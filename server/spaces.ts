import { mkdir, readdir, realpath, lstat, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { compileModel } from '../shared/model.ts';
import { scaffoldSpace, spaceInput } from '../shared/space-scaffold.ts';
import { WorkspaceStore } from './workspace-store.ts';

export class SpaceCatalog {
 private stores = new Map<string, WorkspaceStore>();
 constructor(readonly root: string, readonly defaultRoot: string, readonly defaultStore = new WorkspaceStore(defaultRoot)) {}
 private id(root: string) { return createHash('sha256').update(root).digest('hex').slice(0,24); }
 async list() {
  await mkdir(this.root, { recursive: true });
  const defaultRoot = await realpath(this.defaultRoot), roots = new Set([defaultRoot]);
  for (const entry of await readdir(this.root, { withFileTypes: true })) if (entry.isDirectory() && !entry.name.startsWith('.')) roots.add(await realpath(path.join(this.root, entry.name)));
  const spaces = [];
  for (const root of roots) {
   const id = this.id(root); this.stores.set(id, this.stores.get(id) ?? (root === defaultRoot ? this.defaultStore : new WorkspaceStore(root)));
   const files = await this.stores.get(id)!.read(), model = compileModel(files);
   if (model.errors.length) continue;
   spaces.push({ id, name: model.project.name, folder: root, default: root === defaultRoot });
  }
  return spaces;
 }
 async get(id: string) {
  const spaces = await this.list(), space = spaces.find(space => space.id === id);
  if (!space) throw new Error('Space not found.');
  return { ...space, store: this.stores.get(id)! };
 }
 async create(input: unknown) {
  const data = spaceInput.parse(input), files = scaffoldSpace(data), model = compileModel(files);
  if (model.errors.length) throw new Error(model.errors.join('\n'));
  // Creation is confined to the configured catalog; no client-controlled paths.
  await mkdir(this.root, { recursive: true });
  if ((await lstat(this.root)).isSymbolicLink() || await realpath(this.root) !== path.resolve(this.root)) throw new Error('Spaces directory must be a real directory without symlink ancestors.');
  const slug = data.name.normalize('NFKD').replace(/[^a-zA-Z0-9\u0600-\u06ff]+/g,'-').slice(0,60).replace(/^-|-$/g,'') || 'space';
  const suffix = randomUUID().slice(0,8), destination = path.join(this.root, `${slug}-${suffix}`), staging = path.join(this.root, `.create-${suffix}`);
  await mkdir(staging);
  try {
   for (const file of files) { const target = path.join(staging, file.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content, { flag: 'wx' }); }
   await rename(staging, destination);
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  return this.get(this.id(await realpath(destination)));
 }
}
