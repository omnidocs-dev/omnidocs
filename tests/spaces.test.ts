import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldSpace } from '../shared/space-scaffold.ts';
import { compileModel } from '../shared/model.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { SpaceCatalog } from '../server/spaces.ts';
import { ConflictError } from '../server/workspace-store.ts';

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
 const root = await realpath(await mkdtemp(path.join(tmpdir(), 'omnidocs-spaces-'))); t.after(() => rm(root, { recursive: true, force: true }));
 const projects = path.join(root,'projects'), existing = path.join(projects,'existing'); await mkdir(existing, { recursive: true });
 for (const file of scaffoldSpace({ name: 'Existing', description: 'An existing application' })) { const target = path.join(existing,file.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target,file.content); }
 return { root, projects, existing, catalog: new SpaceCatalog(projects, existing) };
}
test('a fresh C4 space can grow through containers and components and edit old items after reopening', async t => {
 const { catalog } = await setup(t), created = await catalog.create({ name: 'فضای جدید', description: 'توضیح سامانه', systemName: 'سامانه اصلی' });
 let files = await created.store.read(); const first = compileModel(files); assert.deepEqual(first.errors,[]); assert.equal(first.entities.length,1); assert.equal(first.views.length,2); assert.equal(first.importInfo?.integrity,'verified');
 const initial = workspaceRevision(files);
 let result = await created.store.save(initial, [{ op:'entity.create', id:'app.api', viewId:'Containers', kind:'container', name:'API', description:'Serves requests', technology:'Go' }]);
 result = await created.store.save(result.revision, [{ op:'view.create', id:'ApiComponents', viewId:'Containers', scope:'app.api', name:'API components', description:'Components of the API' }]);
 result = await created.store.save(result.revision, [{ op:'entity.create', id:'app.handler', viewId:'ApiComponents', kind:'component', name:'Handler', description:'Handles requests', technology:'Go' }]);
 const reopened = await catalog.get(created.id); files = await reopened.store.read();
 result = await reopened.store.save(workspaceRevision(files), [
  { op:'entity.update', id:'app.api', viewId:'Containers', kind:'container', name:'Public API', description:'Updated after reopening', technology:'Go 1.23' },
  { op:'entity.update', id:'app.handler', viewId:'ApiComponents', kind:'component', name:'Request handler', description:'Updated component', technology:'Go' },
  { op:'entity.update', id:'system.main', viewId:'SystemContext', kind:'system', name:'Renamed system', description:'Original item remains editable', technology:'' },
 ]);
 const model = compileModel(result.files); assert.deepEqual(model.errors,[]); assert.equal(model.entities.find(item => item.id === 'app.handler')?.parent,'app.api'); assert.equal(model.entities.find(item => item.id === 'app.api')?.name,'Public API');
 assert(result.files.find(file => file.path === 'views/c2-containers/system.main/Containers.md')?.content.includes('Public API'));
 assert(result.files.find(file => file.path === 'views/c3-components/app.api/ApiComponents.md')?.content.includes('Request handler'));
 assert(result.files.find(file => file.path === 'architecture-model.md')?.content.includes('component od_app_api ApiComponents'));
 await assert.rejects(reopened.store.save(initial,[{ op:'entity.create', id:'stale', viewId:'SystemContext', kind:'person', name:'Stale', description:'Stale edit', technology:'' }]),ConflictError);
});
test('space edits and connections remain isolated and catalog identities survive a process restart', async t => {
 const { catalog, projects, existing } = await setup(t), a = await catalog.create({ name:'App', description:'A' }), b = await catalog.create({ name:'App', description:'B' });
 assert.notEqual(a.id,b.id); const originalB = workspaceRevision(await b.store.read()); const originalDefault = workspaceRevision(await (await catalog.get((await catalog.list()).find(space => space.default)!.id)).store.read());
 let result = await a.store.save(workspaceRevision(await a.store.read()),[{ op:'entity.create', id:'user', viewId:'SystemContext', kind:'person', name:'User', description:'Uses the app', technology:'' }]);
 result = await a.store.save(result.revision,[{ op:'relation.create', id:'uses', viewId:'SystemContext', source:'user', target:'system.main', label:'Uses', protocol:'HTTPS' }]);
 result = await a.store.save(result.revision,[{ op:'relation.update', id:'uses', viewId:'SystemContext', source:'user', target:'system.main', label:'Calls', protocol:'REST / HTTPS' }]);
 const restarted = new SpaceCatalog(projects,existing), reopened = await restarted.get(a.id); assert.equal(compileModel(await reopened.store.read()).relations[0].label,'Calls');
 assert.equal(workspaceRevision(await (await restarted.get(b.id)).store.read()),originalB); assert.equal(workspaceRevision(await (await restarted.get((await restarted.list()).find(space => space.default)!.id)).store.read()),originalDefault);
 result = await reopened.store.save(result.revision,[{ op:'relation.delete', id:'uses', viewId:'SystemContext' }]); assert.equal(compileModel(result.files).relations.length,0);
 await assert.rejects(restarted.get('../../outside'),/not found/);
});
test('invalid creation is rejected without a folder and symlink spaces are excluded', async t => {
 const { catalog, projects, root } = await setup(t); const before = await readdir(projects);
 await assert.rejects(catalog.create({ name:' ', description:'x' })); assert.deepEqual(await readdir(projects),before);
 const outside = path.join(root,'outside'); await mkdir(outside); await symlink(outside,path.join(projects,'linked'));
 assert.equal((await catalog.list()).length,1);
 const linkedCatalog = new SpaceCatalog(path.join(projects,'linked'),catalog.defaultRoot);
 await assert.rejects(linkedCatalog.create({ name:'App',description:'x' }),/symlink/);
 assert.deepEqual(await readdir(outside),[]);
});
test('next-level creation rejects duplicate scopes and incompatible scope types', () => {
 const files = scaffoldSpace({name:'Test',description:'Test'}), revision = workspaceRevision(files);
 assert.throws(() => prepareEdits(files,[{op:'view.create',id:'OtherContainers',viewId:'SystemContext',scope:'system.main',name:'Other',description:'Other'}]),/already exists/);
 const person = prepareEdits(files,[{op:'entity.create',id:'person',viewId:'SystemContext',kind:'person',name:'Person',description:'User',technology:''}]);
 assert.throws(() => prepareEdits(person.files,[{op:'view.create',id:'Bad',viewId:'SystemContext',scope:'person',name:'Bad',description:'Bad'}]),/software system or container/);
 assert.equal(workspaceRevision(files),revision);
});

test('native Markdown workspaces can create scoped next-level documents without changing existing prose', async () => {
 const { readWorkspace } = await import('../server/workspace-store.ts');
 const files = await readWorkspace('docs/demo'), model = compileModel(files), target = model.views.find(view => view.type === 'container')!;
 const created = prepareEdits(files,[
  {op:'entity.create',id:'qa.newcontainer',viewId:target.id,kind:'container',name:'New container',description:'Test container',technology:'Go'},
  {op:'view.create',id:'QaComponents',viewId:target.id,scope:'qa.newcontainer',name:'Components',description:'Scoped components'},
  {op:'entity.create',id:'qa.component',viewId:'QaComponents',kind:'component',name:'Component',description:'Test component',technology:'Go'},
 ]);
 assert.deepEqual(created.model.errors,[]); assert.equal(created.model.entities.find(entity => entity.id === 'qa.component')?.parent,'qa.newcontainer');
 assert(created.files.some(file => file.path === 'views/c3-components/qa.newcontainer/QaComponents.md'));
 const old = model.entities[0]; assert.equal(created.model.entities.find(entity => entity.id === old.id)?.body,old.body);
});
