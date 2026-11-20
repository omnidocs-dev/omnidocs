import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspace} from '../server/workspace-store.ts';
import {prepareEdits} from '../shared/edit-model.ts';
import {existingViewCandidates} from '../shared/view-membership.ts';
import {compileModel,relationsForView} from '../shared/model.ts';
import {scaffoldSpace} from '../shared/space-scaffold.ts';
import {fencedBlocks} from '../shared/markdown-source.ts';
import {layoutCanvas} from '../shared/canvas-layout.ts';
const demo=await readWorkspace('docs/demo');

test('native view inclusion reuses identity, ownership and existing relationships without changing other views',()=>{
 const files=[...demo,{path:'views/new.md',content:'---\nid: NewContainers\nkind: view\ntype: container\nname: New containers\ndescription: Focused containers\nscope: commerce\nnodes: [worker]\nrelationships: []\n---\n'}];const initial={files,model:compileModel(files)};
 const before=initial.model.views.find(v=>v.id==='system-context')!;
 const result=prepareEdits(initial.files,[{op:'view.include',viewId:'NewContainers',ids:['notifications','notifications']}]);
 const view=result.model.views.find(v=>v.id==='NewContainers')!;
 assert.equal(view.nodes.filter(id=>id==='notifications').length,1);
 assert.deepEqual(result.model.entities,initial.model.entities);
 assert.deepEqual(result.model.views.find(v=>v.id===before.id),before);
 assert(relationsForView(result.model,view).some(r=>r.source==='worker'&&r.target==='notifications'));
 const repeated=prepareEdits(result.files,[{op:'view.include',viewId:'NewContainers',ids:['notifications']}]);
 assert.deepEqual(repeated.changes,[]);
});

function structurizrFixture(){return prepareEdits(scaffoldSpace({name:'SMS example',description:'Shared identity test'}),[
 {op:'entity.create',id:'sms',viewId:'SystemContext',kind:'external',name:'SMS Provider',description:'Sends SMS',technology:''},
 {op:'entity.create',id:'worker',viewId:'Containers',kind:'container',name:'SMS Worker',description:'Delivers SMS',technology:'Go'},
 {op:'view.create',id:'WorkerComponents',viewId:'Containers',scope:'worker',name:'Worker components',description:'Inside worker'},
 {op:'entity.create',id:'sender',viewId:'WorkerComponents',kind:'component',name:'Sender',description:'Calls SMS provider',technology:'Go'}
]).files;}

test('Structurizr inclusion updates DSL and snapshot then supports drawing a real C2-to-external relation and C3 reuse',async()=>{
 const files=structurizrFixture(),original=compileModel(files),sms=original.entities.find(e=>e.id==='sms')!;
 const result=prepareEdits(files,[{op:'view.include',viewId:'Containers',ids:['sms']},{op:'relation.create',id:'worker.sms',viewId:'Containers',source:'worker',target:'sms',label:'Sends SMS',protocol:'HTTPS'},{op:'view.include',viewId:'WorkerComponents',ids:['sms']},{op:'relation.create',id:'sender.sms',viewId:'WorkerComponents',source:'sender',target:'sms',label:'Sends SMS',protocol:'HTTPS'}]);
 assert.deepEqual(result.model.errors,[]);const actual=result.model.entities.find(e=>e.id==='sms')!;for(const key of ['id','name','description','kind','parent','properties'] as const)assert.deepEqual(actual[key],sms[key]);
 assert.equal(result.model.entities.filter(e=>e.id==='sms').length,1);
 const source=result.files.find(f=>f.path===result.model.importInfo!.authoritativeSource)!;
 assert(fencedBlocks(source,'structurizr')[0].includes('include od_sms'));
 const c2=result.model.views.find(v=>v.id==='Containers')!;
 assert(c2.nodes.includes('sms'));assert(relationsForView(result.model,c2).some(r=>r.id==='worker.sms'));
 assert(!c2.boundaries.some(b=>b.nodes.includes('sms')),'external provider stays outside the owning system boundary');
 const expanded=await layoutCanvas(result.model,result.model.views.find(v=>v.id==='SystemContext')!,new Set(['system.main']));
 assert.equal(expanded.nodes.filter(n=>n.entity.id==='sms').length,1,'inline expansion reuses already visible external provider');
 assert(expanded.edges.some(e=>e.relation.id==='worker.sms'));
 const reopened=compileModel(result.files);assert.deepEqual(reopened.errors,[]);
 const repeated=prepareEdits(result.files,[{op:'view.include',viewId:'Containers',ids:['sms']}]);assert.deepEqual(repeated.changes,[]);
});

test('adding existing endpoints reveals existing relationships and rejects inappropriate levels or missing elements atomically',()=>{
 const files=structurizrFixture();
 const connected=prepareEdits(files,[{op:'view.include',viewId:'Containers',ids:['sms']},{op:'relation.create',id:'worker.sms',viewId:'Containers',source:'worker',target:'sms',label:'Sends SMS',protocol:'HTTPS'},{op:'entity.create',id:'caller',viewId:'Containers',kind:'container',name:'Caller',description:'Calls provider',technology:'Go'},{op:'relation.create',id:'caller.sms',viewId:'Containers',source:'caller',target:'sms',label:'Calls SMS',protocol:'HTTPS'}]);
 const included=prepareEdits(connected.files,[{op:'view.include',viewId:'WorkerComponents',ids:['sms','caller']}]);
 assert(relationsForView(included.model,included.model.views.find(v=>v.id==='WorkerComponents')!).some(r=>r.id==='caller.sms'));
 assert.throws(()=>prepareEdits(files,[{op:'view.include',viewId:'SystemContext',ids:['worker']}]),/Cannot include/);
 assert.throws(()=>prepareEdits(files,[{op:'view.include',viewId:'Containers',ids:['sms','sender']}]),/Cannot include/);
 assert.throws(()=>prepareEdits(files,[{op:'view.include',viewId:'Containers',ids:['missing']}]),/Cannot include/);
 const model=compileModel(files),candidates=existingViewCandidates(model,model.views.find(v=>v.id==='Containers')!);
 assert(candidates.some(e=>e.id==='sms'));assert(!candidates.some(e=>e.id==='sender'));
});
