import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
import { compileModel,type SourceFile } from '../shared/model.ts';
import { canvasLayoutKey,canvasNodeId,layoutCanvas } from '../shared/canvas-layout.ts';

async function collect(folder: string): Promise<SourceFile[]> {
 const entries = await readdir(folder, { withFileTypes: true });
 return (await Promise.all(entries.map(async entry => entry.isDirectory() ? collect(`${folder}/${entry.name}`) : entry.name.endsWith('.md') ? [{ path: `${folder}/${entry.name}`, content: await readFile(`${folder}/${entry.name}`, 'utf8') }] : []))).flat();
}
const model = compileModel(await collect('docs/demo'));
const context = model.views.find(view => view.id === 'system-context')!;

function assertNoSiblingOverlaps(graph: Awaited<ReturnType<typeof layoutCanvas>>) {
 for (let index = 0; index < graph.nodes.length; index++) {
  const a = graph.nodes[index];
  for (const b of graph.nodes.slice(index + 1).filter(node => node.parentId === a.parentId)) {
   assert(!(a.position.x < b.position.x + b.width && a.position.x + a.width > b.position.x && a.position.y < b.position.y + b.height && a.position.y + a.height > b.position.y), `${a.id} overlaps ${b.id}`);
  }
 }
}

test('inline expansion preserves context nodes and arrows while nesting the child view', async () => {
 const graph = await layoutCanvas(model, context, new Set(['commerce']));
 assertNoSiblingOverlaps(graph);
 assert.equal(graph.nodes.filter(node => !node.parentId).length, context.nodes.length);
 const boundary = graph.nodes.find(node => node.id === 'commerce')!;
 assert(boundary.expanded && boundary.width > 254);
 assert.equal(graph.nodes.filter(node => node.parentId === 'commerce').length, 6);
 assert(graph.edges.some(edge => edge.source === 'commerce' || edge.target === 'commerce'));
 assert(graph.edges.some(edge => edge.source === 'commerce/api'));
 // Shared external providers stay outside and their original occurrence is reused.
 assert(graph.nodes.some(node => node.id === 'payments'));
 assert(!graph.nodes.some(node => node.id === 'commerce/payments'));
 assert.equal(new Set(graph.nodes.map(node => node.id)).size, graph.nodes.length);
 assert.equal(new Set(graph.edges.map(edge => edge.id)).size, graph.edges.length);
 for (const node of graph.nodes.filter(node => node.parentId)) {
  const parent = graph.nodes.find(parent => parent.id === node.parentId)!;
  assert(node.position.x >= 0 && node.position.y >= 86);
  assert(node.position.x + node.width <= parent.width + 1);
  assert(node.position.y + node.height <= parent.height + 1);
 }
});

test('nested expansion reaches components and every arrow resolves to its local occurrence', async () => {
 const graph = await layoutCanvas(model, context, new Set(['commerce', 'commerce/api']));
 assert(graph.nodes.find(node => node.id === 'commerce/api')?.expanded);
 assert.equal(graph.nodes.filter(node => node.parentId === 'commerce/api').length, 4);
 const ids = new Set(graph.nodes.map(node => node.id));
 for (const edge of graph.edges) { assert(ids.has(edge.source)); assert(ids.has(edge.target)); }
 for (const node of graph.nodes.filter(node => node.parentId)) {
  const parent = graph.nodes.find(parent => parent.id === node.parentId)!;
  assert(node.position.x + node.width <= parent.width + 1);
  assert(node.position.y + node.height <= parent.height + 1);
 }
});

test('collapsed and standalone views do not inherit nested nodes or collide in viewport cache', async () => {
 const graph = await layoutCanvas(model, context, new Set());
 assert.equal(graph.nodes.length, context.nodes.length);
 assert(graph.nodes.every(node => !node.expanded && !node.parentId));
 const containers = model.views.find(view => view.id === 'containers')!;
 const standalone = await layoutCanvas(model, containers, new Set(['commerce', 'commerce/api']));
 assert(standalone.nodes.every(node => !node.expanded && !node.id.includes('/')));
 assert(standalone.nodes.every(node=>!node.parentId||standalone.frames.some(frame=>frame.id===node.parentId)), 'standalone cards may belong to ownership frames, never inline node occurrences');
 assert.equal(canvasLayoutKey(context.id, new Set()), context.id);
 assert.notEqual(canvasLayoutKey(context.id, new Set(['commerce'])), context.id);
 assert.equal(canvasLayoutKey(context.id, new Set(['b','a'])), canvasLayoutKey(context.id, new Set(['a','b'])));
 assert.notEqual(canvasNodeId('a/b'), canvasNodeId('b','a'));
});

test('production frames categorize input, platform, application and data resources with intact direct paths', async () => {
 const production = model.views.find(view => view.id === 'production')!;
 const graph = await layoutCanvas(model, production, new Set());
 assert.equal(graph.nodes.length, production.nodes.length);
 assert.equal(graph.frames.length, 7);
 const all = new Map([...graph.nodes, ...graph.frames].map(node => [node.id, node]));
 for (const node of [...graph.nodes, ...graph.frames].filter(node => node.parentId)) {
  const parent = all.get(node.parentId!)!;
  assert(parent);
  assert(node.position.x >= 0 && node.position.y >= 76);
  assert(node.position.x + node.width <= parent.width + 1);
  assert(node.position.y + node.height <= parent.height + 1);
 }
 assert.equal(graph.nodes.find(node => node.entity.id === 'prod-api-pods')?.parentId, '@frame:applications');
 assert.equal(graph.frames.find(frame => frame.id === '@frame:applications')?.parentId, '@frame:cluster');
 for (const edge of graph.edges) { assert(all.has(edge.source)); assert(all.has(edge.target)); }
 assert(graph.edges.some(edge => edge.relation.id === 'edge-ingress' && edge.source === 'edge' && edge.target === 'prod-ingress'));
 assert.equal(production.entryPoints[0].node, 'prod-clients');
 const checkout = production.flows[0].relationships.map(id => model.relations.find(relation => relation.id === id)!);
 assert.equal(checkout[0].source, production.entryPoints[0].node);
 for (let index = 1; index < checkout.length; index++) assert.equal(checkout[index - 1].target, checkout[index].source);
});
