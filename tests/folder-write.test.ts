import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveDirectory } from '../src/folder-write.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';

test('workspace revisions are independent of enumeration order and locale-sensitive filenames', () => {
 const files = ['Z.md','á.md','مدل.md','a.md'].map(path => ({ path, content: path }));
 assert.equal(workspaceRevision(files), workspaceRevision([...files].reverse()));
 assert.notEqual(workspaceRevision(files), workspaceRevision(files.map(file => file.path === 'مدل.md' ? { ...file, content: 'changed' } : file)));
});

function memoryDirectory(initial: Record<string,string>) {
 const contents = new Map(Object.entries(initial));
 const directories = new Set<string>(['']);
 for (const file of contents.keys()) { const parts = file.split('/'); for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0,index).join('/')); }
 function directory(prefix = ''): any {
  const join = (name: string) => prefix ? `${prefix}/${name}` : name;
  return { kind: 'directory',
   async *entries() {
    const names = new Set<string>();
    for (const file of [...contents.keys(), ...directories]) if (file.startsWith(prefix ? prefix+'/' : '') && file !== prefix) names.add(file.slice(prefix ? prefix.length + 1 : 0).split('/')[0]);
    for (const name of names) { const path = join(name); yield [name, directories.has(path) ? directory(path) : await this.getFileHandle(name)]; }
   },
   async getDirectoryHandle(name: string, options: any = {}) { const path = join(name); if (!directories.has(path) && !options.create) throw new DOMException('Missing folder','NotFoundError'); directories.add(path); return directory(path); },
   async getFileHandle(name: string, options: any = {}) {
    const path = join(name); if (!contents.has(path) && !options.create) throw new DOMException('Missing file','NotFoundError');
    return { kind: 'file', getFile: async () => ({ text: async () => contents.get(path) ?? '' }), createWritable: async () => { let pending = ''; return { write: async (value: string) => { pending = value; }, close: async () => { contents.set(path,pending); }, abort: async () => {} }; } };
   },
   async removeEntry(name: string) { contents.delete(join(name)); },
  };
 }
 return { handle: directory() as FileSystemDirectoryHandle, contents };
}
test('browser folder adapter backs up originals, writes existing/new Markdown, and detects external changes', async () => {
 const directory = memoryDirectory({ 'architecture/model.md': 'original', 'notes.md': 'notes unchanged' });
 const base = [{ path: 'architecture/model.md', content: 'original' }, { path: 'notes.md', content: 'notes unchanged' }];
 const next = [{ path: 'architecture/model.md', content: 'updated' }, { path: 'notes.md', content: 'notes unchanged' }, { path: 'studio/new.md', content: 'new entity' }];
 const result = await saveDirectory(directory.handle, base, next);
 assert.equal(directory.contents.get('architecture/model.md'), 'updated');
 assert.equal(directory.contents.get('studio/new.md'), 'new entity');
 assert.equal(directory.contents.get(`${result.backup}/architecture/model.md`), 'original');
 assert.equal(directory.contents.get('notes.md'), 'notes unchanged');
 await assert.rejects(saveDirectory(directory.handle, base, next), /differs/);
 assert.equal(directory.contents.get('architecture/model.md'), 'updated');
});

test('the same connected folder supports repeated save sessions and never writes another project', async () => {
 const current = memoryDirectory({ 'model.md': 'v1' }), other = memoryDirectory({ 'model.md': 'other project' });
 let base = [{ path: 'model.md', content: 'v1' }];
 for (const content of ['v2','v3']) {
  const next = [{ path: 'model.md', content }, { path: 'studio/new.md', content: 'new item' }];
  await saveDirectory(current.handle,base,next); base=next;
 }
 assert.equal(current.contents.get('model.md'),'v3'); assert.equal(current.contents.get('studio/new.md'),'new item'); assert.equal(other.contents.get('model.md'),'other project'); assert.equal(other.contents.size,1);
 current.contents.set('model.md','external edit'); await assert.rejects(saveDirectory(current.handle,base,[{path:'model.md',content:'v4'}]),/differs/);
 const { readDirectory } = await import('../src/folder-write.ts'); base = await readDirectory(current.handle);
 await saveDirectory(current.handle,base,base.map(file=>file.path==='model.md'?{...file,content:'v5'}:file)); assert.equal(current.contents.get('model.md'),'v5');
});
test('directory permission is reused or renewed on the same handle without choosing another path', async () => {
 const { ensureDirectoryWritable } = await import('../src/folder-write.ts');
 let requests = 0; const options: unknown[] = [];
 const handle = {queryPermission:async (option: unknown)=>{options.push(option); return 'granted';}, requestPermission:async ()=>{requests++;return 'granted';}} as unknown as FileSystemDirectoryHandle;
 await ensureDirectoryWritable(handle); await ensureDirectoryWritable(handle); assert.equal(requests,0); assert.deepEqual(options,[{mode:'readwrite'},{mode:'readwrite'}]);
 const renew = {queryPermission:async ()=>'prompt',requestPermission:async ()=>{requests++;return 'granted';}} as unknown as FileSystemDirectoryHandle;
 await ensureDirectoryWritable(renew); assert.equal(requests,1);
 const denied = {queryPermission:async ()=>'denied',requestPermission:async ()=>'denied'} as unknown as FileSystemDirectoryHandle;
 await assert.rejects(ensureDirectoryWritable(denied),/current project folder was denied/);
});

