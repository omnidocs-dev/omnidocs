import test from 'node:test';
import {createHmac} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Duplex,PassThrough} from 'node:stream';
import {ServerResponse,type IncomingMessage} from 'node:http';
import type {Socket} from 'node:net';
import type {Express} from 'express';
import {createServiceApp as createApp,type Mail,type ServiceOptions} from '../server/service/app.ts';
import {normalizeSixDigitCode} from '../src/SignInFields.tsx';
import {initializePersonalAccounts} from '../server/service/personal-accounts.ts';
const origin='http://127.0.0.1:4174',password='Correct-Horse-Blue-123';
type Login={cookie:string;csrf:string};
const appDatabases=new WeakMap<Express,Awaited<ReturnType<typeof createApp>>['db']>();
const createServiceApp=async(options:ServiceOptions)=>{
 const service=await createApp(options);appDatabases.set(service.app,service.db);return service;
};
type TestCaptcha={id:string;answer:string};
async function seedCaptcha(app:Express,purpose:string,client='127.0.0.1',expires=Date.now()+180_000){
 const {secret,digest}=await import('../server/service/security.ts');
 const id=secret(),answer='123456';
 await appDatabases.get(app)!.transaction(sql=>sql.run('INSERT INTO captcha_challenges(id,purpose,client,answer,expires) VALUES(?,?,?,?,?)',
  [id,purpose,client,digest(id+answer),expires]));
 return {id,answer};
}
async function request(app:Express,method:string,url:string,body?:unknown,session?:Login,requestOrigin=origin,remoteAddress='127.0.0.1',forwardedFor?:string,captcha?:TestCaptcha|null,compress=false){
 const purpose=({ '/api/auth/login':'login','/api/auth/register':'register','/admin/api/login':'admin'} as Record<string,string>)[url];
 if(captcha===undefined&&method==='POST'&&purpose)captcha=await seedCaptcha(app,purpose,forwardedFor??remoteAddress);
 let output='';const socket=new Duplex({read(){},write(chunk,_encoding,callback){output+=chunk.toString();callback();}});const req=new PassThrough() as unknown as IncomingMessage;Object.defineProperty(socket,'remoteAddress',{value:remoteAddress});req.socket=socket as Socket;
 req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.method=method;req.url=url;req.headers={host:'127.0.0.1:4174',origin:requestOrigin,...(forwardedFor?{'x-forwarded-for':forwardedFor}:{}),...(captcha?{'x-omnidocs-captcha-id':captcha.id,'x-omnidocs-captcha-answer':captcha.answer}:{}),...(session?{cookie:session.cookie,'x-omnidocs-token':session.csrf}:{})};
 const serialized=body===undefined?null:Buffer.from(JSON.stringify(body));
 const wireBody=compress&&serialized?gzipSync(serialized):serialized;
 if(wireBody){req.headers['content-type']='application/json';req.headers['content-length']=String(wireBody.length);}
 if(compress)req.headers['content-encoding']='gzip';
 const res=new ServerResponse(req);res.assignSocket(socket as Socket);
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${url}: request timed out`)),10000);res.on('finish',()=>{clearTimeout(timer);resolve();});res.on('error',reject);app(req,res);if(wireBody)req.push(wireBody);req.push(null);});socket.destroy();
 return{status:res.statusCode,data:JSON.parse(output.split('\r\n\r\n').slice(1).join('\r\n\r\n')),cookie:String(res.getHeader('set-cookie')??'').split(';')[0],setCookie:String(res.getHeader('set-cookie')??''),headers:res.getHeaders()};
}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},admin?:ServiceOptions['admin']){const root=await mkdtemp(path.join(tmpdir(),'omnidocs-service-')),mail:Mail[]=[];const service=await createServiceApp({root,origin,admin,mail:async message=>{mail.push(message);}});t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const call=(method:string,url:string,body?:unknown,session?:Login)=>request(service.app,method,url,body,session);
 async function user(email:string){assert.equal((await call('POST','/api/auth/register',{email,name:email.split('@')[0],password})).status,202);await service.drainMail();const message=mail.find(m=>m.to===email&&m.text.includes('/verify/'))!;assert(message);assert.equal((await call('POST','/api/auth/verify',{token:message.text.match(/verify\/(\S+)/)![1],password})).status,200);const login=await call('POST','/api/auth/login',{email,password});assert.equal(login.status,200);assert(login.setCookie.includes('HttpOnly'));assert(login.setCookie.includes('SameSite=Lax'));return{cookie:login.cookie,csrf:login.data.csrf};}
 async function create(session:Login,kind:string,parentId?:string){const result=await call('POST','/api/resources',{kind,parentId,name:`${kind} example`,description:'Private independent documentation'},session);assert.equal(result.status,201,JSON.stringify(result.data));return result.data.id as string;}
 return{...service,root,mail,call,user,create};}

test('verified accounts, private hierarchy, invitation inheritance, future descendants and revocation are enforced server-side',async t=>{
 const f=await fixture(t),alice=await f.user('alice@example.com'),bob=await f.user('bob@example.com'),eve=await f.user('eve@example.com');
 const organization=await f.create(alice,'organization'),project=await f.create(alice,'project',organization),space=await f.create(alice,'space',project);
 assert.deepEqual((await f.call('GET','/api/health')).data,{status:'ok'});
 assert.deepEqual((await f.call('GET','/api/tree',undefined,eve)).data.resources,[]);
 assert.equal((await f.call('GET',`/api/spaces/${space}/workspace`)).status,401);
 assert.equal((await f.call('GET',`/api/spaces/${space}/workspace`,undefined,eve)).status,404);
 assert.equal((await f.call('POST','/api/resources',{kind:'space',parentId:organization,name:'Wrong parent',description:'Invalid tree'},alice)).status,422);
 const invite=await f.call('POST',`/api/resources/${organization}/invitations`,{email:'BOB@example.com',role:'editor'},alice);assert.equal(invite.status,201);
 assert.equal((await f.call('POST',`/api/invitations/${invite.data.id}/accept`,{},eve)).status,404);
 assert.equal((await f.call('POST',`/api/invitations/${invite.data.id}/accept`,{},bob)).status,200);
 const second=await f.create(alice,'space',project),workspace=await f.call('GET',`/api/spaces/${second}/workspace`,undefined,bob);assert(workspace.data.writable);
 assert.equal((await f.call('POST',`/api/resources/${project}/invitations`,{email:'eve@example.com',role:'viewer'},bob)).status,403);
 assert.equal((await f.call('POST',`/api/spaces/${space}/shares`,{mode:'public'},bob)).status,403);
 const command={op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Edited by member',description:'Changed only in this space',technology:''};
 const saved=await f.call('POST',`/api/spaces/${second}/edits`,{revision:workspace.data.revision,commands:[command]},bob);assert.equal(saved.status,200);
 assert.equal((await f.call('POST',`/api/spaces/${second}/edits`,{revision:workspace.data.revision,commands:[command]},bob)).status,409);
 const original=await f.call('GET',`/api/spaces/${space}/workspace`,undefined,alice);assert(!original.data.files.some((file:{content:string})=>file.content.includes('Edited by member')));
 const lower=await f.call('POST',`/api/resources/${space}/invitations`,{email:'bob@example.com',role:'viewer'},alice);await f.call('POST',`/api/invitations/${lower.data.id}/accept`,{},bob);
 assert((await f.call('GET',`/api/spaces/${space}/workspace`,undefined,bob)).data.writable,'direct viewer cannot downgrade inherited editor');
 const access=await f.call('GET',`/api/resources/${organization}/access`,undefined,alice);await f.call('DELETE',`/api/memberships/${access.data.members[0].id}`,undefined,alice);
 assert.equal((await f.call('GET',`/api/spaces/${second}/workspace`,undefined,bob)).status,404);
 const remaining=await f.call('GET',`/api/spaces/${space}/workspace`,undefined,bob);assert.equal(remaining.data.writable,false);assert.equal(remaining.data.editToken,undefined);
 const childOnly=(await f.call('GET','/api/tree',undefined,bob)).data.resources;
 assert.equal(childOnly.find((resource:{id:string})=>resource.id===organization).description,'');
 assert(!childOnly.some((resource:{id:string})=>resource.id===second));
 assert.equal((await f.call('POST',`/api/spaces/${space}/edits`,{revision:remaining.data.revision,commands:[command]},bob)).status,403);
 assert.equal((await f.call('GET','/api/workspace',undefined,alice)).status,404,'local workspace API must not leak into service');
});

test('public and email-restricted links grant read-only access, expire and revoke independently of memberships',async t=>{
 const f=await fixture(t),alice=await f.user('alice@example.com'),bob=await f.user('bob@example.com'),eve=await f.user('eve@example.com');
 const org=await f.create(alice,'organization'),project=await f.create(alice,'project',org),space=await f.create(alice,'space',project);
 const publicShare=await f.call('POST',`/api/spaces/${space}/shares`,{mode:'public'},alice);const token=publicShare.data.url.split('/').at(-1);
 const read=await f.call('GET',`/api/share/${token}/workspace`);assert.equal(read.status,200);assert.equal(read.data.writable,false);assert.equal(read.data.editToken,undefined);assert.equal(read.headers['cache-control'],'no-store');assert.equal(read.headers['x-frame-options'],'DENY');
 assert.equal((await f.call('POST',`/api/spaces/${space}/edits`,{revision:read.data.revision,commands:[]},{cookie:'',csrf:token})).status,403);
 const privateShare=await f.call('POST',`/api/spaces/${space}/shares`,{mode:'restricted',emails:['BOB@example.com']},alice),privateToken=privateShare.data.url.split('/').at(-1);
 assert.equal((await f.call('GET',`/api/share/${privateToken}/workspace`)).status,401);
 assert.equal((await f.call('GET',`/api/share/${privateToken}/workspace`,undefined,eve)).status,403);
 assert.equal((await f.call('GET',`/api/share/${privateToken}/workspace`,undefined,bob)).status,200);
 assert.equal((await f.call('GET',`/api/spaces/${space}/workspace`,undefined,bob)).status,404,'share does not create membership');
 await f.call('DELETE',`/api/shares/${publicShare.data.id}`,undefined,alice);assert.equal((await f.call('GET',`/api/share/${token}/workspace`)).status,404);
 assert.equal((await f.call('GET',`/api/spaces/${space}/workspace`,undefined,alice)).status,200);
 await f.db.transaction(sql=>sql.run('UPDATE shares SET expires=0 WHERE id=?',[privateShare.data.id]));assert.equal((await f.call('GET',`/api/share/${privateToken}/workspace`,undefined,bob)).status,404);
 const stored=await f.db.transaction(sql=>sql.all<{hash:string}>('SELECT hash FROM shares WHERE id=?',[publicShare.data.id]));assert.notEqual(stored[0].hash,token);
});

test('unverified identities, CSRF, replayed verification and password reset cannot bypass access controls',async t=>{
 const f=await fixture(t),email='new@example.com',preActivationPassword='Pre-activation-password-123';
 await f.call('POST','/api/auth/register',{email,name:'New user',password:preActivationPassword});
 assert.equal((await f.call('POST','/api/auth/login',{email,password:preActivationPassword})).status,401);
 assert.equal((await f.call('GET','/api/tree')).status,401);
 const [pending]=await f.db.transaction(sql=>sql.all<{id:string;password:string}>('SELECT id,password FROM users WHERE email=?',[email]));
 assert.equal(pending.password,'!');
 const {digest}=await import('../server/service/security.ts');
 const legacyToken='legacy-unverified-session';
 await f.db.transaction(sql=>sql.run('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)',[digest(legacyToken),pending.id,'legacy-csrf',Date.now()+60_000]));
 const legacy={cookie:`omnidocs_session=${legacyToken}`,csrf:'legacy-csrf'};
 assert.equal((await f.call('GET','/api/tree',undefined,legacy)).status,403);
 await f.drainMail();
 const token=f.mail[0].text.match(/verify\/(\S+)/)![1];
 assert.equal((await f.call('POST','/api/auth/verify',{token})).status,422);
 assert.equal((await f.call('POST','/api/auth/verify',{token,password})).status,200);
 assert.equal((await f.call('POST','/api/auth/verify',{token,password})).status,400);
 assert.equal((await f.call('GET','/api/auth/me',undefined,legacy)).data.user,null);
 assert.equal((await f.call('POST','/api/auth/login',{email,password:preActivationPassword})).status,401);
 const login=await f.call('POST','/api/auth/login',{email,password}),session={cookie:login.cookie,csrf:login.data.csrf};
 assert.equal(login.status,200);
 assert.equal((await request(f.app,'POST','/api/resources',{kind:'organization',name:'No CSRF',description:'Must fail'},{...session,csrf:'bad'})).status,403);
 assert.equal((await request(f.app,'POST','/api/resources',{kind:'organization',name:'Bad origin',description:'Must fail'},session,'https://evil.example')).status,403);
 await f.call('POST','/api/auth/forgot',{email:'new@example.com'});await f.drainMail();const reset=f.mail.find(m=>m.text.includes('/reset/'))!.text.match(/reset\/(\S+)/)![1];
 assert.equal((await f.call('POST','/api/auth/reset',{token:reset,password:'Another-Strong-Password-123'})).status,200);
 assert.equal((await f.call('GET','/api/auth/me',undefined,session)).data.user,null);
 assert.equal((await f.call('POST','/api/auth/login',{email:'new@example.com',password})).status,401);
});

test('account sessions, hierarchy and independent workspace documents survive a service restart',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-service-restart-'));let service=await createServiceApp({root,origin,devMail:true,mail:async()=>{throw new Error('Development mail must not use an external transport.');}});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 await request(service.app,'POST','/api/auth/register',{email:'restart@example.com',name:'Restart',password});
 const [token]=await service.db.transaction(sql=>sql.all<{hash:string}>('SELECT hash FROM auth_tokens'));assert(token.hash.length===64);
 await service.drainMail();const {readdir,readFile}=await import('node:fs/promises');const messages=await readdir(path.join(root,'development-mail'));const mail=JSON.parse(await readFile(path.join(root,'development-mail',messages[0]),'utf8'));
 await request(service.app,'POST','/api/auth/verify',{token:mail.text.match(/verify\/(\S+)/)[1],password});
 const login=await request(service.app,'POST','/api/auth/login',{email:'restart@example.com',password}),session={cookie:login.cookie,csrf:login.data.csrf};
 let parent:string|undefined;for(const kind of ['organization','project','space']){const creation=await request(service.app,'POST','/api/resources',{kind,parentId:parent,name:kind,description:'Persists after restart'},session);assert.equal(creation.status,201);parent=creation.data.id;}
 const workspaceUrl=`/api/spaces/${parent}/workspace`, historyUrl=`/api/spaces/${parent}/history`;
 const before=await request(service.app,'GET',workspaceUrl,undefined,session);
 const edited=await request(service.app,'POST',`/api/spaces/${parent}/edits`,{revision:before.data.revision,commands:[
  {op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Survives restart',description:'Revision persisted',technology:''},
 ]},session);
 assert.equal(edited.status,200);
 await service.close();service=await createServiceApp({root,origin,devMail:true});
 assert.equal((await request(service.app,'GET','/api/tree',undefined,session)).data.resources.length,3);
 const reopened=await request(service.app,'GET',workspaceUrl,undefined,session);
 assert.equal(reopened.status,200);
 assert.equal(reopened.data.revision,edited.data.revision);
 const {versions}=(await request(service.app,'GET',historyUrl,undefined,session)).data;
 assert.equal(versions.length,2);
 const original=await request(service.app,'GET',`${historyUrl}/versions/${versions[1].id}`,undefined,session);
 assert.deepEqual(original.data.after,before.data.files);
 await service.db.transaction(sql=>sql.run('UPDATE sessions SET expires=0'));
 assert.equal((await request(service.app,'POST','/api/auth/logout',{},session)).status,200,'expired sessions can still be signed out locally');
});

test('failed authentication is rate limited even when its transaction rolls back',async t=>{
 const f=await fixture(t);for(let i=0;i<12;i++)assert.equal((await f.call('POST','/api/auth/login',{email:'unknown@example.com',password:'wrong'})).status,401);
 assert.equal((await f.call('POST','/api/auth/login',{email:'unknown@example.com',password:'wrong'})).status,429);
});

test('hosted API rejects compressed JSON for ordinary requests and workspace imports',async t=>{
 const {app}=await fixture(t);
 for(const url of ['/api/auth/register','/api/spaces/import']){
  const response=await request(app,'POST',url,{sample:true},undefined,origin,'127.0.0.1',undefined,null,true);
  assert.equal(response.status,415);
 }
});

test('CAPTCHA is issued as an image and is bound to one submission, action and client',async t=>{
 const f=await fixture(t,{username:'admin',password:'Separate-Admin-Password-123'});
 const challenge=await f.call('POST','/api/auth/captcha',{purpose:'login'});
 assert.equal(challenge.status,200);
 assert.deepEqual(Object.keys(challenge.data).sort(),['id','image']);
 assert.match(challenge.data.image,/^data:image\/png;base64,iVBORw0KGgo/);
 const body={email:'person@example.com',password};
 const login=(captcha:TestCaptcha|null,client='127.0.0.1')=>request(f.app,'POST','/api/auth/login',body,undefined,origin,client,undefined,captcha);
 assert.equal((await login(null)).status,400);
 assert.equal((await login(await seedCaptcha(f.app,'register'))).status,400);
 assert.equal((await login(await seedCaptcha(f.app,'login','127.0.0.1',Date.now()-1))).status,400);
 const wrong=await seedCaptcha(f.app,'login');
 assert.equal((await login({...wrong,answer:'654321'})).status,400);
 assert.equal((await login(wrong)).status,400);
 const once=await seedCaptcha(f.app,'login');
 assert.equal((await login(once,'127.0.0.2')).status,400);
 assert.equal((await login(once)).status,401);
 assert.equal((await login(once)).status,400);
 assert.equal((await request(f.app,'POST','/admin/api/login',{username:'admin',password:'Separate-Admin-Password-123'},undefined,origin,'127.0.0.1',undefined,null)).status,400);
 for(let index=0;index<11;index++)assert.equal((await f.call('POST','/admin/api/login',{username:'admin',password:'wrong'})).status,401);
 const limited=await f.call('POST','/admin/api/login',{username:'admin',password:'wrong'});
 assert.equal(limited.status,429);
 assert.equal(limited.headers['retry-after'],'900');
});

test('administrator controls registration and issues single-use manual activation links',async t=>{
 const credentials={username:'admin',password:'Separate-Admin-Password-123'};
 const f=await fixture(t,credentials);
 assert.equal((await f.call('GET','/api/auth/registration')).data.mode,'email');
 assert.equal((await f.call('POST','/admin/api/registration',{mode:'manual'})).status,401);
 const signed=await f.call('POST','/admin/api/login',credentials);
 const admin={cookie:signed.cookie,csrf:signed.data.csrf};
 assert.equal((await f.call('POST','/admin/api/registration',{mode:'manual'},{...admin,csrf:'invalid'})).status,403);
 assert.equal((await f.call('POST','/admin/api/registration',{mode:'manual'},admin)).status,200);
 const account={email:'pending@example.com',name:'Pending'};
 assert.equal((await f.call('POST','/api/auth/register',account)).status,202);
 await f.drainMail();assert.equal(f.mail.length,0);
 assert.equal((await f.call('POST','/api/auth/login',{email:account.email,password})).status,401);
 const pending=(await f.call('GET','/admin/api/users?status=pending',undefined,admin)).data.users[0];
 const approved=await f.call('POST',`/admin/api/users/${pending.id}`,{action:'approve'},admin);
 assert.equal(approved.status,200);
 const token=new URL(approved.data.activationUrl).hash.split('/').at(-1);
 assert.equal((await f.call('POST','/api/auth/verify',{token,password})).status,200);
 assert.equal((await f.call('POST','/api/auth/verify',{token,password})).status,400);
 assert.equal((await f.call('POST','/api/auth/login',{email:account.email,password})).status,200);
 assert.equal((await f.call('POST','/admin/api/registration',{mode:'automatic'},admin)).status,200);
 const local={email:'local@example.com',name:'Local',password};
 assert.equal((await f.call('POST','/api/auth/register',local)).status,202);
 assert.equal((await f.call('POST','/api/auth/login',{email:local.email,password})).status,200);
 await f.drainMail();assert.equal(f.mail.length,0);
 const hostedOrigin='https://docs.example.test';
 const hosted=await createServiceApp({root:f.root,origin:hostedOrigin,mail:async()=>{}});
 t.after(()=>hosted.close());
 assert.equal((await request(hosted.app,'GET','/api/auth/registration',undefined,undefined,hostedOrigin)).data.mode,'email');
 assert.equal((await request(hosted.app,'POST','/api/auth/login',{email:local.email,password},undefined,hostedOrigin)).status,401);
});

test('local service can start without email and offers administrator or automatic activation',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-local-no-mail-'));
 const credentials={username:'admin',password:'Separate-Admin-Password-123'};
 const service=await createServiceApp({root,origin,admin:credentials});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const signed=await request(service.app,'POST','/admin/api/login',credentials);
 const admin={cookie:signed.cookie,csrf:signed.data.csrf};
 assert.deepEqual((await request(service.app,'GET','/admin/api/registration',undefined,admin)).data,
  {mode:'manual',automaticAvailable:true,emailAvailable:false});
 assert.equal((await request(service.app,'POST','/admin/api/registration',{mode:'email'},admin)).status,409);
 assert.equal((await request(service.app,'POST','/admin/api/registration',{mode:'automatic'},admin)).status,200);
 assert.equal((await request(service.app,'POST','/api/auth/register',{name:'Local',email:'local@example.com',password})).status,202);
 assert.equal((await request(service.app,'POST','/api/auth/login',{email:'local@example.com',password})).status,200);
 assert.deepEqual(await service.db.transaction(sql=>sql.all('SELECT id FROM mail_outbox')),[]);
});

test('loopback registration can return a development activation link while public mail uses the outbox',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-local-verification-'));
 const service=await createServiceApp({root,origin,devMail:true});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const call=(method:string,url:string,body?:unknown,session?:Login)=>request(service.app,method,url,body,session);
 const registration=await call('POST','/api/auth/register',{email:'local@example.com',name:'Local'});
 assert.equal(registration.status,202);
 const link=new URL(registration.data.verificationUrl);
 assert.equal(link.origin,origin);
 assert.equal((await call('GET','/api/auth/me')).data.user,null);
 const token=link.hash.split('/').at(-1);
 assert.equal((await call('POST','/api/auth/verify',{token,password})).status,200);
 const login=await call('POST','/api/auth/login',{email:'local@example.com',password});
 assert.equal(login.data.user.verified,true);
 const f=await fixture(t);
 const remote=await f.call('POST','/api/auth/register',{email:'delivery@example.com',name:'Delivery'});
 assert.equal(remote.data.verificationUrl,undefined);
 await f.call('POST','/api/auth/register',{email:'expired@example.com',name:'Expired'});
 await f.db.transaction(sql=>sql.run('UPDATE mail_outbox SET expires_at=0 WHERE recipient=?',['expired@example.com']));
 await f.drainMail();
 assert(f.mail.some(message=>message.to==='delivery@example.com'));
 assert(!f.mail.some(message=>message.to==='expired@example.com'));
 assert.deepEqual(await f.db.transaction(sql=>sql.all('SELECT id FROM mail_outbox')),[]);
});

test('delivery failure alerts carry only event metadata and are throttled',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-security-alert-'));
 const alerts:unknown[]=[];
 const service=await createServiceApp({root,origin,mail:async()=>{throw new Error('Private mail adapter diagnostics');},
  securityAlert:async event=>{alerts.push(event);}});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 for(const email of ['one@example.com','two@example.com']){
  assert.equal((await request(service.app,'POST','/api/auth/register',{email,name:'Test account'})).status,202);
 }
 await service.drainMail();
 assert.equal(alerts.length,1);
 assert.deepEqual(Object.keys(alerts[0] as object).sort(),['event','level','route','status','time']);
 assert.match(JSON.stringify(alerts),/mail\.delivery_failed/);
 assert.doesNotMatch(JSON.stringify(alerts),/example\.com|adapter diagnostics|verify\//);
});

test('space history records immutable snapshots and requires approval from an authorized peer',async t=>{
 const f=await fixture(t);
 const owner=await f.user('owner@example.com'), editor=await f.user('editor@example.com'), viewer=await f.user('viewer@example.com');
 const org=await f.create(owner,'organization'), project=await f.create(owner,'project',org), space=await f.create(owner,'space',project);
 const url=`/api/spaces/${space}`, history=`${url}/history`;
 for (const [email,role,account] of [['editor@example.com','editor',editor],['viewer@example.com','viewer',viewer]] as const) {
  const grant=await f.call('POST',`/api/resources/${space}/invitations`,{email,role},owner);
  assert.equal((await f.call('POST',`/api/invitations/${grant.data.id}/accept`,{},account)).status,200);
 }
 const settings={required:true,emails:['editor@example.com']};
 assert.equal((await f.call('POST',`${history}/settings`,settings,editor)).status,403);
 assert.equal((await f.call('POST',`${history}/settings`,settings,owner)).status,200);
 const initial=await f.call('GET',`${url}/workspace`,undefined,owner);
 assert.equal(initial.data.reviewRequired,true);
 const commands=[{op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Reviewed system',description:'Approved architecture change',technology:''}];
 assert.equal((await f.call('POST',`${url}/edits`,{revision:initial.data.revision,commands},owner)).status,403);
 const submit=await f.call('POST',`${history}/proposals`,{revision:initial.data.revision,commands,title:'Update system'},owner);
 assert.equal(submit.status,201,JSON.stringify(submit.data));
 const proposal=`${history}/proposals/${submit.data.id}`, revision=submit.data.revision;
 assert.equal((await f.call('GET',proposal,undefined,viewer)).status,404);
 assert.deepEqual((await f.call('GET',history,undefined,viewer)).data.proposals,[]);
 assert.equal((await f.call('GET',`${url}/workspace`,undefined,viewer)).data.revision,initial.data.revision);
 assert.equal((await f.call('POST',proposal,{action:'approve',revision},owner)).status,403);
 assert.equal((await f.call('POST',proposal,{action:'approve',revision:initial.data.revision},editor)).status,409);
 const review=await f.call('GET',proposal,undefined,editor);
 assert.equal(review.data.canReview,true);
 assert.deepEqual(review.data.before,initial.data.files);
 assert.equal((await f.call('POST',proposal,{action:'comment',revision,note:'Checked the architecture'},editor)).status,200);
 const approval=await f.call('POST',proposal,{action:'approve',revision},editor);
 assert.equal(approval.status,200,JSON.stringify(approval.data));
 const snapshots=(await f.call('GET',history,undefined,viewer)).data.versions;
 assert.deepEqual(snapshots.map((entry:{version:number})=>entry.version),[2,1]);
 assert.equal(snapshots[0].parent_id,snapshots[1].id);
 const published=await f.call('GET',`${history}/versions/${snapshots[0].id}`,undefined,viewer);
 assert.deepEqual(published.data.before,initial.data.files);
 assert.deepEqual(published.data.after,review.data.after);
 assert.equal((await f.call('GET',`${url}/workspace`,undefined,viewer)).data.revision,revision);
 const events=(await f.call('GET',proposal,undefined,owner)).data.events;
 assert.deepEqual(events.map(({action,actor}:{action:string;actor:string})=>[action,actor]),
  [['submitted','owner'],['comment','editor'],['approved','editor'],['published','editor']]);
 assert.equal(events[1].note,'Checked the architecture');
 assert.equal((await f.call('POST',proposal,{action:'approve',revision},editor)).status,409);

 const declined=await f.call('POST',`${history}/proposals`,{
  revision,commands:[{...commands[0],name:'Draft revision'}],title:'Another change',
 },owner);
 const declinedUrl=`${history}/proposals/${declined.data.id}`;
 assert.equal((await f.call('POST',declinedUrl,{action:'request_changes',revision:declined.data.revision,note:'Clarify scope'},editor)).status,200);
 assert.equal((await f.call('GET',`${url}/workspace`,undefined,viewer)).data.revision,revision);
});

test('stale approval cannot overwrite another edit and a changed layout can be rebased',async t=>{
 const f=await fixture(t), owner=await f.user('owner@example.com'), editor=await f.user('editor@example.com');
 const org=await f.create(owner,'organization'), project=await f.create(owner,'project',org), space=await f.create(owner,'space',project);
 const url=`/api/spaces/${space}`, history=`${url}/history`;
 const invite=await f.call('POST',`/api/resources/${space}/invitations`,{email:'editor@example.com',role:'editor'},owner);
 await f.call('POST',`/api/invitations/${invite.data.id}/accept`,{},editor);
 const command={op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Requested name',description:'Architecture details',technology:''};
 const initial=(await f.call('GET',`${url}/workspace`,undefined,owner)).data;
 const submit=(revision:string)=>f.call('POST',`${history}/proposals`,{revision,commands:[command],title:'New system name'},editor);
 const first=(await submit(initial.revision)).data;
 const changed=await f.call('POST',`${url}/edits`,{revision:initial.revision,commands:[{...command,name:'Different name'}]},owner);
 assert.equal(changed.status,200);
 const action=(id:string,revision:string,action:string,session:Login)=>f.call('POST',`${history}/proposals/${id}`,{action,revision},session);
 assert.equal((await action(first.id,first.revision,'approve',owner)).status,409);
 const conflict=await action(first.id,first.revision,'rebase',editor);
 assert.equal(conflict.status,409);
 assert.match(conflict.data.error,/Conflicting changes/);

 const second=(await submit(changed.data.revision)).data;
 const layout=await f.call('POST',`${url}/edits`,{revision:changed.data.revision,commands:[
  {op:'layout.save',viewId:'SystemContext',key:'SystemContext',layout:{positions:{'system.main':{x:230,y:180}},viewport:{x:0,y:0,zoom:1},size:{width:900,height:600}}},
 ]},owner);
 assert.equal(layout.status,200,JSON.stringify(layout.data));
 const rebased=await action(second.id,second.revision,'rebase',editor);
 assert.equal(rebased.status,200,JSON.stringify(rebased.data));
 const approve=await action(rebased.data.id,rebased.data.revision,'approve',owner);
 assert.equal(approve.status,200,JSON.stringify(approve.data));
 const all=(await f.call('GET',history,undefined,editor)).data;
 assert.equal(all.proposals.find((entry:{id:string})=>entry.id===rebased.data.id).parent_id,second.id);
 assert.equal(all.proposals.find((entry:{id:string})=>entry.id===second.id).state,'superseded');
 assert.equal(all.versions[1].presentation,1);
 const current=await f.call('GET',`${url}/workspace`,undefined,editor);
 assert(current.data.files.some((file:{path:string;content:string})=>file.path==='studio/layout.md'&&file.content.includes('230')));
});

test('the Free plan limits owned resources across projects and concurrent requests',async t=>{
 const f=await fixture(t), owner=await f.user('owner@example.com'), collaborator=await f.user('collaborator@example.com');
 const create=(kind:string,parentId?:string)=>f.call('POST','/api/resources',{
  kind,parentId,name:`Extra ${kind}`,description:'Checks the Free plan limit',
 },owner);
 const org=await f.create(owner,'organization');
 const blockedOrg=await create('organization');
 assert.equal(blockedOrg.status,409);
 assert.match(blockedOrg.data.error,/1 organization/);
 const first=await f.create(owner,'project',org), second=await f.create(owner,'project',org);
 const blockedProject=await create('project',org);
 assert.equal(blockedProject.status,409);
 assert.match(blockedProject.data.error,/2 projects/);
 await f.create(owner,'space',first);
 await f.create(owner,'space',second);
 const lastSlot=await Promise.all([create('space',first),create('space',second)]);
 assert.deepEqual(lastSlot.map(response=>response.status).sort(),[201,409]);
 assert.match(lastSlot.find(response=>response.status===409)!.data.error,/3 workspaces/);
 const resources=(await f.call('GET','/api/tree',undefined,owner)).data.resources;
 assert.equal(resources.filter((resource:{kind:string})=>resource.kind==='space').length,3);

 const invite=await f.call('POST',`/api/resources/${org}/invitations`,{
  email:'collaborator@example.com',role:'editor',
 },owner);
 assert.equal((await f.call('POST',`/api/invitations/${invite.data.id}/accept`,{},collaborator)).status,200);
 assert.equal((await f.call('GET','/api/tree',undefined,collaborator)).data.resources.length,6);
 const ownOrg=await f.create(collaborator,'organization'), ownProject=await f.create(collaborator,'project',ownOrg);
 await f.create(collaborator,'space',ownProject);
});

test('administrator sign-in and user directory are isolated from ordinary accounts',async t=>{
 const admin={username:'site-operator',password:'Separate-Admin-Password-123'};
 const f=await fixture(t,admin);
 const user=await f.user('member@example.com');
 assert.equal((await f.call('POST','/api/auth/register',{
  email:'pending@example.com',name:'Pending member',password,
 })).status,202);
 assert.equal((await f.call('POST','/api/auth/register',{
  email:'elevated@example.com',name:'Elevated',password,role:'admin',
 })).status,422);
 assert.equal((await f.call('POST','/api/auth/login',admin)).status,422);
 assert.equal((await f.call('GET','/admin/api/users',undefined,user)).status,401);
 assert.equal((await f.call('GET','/admin/api/me',undefined,user)).data.username,null);
 assert.equal((await f.call('POST','/admin/api/login',{
  username:'member@example.com',password,
 },user)).status,401);
 assert.equal((await request(f.app,'POST','/admin/api/login',admin,undefined,'https://invalid.example')).status,403);

 const login=await f.call('POST','/admin/api/login',admin);
 assert.equal(login.status,200);
 assert.match(login.setCookie,/HttpOnly; SameSite=Strict; Path=\/admin\//);
 assert.equal(login.headers['cache-control'],'no-store');
 const administrator={cookie:login.cookie,csrf:login.data.csrf};
 assert.equal((await f.call('GET','/admin/api/me',undefined,administrator)).data.username,admin.username);
 assert.equal((await f.call('GET','/api/auth/me',undefined,administrator)).data.user,null);
 assert.equal((await f.call('GET','/api/tree',undefined,administrator)).status,401);

 const tampered={...administrator,cookie:administrator.cookie.slice(0,-1)+'x'};
 assert.equal((await f.call('GET','/admin/api/users',undefined,tampered)).status,401);
 const directory=await f.call('GET','/admin/api/users',undefined,administrator);
 assert.equal(directory.status,200);
 assert.equal(directory.data.total,3);
 const siteAdmin=directory.data.users.find((row:{platform_role:string})=>row.platform_role==='admin');
 assert.equal(siteAdmin.login_name,admin.username);
 const listed=new Map(directory.data.users.filter((row:{platform_role:string})=>row.platform_role==='member').map((row:{email:string;verified:boolean})=>[row.email,row.verified]));
 assert.deepEqual(listed,new Map([['pending@example.com',false],['member@example.com',true]]));
 assert.deepEqual(Object.keys(directory.data.users[0]).sort(),['created_at','email','id','login_name','name','owned','platform_role','suspended','verified']);
 const search=await f.call('GET','/admin/api/users?q=MEMBER%40',undefined,administrator);
 assert.equal(search.data.total,1);
 assert.equal(search.data.users[0].email,'member@example.com');
 assert.equal((await f.call('GET','/admin/api/users?q=%25',undefined,administrator)).data.total,0);
 assert.equal((await f.call('POST','/admin/api/logout',{}, {...administrator,csrf:'incorrect'})).status,403);
 assert.equal((await f.call('POST','/admin/api/logout',{},administrator)).status,200);
 assert.equal((await f.call('GET','/admin/api/users',undefined,administrator)).status,401);
 assert.equal((await f.call('GET','/api/tree',undefined,user)).status,200);
});

test('admin access is disabled until an administrator is configured',async t=>{
 const f=await fixture(t);
 assert.deepEqual((await f.call('GET','/admin/api/me')).data,{enabled:false,username:null});
 assert.equal((await f.call('POST','/admin/api/login',{username:'admin',password})).status,403);
 assert.equal((await f.call('GET','/admin/api/users')).status,401);
});

test('personal setup provides working administrator and member credentials exactly once',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-personal-'));
 let service:Awaited<ReturnType<typeof createServiceApp>>|undefined;
 t.after(async()=>{await service?.close();await rm(root,{recursive:true,force:true});});
 const created=await initializePersonalAccounts(root);
 assert.equal(created.length,2);
 const admin=created.find(account=>account.role==='admin')!,member=created.find(account=>account.role==='member')!;
 assert.notEqual(admin.password,member.password);
 assert.deepEqual(await initializePersonalAccounts(root),[]);
 const application=await createServiceApp({root,origin});
 service=application;
 const call=(method:string,url:string,body?:unknown,session?:Login)=>request(application.app,method,url,body,session);
 const manager=await call('POST','/admin/api/login',{username:admin.login,password:admin.password});
 const user=await call('POST','/api/auth/login',{email:member.login,password:member.password});
 assert.equal(manager.status,200);
 assert.equal(user.status,200);
 assert.equal(user.data.user.verified,true);
 assert.equal((await call('GET','/admin/api/overview',undefined,{cookie:user.cookie,csrf:user.data.csrf})).status,401);
 const hashes=await application.db.transaction(sql=>sql.all<{password:string}>('SELECT password FROM users'));
 assert.equal(hashes.length,2);
 assert(hashes.every(({password})=>/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(password)));
});

test('the administrator is a database user and password reset survives restarts without environment credentials',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-admin-database-'));
 const original={username:'site-operator',password:'Original-Test-Password-1234'};
 const options={root,origin,mail:async()=>{}};
 let service=await createServiceApp({...options,admin:original});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const getAccount=()=>service.db.transaction(sql=>sql.all<{id:string;email:string;login_name:string;password:string}>("SELECT id,email,login_name,password FROM users WHERE platform_role='admin'"));
 const [account]=await getAccount();
 assert.equal(account.login_name,original.username);
 assert.match(account.password,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 assert.notEqual(account.password,original.password);
 const login=(passwordValue:string)=>request(service.app,'POST','/admin/api/login',{username:original.username,password:passwordValue});
 const oldLogin=await login(original.password);
 assert.equal(oldLogin.status,200);
 const [session]=await service.db.transaction(sql=>sql.all<{user_id:string}>('SELECT user_id FROM admin_sessions'));
 assert.equal(session.user_id,account.id);
 const {resetAdminPassword}=await import('../server/service/admin.ts');
 const replacement='Replacement-Test-Password-1234';
 await resetAdminPassword(service.db,'unused',replacement);
 const previous={cookie:oldLogin.cookie,csrf:oldLogin.data.csrf};
 assert.equal((await request(service.app,'GET','/admin/api/overview',undefined,previous)).status,401);
 await service.close();
 service=await createServiceApp({...options,admin:original});
 assert.equal((await login(original.password)).status,401,'old bootstrap settings must never overwrite a database password');
 await service.close();
 service=await createServiceApp(options);
 assert.equal((await getAccount())[0].id,account.id);
 assert.equal((await login(replacement)).status,200);
 assert.equal((await request(service.app,'POST','/api/auth/login',{email:account.email,password:replacement})).status,401);
});

test('migration keeps the effective legacy authenticator and ignores later bootstrap changes',async t=>{
 const f=await fixture(t);
 const {bootstrapAdmin}=await import('../server/service/admin.ts');
 const {digest}=await import('../server/service/security.ts');
 const previous='A'.repeat(32),active='B'.repeat(32);
 await f.db.transaction(sql=>sql.run('INSERT INTO admin_mfa(id,environment_id,secret) VALUES(1,?,?)',[digest(previous),previous]));
 const credentials={username:'admin',password:'Migration-Test-Password-1234',totpSecret:active};
 await bootstrapAdmin(f.db,credentials);
 await bootstrapAdmin(f.db,{...credentials,totpSecret:'C'.repeat(32)});
 const [stored]=await f.db.transaction(sql=>sql.all<{secret:string}>('SELECT secret FROM admin_mfa WHERE id=1'));
 assert.equal(stored.secret,active);
});

test('HTTPS administrator access requires an approved network and a single-use authenticator code',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-admin-https-'));
 const secureOrigin='https://docs.example.com';
 const admin={username:'site-operator',password:'Separate-Admin-Password-123'};
 const totpSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const service=await createServiceApp({root,origin:secureOrigin,admin:{...admin,totpSecret},mail:async()=>{},trustProxyHops:1});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const requestAdmin=(body:unknown,address='127.0.0.1',forwardedFor?:string)=>request(service.app,'POST','/admin/api/login',body,undefined,secureOrigin,address,forwardedFor);
 assert.equal((await request(service.app,'GET','/admin/api/me',undefined,undefined,secureOrigin,'192.0.2.5')).status,404);
 assert.equal((await requestAdmin(admin,'10.0.0.8','192.0.2.5')).status,404);
 assert.equal((await requestAdmin(admin)).status,401);
 const counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30_000)));
 const mac=createHmac('sha1','12345678901234567890').update(counter).digest();
 const code=String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1_000_000).padStart(6,'0');
 const login=await requestAdmin({...admin,code});
 assert.equal(login.status,200);
 assert.match(login.setCookie,/^__Secure-omnidocs_admin=/);
 assert.match(login.setCookie,/Path=\/admin\/; Max-Age=28800; Secure$/);
 assert.equal((await requestAdmin({...admin,code})).status,401);
});

test('six-digit sign-in fields preserve grouped and localized codes',()=>{
 for(const value of ['012345',' 012 345 ','۰۱۲ ۳۴۵','٠١٢-٣٤٥','\u200e012\u200f345'])assert.equal(normalizeSixDigitCode(value),'012345');
 assert.equal(normalizeSixDigitCode('ABCD2345EFGH'),'');
});

function enrollmentCode(key:string,offset=0){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 const bits=[...key].map(letter=>alphabet.indexOf(letter).toString(2).padStart(5,'0')).join('');
 const decoded=Buffer.from(bits.match(/.{8}/g)!.map(byte=>parseInt(byte,2)));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30_000)+offset));
 const mac=createHmac('sha1',decoded).update(counter).digest();
 return String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1_000_000).padStart(6,'0');
}

test('HTTPS administrator can enroll and rotate from the panel with limited bootstrap access',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'omnidocs-admin-enroll-'));
 const secureOrigin='https://docs.example.com',credentials={username:'admin',password:'Separate-Admin-Password-123'};
 const service=await createServiceApp({root,origin:secureOrigin,admin:credentials,mail:async()=>{}});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const call=(method:string,url:string,body?:unknown,session?:Login)=>request(service.app,method,'/admin/api/'+url,body,session,secureOrigin);
 assert.equal((await call('POST','mfa/start',{})).status,401);
 const signed=await call('POST','login',credentials);
 assert.equal(signed.status,200);assert.equal(signed.data.enrollmentRequired,true);
 assert.match(signed.setCookie,/Max-Age=600; Secure$/);
 const bootstrap={cookie:signed.cookie,csrf:signed.data.csrf};
 assert.equal((await call('GET','overview',undefined,bootstrap)).status,403);
 assert.equal((await call('POST','mfa/start',{},{...bootstrap,csrf:'invalid'})).status,403);
 const started=await call('POST','mfa/start',{},bootstrap);
 assert.equal(started.status,200);assert.match(started.data.key,/^[A-Z2-7]{32}$/);
 const firstCode=enrollmentCode(started.data.key);
 assert.equal((await call('POST','mfa/confirm',{code:'abc'},bootstrap)).status,422);
 const confirmed=await call('POST','mfa/confirm',{code:firstCode},bootstrap);
 assert.equal(confirmed.status,200);assert.equal(confirmed.data.mfaRequired,true);
 assert.equal((await call('GET','overview',undefined,bootstrap)).status,401);
 const signedIn={cookie:confirmed.cookie,csrf:confirmed.data.csrf};
 assert.equal((await call('GET','overview',undefined,signedIn)).status,200);
 assert.equal((await call('POST','login',credentials)).status,401);
 assert.equal((await call('POST','mfa/start',{code:firstCode},signedIn)).status,401);
 const replacement=await call('POST','mfa/start',{code:enrollmentCode(started.data.key,1)},signedIn);
 assert.equal(replacement.status,200);
 assert.notEqual(replacement.data.key,started.data.key);
 assert.equal((await call('GET','overview',undefined,signedIn)).status,200);
 const rotated=await call('POST','mfa/confirm',{code:enrollmentCode(replacement.data.key)},signedIn);
 assert.equal(rotated.status,200);
 assert.equal((await call('GET','overview',undefined,signedIn)).status,401);
 assert.equal((await call('GET','overview',undefined,{cookie:rotated.cookie,csrf:rotated.data.csrf})).status,200);
});

test('workspace imports preserve Markdown and layout in a new, independently editable space',async t=>{
 const f=await fixture(t), owner=await f.user('importer@example.com'), member=await f.user('member@example.com');
 const organization=await f.create(owner,'organization'), project=await f.create(owner,'project',organization);
 const source=await f.create(owner,'space',project);
 const sourceUrl=`/api/spaces/${source}`;
 const initial=(await f.call('GET',`${sourceUrl}/workspace`,undefined,owner)).data;
 const arranged=await f.call('POST',`${sourceUrl}/edits`,{revision:initial.revision,commands:[
  {op:'layout.save',viewId:'SystemContext',key:'SystemContext',layout:{
   positions:{'system.main':{x:230,y:180}},viewport:{x:0,y:0,zoom:1},size:{width:900,height:600},
  }},
 ]},owner);
 assert.equal(arranged.status,200);
 const exported=(await f.call('GET',`${sourceUrl}/workspace`,undefined,owner)).data;
 const bundle={format:'omnidocs-workspace',version:1,name:'Imported architecture',description:exported.description,files:exported.files};

 const invitation=await f.call('POST',`/api/resources/${project}/invitations`,{email:'member@example.com',role:'editor'},owner);
 assert.equal((await f.call('POST',`/api/invitations/${invitation.data.id}/accept`,{},member)).status,200);
 const importWorkspace=(session:Login,input=bundle,parentId=project)=>f.call('POST','/api/spaces/import',{parentId,bundle:input},session);
 assert.equal((await importWorkspace(member)).status,403);
 assert.equal((await importWorkspace(owner,bundle,organization)).status,422);
 assert.equal((await importWorkspace(owner,{...bundle,files:[{path:'../invalid.md',content:'# Invalid'}]})).status,422);
 assert.equal((await importWorkspace(owner,{...bundle,files:[{path:'notes.md',content:'# Invalid model'}]})).status,422);
 assert.equal((await importWorkspace(owner,{...bundle,files:[...bundle.files,{...bundle.files[0],path:bundle.files[0].path.toUpperCase()}]})).status,422);

 const imported=await importWorkspace(owner);
 assert.equal(imported.status,201,JSON.stringify(imported.data));
 assert.notEqual(imported.data.id,source);
 const url=`/api/spaces/${imported.data.id}`;
 const copied=(await f.call('GET',`${url}/workspace`,undefined,owner)).data;
 assert.equal(copied.name,bundle.name);
 assert.equal(copied.revision,exported.revision);
 assert.deepEqual(copied.files,bundle.files);
 assert(copied.files.some((file:{path:string})=>file.path==='studio/layout.md'));
 const history=(await f.call('GET',`${url}/history`,undefined,owner)).data;
 assert.deepEqual(history.versions.map((version:{version:number;title:string})=>[version.version,version.title]),[[1,'Imported workspace']]);
 const edited=await f.call('POST',`${url}/edits`,{revision:copied.revision,commands:[
  {op:'entity.update',id:'system.main',viewId:'SystemContext',kind:'system',name:'Imported system',description:'Edited copy',technology:''},
 ]},owner);
 assert.equal(edited.status,200);
 assert.equal((await f.call('GET',`${sourceUrl}/workspace`,undefined,owner)).data.revision,exported.revision);

 assert.equal((await importWorkspace(owner)).status,201);
 assert.equal((await importWorkspace(owner)).status,409);
});

test('administrator overview shows ownership and recorded activity, and account suspension revokes access',async t=>{
 const credentials={username:'site-operator',password:'Separate-Admin-Password-123'};
 const f=await fixture(t,credentials);
 const owner=await f.user('dash-owner@example.com');
 const org=await f.create(owner,'organization'), project=await f.create(owner,'project',org), space=await f.create(owner,'space',project);
 const account=(await f.call('GET','/api/auth/me',undefined,owner)).data.user;
 assert.equal((await f.call('GET','/admin/api/overview',undefined,owner)).status,401);

 const login=await f.call('POST','/admin/api/login',credentials);
 const administrator={cookie:login.cookie,csrf:login.data.csrf};
 const admin=(url:string,body?:unknown,session:Login=administrator)=>f.call(body?'POST':'GET',`/admin/api/${url}`,body,session);
 const summary=await admin('overview');
 assert.equal(summary.status,200,JSON.stringify(summary.data));
 assert.deepEqual(summary.data.users,{total:2,verified:2,pending:0,suspended:0});
 assert.deepEqual(summary.data.resources,{organization:1,project:1,space:1});
 assert(summary.data.activity.some((entry:{action:string})=>entry.action==='resource.create'));

 const userUrl=`users/${account.id}`;
 const detail=await admin(userUrl);
 assert.deepEqual(detail.data.user.owned,{organization:1,project:1,space:1});
 assert.deepEqual(detail.data.resources.map((item:{id:string})=>item.id).sort(),[org,project,space].sort());
 assert.equal(detail.data.sessions,1);
 assert.equal((await admin(userUrl,{action:'rename',name:'Changed account'},owner)).status,401);
 assert.equal((await admin(userUrl,{action:'suspend'},{...administrator,csrf:'invalid'})).status,403);
 assert.equal((await admin(userUrl,{action:'rename',name:'Changed account'})).status,200);
 assert.equal((await f.call('GET','/api/auth/me',undefined,owner)).data.user.name,'Changed account');

 assert.equal((await admin(userUrl,{action:'revoke_sessions'})).status,200);
 assert.equal((await f.call('GET','/api/tree',undefined,owner)).status,401);
 const signedIn=await f.call('POST','/api/auth/login',{email:account.email,password});
 assert.equal(signedIn.status,200);
 const renewed={cookie:signedIn.cookie,csrf:signedIn.data.csrf};
 assert.equal((await admin(userUrl,{action:'suspend'})).status,200);
 assert.equal((await f.call('GET','/api/tree',undefined,renewed)).status,401);
 assert.equal((await f.call('POST','/api/auth/login',{email:account.email,password})).status,401);
 assert.equal((await admin('users?status=suspended')).data.users[0].id,account.id);
 const suspended=await admin(userUrl);
 assert.equal(suspended.data.sessions,0);
 assert(suspended.data.activity.some((entry:{action:string;management:boolean})=>entry.management&&entry.action==='admin.user.suspend'));
 const management=await admin('activity?source=admin');
 assert.equal(management.status,200);
 assert.equal(management.data.total,3);
 assert(management.data.items.every((entry:{management:boolean})=>entry.management));
 const userEvents=await admin('activity?source=users');
 assert(userEvents.data.items.length>0);
 assert(userEvents.data.items.every((entry:{management:boolean})=>!entry.management));
 assert.equal((await admin(userUrl,{action:'restore'})).status,200);
 const restored=await f.call('POST','/api/auth/login',{email:account.email,password});
 assert.equal(restored.status,200);
 assert.equal((await f.call('GET','/api/tree',undefined,{cookie:restored.cookie,csrf:restored.data.csrf})).data.resources.length,3);
});

test('administrator resource archive covers nested access and is reversible without changing documents',async t=>{
 const credentials={username:'site-operator',password:'Separate-Admin-Password-123'};
 const f=await fixture(t,credentials);
 const owner=await f.user('owner@example.com'), invitee=await f.user('guest@example.com');
 const org=await f.create(owner,'organization'), project=await f.create(owner,'project',org), space=await f.create(owner,'space',project);
 const workspaceUrl=`/api/spaces/${space}/workspace`;
 const source=(await f.call('GET',workspaceUrl,undefined,owner)).data;
 const share=await f.call('POST',`/api/spaces/${space}/shares`,{mode:'public'},owner);
 const sharedUrl=`/api/share/${share.data.url.split('/').at(-1)}/workspace`;
 const invited=await f.call('POST',`/api/resources/${space}/invitations`,{email:'guest@example.com',role:'viewer'},owner);
 const inviteUrl=`/api/invitations/${invited.data.id}/accept`;
 const login=await f.call('POST','/admin/api/login',credentials);
 const administrator={cookie:login.cookie,csrf:login.data.csrf};
 const admin=(url:string,body?:unknown)=>f.call(body?'POST':'GET',`/admin/api/${url}`,body,administrator);

 assert.equal((await admin(`resources/${space}`,{action:'edit',name:'Renamed space',description:'Updated workspace metadata'})).status,200);
 assert.equal((await f.call('GET',workspaceUrl,undefined,owner)).data.name,'Renamed space');
 assert.equal((await admin('resources?kind=space&q=renamed')).data.items[0].owner_email,'owner@example.com');
 assert.equal((await admin(`resources/${project}`,{action:'archive'})).status,200);
 assert.equal((await f.call('GET',workspaceUrl,undefined,owner)).status,404);
 assert.equal((await f.call('GET',sharedUrl)).status,404);
 assert.equal((await f.call('POST',inviteUrl,{},invitee)).status,404);
 assert.equal((await f.call('GET','/api/invitations',undefined,invitee)).data.invitations.length,0);
 assert.deepEqual((await f.call('GET','/api/tree',undefined,owner)).data.resources.map((item:{id:string})=>item.id),[org]);
 const archived=await admin('resources?kind=space&status=archived');
 assert.equal(archived.data.items[0].blocked,true);
 assert.equal((await admin('overview')).data.archived,1);

 assert.equal((await admin(`resources/${project}`,{action:'restore'})).status,200);
 const recovered=await f.call('GET',workspaceUrl,undefined,owner);
 assert.equal(recovered.status,200);
 assert.equal(recovered.data.revision,source.revision);
 assert.equal((await f.call('GET',sharedUrl)).status,200);
 assert.equal((await f.call('POST',inviteUrl,{},invitee)).status,200);
 assert.equal((await f.call('GET',workspaceUrl,undefined,invitee)).data.permission,'viewer');
 const inviteeId=(await f.call('GET','/api/auth/me',undefined,invitee)).data.user.id;
 const guest=await admin(`users/${inviteeId}`);
 assert.equal(guest.data.memberships.length,1);
 const [grant]=guest.data.memberships;
 assert.equal(grant.scope_id,space);
 assert.equal(grant.role,'viewer');
 const membershipUrl=`users/${inviteeId}/memberships/${grant.id}`;
 assert.equal((await admin(membershipUrl,{action:'change_role',role:'editor'})).status,200);
 assert.equal((await f.call('GET',workspaceUrl,undefined,invitee)).data.permission,'editor');
 assert.equal((await admin(membershipUrl,{action:'revoke'})).status,200);
 assert.equal((await f.call('GET',workspaceUrl,undefined,invitee)).status,404);
});
