import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { compileModel } from '../shared/model.ts';
import { architectureLayers, c4Layers } from '../shared/navigation.ts';
const metadata: Record<string, unknown>[] = [
 { id:'workspace',kind:'project',name:'Multi-system workspace',description:'Test workspace',home:'context-a' },
 ...[
  ['app-a','system',undefined],['app-b','system',undefined],['api-a','container','app-a'],['api-b','container','app-b'],['worker-a','container','app-a'],['component-a','component','api-a'],['code-a','code','component-a'],
 ].map(([id,kind,parent]) => ({id,kind,parent,name:id,description:`Responsibilities of ${id}`,technology:'Go',...(id==='worker-a'?{relationships:[{id:'worker-call',target:'api-a',label:'Dispatches jobs'}]}:{})})),
 ...[
  ['context-a','context','app-a',['app-a']],['context-b','context','app-b',['app-b']],
  ['containers-a','container','app-a',['api-a','worker-a']],['containers-b','container','app-b',['api-b']],
  ['api-components-a','component','api-a',['component-a']],['worker-components-a','component','worker-a',[]],
  ['code-view-a','code','component-a',['code-a']],['deployment-a','deployment','app-a',['api-a']],
 ].map(([id,type,scope,nodes]) => ({id,kind:'view',name:id,type,scope,nodes,description:`View ${id}`})),
];
const model = compileModel(metadata.map(item => ({path:`${item.id}.md`,content:`---\n${stringify(item)}---\n# Details`} )));
assert.deepEqual(model.errors, []);
const view = (id:string) => model.views.find(view=>view.id===id)!;
test('layer navigation stays inside the current system', () => {
 const options = architectureLayers(model,view('context-a'));
 assert.deepEqual(options[0].views.map(view=>view.id),['context-a']);
 assert.deepEqual(options[1].views.map(view=>view.id),['containers-a']);
 assert(options.flatMap(layer=>layer.views).every(view=>!view.id.endsWith('-b')));
});
test('code-level navigation resolves the correct ancestor diagrams', () => {
 const options = architectureLayers(model,view('code-view-a'),'code-a');
 assert.deepEqual(options.slice(0,4).map(layer=>layer.preferred?.id),['context-a','containers-a','api-components-a','code-view-a']);
});
test('multiple component views preserve the selected container or relationship source', () => {
 const options = architectureLayers(model,view('containers-a'),'worker-call');
 assert.equal(options[2].views.length,2);
 assert.equal(options[2].preferred?.id,'worker-components-a');
 assert.equal(architectureLayers(model,view('containers-a'),'api-a')[2].preferred?.id,'api-components-a');
});
test('unavailable levels stay empty and foreign selections cannot change systems', () => {
 const options = architectureLayers(model,view('context-b'),'worker-a');
 assert.equal(options[0].preferred?.id,'context-b');
 assert.equal(options[2].views.length,0); assert.equal(options[2].preferred,undefined);
 assert.equal(options[3].views.length,0);
 assert.deepEqual(c4Layers.map(layer=>layer.level),[1,2,3,4]);
});
test('complementary views can return to their system architecture', () => {
 const options = architectureLayers(model,view('deployment-a'));
 assert.equal(options[0].preferred?.id,'context-a'); assert.equal(options[1].preferred?.id,'containers-a');
});

test('custom level 5 only exposes explicitly configured complementary views', () => {
 const custom = { ...view('deployment-a'), id:'custom-deployment-a', navigationLevel:5 as const };
 const configured = { ...model, views:[...model.views,custom] };
 const options = architectureLayers(configured,view('context-a'));
 assert.deepEqual(options[4].views.map(view=>view.id),['custom-deployment-a']);
 assert.equal(architectureLayers(configured,view('context-b'))[4].views.length,0);
});

test('code-level navigation stays in the current or selected application branch', () => {
 const scoped = compileModel([...metadata,
  { id: 'worker-component-a', kind: 'component', name: 'UI workflow', description: 'UI logic', technology: 'TypeScript', parent: 'worker-a' },
  { id: 'worker-code-a', kind: 'code', name: 'submit()', description: 'Submits a request', parent: 'worker-component-a' },
  { id: 'worker-code-view-a', kind: 'view', name: 'Frontend code', type: 'code', scope: 'worker-component-a', nodes: ['worker-code-a'], description: 'UI implementation' },
 ].map(item => ({ path: `${item.id}.md`, content: `---\n${stringify(item)}---\n# Details` })));
 assert.deepEqual(scoped.errors, []);
 const current = (id: string) => scoped.views.find(view => view.id === id)!;
 assert.deepEqual(architectureLayers(scoped, current('worker-components-a'))[3].views.map(view => view.id), ['worker-code-view-a']);
 assert.deepEqual(architectureLayers(scoped, current('api-components-a'))[3].views.map(view => view.id), ['code-view-a']);
 assert.equal(architectureLayers(scoped, current('context-a'), 'worker-a')[3].preferred?.id, 'worker-code-view-a');
 assert.equal(architectureLayers(scoped, current('context-a'))[3].views.length, 2);
 assert.equal(architectureLayers(model, view('worker-components-a'))[3].views.length, 0);
});
