import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { workspaceRevision } from '../shared/edit-contract.ts';
import { ConflictError } from './workspace-store.ts';
import { SpaceCatalog } from './spaces.ts';

/** Local document API, separated from the process and watcher for integration tests. */
export function createStudioApp({ docsRoot, spacesRoot, demo = false }: { docsRoot: string; spacesRoot: string; demo?: boolean }) {
 const app = express();
 app.get('/api/mode',(_req,res)=>res.json({mode:'local'}));
const catalog = new SpaceCatalog(spacesRoot, docsRoot);
const store = catalog.defaultStore, editToken = randomUUID();
app.use('/api', (req, res, next) => {
  const allowed = new Set(['127.0.0.1','localhost','[::1]']);
  try {
    if (!allowed.has(new URL(`http://${req.headers.host}`).hostname)) { res.status(403).json({ error: 'Use the local Studio address.' }); return; }
    if (req.headers.origin && !allowed.has(new URL(req.headers.origin).hostname)) { res.status(403).json({ error: 'Cross-origin workspace access is disabled.' }); return; }
  } catch { res.status(403).json({ error: 'Invalid request origin.' }); return; }
  next();
});
app.use(express.json({ limit: '1mb', inflate: false }));
app.get('/api/workspace', async (_req, res) => {
  try { const files = await store.read(); res.json({ name: path.basename(docsRoot), demo, files, revision: workspaceRevision(files), editToken, writable: true }); }
  catch { res.status(500).json({ error: 'Cannot read the document folder. Check OMNIDOCS_DIR and file permissions.' }); }
});
app.post('/api/edits', async (req, res) => {
  if (req.get('x-omnidocs-token') !== editToken) { res.status(403).json({ error: 'Open this workspace in the local Studio before saving.' }); return; }
  const { revision, commands } = req.body ?? {};
  if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision) || !Array.isArray(commands)) { res.status(400).json({ error: 'A workspace revision and edit commands are required.' }); return; }
  try { res.json(await store.save(revision, commands)); }
  catch (error) { res.status(error instanceof ConflictError ? 409 : 422).json({ error: error instanceof Error ? error.message : 'Save failed.' }); }
});
app.get('/api/spaces', async (_req, res) => {
 try { res.json({ spaces: await catalog.list(), editToken }); } catch (error) { res.status(500).json({ error: String(error) }); }
});
app.post('/api/spaces', async (req, res) => {
 if (req.get('x-omnidocs-token') !== editToken) { res.status(403).json({ error: 'Open the local Studio before creating a space.' }); return; }
 try { const { store: _store, ...space } = await catalog.create(req.body); res.status(201).json(space); }
 catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : 'Cannot create space.' }); }
});
app.get('/api/spaces/:id/workspace', async (req, res) => {
 try { const space = await catalog.get(req.params.id), files = await space.store.read(); res.json({ name: space.name, files, revision: workspaceRevision(files), editToken, writable: true }); }
 catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Space unavailable.' }); }
});
app.post('/api/spaces/:id/edits', async (req, res) => {
 if (req.get('x-omnidocs-token') !== editToken) { res.status(403).json({ error: 'Open the local Studio before saving.' }); return; }
 const { revision, commands } = req.body ?? {};
 if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision) || !Array.isArray(commands)) { res.status(400).json({ error: 'A workspace revision and edit commands are required.' }); return; }
 try { const space = await catalog.get(req.params.id); res.json(await space.store.save(revision, commands)); }
 catch (error) { res.status(error instanceof ConflictError ? 409 : 422).json({ error: error instanceof Error ? error.message : 'Save failed.' }); }
});
 return { app, catalog, editToken };
}
