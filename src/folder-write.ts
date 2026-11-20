import { inspectWorkspace } from '../shared/workspace-inspection';
import type { SourceFile } from '../shared/model';
import { fileChanges, workspaceRevision } from '../shared/edit-contract';

export async function readDirectory(directory: FileSystemDirectoryHandle, prefix = ''): Promise<SourceFile[]> {
 const files: SourceFile[] = [];
 for await (const [name, handle] of (directory as any).entries()) {
  if (name.startsWith('.') || name === 'node_modules') continue;
  const path = prefix ? `${prefix}/${name}` : name;
  if (handle.kind === 'directory') files.push(...await readDirectory(handle, path));
  else if (/\.md$/i.test(name)) files.push({ path, content: await (await handle.getFile()).text() });
 }
 return files;
}
async function getFile(directory: FileSystemDirectoryHandle, path: string, create: boolean) {
 const parts = path.split('/');
 if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('Invalid workspace path.');
 for (const part of parts.slice(0,-1)) directory = await directory.getDirectoryHandle(part, { create });
 return directory.getFileHandle(parts[parts.length - 1], { create });
}
async function write(handle: FileSystemFileHandle, content: string) { const stream = await handle.createWritable(); try { await stream.write(content); await stream.close(); } catch (error) { await stream.abort().catch(() => {}); throw error; } }
export async function saveDirectory(directory: FileSystemDirectoryHandle, base: SourceFile[], next: SourceFile[]) {
 const revision = workspaceRevision(base);
 if (workspaceRevision(await readDirectory(directory)) !== revision) throw new Error('This folder differs from the loaded workspace. Reopen the current files before saving.');
 const changes = fileChanges(base, next), transaction = `${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}`;
 const backup = await (await (await directory.getDirectoryHandle('.omnidocs', { create: true })).getDirectoryHandle('history', { create: true })).getDirectoryHandle(transaction, { create: true });
 await write(await getFile(backup, 'manifest.json', true), JSON.stringify({ revision, files: changes.map(({ path, before }) => ({ path, existed: before !== null })) }, null, 2));
 for (const change of changes) if (change.before !== null) await write(await getFile(backup, change.path, true), change.before);
 if (workspaceRevision(await readDirectory(directory)) !== revision) throw new Error('Files changed while preparing the save. Nothing was written.');
 const committed: typeof changes = [];
 try {
  for (const change of changes) {
   let current: string | null = null;
   try { current = await (await (await getFile(directory, change.path, false)).getFile()).text(); } catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; }
   if (current !== change.before) throw new Error(`Concurrent change in ${change.path}.`);
   if (change.after === null) {
    const parts = change.path.split('/'); let parent = directory;
    for (const part of parts.slice(0,-1)) parent = await parent.getDirectoryHandle(part);
    await parent.removeEntry(parts.at(-1)!);
   } else await write(await getFile(directory, change.path, true), change.after);
   committed.push(change);
  }
  if (workspaceRevision(await readDirectory(directory)) !== workspaceRevision(next)) throw new Error('The folder changed during saving.');
 } catch (error) {
  for (const change of committed.reverse()) {
   let current: string | null = null;
   try { current = await (await (await getFile(directory,change.path,false)).getFile()).text(); } catch (err) { if ((err as DOMException).name !== 'NotFoundError') throw err; }
   if (current !== change.after) continue;
   if (change.before !== null) await write(await getFile(directory,change.path,true),change.before);
   else { const parts=change.path.split('/'); let parent=directory; for (const part of parts.slice(0,-1)) parent=await parent.getDirectoryHandle(part); await parent.removeEntry(parts.at(-1)!); }
  }
  throw new Error(`${error instanceof Error ? error.message : 'Save failed.'} Backup: .omnidocs/history/${transaction}`);
 }
 return { backup: `.omnidocs/history/${transaction}`, changed: changes.map(change => change.path) };
}

/** Reuse the opened directory; permission renewal never selects a new destination. */
export async function ensureDirectoryWritable(directory: FileSystemDirectoryHandle) {
 const permission = directory as FileSystemDirectoryHandle & { queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>; requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState> };
 if (!permission.queryPermission) return;
 if (await permission.queryPermission({ mode: 'readwrite' }) === 'granted') return;
 if (permission.requestPermission && await permission.requestPermission({ mode: 'readwrite' }) === 'granted') return;
 throw new Error('Write access to the current project folder was denied. Allow access to this same folder to save; the project has not been changed.');
}

/** Finder metadata does not make a newly chosen project folder nonempty. */
export async function directoryIsEmpty(directory: FileSystemDirectoryHandle) {
 for await (const [name] of (directory as any).entries()) if (name !== '.DS_Store') return false;
 return true;
}

/** Called only after the user confirms the visible scaffold preview. Never initialize over existing files. */
export async function initializeDirectory(directory: FileSystemDirectoryHandle, files: SourceFile[]) {
 const inspection = inspectWorkspace(files);
 if (!inspection.compatible) throw new Error(inspection.errors.join('\n'));
 await ensureDirectoryWritable(directory);
 if (!await directoryIsEmpty(directory)) throw new Error('The folder is no longer empty. Reopen and validate its contents before creating documentation; no existing files were overwritten.');
 return saveDirectory(directory, [], files);
}
