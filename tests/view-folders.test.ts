import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldSpace } from '../shared/space-scaffold.ts';
import { organizeViewDocuments } from '../shared/organize-views.ts';
import { viewDocumentPath } from '../shared/view-paths.ts';
import { compileModel } from '../shared/model.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';
import { WorkspaceStore, readWorkspace } from '../server/workspace-store.ts';

function legacy() {
 return scaffoldSpace({name:'Legacy app',description:'Old flat view documents'}).map(file=>({...file,path:file.path.startsWith('views/')?`views/${file.path.split('/').at(-1)}`:file.path,content:file.path==='README.md'?file.content.replaceAll('views/c1-context/system.main/','views/').replaceAll('views/c2-containers/system.main/','views/'):file.content}));
}
test('new scaffolds and component views use level and owning-scope folders', () => {
 const files=scaffoldSpace({name:'App',description:'Purpose'});
 assert(files.some(file=>file.path==='views/c1-context/system.main/SystemContext.md')); assert(files.some(file=>file.path==='views/c2-containers/system.main/Containers.md'));
 assert(files.find(file=>file.path==='README.md')!.content.includes('(views/c2-containers/system.main/Containers.md)'));
 assert.equal(viewDocumentPath('code','app.component','CodeView'),'views/c4-code/app.component/CodeView.md');
 assert(!viewDocumentPath('component','../../outside','View').includes('..'));
 const result=prepareEdits(files,[{op:'entity.create',id:'app.api',viewId:'Containers',kind:'container',name:'API',description:'API',technology:'Go'},{op:'view.create',id:'ApiComponents',viewId:'Containers',scope:'app.api',name:'API components',description:'Internal components'}]);
 assert(result.files.some(file=>file.path==='views/c3-components/app.api/ApiComponents.md')); assert.deepEqual(result.model.errors,[]);
});
test('organizing flat views preserves identities and canonical bytes and rewrites relative links outside code', () => {
 const files=legacy(); files.find(file=>file.path==='views/SystemContext.md')!.content+='\n[Canonical](../architecture-model.md)\n[Peer](Containers.md#details)\n`[Literal](Containers.md)`\n\n```text\n[Literal](Containers.md)\n```\n';
 const before=compileModel(files), result=prepareEdits(files,[{op:'workspace.organize'}]);
 assert.deepEqual(result.model.errors,[]); assert.deepEqual(result.model.entities.map(item=>item.id),before.entities.map(item=>item.id)); assert.deepEqual(result.model.views.map(view=>view.id),before.views.map(view=>view.id));
 for (const source of ['architecture-model.md','architecture-json.md']) assert.equal(result.files.find(file=>file.path===source)!.content,files.find(file=>file.path===source)!.content);
 const moved=result.files.find(file=>file.path==='views/c1-context/system.main/SystemContext.md')!.content;
 assert(moved.includes('[Canonical](../../../architecture-model.md)')); assert(moved.includes('[Peer](../../c2-containers/system.main/Containers.md#details)')); assert(moved.includes('`[Literal](Containers.md)`')); assert(moved.includes('```text\n[Literal](Containers.md)'));
 assert.equal(result.changes.filter(change=>change.after===null).length,2); assert(!result.files.some(file=>file.path==='views/SystemContext.md'));
 assert.equal(workspaceRevision(organizeViewDocuments(result.files)),workspaceRevision(result.files));
});
test('view organization persists moved files, removes originals and keeps recoverable backups on real disk', async t => {
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-organize-'));t.after(()=>rm(root,{recursive:true,force:true})); const files=legacy();
 for (const file of files) {const target=path.join(root,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content);}
 const store=new WorkspaceStore(root), result=await store.save(workspaceRevision(files),[{op:'workspace.organize'}]);
 await assert.rejects(access(path.join(root,'views/SystemContext.md'))); await access(path.join(root,'views/c1-context/system.main/SystemContext.md'));
 assert.equal(await readFile(path.join(root,result.backup,'views/SystemContext.md'),'utf8'),files.find(file=>file.path==='views/SystemContext.md')!.content);
 assert.deepEqual(compileModel(await readWorkspace(root)).errors,[]);
});
