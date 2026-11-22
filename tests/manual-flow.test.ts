import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspace} from '../server/workspace-store.ts';
import {compileModel,relationsForView} from '../shared/model.ts';
import {prepareEdits} from '../shared/edit-model.ts';
import {scaffoldSpace} from '../shared/space-scaffold.ts';
import {layoutCanvas} from '../shared/canvas-layout.ts';
const demo=await readWorkspace('docs/demo');
const create={op:'flow.create',id:'manual-flow',name:'My manual flow',description:'Three abstraction bands; no invented path'};

test('manual native flow starts empty with three bands; inclusion never invents or imports connections',async()=>{
 const result=prepareEdits(demo,[create]),view=result.model.views.find(v=>v.id===create.id)!;
 assert.equal(view.layout,'levels');assert.deepEqual(view.nodes,[]);assert.deepEqual(view.relationships,[]);
 const graph=await layoutCanvas(result.model,view,new Set());assert.equal(graph.frames.length,3);assert.equal(graph.nodes.length,0);
 assert(graph.frames[0].position.x<graph.frames[1].position.x&&graph.frames[1].position.x<graph.frames[2].position.x);
 const added=prepareEdits(result.files,[{op:'view.include',viewId:create.id,ids:['notifications','worker','orders']}]),flow=added.model.views.find(v=>v.id===create.id)!;
 assert.deepEqual(relationsForView(added.model,flow),[],'existing worker-to-provider link must not appear without manual drawing');
 const filled=await layoutCanvas(added.model,flow,new Set());
 assert.equal(filled.nodes.find(n=>n.entity.id==='notifications')?.parentId,'@frame:flow-level-L1');
 assert.equal(filled.nodes.find(n=>n.entity.id==='worker')?.parentId,'@frame:flow-level-L2');
 assert.equal(filled.nodes.find(n=>n.entity.id==='orders')?.parentId,'@frame:flow-level-L3');
 assert.deepEqual(added.model.entities,result.model.entities);
 assert.throws(()=>prepareEdits(result.files,[{op:'view.include',viewId:create.id,ids:['checkout-http-code']}]),/Cannot include/);
});

function canonical(){return prepareEdits(scaffoldSpace({name:'Manual flow test',description:'Shared architecture model'}),[
 {op:'entity.create',id:'provider',viewId:'SystemContext',kind:'external',name:'Provider',description:'External provider',technology:''},
 {op:'entity.create',id:'worker',viewId:'Containers',kind:'container',name:'Worker',description:'Runs tasks',technology:'Go'},
 {op:'view.create',id:'WorkerComponents',viewId:'Containers',scope:'worker',name:'Worker parts',description:'Worker components'},
 {op:'entity.create',id:'sender',viewId:'WorkerComponents',kind:'component',name:'Sender',description:'Sends notifications',technology:'Go'},
]).files;}

test('Structurizr companion flow roundtrips shared elements, drawn relations and selected ports without adding fake C4 views',()=>{
 const source=canonical(),empty=prepareEdits(source,[create]);
 for(const file of source)assert.equal(empty.files.find(f=>f.path===file.path)?.content,file.content,'creating empty flow must not touch canonical source');
 const added=prepareEdits(empty.files,[{op:'view.include',viewId:create.id,ids:['provider','worker','sender']}]);
 const linked=prepareEdits(added.files,[{op:'relation.create',id:'send.notification',viewId:create.id,source:'sender',target:'provider',label:'Sends notification',protocol:'HTTPS',sourceHandle:'port-top-0',targetHandle:'port-bottom-2'}]);
 const reopened=compileModel(linked.files);assert.deepEqual(reopened.errors,[]);
 assert.equal(reopened.entities.filter(e=>e.id==='provider').length,1);
 assert.equal(relationsForView(reopened,reopened.views.find(v=>v.id===create.id)!)[0].id,'send.notification');
 const edited=prepareEdits(linked.files,[{op:'relation.update',id:'send.notification',viewId:create.id,source:'sender',target:'provider',label:'Delivers SMS',protocol:'HTTPS'}]);
 assert.equal(edited.model.relations.find(r=>r.id==='send.notification')?.label,'Delivers SMS');
 const removed=prepareEdits(edited.files,[{op:'relation.delete',id:'send.notification',viewId:create.id}]);assert.deepEqual(removed.model.views.find(v=>v.id===create.id)!.relationships,[]);
 const deleted=prepareEdits(linked.files,[{op:'entity.delete',id:'provider',viewId:'SystemContext',cascade:true}]);
 assert(!deleted.model.views.find(v=>v.id===create.id)!.nodes.includes('provider'));assert.deepEqual(deleted.model.errors,[]);
});