test('empty folders initialize only through the explicit creation operation and validate after writing', async () => {
 const { scaffoldSpace } = await import('../shared/space-scaffold.ts');
 const { inspectWorkspace } = await import('../shared/workspace-inspection.ts');
 const { directoryIsEmpty, initializeDirectory, readDirectory } = await import('../src/folder-write.ts');
 const folder = memoryDirectory({'.DS_Store':'Finder metadata'});
 assert.equal(await directoryIsEmpty(folder.handle),true);
 const preview = scaffoldSpace({name:'New app',description:'Application purpose'});
 assert.equal(folder.contents.size,1); // Constructing/reviewing the preview writes nothing.
 await initializeDirectory(folder.handle,preview);
 const sources = await readDirectory(folder.handle), report = inspectWorkspace(sources);
 assert.equal(report.compatible,true); assert.equal(report.editable,true); assert.equal(report.documents,5); assert.equal(report.elements,1); assert.equal(report.views,2);
 for (const file of preview) assert.equal(folder.contents.get(file.path),file.content);
 assert.equal(folder.contents.get('.DS_Store'),'Finder metadata');
 const before = new Map(folder.contents);
 await assert.rejects(initializeDirectory(folder.handle,preview),/no longer empty/);
 assert.deepEqual(folder.contents,before);
});
test('non-Markdown files and files appearing while confirmation is open prevent initialization without overwriting', async () => {
 const { scaffoldSpace } = await import('../shared/space-scaffold.ts');
 const { directoryIsEmpty, initializeDirectory } = await import('../src/folder-write.ts');
 const folder = memoryDirectory({}), files = scaffoldSpace({name:'New app',description:'Purpose'});
 assert.equal(await directoryIsEmpty(folder.handle),true);
 folder.contents.set('existing.pdf','existing content');
 assert.equal(await directoryIsEmpty(folder.handle),false);
 await assert.rejects(initializeDirectory(folder.handle,files),/no longer empty/);
 assert.deepEqual([...folder.contents],[['existing.pdf','existing content']]);
});
test('compatibility reports distinguish supported models, ordinary Markdown, invalid references and stale snapshots', async () => {
 const { scaffoldSpace } = await import('../shared/space-scaffold.ts');
 const { inspectWorkspace } = await import('../shared/workspace-inspection.ts');
 const { readWorkspace } = await import('../server/workspace-store.ts');
 assert.equal(inspectWorkspace(await readWorkspace('docs/demo')).compatible,true);
 const ordinary = [{path:'README.md',content:'# Existing documentation\nA prose document.'}];
 assert.equal(inspectWorkspace(ordinary).compatible,false);
 const files = scaffoldSpace({name:'Test',description:'Purpose'});
 const snapshotOnly = files.map(file=>file.path==='architecture-json.md'?{...file,content:file.content.replace(/^model_source:.*\n/m,'').replace(/^source_dsl_sha256:.*\n/m,'')}:file);
 const viewOnly = inspectWorkspace(snapshotOnly); assert.equal(viewOnly.compatible,true); assert.equal(viewOnly.editable,false);
 const stale = files.map(file=>file.path==='architecture-model.md'?{...file,content:file.content.replace('"Purpose"','"Changed purpose"')}:file);
 const report=inspectWorkspace(stale); assert.equal(report.compatible,false); assert(report.errors.some(error=>/stale|SHA-256/.test(error)));
 assert.equal(inspectWorkspace([]).compatible,false);
 const native = [{path:'project.md',content:'---\nid: project\nkind: project\nname: Test\ndescription: Test\nhome: missing-view\n---\n'}];
 assert.equal(inspectWorkspace(native).compatible,false);
});

test('browser view moves remove old paths and restore deleted originals if a later removal fails', async () => {
 const initial = {'old-a.md':'A','old-b.md':'B'}, base=Object.entries(initial).map(([path,content])=>({path,content}));
 const next=[{path:'views/c1-context/system/A.md',content:'A'},{path:'views/c2-containers/system/B.md',content:'B'}];
 const folder=memoryDirectory(initial), originalRemove=folder.handle.removeEntry.bind(folder.handle);
 folder.handle.removeEntry=async name=>{if(name==='old-b.md')throw new Error('Simulated removal failure');await originalRemove(name);};
 await assert.rejects(saveDirectory(folder.handle,base,next),/Simulated removal failure/);
 assert.equal(folder.contents.get('old-a.md'),'A');assert.equal(folder.contents.get('old-b.md'),'B');assert(!folder.contents.has('views/c1-context/system/A.md'));
 folder.handle.removeEntry=originalRemove;
 await saveDirectory(folder.handle,base,next);
 assert(!folder.contents.has('old-a.md'));assert(!folder.contents.has('old-b.md'));assert.equal(folder.contents.get('views/c1-context/system/A.md'),'A');
});
