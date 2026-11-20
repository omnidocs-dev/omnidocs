import { mkdir, readFile, readdir, lstat, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SourceFile } from '../shared/model.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { workspaceRevision } from '../shared/edit-contract.ts';

export class ConflictError extends Error {}
export async function readWorkspace(root: string, prefix = ''): Promise<SourceFile[]> {
 const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
 return (await Promise.all(entries.filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules').map(async entry => {
  const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isDirectory()) return readWorkspace(root, relative);
  return entry.isFile() && /\.md$/i.test(entry.name) ? [{ path: relative, content: await readFile(path.join(root, relative), 'utf8') }] : [];
 }))).flat();
}
async function safePath(root: string, relative: string) {
 if (!relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.' || part.startsWith('.')) || path.isAbsolute(relative)) throw new Error('Invalid workspace path.');
 let current = root;
 for (const part of relative.split('/')) {
  current = path.join(current, part);
  try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not writable from Studio.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
 }
 return current;
}
export class WorkspaceStore {
 private queue: Promise<unknown> = Promise.resolve();
 constructor(readonly root: string) {}
 async read() { await this.queue.catch(() => {}); return readWorkspace(this.root); }
 save(revision: string, commands: unknown[]) {
  const operation = this.queue.catch(() => {}).then(async () => {
   const root = await realpath(this.root), original = await readWorkspace(root);
   if (workspaceRevision(original) !== revision) throw new ConflictError('The document folder changed. Reload it before saving; no files were overwritten.');
   const prepared = prepareEdits(original, commands);
   const transaction = `${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
   const history = path.join(root, '.omnidocs', 'history', transaction);
   // Reject a redirected backup folder as well as redirected model files.
   for (const folder of [path.join(root, '.omnidocs'), path.join(root, '.omnidocs', 'history')]) {
    try { if ((await lstat(folder)).isSymbolicLink()) throw new Error('Backup directories cannot be symbolic links.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   }
   const targets = await Promise.all(prepared.changes.map(async change => ({ ...change, absolute: await safePath(root, change.path) })));
   await mkdir(history, { recursive: true });
   await writeFile(path.join(history, 'manifest.json'), JSON.stringify({ revision, files: targets.map(({path,before}) => ({ path, existed: before !== null })) }, null, 2));
   for (const target of targets) if (target.before !== null) { const backup = path.join(history, target.path); await mkdir(path.dirname(backup), { recursive: true }); await writeFile(backup, target.before, { flag: 'wx' }); }
   if (workspaceRevision(await readWorkspace(root)) !== revision) throw new ConflictError('Files changed while the save was being prepared. Nothing was written.');
   const committed: typeof targets = [];
   try {
    for (const target of targets) {
     await safePath(root, target.path);
     const current = await readFile(target.absolute, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
     if (current !== target.before) throw new ConflictError(`Concurrent change in ${target.path}.`);
     await mkdir(path.dirname(target.absolute), { recursive: true });
     if (target.after === null) await rm(target.absolute);
     else {
      const temporary = path.join(path.dirname(target.absolute), `.omnidocs-${transaction}.tmp`);
      try { await writeFile(temporary, target.after, { flag: 'wx' }); await rename(temporary, target.absolute); } finally { await rm(temporary, { force: true }); }
     }
     committed.push(target);
    }
    if (workspaceRevision(await readWorkspace(root)) !== workspaceRevision(prepared.files)) throw new ConflictError('The folder changed during saving.');
   } catch (error) {
    for (const target of committed.reverse()) {
     // Never roll back over an external editor's subsequent change.
     if (await readFile(target.absolute, 'utf8').catch(() => null) !== target.after) continue;
     if (target.before === null) await rm(target.absolute, { force: true }); else await writeFile(target.absolute, target.before);
    }
    throw error;
   }
   return { files: prepared.files, revision: workspaceRevision(prepared.files), changed: targets.map(target => target.path), backup: `.omnidocs/history/${transaction}` };
  });
  this.queue = operation; return operation;
 }
}
