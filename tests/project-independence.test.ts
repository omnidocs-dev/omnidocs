import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileModel, childView } from '../shared/model.ts';
import { architectureLayers } from '../shared/navigation.ts';
import { layoutCanvas } from '../shared/canvas-layout.ts';
import { genericWorkspace } from './fixtures/projects.ts';

for (const [prefix, name, nouns, host] of [
 ['r7', 'Research Archive', ['Researcher', 'Archive', 'Catalog application'], 'University VM'],
 ['m9', 'Civic Planner', ['Resident', 'Permit planning', 'Permit application'], 'Municipal VM'],
] as const) {
 test(`${name}: arbitrary Markdown IDs and domain names drive C4, relationships, and deployment`, async () => {
  const sources = genericWorkspace(prefix, name, [...nouns], host);
  const model = compileModel(sources);
  assert.deepEqual(model.errors, []);
  assert.equal(model.project.name, name);
  const getView = (key: string) => model.views.find(view => view.id === `${prefix}-${key}`)!;
  const overview = getView('overview');
  assert.equal(childView(model, `${prefix}-system`)?.id, `${prefix}-applications`);
  assert.equal(childView(model, `${prefix}-app`)?.id, `${prefix}-modules`);
  assert.equal(childView(model, `${prefix}-component`)?.id, `${prefix}-implementation`);
  assert.deepEqual(architectureLayers(model, overview).slice(0, 4).map(layer => layer.preferred?.id), ['overview', 'applications', 'modules', 'implementation'].map(key => `${prefix}-${key}`));
  const parentId = `${prefix}-system`, appId = `${parentId}/${prefix}-app`, componentId = `${appId}/${prefix}-component`;
  const graph = await layoutCanvas(model, overview, new Set([parentId, appId, componentId]));
  assert(graph.nodes.some(node => node.id === `${componentId}/${prefix}-code`));
  assert(graph.nodes.some(node => node.entity.name === nouns[2]));
  assert(graph.edges.some(edge => edge.relation.id === `${prefix}-persist` && edge.source === appId));
  assert.equal(graph.nodes.filter(node => !node.parentId).length, 2);
  const deployment = await layoutCanvas(model, getView('environment'), new Set([`${prefix}-host`]));
  assert.equal(childView(model, `${prefix}-host`)?.id, `${prefix}-execution`);
  assert(deployment.nodes.some(node => node.id === `${prefix}-host/${prefix}-process`));
  assert(deployment.nodes.some(node => node.entity.name === host));
  assert(deployment.edges.some(edge => edge.relation.id === `${prefix}-connect`));
  const ids = new Set([...graph.nodes, ...deployment.nodes].map(node => node.entity.id));
  assert([...ids].every(id => id.startsWith(`${prefix}-`)));
  assert.equal(model.fileCount, sources.length);
 });
}