test('invalid supplemental flow references and duplicate identifiers fail compilation',()=>{
 const base=prepareEdits(canonical(),[create]);const flow=base.files.find(f=>f.path.includes('manual-flow.md'))!;
 const invalid=base.files.map(f=>f===flow?{...f,content:f.content.replace('nodes: []','nodes: [missing]')}:f);assert(compileModel(invalid).errors.some(e=>e.includes('Unknown node')));
 assert.throws(()=>prepareEdits(base.files,[create]),/already exists/);
});

test('flow editor links the start and steps by model ID and removes references without deleting architecture',()=>{
 const empty=prepareEdits(demo,[create]);
 const relationship=empty.model.relations.find(link=>link.source==='worker'&&link.target==='notifications')!;
 assert(relationship);
 const linked=prepareEdits(empty.files,[
  {op:'flow.start',viewId:create.id,node:'worker'},
  {op:'flow.link',viewId:create.id,relationship:relationship.id},
 ]);
 const reopened=compileModel(linked.files),flow=reopened.views.find(view=>view.id===create.id)!;
 assert.deepEqual(reopened.errors,[]);
 assert.deepEqual(flow.entryPoints,[{node:'worker',label:'Start'}]);
 assert.deepEqual(flow.nodes,['worker','notifications']);
 assert.deepEqual(relationsForView(reopened,flow).map(link=>link.id),[relationship.id]);
 assert.deepEqual(linked.model.entities,empty.model.entities);
 const detached=prepareEdits(linked.files,[{op:'flow.unlink',viewId:create.id,relationship:relationship.id}]);
 assert.deepEqual(detached.model.views.find(view=>view.id===create.id)!.relationships,[]);
 assert(detached.model.relations.some(link=>link.id===relationship.id));
 const removed=prepareEdits(linked.files,[{op:'flow.remove',viewId:create.id,node:'worker'}]);
 const remaining=removed.model.views.find(view=>view.id===create.id)!;
 assert.deepEqual(remaining.nodes,['notifications']);
 assert.deepEqual(remaining.entryPoints,[]);
 assert.deepEqual(remaining.relationships,[]);
 assert(removed.model.entities.some(entity=>entity.id==='worker'));
 assert(removed.model.relations.some(link=>link.id===relationship.id));
});

test('a new step adds eligible endpoints atomically in a Structurizr companion flow',()=>{
 const source=canonical(),empty=prepareEdits(source,[create]);
 const started=prepareEdits(empty.files,[{op:'flow.start',viewId:create.id,node:'sender'}]);
 for(const file of source)assert.equal(started.files.find(item=>item.path===file.path)?.content,file.content);
 const step={op:'relation.create',id:'sender.outbound',viewId:create.id,source:'sender',target:'provider',
  label:'Sends notification data',protocol:'HTTPS',includeEndpoints:true};
 const added=prepareEdits(started.files,[step]);
 const flow=added.model.views.find(view=>view.id===create.id)!;
 assert.deepEqual(flow.nodes,['sender','provider']);
 assert.deepEqual(relationsForView(added.model,flow).map(link=>link.id),[step.id]);
 const deleted=prepareEdits(added.files,[{op:'entity.delete',id:'sender',viewId:'WorkerComponents',cascade:true}]);
 assert.deepEqual(deleted.model.views.find(view=>view.id===create.id)!.entryPoints,[]);
 assert.throws(()=>prepareEdits(started.files,[{...step,target:'missing'}]),/Cannot include/);
 assert.throws(()=>prepareEdits(started.files,[{...step,viewId:'WorkerComponents'}]),/Only a new data flow/);
});


test('an existing data flow can add a C4 step without changing its original layout or relationship order',()=>{
 const before=compileModel(demo);
 const original=before.views.find(view=>view.id==='order-flow')!;
 assert.equal(original.layout,undefined);
 const result=prepareEdits(demo,[{
  op:'relation.create',id:'checkout.worker.status',viewId:original.id,source:'worker',target:'orders',
  label:'Sends fulfillment status',protocol:'HTTPS',includeEndpoints:true,
 }]);
 const flow=result.model.views.find(view=>view.id===original.id)!;
 assert.equal(flow.layout,undefined);
 assert(flow.nodes.includes('orders'));
 assert.deepEqual(flow.relationships,[...relationsForView(before,original).map(link=>link.id),'checkout.worker.status']);
});
