import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { compileModel } from '../shared/model.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';
import { readWorkspace,WorkspaceStore,ConflictError } from '../server/workspace-store.ts';

const demo = await readWorkspace('docs/demo');
const addPerson = { op: 'entity.create', id: 'test.operator', kind: 'person', name: 'اپراتور آزمایشی', description: 'An operator added by a regression test', technology: '', viewId: 'system-context' };

test('native Markdown add/update roundtrip retains body, metadata and connection direction', () => {
 const result = prepareEdits(demo, [addPerson,
  { op: 'relation.create', id: 'test.uses', viewId: 'system-context', source: 'test.operator', target: 'commerce', label: 'Reviews orders', protocol: 'REST / HTTPS' },
  { ...addPerson, op: 'entity.update', name: 'Updated operator' },
 ]);
 assert.deepEqual(result.model.errors, []);
 assert.equal(result.model.entities.find(entity => entity.id === 'test.operator')?.name, 'Updated operator');
 assert.equal(result.model.relations.find(relation => relation.id === 'test.uses')?.source, 'test.operator');
 assert(result.files.some(file => file.path === 'studio/entities/test.operator.md'));
 assert(result.model.views.find(view => view.id === 'system-context')?.nodes.includes('test.operator'));
 const original = compileModel(demo).entities.find(entity => entity.id === 'commerce')!;
 assert.equal(result.model.entities.find(entity => entity.id === 'commerce')?.body, original.body);
});

async function temporaryWorkspace(t: { after: (fn: () => Promise<void>) => void }) {
 const root = await mkdtemp(path.join(tmpdir(), 'omnidocs-edit-test-'));
 t.after(() => rm(root, { recursive: true, force: true }));
 for (const file of demo) { const target = path.join(root, file.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
 return root;
}
test('server saves real Markdown with recoverable backups and rejects a stale concurrent save', async t => {
 const root = await temporaryWorkspace(t), store = new WorkspaceStore(root), revision = workspaceRevision(await store.read());
 const result = await store.save(revision, [addPerson]);
 assert.equal(compileModel(await store.read()).entities.find(entity => entity.id === 'test.operator')?.name, addPerson.name);
 assert(result.changed.includes('studio/entities/test.operator.md'));
 const view = compileModel(demo).views.find(view => view.id === 'system-context')!;
 assert.equal(await readFile(path.join(root, result.backup, view.source), 'utf8'), demo.find(file => file.path === view.source)!.content);
 await assert.rejects(store.save(revision, [{ ...addPerson, id: 'test.other' }]), ConflictError);
});
test('server rejects symlink destinations and rolls back an earlier file if a later write fails', async t => {
 const root = await temporaryWorkspace(t), outside = await mkdtemp(path.join(tmpdir(), 'omnidocs-outside-'));
 t.after(() => rm(outside, { recursive: true, force: true }));
 await symlink(outside, path.join(root, 'studio'));
 const store = new WorkspaceStore(root), revision = workspaceRevision(await store.read());
 await assert.rejects(store.save(revision, [addPerson]), /Symbolic links/);
 await rm(path.join(root, 'studio'));
 await mkdir(path.join(root, 'studio/entities/test.operator.md'), { recursive: true });
 await assert.rejects(store.save(revision, [addPerson]));
 assert.equal(workspaceRevision(await store.read()), revision);
});
