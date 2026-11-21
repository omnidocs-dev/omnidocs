import * as oidc from 'openid-client';
import {discoverZitadel,readZitadelSettings,zitadelCallback,zitadelErrorDetails} from './zitadel.ts';
import {consumeCaptcha,createCaptcha,reserveCaptchaFreeAttempt} from './captcha.ts';
import {issueAccountLink,registrationMode} from './registration.ts';
import {adminEmailDomain,bootstrapAdmin,readAdminAccount,registerAdminRoutes,type AdminCredentials} from './admin.ts';
import {initializeImportedHistory, publishedFiles, registerHistoryRoutes, reviewRequired, savePublished} from './history.ts';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {connectDatabase,migrate,resolveServiceDataRoot,type SQL,type TransactionMode} from './database.ts';
import {access,adminIPCheck,ancestors,checkPassword,digest,fail,hashPassword,normalizeEmail,rateLimit,requireAccess,secret,ServiceError,type Resource,type User} from './security.ts';
import {scaffoldSpace} from '../../shared/space-scaffold.ts';
import {WorkspaceStore,ConflictError} from '../workspace-store.ts';
import {workspaceRevision} from '../../shared/edit-contract.ts';
import {freePlanLimits,freePlanLimitMessage} from '../../shared/free-plan.ts';
import {workspaceBundleSchema,workspaceImportMaxBytes,type WorkspaceBundle} from '../../shared/workspace-transfer.ts';
import {inspectWorkspace} from '../../shared/workspace-inspection.ts';
const email=z.string().trim().email().max(254).transform(normalizeEmail),password=z.string().min(12).max(128),name=z.string().trim().min(1).max(160),role=z.enum(['viewer','editor']);
const resourceInput=z.object({kind:z.enum(['organization','project','space']),parentId:z.string().uuid().optional(),name,description:z.string().trim().min(1).max(2000)}).strict();
export type Mail={to:string;subject:string;text:string};
export type SecurityEvent={time:string;level:'info'|'warn';event:string;route:string;status?:number};
export type ServiceOptions={root:string;origin:string;databaseURL?:string;mail?:(message:Mail)=>Promise<void>;devMail?:boolean;admin?:AdminCredentials;trustProxyHops?:number;adminNetworks?:string;securityAlert?:(event:SecurityEvent)=>Promise<void>};
type Context={sql:SQL;user:User|undefined;session:{hash:string;csrf:string}|undefined;req:express.Request;prepared?:unknown};
type Reply={status?:number;body?:unknown;cookie?:string};
export async function createServiceApp(options:ServiceOptions){
 const adminAllowed=adminIPCheck(options.adminNetworks);
 const isLoopback=adminIPCheck();
 const origin=new URL(options.origin).origin,secure=origin.startsWith('https:'),cookieName=secure?'__Host-omnidocs_session':'omnidocs_session',local=['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);
 const localAccess=local&&!options.trustProxyHops;
 if(!secure&&!local)throw new Error('The public service URL must use HTTPS.');
 const emailAvailable=!!(options.mail||options.devMail);
 if(!emailAvailable&&!localAccess)throw new Error('Configure mail delivery, or explicitly enable local development mail.');
 if(options.devMail&&!local)throw new Error('Development mail is only available on a loopback public URL.');
 const root=await resolveServiceDataRoot(options.root);
 const db=await connectDatabase(path.join(root,'metadata.sqlite'),options.databaseURL);await migrate(db);
 const app=express();app.disable('x-powered-by');app.set('trust proxy',options.trustProxyHops??'loopback');
 app.use((_req,res,next)=>{res.set({'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});next();});
 app.use(['/api','/admin/api'],(_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});next();});
 app.use(['/api','/admin/api'],(req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin){res.status(403).json({error:'Request origin is not allowed.'});return;}next();});
 app.use('/admin/api',(req,res,next)=>{
  if(secure&&!adminAllowed(req.ip)){res.status(404).json({error:'API endpoint unavailable.'});return;}
  next();
 });
 const parseJson=express.json({limit:'2mb',inflate:false});
 const parseImport=express.json({limit:workspaceImportMaxBytes+1024,inflate:false});
 app.use((req,res,next)=>{
  const parse=req.method==='POST'&&/^\/api\/spaces\/import\/?$/i.test(req.path)?parseImport:parseJson;
  parse(req,res,next);
 });
 app.get('/api/mode',(_req,res)=>res.json({mode:'service'}));
 const stores=new Map<string,WorkspaceStore>();
 const store=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))fail(404,'Space unavailable.');if(!stores.has(id))stores.set(id,new WorkspaceStore(path.join(root,'workspaces',id)));return stores.get(id)!;};
 const stamp=()=>Date.now();
 const audit=(sql:SQL,user:User|undefined,action:string,id?:string)=>sql.run('INSERT INTO audit_events(id,user_id,action,resource_id,created_at) VALUES(?,?,?,?,?)',[randomUUID(),user?.id??null,action,id??null,stamp()]);
 const sessionCookie=(token:string,maxAge=604800)=>`${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
 const queueMail=async(sql:SQL,message:Mail,expires=stamp()+86400_000)=>{await sql.run('INSERT INTO mail_outbox(id,recipient,subject,body,next_at,expires_at) VALUES(?,?,?,?,?,?)',[randomUUID(),message.to,message.subject,message.text,stamp(),expires]);};
 const authMail=async(sql:SQL,user:User,purpose:'verify'|'reset')=>{
  const {token,expires}=await issueAccountLink(sql,user.id,purpose);
  const subject=purpose==='verify'?'Verify your OmniDocs email':'Reset your OmniDocs password';
  const url=`${origin}/#/${purpose}/${token}`;
  await sql.run('DELETE FROM mail_outbox WHERE recipient=? AND subject=?',[user.email,subject]);
  await queueMail(sql,{to:user.email,subject,text:`${purpose==='verify'?'Activate your account and set your password':'Reset your password'}: ${url}\nThis link expires and can only be used once.`},expires);
  return url;
 };
 async function identify(sql:SQL,req:express.Request){const token=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);if(!token)return{user:undefined,session:undefined};const [row]=await sql.all<User&{hash:string;csrf:string}>('SELECT u.id,u.email,u.name,u.verified,s.hash,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND (?=1 OR NOT EXISTS (SELECT 1 FROM local_accounts l WHERE l.user_id=u.id)) AND NOT EXISTS (SELECT 1 FROM suspended_users b WHERE b.user_id=u.id)',[digest(token),stamp(),Number(localAccess)]);return row?{user:{id:row.id,email:row.email,name:row.name,verified:row.verified},session:{hash:row.hash,csrf:row.csrf}}:{user:undefined,session:undefined};}
 const nextAlert=new Map<string,number>();
 function logSecurity(event:string,route:string,status?:number){
  const details:SecurityEvent={time:new Date().toISOString(),level:event.endsWith('_succeeded')?'info':'warn',event,route,status};
  console[details.level](JSON.stringify(details));
  const alert=options.securityAlert,now=stamp();
  if(alert&&details.level==='warn'&&now>=(nextAlert.get(event)??0)){
   nextAlert.set(event,now+300_000);
   void Promise.resolve().then(()=>alert(details)).catch(()=>{
    console.warn(JSON.stringify({time:new Date().toISOString(),level:'warn',event:'security.alert_delivery_failed'}));
   });
  }
 }
 function route(method:'get'|'post'|'delete',url:string,handler:(ctx:Context)=>Promise<Reply>,csrf=true,prepare?:(req:express.Request)=>Promise<unknown>){
  const captchaPurpose=url==='/api/auth/login'?'login':url==='/api/auth/register'?'register':url==='/admin/api/login'?'admin':undefined;
  app[method](url,async(req,res)=>{
   let captchaRequired=false;
  try{
   const client=req.ip??'unknown';
   const captchaIssuer=url.endsWith('/captcha');
   if(method!=='get'){
    await db.transaction(sql=>rateLimit(sql,`write:${client}`,160),'independent');
    if(captchaIssuer)await db.transaction(sql=>rateLimit(sql,`captcha:${url}:${client}`,30,60_000),'independent');
    else if(url.startsWith('/api/auth/')||url==='/admin/api/login'||url.startsWith('/admin/api/mfa/')){
     const account=typeof req.body?.email==='string'?digest(normalizeEmail(req.body.email)):'';
     await db.transaction(sql=>rateLimit(sql,`auth:${url}:${client}:${account}`,12),'independent');
     if(captchaPurpose==='login')await db.transaction(sql=>rateLimit(sql,`login:ip:${client}`,30),'independent');
     if(captchaPurpose==='admin')await db.transaction(sql=>rateLimit(sql,'auth:admin:global',30),'independent');
    }
   }
   const freeAttempt=captchaPurpose?await db.transaction(sql=>reserveCaptchaFreeAttempt(sql,captchaPurpose,client),'independent'):undefined;
   if(captchaPurpose){
    captchaRequired=true;
    const id=req.get('x-omnidocs-captcha-id')??'',answer=req.get('x-omnidocs-captcha-answer')??'';
    if(!freeAttempt||id||answer){
     const expected=/^[A-Za-z0-9_-]{43}$/.test(id)?await db.transaction(sql=>consumeCaptcha(sql,captchaPurpose,client,id),'independent'):undefined;
     if(!expected||!/^\d{6}$/.test(answer)||digest(id+answer)!==expected)fail(400,'Enter the digits from a new CAPTCHA and try again.');
    }
   }
   if(captchaPurpose==='login'&&typeof req.body?.email==='string'){
    const account=email.parse(req.body.email);
    await db.transaction(sql=>rateLimit(sql,`login:account:${digest(account)}`,40),'independent');
   }
   if(url==='/api/share/:token/workspace')await db.transaction(sql=>rateLimit(sql,`share:read:${req.ip}`,120,60_000),'independent');
   const prepared=await prepare?.(req);
   const scoped=url.startsWith('/api/spaces/:id/')&&(method!=='get'||url==='/api/spaces/:id/history');
   const mode:TransactionMode=captchaIssuer?'independent':scoped?{space:String(req.params.id)}:method==='get'?'read':'global';
   const reply=await db.transaction(async sql=>{
    const identity=await identify(sql,req);
    if(method!=='get'&&csrf&&(!identity.session||req.get('x-omnidocs-token')!==identity.session.csrf))fail(403,'Invalid session request token.');
    const reply=await handler({sql,req,...identity,prepared});
    if(freeAttempt)await sql.run('DELETE FROM rate_limits WHERE bucket=? AND expires=?',[freeAttempt.bucket,freeAttempt.expires]);
    return reply;
   },mode);
   if(reply.cookie)res.setHeader('Set-Cookie',reply.cookie);
   if(url==='/admin/api/login')logSecurity('admin.login_succeeded',url,200);
   if(url==='/admin/api/mfa/confirm')logSecurity('admin.mfa_succeeded',url,200);
   res.status(reply.status??200).json(reply.body??{ok:true});
  }catch(error){
   const status=error instanceof ServiceError?error.status:error instanceof ConflictError?409:error instanceof z.ZodError?422:500;
   if(status===500)logSecurity('api.unexpected_error',url,status);
   if(url==='/admin/api/login'&&status===401)logSecurity('admin.login_denied',url,status);
   if(status===429)res.setHeader('Retry-After',url.endsWith('/captcha')||url==='/api/share/:token/workspace'?'60':'900');
   res.status(status).json({...(captchaRequired&&status<500&&status!==429?{captchaRequired:true}:{}),error:error instanceof ServiceError||error instanceof ConflictError?error.message:error instanceof z.ZodError?error.issues.map(i=>i.message).join('; '):'The request could not be completed.'});
  }});
 }
 try{await bootstrapAdmin(db,options.admin);await registerAdminRoutes(route,secure,origin,localAccess,emailAvailable,db);}catch(error){await db.close();throw error;}
 route('get','/api/health',async({sql})=>{
  await sql.all('SELECT 1');
  return {body:{status:'ok'}};
 });
 route('get','/api/auth/registration',async({sql})=>{
  const {config,generation}=await readZitadelSettings(sql);
  return {body:{mode:await registrationMode(sql,localAccess,emailAvailable),zitadelEnabled:!!(config&&generation)}};
 });
 route('post','/api/auth/captcha',async({sql,req})=>{
  const {purpose}=z.object({purpose:z.enum(['login','register'])}).strict().parse(req.body);
  return {body:await createCaptcha(sql,purpose,req.ip??'unknown')};
 },false);
 route('post','/admin/api/captcha',async({sql,req})=>{
  if(!(await readAdminAccount(sql)))fail(403,'Administrator access is disabled.');
  return {body:await createCaptcha(sql,'admin',req.ip??'unknown')};
 },false);
 const verified=(user:User|undefined)=>{if(!user)fail(401,'Sign in to continue.');if(!user.verified)fail(403,'Verify your email to continue.');return user;};
 // Older clients may include a password. Only activation can set it.
 const registration=z.object({email,name,password:password.optional()}).strict();
 const loginInput=z.object({email,password:z.string().max(128)}).strict();
 const activationInput=z.object({token:z.string().min(32).max(100),password}).strict();
 const accountForLogin=(sql:SQL,address:string)=>sql.all<User&{password:string;suspended:number}>(
  'SELECT u.id,u.email,u.name,u.verified,u.password, CASE WHEN b.user_id IS NULL THEN 0 ELSE 1 END AS suspended FROM users u LEFT JOIN suspended_users b ON b.user_id=u.id WHERE u.email=? AND u.platform_role<>\'admin\' AND (?=1 OR NOT EXISTS (SELECT 1 FROM local_accounts l WHERE l.user_id=u.id))',[address,Number(localAccess)]);
 const flowCookie=secure?'__Host-omnidocs_zitadel':'omnidocs_zitadel';
 const flowCookieOptions={httpOnly:true,sameSite:'lax' as const,secure,path:'/'};
 const ssoFailure='/#/login/zitadel-error';
 const zitadelStart='/api/auth/zitadel/start';
 function traceZitadel(route:string,state:string|undefined,res:express.Response){
  const flowId=state?digest(state).slice(0,16):randomUUID();
  const started=performance.now();
  let stage='request_received';
  function log(level:'info'|'warn',event:string,details?:ReturnType<typeof zitadelErrorDetails>){
   console[level](JSON.stringify({
    time:new Date().toISOString(),level,event,route,flowId,stage,
    elapsedMs:Math.round(performance.now()-started),...details,
   }));
  }
  log('info','sso.progress');
  return {
   step(value:string){stage=value;log('info','sso.progress');},
   fail(details:ReturnType<typeof zitadelErrorDetails>){
    log('warn','sso.failed',details);
    res.redirect(303,ssoFailure);
   },
   success(){log('info','sso.succeeded');},
  };
 }
 app.get(zitadelStart,async(req,res)=>{
  const state=oidc.randomState(),trace=traceZitadel(zitadelStart,state,res);
  try{
   trace.step('load_settings');
   await db.transaction(sql=>rateLimit(sql,`zitadel:start:${req.ip}`,30),'independent');
   const {config:provider,generation}=await db.transaction(readZitadelSettings,'read');
   if(!provider||!generation)return trace.fail({reason:'sso_unavailable'});
   trace.step('discover_provider');
   const config=await discoverZitadel(provider);
   trace.step('prepare_authorization');
   const nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier();
   const authorization=oidc.buildAuthorizationUrl(config,{
    redirect_uri:origin+zitadelCallback,scope:'openid email profile',state,nonce,
    code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',
   });
   const stored=await db.transaction(async sql=>{
    if((await readZitadelSettings(sql)).generation!==generation)return false;
    await sql.run('DELETE FROM zitadel_flows WHERE expires<=?',[stamp()]);
    await sql.run('INSERT INTO zitadel_flows(hash,verifier,nonce,generation,expires) VALUES(?,?,?,?,?)',
     [digest(state),verifier,nonce,generation,stamp()+600_000]);
    return true;
   },'global');
   if(!stored)return trace.fail({reason:'settings_changed'});
   res.cookie(flowCookie,state,{...flowCookieOptions,maxAge:600_000});
   trace.step('redirect_to_provider');
   res.redirect(303,authorization.href);
  }catch(error){trace.fail(error instanceof ServiceError&&error.status===429?{reason:'rate_limited'}:zitadelErrorDetails(error));}
 });
 app.get(zitadelCallback,async(req,res)=>{
  const state=(req.headers.cookie??'').split(';').map(value=>value.trim()).find(value=>value.startsWith(flowCookie+'='))?.slice(flowCookie.length+1);
  const callback=new URL(origin+zitadelCallback);
  callback.search=req.originalUrl.slice(req.path.length);
  const callbackState=callback.searchParams.get('state');
  const trace=traceZitadel(zitadelCallback,callbackState??state,res);
  trace.step('validate_callback');
  if(!state)return trace.fail({reason:'flow_cookie_missing'});
  if(callback.searchParams.getAll('state').length!==1||callbackState!==state)return trace.fail({reason:'state_mismatch'});
  res.clearCookie(flowCookie,flowCookieOptions);
  try{
   trace.step('consume_flow');
   const attempt=await db.transaction(async sql=>{
    const [pending]=await sql.all<{verifier:string;nonce:string;generation:string;expires:number}>('SELECT verifier,nonce,generation,expires FROM zitadel_flows WHERE hash=?',[digest(state)]);
    const {config:provider,generation}=await readZitadelSettings(sql);
    if(!provider||!generation)return 'sso_unavailable';
    if(!pending)return 'flow_missing_or_consumed';
    if(Number(pending.expires)<=stamp())return 'flow_expired';
    if(pending.generation!==generation)return 'settings_changed';
    await sql.run('DELETE FROM zitadel_flows WHERE hash=?',[digest(state)]);
    return {flow:pending,provider};
   },'global');
   if(typeof attempt==='string')return trace.fail({reason:attempt});
   const {flow,provider}=attempt;
   trace.step('discover_provider');
   const config=await discoverZitadel(provider);
   trace.step('exchange_code_and_validate_id_token');
   const tokens=await oidc.authorizationCodeGrant(config,callback,{
    expectedState:state,expectedNonce:flow.nonce,pkceCodeVerifier:flow.verifier,
   });
   const claims=tokens.claims();
   if(!claims?.sub)return trace.fail({reason:'subject_missing'});
   trace.step('fetch_userinfo');
   const profile=await oidc.fetchUserInfo(config,tokens.access_token,claims.sub);
   trace.step('validate_email');
   const address=email.safeParse(profile.email);
   if(!address.success)return trace.fail({reason:'email_missing_or_invalid'});
   if(profile.email_verified!==true)return trace.fail({reason:'email_unverified'});
   trace.step('match_account_and_create_session');
   const session=await db.transaction(async sql=>{
    if(flow.generation!==(await readZitadelSettings(sql)).generation)return 'settings_changed';
    if(address.data.endsWith('@'+adminEmailDomain))return 'reserved_member_email';
    const [existing]=await accountForLogin(sql,address.data);
    if(existing&&!existing.verified)return 'member_email_unverified';
    if(existing?.suspended)return 'member_suspended';
    if(!existing&&(await sql.all('SELECT 1 FROM users WHERE email=?',[address.data])).length)return 'member_ineligible';
    const identities=await sql.all<{subject:string;user_id:string}>(
     'SELECT subject,user_id FROM zitadel_identities WHERE issuer=? AND (user_id=? OR subject=?)',
     [provider.issuer,existing?.id??null,claims.sub]);
    if(identities.some(identity=>identity.subject!==claims.sub||identity.user_id!==existing?.id))return 'identity_mismatch';
    const displayName=name.safeParse(profile.name);
    const user=existing??{id:randomUUID(),email:address.data,name:displayName.success?displayName.data:address.data.split('@')[0],verified:1};
    if(!existing){
     await sql.run('INSERT INTO users(id,email,name,password,verified,created_at) VALUES(?,?,?,?,?,?)',
      [user.id,user.email,user.name,'!',user.verified,stamp()]);
     await audit(sql,user,'account.zitadel_created');
    }
    if(!identities.length)await sql.run('INSERT INTO zitadel_identities(issuer,subject,user_id) VALUES(?,?,?)',[provider.issuer,claims.sub,user.id]);
    return createMemberSession(sql,user,'account.zitadel_sign_in');
   },'global');
   if(typeof session==='string')return trace.fail({reason:session});
   res.append('Set-Cookie',sessionCookie(session.token));
   trace.success();
   res.redirect(303,'/');
  }catch(error){trace.fail(zitadelErrorDetails(error));}
 });
 async function createMemberSession(sql:SQL,user:User,action='account.sign_in'){
  const token=secret(),csrf=secret();
  await sql.run('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)',[digest(token),user.id,csrf,stamp()+604800_000]);
  await audit(sql,user,action);
  return {token,csrf};
 }
 const validToken=(sql:SQL,token:string,purpose:'verify'|'reset')=>sql.all<{user_id:string}>(
  'SELECT user_id FROM auth_tokens WHERE hash=? AND purpose=? AND expires>?',[digest(token),purpose,stamp()]);
 const clearAccountLinks=async(sql:SQL,userId:string)=>{
  await sql.run('DELETE FROM auth_tokens WHERE user_id=?',[userId]);
  await sql.run("DELETE FROM mail_outbox WHERE recipient=(SELECT email FROM users WHERE id=?) AND subject IN ('Verify your OmniDocs email','Reset your OmniDocs password')",[userId]);
  await sql.run('DELETE FROM sessions WHERE user_id=?',[userId]);
 };
 const preparePassword=(purpose:'verify'|'reset')=>async(req:express.Request)=>{
  const input=activationInput.parse(req.body);
  if(!(await db.transaction(sql=>validToken(sql,input.token,purpose),'read')).length)fail(400,'This link is invalid or expired.');
  return hashPassword(input.password);
 };
 route('post','/api/auth/register',async({sql,req,prepared})=>{
  const input=registration.parse(req.body),mode=await registrationMode(sql,localAccess,emailAvailable);
  if(input.email.endsWith('@'+adminEmailDomain))fail(422,'Use a real email address.');
  const candidate=prepared as {mode:string;hash?:string};
  if(candidate.mode!==mode)fail(409,'Registration settings changed. Reload this page and try again.');
  let [user]=await sql.all<User&{local_only:number}>(`SELECT u.id,u.email,u.name,u.verified,
   CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS local_only FROM users u LEFT JOIN local_accounts l ON l.user_id=u.id WHERE u.email=?`,[input.email]);
  if(!user){
   const automatic=mode==='automatic';
   user={id:randomUUID(),email:input.email,name:input.name,verified:Number(automatic),local_only:Number(automatic)};
   await sql.run('INSERT INTO users(id,email,name,password,verified,created_at) VALUES(?,?,?,?,?,?)',
    [user.id,user.email,user.name,candidate.hash??'!',user.verified,stamp()]);
   if(automatic)await sql.run('INSERT INTO local_accounts(user_id) VALUES(?)',[user.id]);
  }
  if(mode==='automatic')return {status:202,body:{message:'You can sign in with your password if this is a new account. Existing pending accounts require approval.'}};
  if(mode==='manual')return {status:202,body:{message:'An administrator will review your registration and provide an activation link.'}};
  const developmentLink=options.devMail&&isLoopback(req.socket.remoteAddress);
  let verificationUrl:string|undefined;
  if(!user.verified||user.local_only){
   const [active]=await sql.all('SELECT 1 FROM auth_tokens WHERE user_id=? AND purpose=? AND expires>?',[user.id,'verify',stamp()+23*3600_000]);
   if(!active||developmentLink)verificationUrl=await authMail(sql,user,'verify');
  }
  return {status:202,body:{message:'Check your email for a link to set your password, or sign in if you already have an account.',...(developmentLink&&verificationUrl?{verificationUrl}:{})}};
 },false,async req=>{
  const input=registration.parse(req.body),mode=await db.transaction(sql=>registrationMode(sql,localAccess,emailAvailable),'read');
  return {mode,hash:mode==='automatic'?await hashPassword(password.parse(input.password)):undefined};
 });
 route('post','/api/auth/login',async({sql,req,prepared})=>{
  const {email:address}=loginInput.parse(req.body);
  const [user]=await accountForLogin(sql,address);
  if(!user||!user.verified||user.suspended||user.password!==prepared)fail(401,'Email or password is incorrect.');
  const {token,csrf}=await createMemberSession(sql,user);
  return{cookie:sessionCookie(token),body:{user:{id:user.id,email:user.email,name:user.name,verified:true},csrf}};
 },false,async(req)=>{
  const input=loginInput.parse(req.body);
  const [user]=await db.transaction(sql=>accountForLogin(sql,input.email),'read');
  if(!await checkPassword(input.password,user?.verified?user.password:undefined)||!user?.verified||user.suspended)fail(401,'Email or password is incorrect.');
  return user.password;
 });
 route('get','/api/auth/me',async({user,session})=>({body:{user:user?{...user,verified:!!user.verified}:null,csrf:session?.csrf,developmentMail:!!options.devMail}}));
 route('post','/api/auth/logout',async({sql,session,req})=>{if(session){if(req.get('x-omnidocs-token')!==session.csrf)fail(403,'Invalid session request token.');await sql.run('DELETE FROM sessions WHERE hash=?',[session.hash]);}return{cookie:sessionCookie('',0)};},false);
 route('post','/api/auth/verify',async({sql,req,prepared})=>{
  const {token}=activationInput.parse(req.body);
  const [record]=await validToken(sql,token,'verify');
  if(!record)fail(400,'This verification link is invalid or expired.');
  await sql.run('UPDATE users SET verified=1,password=? WHERE id=?',[prepared,record.user_id]);
  await sql.run('DELETE FROM local_accounts WHERE user_id=?',[record.user_id]);
  await clearAccountLinks(sql,record.user_id);
  return{cookie:sessionCookie('',0)};
 },false,preparePassword('verify'));
 route('post','/api/auth/resend',async({sql,user,req})=>{let verificationUrl:string|undefined;if(user&&!user.verified&&await registrationMode(sql,localAccess,emailAvailable)==='email'){const url=await authMail(sql,user,'verify');if(options.devMail&&isLoopback(req.socket.remoteAddress))verificationUrl=url;}return{body:{message:verificationUrl?'Local development mail is enabled. Open the verification link below; no email is sent.':'A new verification email will be sent if needed.',...(verificationUrl?{verificationUrl}:{})}};});
 route('post','/api/auth/forgot',async({sql,req})=>{
  const input=z.object({email}).strict().parse(req.body);
  const [user]=await sql.all<User>("SELECT id,email,name,verified FROM users WHERE email=? AND platform_role<>'admin'",[input.email]);
  if(emailAvailable&&user?.verified&&!(await sql.all('SELECT 1 FROM local_accounts WHERE user_id=?',[user.id])).length){
   const [recent]=await sql.all('SELECT 1 FROM auth_tokens WHERE user_id=? AND purpose=? AND expires>?',[user.id,'reset',stamp()+55*60_000]);
   if(!recent)await authMail(sql,user,'reset');
  }
  return{body:{message:'If the account exists, check your email for a reset link.'}};
 },false);
 route('post','/api/auth/reset',async({sql,req,prepared})=>{
  const {token}=activationInput.parse(req.body);
  const [record]=await validToken(sql,token,'reset');
  if(!record)fail(400,'This reset link is invalid or expired.');
  await sql.run('UPDATE users SET password=? WHERE id=?',[prepared,record.user_id]);
  await clearAccountLinks(sql,record.user_id);
  return{cookie:sessionCookie('',0)};
 },false,preparePassword('reset'));
 route('get','/api/tree',async({sql,user})=>{
  const account=verified(user);
  const direct=await sql.all<Resource>(`WITH RECURSIVE reachable(id) AS (
   SELECT id FROM resources WHERE owner_id=?
   UNION SELECT scope_id FROM memberships WHERE email=?
   UNION SELECT r.id FROM resources r JOIN reachable p ON p.id=r.parent_id
  ) SELECT r.* FROM resources r JOIN reachable v ON v.id=r.id`,[account.id,account.email]);
  const visible=new Map<string,Resource>(),rights=new Map<string,Awaited<ReturnType<typeof access>>>();
  for(const node of direct){
   const result=await access(sql,account,node.id);
   if(!result.role)continue;
   rights.set(node.id,result);
   for(const parent of await ancestors(sql,node.id))visible.set(parent.id,parent);
  }
  const resources=[...visible.values()].sort((a,b)=>Number(a.created_at)-Number(b.created_at)||a.id.localeCompare(b.id));
  return{body:{resources:resources.map(({id,kind,parent_id,name,description,created_at})=>({
   id,kind,parent_id,name,description:rights.has(id)?description:'',created_at,...(rights.get(id)??{role:null,via:[]}),
  }))}};
 });
 async function createResource(sql:SQL,account:User,input:z.infer<typeof resourceInput>,bundle?:WorkspaceBundle):Promise<Reply>{
  if(input.kind==='organization'&&input.parentId||input.kind!=='organization'&&!input.parentId)fail(422,'Choose the correct parent.');
  if(input.parentId){await requireAccess(sql,account,input.parentId,'owner');const [parent]=await sql.all<Resource>('SELECT * FROM resources WHERE id=?',[input.parentId]);if(parent.kind!==(input.kind==='project'?'organization':'project'))fail(422,'Organizations contain projects, and projects contain spaces.');}
  const [count]=await sql.all<{total:number}>('SELECT COUNT(*) AS total FROM resources WHERE owner_id=? AND kind=?',[account.id,input.kind]);
  if(Number(count.total)>=freePlanLimits[input.kind])fail(409,freePlanLimitMessage(input.kind));
  const id=randomUUID();
  if(input.kind==='space'&&!bundle){
   const destination=path.join(root,'workspaces',id),staging=path.join(root,'workspaces',`.create-${id}`);await mkdir(staging,{recursive:true,mode:0o700});
   try{for(const file of scaffoldSpace({name:input.name,description:input.description})){const target=path.join(staging,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.content,{flag:'wx',mode:0o600});}await rename(staging,destination);}catch(error){await rm(staging,{recursive:true,force:true});throw error;}
  }
  await sql.run('INSERT INTO resources(id,kind,parent_id,owner_id,name,description,created_at) VALUES(?,?,?,?,?,?,?)',[id,input.kind,input.parentId??null,account.id,input.name,input.description,stamp()]);
  if(bundle)await initializeImportedHistory(sql,id,bundle.files,account);
  await audit(sql,account,bundle?'workspace.import':'resource.create',id);
  return {status:201,body:{id,...input,role:'owner'}};
 }
 route('post','/api/resources',async({sql,user,req})=>createResource(sql,verified(user),resourceInput.parse(req.body)));
 route('post','/api/spaces/import',async({sql,user,prepared})=>{
  const account=verified(user),{parentId,bundle}=prepared as {parentId:string;bundle:WorkspaceBundle};
  return createResource(sql,account,{kind:'space',parentId,name:bundle.name,description:bundle.description},bundle);
 },true,async(req)=>{
  const {parentId,bundle}=z.object({parentId:z.string().uuid(),bundle:workspaceBundleSchema}).strict().parse(req.body);
  await db.transaction(async sql=>{
   const {user,session}=await identify(sql,req);
   if(!session||req.get('x-omnidocs-token')!==session.csrf)fail(403,'Invalid session request token.');
   await requireAccess(sql,user,parentId,'owner');
  },'read');
  if(Buffer.byteLength(JSON.stringify(bundle))>workspaceImportMaxBytes)fail(413,'The workspace exceeds the 10 MiB import limit.');
  const inspection=inspectWorkspace(bundle.files);
  if(!inspection.compatible)fail(422,inspection.errors.slice(0,5).join('\n'));
  return {parentId,bundle};
 });
 route('get','/api/resources/:id/access',async({sql,user,req})=>{const id=String(req.params.id);await requireAccess(sql,user,id,'owner');const chain=await ancestors(sql,id);const members=[];for(const node of chain){const grants=await sql.all<{id:string;email:string;role:string}>('SELECT id,email,role FROM memberships WHERE scope_id=?',[node.id]);members.push(...grants.map(g=>({...g,scopeId:node.id,scopeName:node.name,inherited:node.id!==id})));}return{body:{members,invitations:await sql.all('SELECT id,email,role,expires FROM invitations WHERE scope_id=? AND accepted=0 AND revoked=0 AND expires>?',[id,stamp()]),shares:await sql.all('SELECT id,mode,emails,expires,revoked,created_at FROM shares WHERE space_id=?',[id])}};});
 route('post','/api/resources/:id/invitations',async({sql,user,req})=>{const id=String(req.params.id);await requireAccess(sql,user,id,'owner');const input=z.object({email,role}).strict().parse(req.body),invite=randomUUID();await sql.run('UPDATE invitations SET revoked=1 WHERE scope_id=? AND email=? AND accepted=0',[id,input.email]);await sql.run('INSERT INTO invitations(id,scope_id,email,role,expires) VALUES(?,?,?,?,?)',[invite,id,input.email,input.role,stamp()+7*86400_000]);const [resource]=await sql.all<Resource>('SELECT * FROM resources WHERE id=?',[id]);await queueMail(sql,{to:input.email,subject:`Invitation to ${resource.name}`,text:`You have been invited as ${input.role} to ${resource.name}. Sign in with this verified email to accept: ${origin}/#/invitations\nParent access includes current and future descendants.`});await audit(sql,user,'invitation.create',id);return{status:201,body:{id:invite}};});
 route('get','/api/invitations',async({sql,user})=>{const account=verified(user);const pending=await sql.all<{scope_id:string;id:string;role:string;expires:number;name:string;kind:string}>('SELECT i.id,i.scope_id,i.role,i.expires,r.name,r.kind FROM invitations i JOIN resources r ON r.id=i.scope_id WHERE i.email=? AND i.accepted=0 AND i.revoked=0 AND i.expires>?',[account.email,stamp()]);
  const invitations=[];for(const {scope_id,...invite} of pending)if(!(await ancestors(sql,scope_id)).some(node=>node.archived))invitations.push(invite);
  return{body:{invitations}};});
 route('post','/api/invitations/:id/accept',async({sql,user,req})=>{const account=verified(user),[invite]=await sql.all<{id:string;scope_id:string;role:string}>('SELECT * FROM invitations WHERE id=? AND email=? AND accepted=0 AND revoked=0 AND expires>?',[String(req.params.id),account.email,stamp()]);if(!invite||(await ancestors(sql,invite.scope_id)).some(node=>node.archived))fail(404,'Invitation unavailable.');await sql.run('INSERT INTO memberships(id,scope_id,email,role) VALUES(?,?,?,?) ON CONFLICT(scope_id,email) DO UPDATE SET role=excluded.role',[randomUUID(),invite.scope_id,account.email,invite.role]);await sql.run('UPDATE invitations SET accepted=1 WHERE id=?',[invite.id]);await audit(sql,user,'invitation.accept',invite.scope_id);return{};});
 route('delete','/api/invitations/:id',async({sql,user,req})=>{const [invite]=await sql.all<{scope_id:string}>('SELECT scope_id FROM invitations WHERE id=?',[String(req.params.id)]);if(!invite)fail(404,'Invitation unavailable.');await requireAccess(sql,user,invite.scope_id,'owner');await sql.run('UPDATE invitations SET revoked=1 WHERE id=?',[String(req.params.id)]);return{};});
 route('delete','/api/memberships/:id',async({sql,user,req})=>{const [grant]=await sql.all<{scope_id:string}>('SELECT scope_id FROM memberships WHERE id=?',[String(req.params.id)]);if(!grant)fail(404,'Membership unavailable.');await requireAccess(sql,user,grant.scope_id,'owner');await sql.run('DELETE FROM memberships WHERE id=?',[String(req.params.id)]);await audit(sql,user,'membership.revoke',grant.scope_id);return{};});
 async function workspace(sql:SQL,user:User|undefined,id:string,readOnly=false){const permission=await requireAccess(sql,user,id);const [resource]=await sql.all<Resource>('SELECT * FROM resources WHERE id=?',[id]);if(resource.kind!=='space')fail(404,'Space unavailable.');const files=await publishedFiles(sql,id,()=>store(id).read());return{files,name:resource.name,description:resource.description,revision:workspaceRevision(files),reviewRequired:await reviewRequired(sql,id),writable:!readOnly&&permission.role!=='viewer',permission:permission.role};}
 route('get','/api/spaces/:id/workspace',async({sql,user,session,req})=>{const data=await workspace(sql,user,String(req.params.id));return{body:{...data,editToken:data.writable?session?.csrf:undefined}};});
 registerHistoryRoutes(route, id=>store(id).read());
 route('post','/api/spaces/:id/edits',async({sql,user,req})=>{
  const id=String(req.params.id);
  await requireAccess(sql,user,id,'editor');
  const [resource]=await sql.all<Resource>('SELECT kind FROM resources WHERE id=?',[id]);
  if(resource.kind!=='space')fail(404,'Space unavailable.');
  const result=await savePublished(sql,id,user!,req.body,()=>store(id).read());
  await audit(sql,user,'workspace.save',id);
  return {body:result};
 });
 route('post','/api/spaces/:id/shares',async({sql,user,req})=>{const id=String(req.params.id);await requireAccess(sql,user,id,'owner');const [node]=await sql.all<Resource>('SELECT * FROM resources WHERE id=?',[id]);if(node.kind!=='space')fail(422,'Share links belong to one space.');const input=z.object({mode:z.enum(['public','restricted']),emails:z.array(email).max(100).default([]),days:z.number().int().min(1).max(365).default(30)}).strict().parse(req.body);if(input.mode==='restricted'&&!input.emails.length)fail(422,'Specify the allowed email addresses.');const token=secret(),share=randomUUID();await sql.run('INSERT INTO shares(id,hash,space_id,mode,emails,expires,created_at) VALUES(?,?,?,?,?,?,?)',[share,digest(token),id,input.mode,JSON.stringify([...new Set(input.emails)]),stamp()+input.days*86400_000,stamp()]);await audit(sql,user,'share.create',id);return{status:201,body:{id:share,url:`${origin}/#/share/${token}`}};});
 route('delete','/api/shares/:id',async({sql,user,req})=>{const [share]=await sql.all<{space_id:string}>('SELECT space_id FROM shares WHERE id=?',[String(req.params.id)]);if(!share)fail(404,'Share unavailable.');await requireAccess(sql,user,share.space_id,'owner');await sql.run('UPDATE shares SET revoked=1 WHERE id=?',[String(req.params.id)]);await audit(sql,user,'share.revoke',share.space_id);return{};});
 route('get','/api/share/:token/workspace',async({sql,user,req})=>{const [share]=await sql.all<{space_id:string;mode:string;emails:string}>('SELECT space_id,mode,emails FROM shares WHERE hash=? AND revoked=0 AND expires>?',[digest(String(req.params.token)),stamp()]);if(!share||(await ancestors(sql,share.space_id)).some(node=>node.archived))fail(404,'This share link is unavailable or expired.');if(share.mode==='restricted'){const account=verified(user);if(!JSON.parse(share.emails).includes(account.email))fail(403,'This link is restricted to specific verified email addresses.');}const [resource]=await sql.all<Resource>('SELECT * FROM resources WHERE id=?',[share.space_id]);const files=await publishedFiles(sql,share.space_id,()=>store(share.space_id).read());return{body:{name:resource.name,description:resource.description,files,revision:workspaceRevision(files),writable:false,shared:true}};});
 app.use(['/api','/admin/api'],(_req,res)=>res.status(404).json({error:'API endpoint unavailable.'}));
 app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const type=typeof error==='object'&&error!==null&&'type' in error?error.type:undefined;
  if(type==='encoding.unsupported'){res.status(415).json({error:'Send the JSON body without compression.'});return;}
  const tooLarge=type==='entity.too.large';
  res.status(tooLarge?413:400).json({error:tooLarge?'The upload exceeds the request size limit.':'Invalid request body.'});
 });
 let draining=false;
 async function drainMail(){
  if(draining)return;
  draining=true;
  try{
   await db.transaction(async sql=>{
    await sql.run('DELETE FROM mail_outbox WHERE expires_at<=?',[stamp()]);
    await sql.run('DELETE FROM auth_tokens WHERE expires<=?',[stamp()]);
    await sql.run('DELETE FROM rate_limits WHERE expires<=?',[stamp()]);
    await sql.run('DELETE FROM captcha_challenges WHERE expires<=?',[stamp()]);
    await sql.run('DELETE FROM admin_mfa_pending WHERE expires<=?',[stamp()]);
   },'independent');
   for(let i=0;i<20;i++){
    const job=await db.transaction(async sql=>{
     const now=stamp();
     const [mail]=await sql.all<{id:string;recipient:string;subject:string;body:string;attempts:number}>(
      `UPDATE mail_outbox SET delivered=2,attempts=attempts+1,next_at=?
       WHERE id=(SELECT id FROM mail_outbox WHERE delivered<>1 AND next_at<=? AND expires_at>? ORDER BY next_at,id LIMIT 1)
        AND next_at<=? AND expires_at>? RETURNING id,recipient,subject,body,attempts`,[now+60_000,now,now,now,now]);
     return mail;
    },'independent');
    if(!job)break;
    try{
     const message={to:job.recipient,subject:job.subject,text:job.body};
     if(options.mail&&!options.devMail)await options.mail(message);
     else if(options.devMail){
      await mkdir(path.join(root,'development-mail'),{recursive:true,mode:0o700});
      await writeFile(path.join(root,'development-mail',`${job.id}.json`),JSON.stringify(message,null,2),{mode:0o600});
     }else throw new Error('Email delivery is unavailable.');
    }catch{
     logSecurity('mail.delivery_failed','mail_outbox');
     await db.transaction(sql=>sql.run('UPDATE mail_outbox SET delivered=0,next_at=? WHERE id=?',[stamp()+Math.min(3600_000,30_000*2**Math.min(job.attempts-1,6)),job.id]),'independent');
     continue;
    }
    await db.transaction(sql=>sql.run('DELETE FROM mail_outbox WHERE id=?',[job.id]),'independent');
   }
  }finally{draining=false;}
 }
 const timer=setInterval(()=>void drainMail().catch(()=>logSecurity('mail.queue_failed','mail_outbox')),3000);
 timer.unref();
 return{app,db,drainMail,async close(){clearInterval(timer);while(draining)await new Promise(resolve=>setTimeout(resolve,10));await db.close();}};
}
