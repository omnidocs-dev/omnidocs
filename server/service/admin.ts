import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Request} from 'express';
import {z} from 'zod';
import {registerManagementRoutes,type ManagementRoute} from './admin-management.ts';
import type {Database,SQL} from './database.ts';
import {checkPassword,digest,fail,hashPassword,secret} from './security.ts';

export type AdminCredentials = {username:string;password?:string;passwordHash?:string;totpSecret?:string};
export type AdminAccount={id:string;username:string;password_hash:string;suspended:number};
export const adminEmailDomain='admin.omnidocs.invalid';
export const adminSessionSchema = 'CREATE TABLE IF NOT EXISTS admin_sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires BIGINT NOT NULL, user_id TEXT REFERENCES users(id))';
export const adminOtpSchema = [
 'CREATE TABLE IF NOT EXISTS admin_otp_steps (key_id TEXT PRIMARY KEY, step BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS admin_mfa (id INTEGER PRIMARY KEY, environment_id TEXT NOT NULL, secret TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS admin_mfa_pending (session_hash TEXT PRIMARY KEY REFERENCES admin_sessions(hash) ON DELETE CASCADE, secret TEXT NOT NULL, expires BIGINT NOT NULL)',
];

const loginSchema=z.object({
 username:z.string().trim().min(1).max(254),
 password:z.string().min(1).max(128),
 code:z.string().regex(/^\d{6}$/).optional(),
}).strict();
const usernameInput=z.string().trim().regex(/^[a-zA-Z0-9._-]{3,64}$/);
const passwordInput=z.string().min(16).max(128);
const hashInput=z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
const keyInput=z.string().regex(/^[A-Z2-7]{32}$/);
const configSchema=z.object({
 username:usernameInput,password:passwordInput.optional(),passwordHash:hashInput.optional(),totpSecret:keyInput.optional(),
});
function validateAdminCredentials(credentials:AdminCredentials){
 const configuration=configSchema.safeParse(credentials);
 if(!configuration.success)throw new Error('Check the administrator bootstrap username, password or authenticator key.');
 return configuration.data;
}

export function adminCredentialsFromEnvironment(env:NodeJS.ProcessEnv) {
 const password=env.OMNIDOCS_ADMIN_PASSWORD||undefined;
 const passwordHash=env.OMNIDOCS_ADMIN_PASSWORD_HASH||undefined;
 const totpSecret=env.OMNIDOCS_ADMIN_TOTP_SECRET||undefined;
 if(!password&&!passwordHash&&!totpSecret)return undefined;
 return validateAdminCredentials({username:env.OMNIDOCS_ADMIN_USERNAME||'admin',password,passwordHash,totpSecret});
}

export async function readAdminAccount(sql:SQL){
 const [admin]=await sql.all<AdminAccount>(`SELECT u.id,COALESCE(u.login_name,u.email) AS username,u.password AS password_hash,
  CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END AS suspended
  FROM users u LEFT JOIN suspended_users s ON s.user_id=u.id WHERE u.platform_role='admin'`);
 return admin;
}

export async function insertAdmin(sql:SQL,username:string,hash:string){
 const id=randomUUID();
 await sql.run("INSERT INTO users(id,email,name,password,verified,created_at,platform_role,login_name) VALUES(?,?,?,?,1,?,'admin',?)",
  [id,`${id}@${adminEmailDomain}`,username,hash,Date.now(),username]);
}

export async function bootstrapAdmin(db:Database,input?:AdminCredentials){
 if(!input)return;
 const config=validateAdminCredentials(input);
 await db.transaction(async sql=>{
  let admin=await readAdminAccount(sql);
  if(!admin&&(config.password||config.passwordHash)){
   const hash=config.passwordHash??await hashPassword(config.password!);
   await insertAdmin(sql,config.username,hash);
   admin=await readAdminAccount(sql);
  }
  if(admin&&config.totpSecret){
   await sql.run("UPDATE admin_mfa SET environment_id='', secret=CASE WHEN environment_id=? THEN secret ELSE ? END WHERE id=1 AND environment_id<>''",
    [digest(config.totpSecret),config.totpSecret]);
   await sql.run("INSERT INTO admin_mfa(id,environment_id,secret) VALUES(1,'',?) ON CONFLICT(id) DO NOTHING",[config.totpSecret]);
  }
 });
}

export async function resetAdminPassword(db:Database,username:string,password:string){
 const named=usernameInput.parse(username),hash=await hashPassword(passwordInput.parse(password));
 return db.transaction(async sql=>{
  const admin=await readAdminAccount(sql);
  if(admin)await sql.run('UPDATE users SET password=? WHERE id=?',[hash,admin.id]);
  else await insertAdmin(sql,named,hash);
  await sql.run('DELETE FROM admin_sessions');
  if(admin)await sql.run('DELETE FROM sessions WHERE user_id=?',[admin.id]);
  return admin?.username??named;
 });
}

