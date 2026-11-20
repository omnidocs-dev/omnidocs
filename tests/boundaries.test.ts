import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { compileModel } from '../shared/model.ts';
import { layoutCanvas } from '../shared/canvas-layout.ts';
import { genericWorkspace } from './fixtures/projects.ts';

function fixture(change?: (view: Record<string, any>) => void) {
 const files = genericWorkspace('z3', 'Laboratory registry', ['Scientist', 'Registry', 'Registry service'], 'Laboratory server');
 return files.map(file => {
  const match = file.content.match(/^---\n([\s\S]*?)\n---([\s\S]*)$/)!;
  const data = parse(match[1]);
  if (data.id !== 'z3-environment') return file;
  data.boundaries = [
   { id: 'private', name: 'Laboratory network', category: 'Private network', tone: 'blue', nodes: [] },
   { id: 'compute', name: 'Execution', parent: 'private', nodes: ['z3-host'] },
   { id: 'storage', name: 'Persistence', parent: 'private', nodes: ['z3-storage'] },
  ];
  data.entryPoints = [{ node: 'z3-host', label: 'Internal record input' }];
  data.flows = [{ id: 'write', name: 'Record write', relationships: ['z3-connect'] }];
  change?.(data);
  return { ...file, content: `---\n${stringify(data)}---${match[2]}` };
 });
}

test('arbitrary document frames coexist with inline expansion and retain cross-frame arrows', async () => {
 const model = compileModel(fixture()); assert.deepEqual(model.errors, []);
 const view = model.views.find(view => view.id === 'z3-environment')!;
 const graph = await layoutCanvas(model, view, new Set(['z3-host']));
 assert.equal(graph.frames.length, 3);
 assert.equal(graph.nodes.find(node => node.id === 'z3-host')?.parentId, '@frame:compute');
 assert.equal(graph.nodes.find(node => node.id === 'z3-host/z3-process')?.parentId, 'z3-host');
 assert.equal(graph.edges[0].source, 'z3-host'); assert.equal(graph.edges[0].target, 'z3-storage');
 const all = new Map([...graph.frames, ...graph.nodes].map(node => [node.id, node]));
 for (const child of all.values()) if (child.parentId) {
  const parent = all.get(child.parentId)!; assert(parent);
  assert(child.position.x + child.width <= parent.width + 1);
  assert(child.position.y + child.height <= parent.height + 1);
 }
});

test('invalid frame membership, cycles, input nodes and path references produce file-specific errors', () => {
 for (const [change, message] of [
  [(view: any) => view.boundaries[0].nodes.push('missing'), 'outside this view'],
  [(view: any) => view.boundaries[0].nodes.push('z3-host'), 'multiple boundaries'],
  [(view: any) => view.boundaries[0].parent = 'compute', 'hierarchy contains a cycle'],
  [(view: any) => view.boundaries[1].parent = 'missing', 'Unknown parent boundary'],
  [(view: any) => view.boundaries.push(view.boundaries[0]), 'Duplicate boundary IDs'],
  [(view: any) => view.entryPoints[0].node = 'missing', 'Entry point'],
  [(view: any) => view.flows[0].relationships = ['z3-request'], 'outside this view'],
  [(view: any) => view.flows[0].relationships.push('z3-connect'), 'repeats a relationship'],
 ] as const) {
  const model = compileModel(fixture(change));
  assert(model.errors.some(error => error.includes('documents/') && error.includes(message)), JSON.stringify(model.errors));
 }
});
