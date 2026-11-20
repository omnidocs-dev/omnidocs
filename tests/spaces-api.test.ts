import test from 'node:test';
import assert from 'node:assert/strict';
import { Duplex, PassThrough } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Express } from 'express';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createStudioApp } from '../server/app.ts';
import { scaffoldSpace } from '../shared/space-scaffold.ts';

/** Exercise Express middleware and routes over an in-memory HTTP transport, without binding a port. */
async function request(app: Express, method: string, url: string, body?: unknown, token?: string, origin?: string) {
 let output = '';
 const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
 const req = new PassThrough() as unknown as IncomingMessage; req.socket = socket as Socket; const res = new ServerResponse(req);
 req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1; req.method = method; req.url = url; req.headers = { host:'127.0.0.1:4174', ...(token ? {'x-omnidocs-token':token} : {}), ...(origin ? {origin} : {}) };
 const serialized = body === undefined ? '' : JSON.stringify(body);
 if (serialized) { req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(serialized)); }
 res.assignSocket(socket as Socket);
 await new Promise<void>((resolve,reject) => { const timer = setTimeout(() => reject(new Error(`${method} ${url}: ${output}`)), 2000); res.on('finish',() => { clearTimeout(timer); resolve(); }); res.on('error',reject); app(req,res); req.push(serialized ? Buffer.from(serialized) : null); if (serialized) req.push(null); });
 socket.destroy();
 return { status: res.statusCode, data: JSON.parse(output.split('\r\n\r\n').slice(1).join('\r\n\r\n')) };
}
test('space API authorizes creation and scopes edits, reloads, conflicts, and cross-origin protection', async t => {
 const root = await realpath(await mkdtemp(path.join(tmpdir(),'omnidocs-api-'))); t.after(() => rm(root,{recursive:true,force:true}));
 const docsRoot = path.join(root,'existing'); await mkdir(docsRoot);
 for (const file of scaffoldSpace({name:'Existing',description:'Existing system'})) { const target = path.join(docsRoot,file.path); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,file.content); }
 const { app } = createStudioApp({ docsRoot,spacesRoot:path.join(root,'projects') });
 const catalog = await request(app,'GET','/api/spaces'); assert.equal(catalog.status,200); const token = catalog.data.editToken, originalId = catalog.data.spaces[0].id;
 assert.equal((await request(app,'POST','/api/spaces',{name:'New',description:'New application'})).status,403);
 assert.equal((await request(app,'POST','/api/spaces',{name:'New',description:'New application'},token,'https://untrusted.example')).status,403);
 const creation = await request(app,'POST','/api/spaces',{name:'New',description:'New application'},token); assert.equal(creation.status,201);
 const id = creation.data.id, workspace = await request(app,'GET',`/api/spaces/${id}/workspace`); assert.equal(workspace.status,200);
 const command = {op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Updated',description:'Updated purpose',technology:''};
 const saved = await request(app,'POST',`/api/spaces/${id}/edits`,{revision:workspace.data.revision,commands:[command]},token); assert.equal(saved.status,200); assert(saved.data.backup);
 assert.equal((await request(app,'POST',`/api/spaces/${id}/edits`,{revision:workspace.data.revision,commands:[command]},token)).status,409);
 const reload = await request(app,'GET',`/api/spaces/${id}/workspace`); assert(reload.data.files.find((file: any) => file.path === 'architecture-model.md').content.includes('Updated purpose'));
 const original = await request(app,'GET',`/api/spaces/${originalId}/workspace`); assert(!original.data.files.find((file: any) => file.path === 'architecture-model.md').content.includes('Updated purpose'));
 assert.equal((await request(app,'GET','/api/spaces/unknown/workspace')).status,404);
});