export async function resetAdminAuthenticator(db:Database){
 return db.transaction(async sql=>{
  if(!await readAdminAccount(sql))fail(409,'Create an administrator before resetting the authenticator.');
  const key=generateTotpSecret();
  await sql.run("INSERT INTO admin_mfa(id,environment_id,secret) VALUES(1,'',?) ON CONFLICT(id) DO UPDATE SET environment_id=excluded.environment_id,secret=excluded.secret",[key]);
  await sql.run('DELETE FROM admin_sessions');
  await sql.run('DELETE FROM admin_otp_steps');
  return key;
 });
}

function generateTotpSecret(){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 let output='',buffer=0,bits=0;
 for(const byte of randomBytes(20)){
  buffer=(buffer<<8)|byte;bits+=8;
  while(bits>=5){bits-=5;output+=alphabet[(buffer>>bits)&31];}
 }
 return output;
}

function decodeBase32(value:string){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 const bytes=Buffer.alloc(20);
 let buffer=0,bits=0,index=0;
 for(const letter of value){
  buffer=(buffer<<5)|alphabet.indexOf(letter);bits+=5;
  if(bits>=8){bits-=8;bytes[index++]=buffer>>bits;}
 }
 return bytes;
}

function verifiedOtpStep(key:Buffer,code:string,now:number){
 const current=Math.floor(now/30_000),counter=Buffer.alloc(8);
 for(const step of [current,current-1,current+1]){
  counter.writeBigUInt64BE(BigInt(step));
  const mac=createHmac('sha1',key).update(counter).digest();
  const value=(mac.readUInt32BE(mac[mac.length-1]&15)&0x7fffffff)%1_000_000;
  if(timingSafeEqual(Buffer.from(String(value).padStart(6,'0')),Buffer.from(code)))return step;
 }
}

