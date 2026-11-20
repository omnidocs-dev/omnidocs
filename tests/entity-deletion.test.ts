import { parse, stringify } from 'yaml';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,access } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { scaffoldSpace } from '../shared/space-scaffold.ts';
import {prepareEdits} from '../shared/edit-model.ts';
import {compileModel} from '../shared/model.ts';
import {planEntityDeletion} from '../shared/entity-deletion.ts';
import {readWorkspace,WorkspaceStore} from '../server/workspace-store.ts';
import {workspaceRevision} from '../shared/edit-contract.ts';
import {fencedBlocks} from '../shared/markdown-source.ts';

function seed(){return prepareEdits(scaffoldSpace({name:'Deletion test',description:'A model for deletion'}),[
 {op:'entity.create',id:'user',viewId:'SystemContext',kind:'person',name:'User',description:'Uses the system',technology:''},
 {op:'relation.create',id:'uses',viewId:'SystemContext',source:'user',target:'system.main',label:'Uses app',protocol:''},
 {op:'entity.create',id:'api',viewId:'Containers',kind:'container',name:'API',description:'Serves requests',technology:'Go'},
 {op:'entity.create',id:'db',viewId:'Containers',kind:'container',elementType:'database',name:'Database',description:'Stores records',technology:'PostgreSQL'},
 {op:'relation.create',id:'stores',viewId:'Containers',source:'api',target:'db',label:'Stores data',protocol:'SQL'},
 {op:'view.create',id:'ApiComponents',viewId:'Containers',scope:'api',name:'API components',description:'Inside API'},
 {op:'entity.create',id:'handler',viewId:'ApiComponents',kind:'component',name:'Handler',description:'Handles requests',technology:'Go'},
 ]);}
test('delete an item removes its exact relationships everywhere and preserves unrelated items and source freshness',()=>{
 const before=seed(), result=prepareEdits(before.files,[{op:'entity.delete',id:'user',viewId:'SystemContext'}]);
 assert(!result.model.entities.some(item=>item.id==='user'));assert(!result.model.relations.some(item=>item.id==='uses'));assert(result.model.relations.some(item=>item.id==='stores'));assert.deepEqual(result.model.errors,[]);assert.equal(result.model.importInfo?.integrity,'verified');
 const dsl=fencedBlocks(result.files.find(file=>file.path==='architecture-model.md')!,'structurizr')[0];assert(!dsl.includes('od_user'));assert(!dsl.includes('od_uses'));assert(dsl.includes('od_api'));
});
test('owned components and views require cascade consent and are removed with their source documents',()=>{
 const before=seed(), plan=planEntityDeletion(before.model,'api');assert.equal(plan.entities.length,2);assert.equal(plan.views.length,1);
 assert.throws(()=>prepareEdits(before.files,[{op:'entity.delete',id:'api',viewId:'Containers',cascade:false}]),/cascade/);
 const result=prepareEdits(before.files,[{op:'entity.delete',id:'api',viewId:'Containers',cascade:true}]);
 assert(!result.model.entities.some(item=>['api','handler'].includes(item.id)));assert(!result.model.views.some(view=>view.id==='ApiComponents'));assert(!result.model.relations.some(item=>item.id==='stores'));assert(result.model.entities.some(item=>item.id==='db'));
 assert(!result.files.some(file=>file.path.endsWith('/ApiComponents.md')));assert.deepEqual(result.model.errors,[]);
 assert.throws(()=>prepareEdits(before.files,[{op:'entity.delete',id:'system.main',viewId:'SystemContext',cascade:true}]),/primary system/);
});
test('native deletion removes entity files and cleans boundaries, flows and surviving references',async()=>{
 const files=await readWorkspace('docs/demo'), model=compileModel(files), view=model.views.find(view=>view.type==='container')!;
 const before=prepareEdits(files,[{op:'entity.create',id:'qa.api',viewId:view.id,kind:'container',name:'API',description:'Test API',technology:'Go'}, {op:'view.create',id:'QaDeleteComponents',viewId:view.id,scope:'qa.api',name:'Components',description:'Components'}, {op:'entity.create',id:'qa.handler',viewId:'QaDeleteComponents',kind:'component',name:'Handler',description:'Handler',technology:'Go'}]);
 const withLink=prepareEdits(before.files,[{op:'relation.create',id:'qa.connection',viewId:view.id,source:'qa.api',target:view.nodes[0],label:'Calls',protocol:'REST'}]);
 const viewFile=withLink.files.find(file=>file.path===view.source)!;
 const match=viewFile.content.match(/^---\n([\s\S]*?)\n---\n/)!;const metadata=parse(match[1]);
 metadata.boundaries=[...(metadata.boundaries??[]),{id:'qa.frame',name:'Test frame',nodes:['qa.api']}];
 metadata.entryPoints=[...(metadata.entryPoints??[]),{node:'qa.api',label:'Test entry'}];
 metadata.flows=[...(metadata.flows??[]),{id:'qa.flow',name:'Test flow',relationships:['qa.connection']}];
 viewFile.content=`---\n${stringify(metadata)}---\n${viewFile.content.slice(match[0].length)}`;
 assert.deepEqual(compileModel(withLink.files).errors,[]);
 const result=prepareEdits(withLink.files,[{op:'entity.delete',id:'qa.api',viewId:view.id,cascade:true}]);
 assert(!result.files.some(file=>file.path==='studio/entities/qa.api.md'||file.path==='studio/entities/qa.handler.md'||file.path.endsWith('/QaDeleteComponents.md')));assert.deepEqual(result.model.errors,[]);
 assert(!result.model.views.find(item=>item.id===view.id)!.boundaries.some(frame=>frame.id==='qa.frame'));assert(!result.model.views.find(item=>item.id===view.id)!.flows.some(flow=>flow.id==='qa.flow'));
 assert.equal(result.model.entities.length,model.entities.length);assert.equal(result.model.views.length,model.views.length);
});
test('deleted view documents are backed up and removed on real disk',async t=>{
 const before=seed(),root=await mkdtemp(path.join(tmpdir(),'omnidocs-delete-item-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const file of before.files){const target=path.join(root,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
 const store=new WorkspaceStore(root), result=await store.save(workspaceRevision(before.files),[{op:'entity.delete',id:'api',viewId:'Containers',cascade:true}]);
 const note=before.files.find(file=>file.path.endsWith('/ApiComponents.md'))!;await assert.rejects(access(path.join(root,note.path)));assert.equal(await readFile(path.join(root,result.backup,note.path),'utf8'),note.content);assert.deepEqual(compileModel(await store.read()).errors,[]);
});
