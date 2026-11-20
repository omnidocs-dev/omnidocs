import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkspace,WorkspaceStore } from '../server/workspace-store.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';
import { readLayoutState } from '../shared/layout-state.ts';
import { compileModel } from '../shared/model.ts';
import { arrangeShapes } from '../shared/arrangement.ts';
import { routeConnections } from '../shared/connection-layout.ts';

const demo=await readWorkspace('docs/demo');
const snapshot={routing:'automatic',viewport:{x:20,y:-45,zoom:.65},positions:{commerce:{x:430,y:210}},parents:{commerce:undefined},dimensions:{frame:{width:900,height:700}},size:{width:1400,height:900},arrangement:{mode:'vertical',spacing:'wide'}};
const command={op:'layout.save',viewId:'system-context',key:'system-context',layout:snapshot};

test('layout survives disk save and a fresh workspace instance without changing architecture files',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-layout-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const file of demo){const target=path.join(root,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
 const store=new WorkspaceStore(root);await store.save(workspaceRevision(await store.read()),[command]);
 const reopened=await new WorkspaceStore(root).read();
 const saved=readLayoutState(reopened).layouts['system-context'];
 assert.equal(saved.routing,snapshot.routing);assert.deepEqual(saved.positions,snapshot.positions);assert.deepEqual(saved.arrangement,snapshot.arrangement);assert.deepEqual(saved.dimensions,snapshot.dimensions);assert.deepEqual(saved.viewport,snapshot.viewport);
 assert.deepEqual(compileModel(reopened).errors,[]);
 for(const file of demo)assert.equal(reopened.find(item=>item.path===file.path)?.content,file.content);
});

test('layout rejects invalid views, mismatched keys and invalid coordinates',()=>{
 assert.throws(()=>prepareEdits(demo,[{...command,viewId:'missing'}]),/existing view/);
 assert.throws(()=>prepareEdits(demo,[{...command,key:'other-view'}]),/existing view/);
 assert.throws(()=>prepareEdits(demo,[{...command,layout:{...snapshot,positions:{commerce:{x:Infinity,y:0}}}}]));
});

test('chosen connection points roundtrip separately from semantic relation and are removed on deletion',()=>{
 const command={op:'relation.create',id:'test.fixed',viewId:'system-context',source:'customer',target:'commerce',label:'Uses',protocol:'',sourceHandle:'port-bottom-0',targetHandle:'port-top-2'};
 const first=prepareEdits(demo,[command]);
 assert.deepEqual(readLayoutState(first.files).connections['test.fixed'],{sourceHandle:'port-bottom-0',targetHandle:'port-top-2'});
 const deleted=prepareEdits(first.files,[{op:'relation.delete',id:'test.fixed',viewId:'system-context'}]);
 assert.equal(readLayoutState(deleted.files).connections['test.fixed'],undefined);
});

const shapes=[{id:'c',width:100,height:80},{id:'a',width:160,height:100},{id:'b',width:120,height:90}];
const links=[{id:'ab',sources:['a'],targets:['b']},{id:'bc',sources:['b'],targets:['c']}];
test('arrangement follows direction and preserves spacing in every mode',async()=>{
 for(const mode of ['horizontal','vertical','row','column','grid'] as const){
  const result=await arrangeShapes('test',shapes,links,'RIGHT',{mode,spacing:'comfortable'});
  const children=result.children!,a=children.find(n=>n.id==='a')!,b=children.find(n=>n.id==='b')!,c=children.find(n=>n.id==='c')!;
  if(mode==='horizontal'||mode==='row')assert(a.x!<b.x!&&b.x!<c.x!);
  if(mode==='vertical'||mode==='column')assert(a.y!<b.y!&&b.y!<c.y!);
  for(const first of children)for(const second of children)if(first.id!==second.id)assert(first.x!+first.width!<=second.x!||second.x!+second.width!<=first.x!||first.y!+first.height!<=second.y!||second.y!+second.height!<=first.y!);
 }
 const compact=await arrangeShapes('c',shapes,links,'RIGHT',{mode:'row',spacing:'compact'}),wide=await arrangeShapes('w',shapes,links,'RIGHT',{mode:'row',spacing:'wide'});
 assert(wide.width!>compact.width!);
});

test('routing honors chosen fractional points and outward directed stems',()=>{
 const routes=routeConnections([{id:'a',x:0,y:100,width:200,height:160},{id:'b',x:500,y:100,width:200,height:160}],[{id:'ab',source:'a',target:'b',sourceHandle:'port-top-0',targetHandle:'port-bottom-2'}]);
 const route=routes.get('ab')!;assert.equal(route.sourceHandle,'port-top-0');assert.equal(route.targetHandle,'port-bottom-2');
 assert.deepEqual(route.points[0],{x:50,y:100});assert.deepEqual(route.points.at(-1),{x:650,y:260});
 assert(route.points[1].y<100);assert(route.points.at(-2)!.y>260);
});