export async function registerAdminRoutes(route:ManagementRoute,secure:boolean,origin:string,local:boolean,emailAvailable:boolean,db:Database) {
 const cookieName=secure?'__Secure-omnidocs_admin':'omnidocs_admin';
 const ttl=8*60*60,enrollmentTtl=10*60;
 const signature=(admin:AdminAccount,token:string,keyId?:string)=>createHmac('sha256',admin.password_hash)
  .update(admin.username+'\n'+(keyId??(secure?'enrollment':''))+'\n'+token).digest('hex');
 const cookie=(value:string,age=ttl)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/admin/; Max-Age=${age}${secure?'; Secure':''}`;

 async function authenticator(sql:SQL){
  const [stored]=await sql.all<{secret:string}>('SELECT secret FROM admin_mfa WHERE id=1');
  const value=stored?.secret;
  if(!value)return undefined;
  const key=decodeBase32(value);
  return {key,id:digest(key.toString('hex'))};
 }
 type Authenticator=NonNullable<Awaited<ReturnType<typeof authenticator>>>;

 async function session(sql:SQL,req:Request,admin:AdminAccount|undefined,keyId?:string) {
  if(!admin||admin.suspended)return undefined;
  const value=(req.headers.cookie??'').split(';').map(part=>part.trim())
   .find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const match=value?.match(/^([a-zA-Z0-9_-]{43})\.([a-f0-9]{64})$/);
  if(!match)return undefined;
  const [,token,signed]=match;
  if(!timingSafeEqual(Buffer.from(signed,'hex'),Buffer.from(signature(admin,token,keyId),'hex')))return undefined;
  const [row]=await sql.all<{hash:string;csrf:string}>('SELECT hash,csrf FROM admin_sessions WHERE hash=? AND user_id=? AND expires>?',[digest(token),admin.id,Date.now()]);
  return row;
 }

 const sessionBody=(admin:AdminAccount,csrf:string,keyId?:string)=>({
  username:admin.username,csrf,...(keyId?{mfaRequired:true}:secure?{enrollmentRequired:true}:{}),
 });
 async function newSession(sql:SQL,admin:AdminAccount,keyId?:string){
  const token=secret(),csrf=secret(),now=Date.now(),age=secure&&!keyId?enrollmentTtl:ttl;
  await sql.run('DELETE FROM admin_sessions WHERE expires<=?',[now]);
  await sql.run('INSERT INTO admin_sessions(hash,csrf,expires,user_id) VALUES(?,?,?,?)',[digest(token),csrf,now+age*1000,admin.id]);
  return {body:sessionBody(admin,csrf,keyId),cookie:cookie(`${token}.${signature(admin,token,keyId)}`,age)};
 }

 async function consumeCode(sql:SQL,otp:Authenticator,code?:string){
  const step=code&&verifiedOtpStep(otp.key,code,Date.now());
  if(!step)fail(401,'The authentication code is incorrect or expired.');
  const [used]=await sql.all(`INSERT INTO admin_otp_steps(key_id,step) VALUES(?,?)
   ON CONFLICT(key_id) DO UPDATE SET step=excluded.step WHERE admin_otp_steps.step<excluded.step RETURNING step`,[otp.id,step]);
  if(!used)fail(401,'That authentication code has already been used. Wait for a new code.');
 }

 async function requireSession(sql:SQL,req:Request,admin:AdminAccount|undefined,otp:Authenticator|undefined,write=false){
  const current=await session(sql,req,admin,otp?.id);
  if(!current)fail(401,'Sign in to the administrator panel.');
  if(write&&req.get('x-omnidocs-token')!==current.csrf)fail(403,'Invalid administrator request token.');
  return current;
 }
 const codeInput=z.string().regex(/^\d{6}$/);
 const prefix='/admin/api';
 route('get',`${prefix}/me`,async({sql,req})=>{
  const admin=await readAdminAccount(sql),otp=await authenticator(sql),current=await session(sql,req,admin,otp?.id);
  return {body:{enabled:!!admin,...(current&&admin?sessionBody(admin,current.csrf,otp?.id):{username:null,...(otp?{mfaRequired:true}:{})})}};
 },false);
 route('post',`${prefix}/login`,async({sql,req,prepared})=>{
  const admin=await readAdminAccount(sql);
  if(!admin||admin.suspended||admin.password_hash!==prepared)fail(401,'Administrator credentials are incorrect.');
  const otp=await authenticator(sql);
  if(otp)await consumeCode(sql,otp,loginSchema.parse(req.body).code);
  return newSession(sql,admin,otp?.id);
 },false,async(req)=>{
  const admin=await db.transaction(readAdminAccount,'read');
  if(!admin)fail(403,'Administrator access is disabled.');
  const {username,password}=loginSchema.parse(req.body);
  if(!await checkPassword(password,admin.password_hash)||username!==admin.username||admin.suspended)fail(401,'Administrator username or password is incorrect.');
  return admin.password_hash;
 });
 route('post',`${prefix}/logout`,async({sql,req})=>{
  const admin=await readAdminAccount(sql),otp=await authenticator(sql),current=await session(sql,req,admin,otp?.id);
  if(current){
   if(req.get('x-omnidocs-token')!==current.csrf)fail(403,'Invalid administrator request token.');
   await sql.run('DELETE FROM admin_sessions WHERE hash=?',[current.hash]);
  }
  return {cookie:cookie('',0)};
 },false);

 route('post',`${prefix}/mfa/start`,async({sql,req})=>{
  const admin=await readAdminAccount(sql),otp=await authenticator(sql),current=await requireSession(sql,req,admin,otp,true);
  const {code}=z.object({code:codeInput.optional()}).strict().parse(req.body);
  if(otp)await consumeCode(sql,otp,code);
  const key=generateTotpSecret(),expires=Date.now()+enrollmentTtl*1000;
  await sql.run('DELETE FROM admin_mfa_pending WHERE expires<=?',[Date.now()]);
  await sql.run(`INSERT INTO admin_mfa_pending(session_hash,secret,expires) VALUES(?,?,?)
   ON CONFLICT(session_hash) DO UPDATE SET secret=excluded.secret, expires=excluded.expires`,[current.hash,key,expires]);
  return {body:{key,expires}};
 },false);
 route('post',`${prefix}/mfa/confirm`,async({sql,req})=>{
  const admin=await readAdminAccount(sql),otp=await authenticator(sql),current=await requireSession(sql,req,admin,otp,true);
  const {code}=z.object({code:codeInput}).strict().parse(req.body);
  const [pending]=await sql.all<{secret:string}>('SELECT secret FROM admin_mfa_pending WHERE session_hash=? AND expires>?',[current.hash,Date.now()]);
  if(!pending)fail(409,'Start authenticator setup again. The previous key expired.');
  const key=decodeBase32(pending.secret),keyId=digest(key.toString('hex'));
  await consumeCode(sql,{key,id:keyId},code);
  await sql.run(`INSERT INTO admin_mfa(id,environment_id,secret) VALUES(1,'',?)
   ON CONFLICT(id) DO UPDATE SET environment_id=excluded.environment_id, secret=excluded.secret`,[pending.secret]);
  await sql.run('DELETE FROM admin_sessions');
  await sql.run('DELETE FROM admin_otp_steps WHERE key_id<>?',[keyId]);
  return newSession(sql,admin!,keyId);
 },false);

 registerManagementRoutes(route,origin,local,emailAvailable,async({sql,req},write)=>{
  const admin=await readAdminAccount(sql),otp=await authenticator(sql);
  await requireSession(sql,req,admin,otp,write);
  if(secure&&!otp)fail(403,'Set up your authenticator to use the administrator panel.');
  return admin!.username;
 });
}
