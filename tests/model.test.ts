import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { compileModel, childView, relationsForView, type SourceFile } from '../shared/model.ts';
const source = (path: string, metadata: string, body = '# Documentation') => ({ path, content: `---\n${metadata}\n---\n${body}` });
const project = source('workspace.md', 'id: demo\nkind: project\nname: Demo\ndescription: A test workspace\nhome: context');
const system = source('system.md', 'id: app\nkind: system\nname: App\ndescription: Runs the application');
const context = source('context.md', 'id: context\nkind: view\ntype: context\nname: Context\ndescription: System overview\nscope: app\nnodes: [app]');
const base = [project, system, context];
test('compiles a valid minimal Markdown workspace', () => {
 const model = compileModel(base); assert.deepEqual(model.errors, []); assert.equal(model.entities[0].body, '# Documentation'); assert.equal(model.project.home, 'context');
});
test('reports missing references and duplicate IDs with source filenames', () => {
 const extra = source('bad.md', 'id: other\nkind: container\nname: Other\ndescription: Other service\nparent: missing\ntechnology: Go\nrelationships:\n  - id: call\n    target: nowhere\n    label: Requests data');
 const model = compileModel([...base, extra, { ...system, path: 'duplicate.md' }]);
 assert(model.errors.some(e => e.includes('bad.md') && e.includes('Unknown parent')));
 assert(model.errors.some(e => e.includes('nowhere'))); assert(model.errors.some(e => e.includes('Duplicate ID')));
});
test('rejects cyclic entity and view hierarchies', () => {
 const a = source('a.md', 'id: a\nkind: component\nname: A\ndescription: A\ntechnology: Go\nparent: b');
 const b = source('b.md', 'id: b\nkind: component\nname: B\ndescription: B\ntechnology: Go\nparent: a');
 const view = source('cycle.md','id: cycle\nkind: view\ntype: dataflow\nname: Cycle\ndescription: Cycle\nparentView: cycle');
 const model = compileModel([...base, a, b, view]); assert(model.errors.some(e => e.includes('Parent hierarchy contains a cycle'))); assert(model.errors.some(e => e.includes('View hierarchy contains a cycle')));
});
test('context views cannot expose implementation internals', () => {
 const container = source('api.md','id: api\nkind: container\nname: API\ndescription: API\ntechnology: Go\nparent: app');
 const invalidContext = source('context.md','id: context\nkind: view\ntype: context\nname: Context\ndescription: Context\nscope: app\nnodes: [app, api]');
 assert(compileModel([project,system,container,invalidContext]).errors.some(e => e.includes('only people and software systems')));
});
test('does not silently accept malformed Markdown or YAML', () => {
 const model = compileModel([...base, {path:'plain.md',content:'No frontmatter'}, {path:'broken.md',content:'---\nid: [bad\n---\n# Bad'}]);
 assert.equal(model.errors.length, 2); assert(model.errors.some(e => e.startsWith('plain.md:'))); assert(model.errors.some(e => e.startsWith('broken.md:')));
});
test('loads the real demo and follows C4 and flow references', async () => {
 async function collect(directory: string): Promise<SourceFile[]> {
  const results = await Promise.all((await readdir(directory,{withFileTypes:true})).map(async e => e.isDirectory() ? collect(`${directory}/${e.name}`) : [{path:`${directory}/${e.name}`,content:await readFile(`${directory}/${e.name}`,'utf8')}])); return results.flat();
 }
 const model = compileModel(await collect('docs/demo'));
 assert.deepEqual(model.errors, []); assert.equal(model.views.length, 12);
 assert.equal(childView(model,'commerce')?.id,'containers'); assert.equal(childView(model,'api')?.id,'api-components');
 assert.equal(childView(model,'runtime')?.id,'production-cluster');
 assert.equal(childView(model,'prod-app')?.id,'production-app');
 assert.equal(childView(model,'data-node')?.id,'production-data');
 const flow = model.views.find(v => v.id === 'order-flow')!;
 assert.deepEqual(relationsForView(model,flow).map(r => r.id),flow.relationships);
 const bpmn = model.views.find(v => v.type === 'bpmn')!; assert(bpmn.bpmn?.includes('bpmndi:BPMNDiagram')); assert.equal(bpmn.bindings.Authorize, 'payment-adapter');
});
test('requires BPMN XML and valid task-to-entity references', () => {
 const bpmn = source('process.md','id: process\nkind: view\ntype: bpmn\nname: Process\ndescription: Process\nbindings:\n  Task_A: missing');
 const errors = compileModel([...base,bpmn]).errors;
 assert(errors.some(e => e.includes('fenced bpmn XML'))); assert(errors.some(e => e.includes('Unknown BPMN binding')));
});
test('rejects a relationship explicitly included outside its endpoints', () => {
 const other = source('other.md','id: other\nkind: external\nname: Provider\ndescription: Provider');
 const linked = source('system.md','id: app\nkind: system\nname: App\ndescription: App\nrelationships:\n  - id: request\n    target: other\n    label: Requests authorization');
 const invalid = source('flow.md','id: flow\nkind: view\ntype: dataflow\nname: Flow\ndescription: Flow\nnodes: [app]\nrelationships: [request]');
 assert(compileModel([project,linked,context,other,invalid]).errors.some(e => e.includes('endpoint outside this view')));
});

test('custom navigation level 5 cannot relabel an official C4 view', () => {
 const custom = source('custom.md','id: custom\nkind: view\ntype: deployment\nname: Custom perspective\ndescription: Custom view\nscope: app\nnodes: [app]\nnavigationLevel: 5');
 const model = compileModel([...base,custom]);
 assert.deepEqual(model.errors,[]); assert.equal(model.views.find(view=>view.id==='custom')?.navigationLevel,5);
 const invalid = source('custom.md','id: custom\nkind: view\ntype: code\nname: Code\ndescription: Code\nnavigationLevel: 5');
 assert(compileModel([...base,invalid]).errors.some(error=>error.includes('C4 architecture views keep levels 1 to 4')));
});
