import {createServer,type Server} from 'node:http';
import express from 'express';
import { watch } from 'chokidar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudioApp } from './app.ts';
import { workspaceConfiguration } from './workspace-config.ts';
import { adminCredentialsFromEnvironment } from './service/admin.ts';
import {serviceDatabaseURL} from './service/database.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { documents: docsRoot, spaces: spacesRoot, demo } = await workspaceConfiguration(root);
const serviceMode=process.env.OMNIDOCS_MODE==='service';
const publicURL=process.env.OMNIDOCS_PUBLIC_URL||'http://127.0.0.1:4174';
const mailEndpoint=process.env.OMNIDOCS_MAIL_WEBHOOK;
const alertEndpoint=process.env.OMNIDOCS_SECURITY_ALERT_WEBHOOK;
function validateWebhook(value:string,setting:string,allowLoopback=false){
 let endpoint:URL;
 try{endpoint=new URL(value);}catch{throw new Error(`Configure a valid ${setting} URL.`);}
 const loopback=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname);
 if(endpoint.username||endpoint.password)throw new Error(`Configure ${setting} credentials with its separate token setting.`);
 if(endpoint.protocol!=='https:'&&!(allowLoopback&&endpoint.protocol==='http:'&&loopback(new URL(publicURL).hostname)&&loopback(endpoint.hostname))){
  throw new Error(`${setting} must use HTTPS.`);
 }
}
if(serviceMode&&mailEndpoint)validateWebhook(mailEndpoint,'OMNIDOCS_MAIL_WEBHOOK',true);
if(serviceMode&&alertEndpoint)validateWebhook(alertEndpoint,'OMNIDOCS_SECURITY_ALERT_WEBHOOK');
async function postWebhook(url:string,message:unknown,token?:string){
 const response=await fetch(url,{method:'POST',
  headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
  body:JSON.stringify(message),signal:AbortSignal.timeout(15000),redirect:'error'});
 await response.body?.cancel();
 if(!response.ok)throw new Error('Webhook delivery failed.');
}
const admin=serviceMode?adminCredentialsFromEnvironment(process.env):undefined;
const service=serviceMode?await (await import('./service/app.ts')).createServiceApp({
 admin,root:path.resolve(process.env.OMNIDOCS_SERVICE_DATA||path.join(root,'.service-data')),
 origin:publicURL,
 databaseURL:serviceDatabaseURL(process.env),devMail:process.env.OMNIDOCS_DEV_MAIL==='1',
 trustProxyHops:process.env.OMNIDOCS_BEHIND_PROXY==='1'?1:undefined,
 adminNetworks:process.env.OMNIDOCS_ADMIN_NETWORKS,
 mail:mailEndpoint?message=>postWebhook(mailEndpoint,message,process.env.OMNIDOCS_MAIL_TOKEN):undefined,
 securityAlert:alertEndpoint?event=>postWebhook(alertEndpoint,event,process.env.OMNIDOCS_SECURITY_ALERT_TOKEN):undefined,
}):null;
const {app}=service??createStudioApp({docsRoot,spacesRoot,demo});
const subscribers = new Set<express.Response>();
if(!serviceMode)app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders(); res.write(': connected\n\n'); subscribers.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); subscribers.delete(res); });
});
const watcher = !serviceMode?watch([...new Set([docsRoot, spacesRoot])], { ignoreInitial: true, usePolling: true, interval: 500, followSymlinks: false, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }, ignored: /(^|[/\\])\../ }):null;
watcher?.on('error', error => console.error('Document watcher:', error));
watcher?.on('all', (_event, filename) => { if (/\.md$/i.test(filename)) for (const res of subscribers) res.write('data: changed\n\n'); });
if (process.argv.includes('--production')) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
const port = Number(process.env.OMNIDOCS_PORT || 4174);
const host=process.env.OMNIDOCS_HOST||'127.0.0.1';
let server:Server;
try{
 server=await new Promise<Server>((resolve,reject)=>{const instance=createServer(app);instance.once('error',reject);instance.listen(port,host,()=>{instance.removeListener('error',reject);resolve(instance);});});
 console.log(`${serviceMode?'OmniDocs hosted service':`OmniDocs documents: ${docsRoot}`}\n${process.argv.includes('--production')?'Studio':'Document API'}: http://${host}:${port}`);
}catch(error){
 await watcher?.close();await service?.close();
 const code=(error as NodeJS.ErrnoException).code;
 console.error(code==='EADDRINUSE'?`Cannot start OmniDocs: port ${port} is already in use. Stop the other OmniDocs instance or set OMNIDOCS_PORT and OMNIDOCS_PUBLIC_URL to a free port.`:`Cannot start OmniDocs on ${host}:${port}: ${code??String(error)}`);
 process.exit(1);
}
function close() { for (const res of subscribers) res.end(); void watcher?.close(); server.close(()=>{void service?.close();}); }
process.on('SIGINT', close); process.on('SIGTERM', close);
