import {historySchema} from './history.ts';
import {managementSchema} from './admin-management.ts';
import {adminOtpSchema,adminSessionSchema} from './admin.ts';
import {captchaSchema} from './captcha.ts';
import {registrationSchema} from './registration.ts';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {mkdir,chmod,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
export interface SQL {all<T=Record<string,unknown>>(sql:string,params?:unknown[]):Promise<T[]>;run(sql:string,params?:unknown[]):Promise<void>}
export type TransactionMode = 'global' | 'read' | 'independent' | {space:string};
export interface Database {kind:'postgres'|'sqlite';transaction<T>(fn:(sql:SQL)=>Promise<T>,mode?:TransactionMode):Promise<T>;close():Promise<void>}
type PostgresTransaction={unsafe<T>(statement:string,params?:unknown[]):Promise<T[]>};
type PostgresClient={
 begin<T>(fn:(transaction:PostgresTransaction)=>Promise<T>):Promise<T>;
 end(options:{timeout:number}):Promise<void>;
};

export function serviceDatabaseURL(env:NodeJS.ProcessEnv){
 if(env.OMNIDOCS_DATABASE_ENGINE==='sqlite')return undefined;
 if(env.DATABASE_URL)return env.DATABASE_URL;
 if(!env.OMNIDOCS_POSTGRES_HOST){
  if(env.OMNIDOCS_DATABASE_ENGINE==='postgres')throw new Error('Configure a PostgreSQL connection for the production service.');
  return undefined;
 }
 if(!env.OMNIDOCS_POSTGRES_PASSWORD)throw new Error('Configure OMNIDOCS_POSTGRES_PASSWORD for the PostgreSQL service.');
 const url=new URL(`postgresql://${env.OMNIDOCS_POSTGRES_HOST}:5432/omnidocs`);
 url.username='omnidocs';
 url.password=env.OMNIDOCS_POSTGRES_PASSWORD;
 return url.href;
}

export async function resolveServiceDataRoot(directory:string){
 await mkdir(directory,{recursive:true,mode:0o700});
 if((await lstat(directory)).isSymbolicLink())throw new Error('Service storage must not be a symlink.');
 return realpath(directory);
}

export async function connectDatabase(filename:string,url?:string):Promise<Database>{
 if(url){
  const postgres=createRequire(import.meta.url)('postgres') as (url:string,options:{max:number;connect_timeout:number})=>PostgresClient;
  const pool=postgres(url,{max:8,connect_timeout:5});
  function statement(sql:string){
   let index=0;
   return sql.replace(/\?/g,()=>`$${++index}`);
  }
  return {
   kind:'postgres',
   transaction(fn,mode='global'){
    return pool.begin(async client=>{
     if(mode==='read')await client.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
     if(mode==='global')await client.unsafe('SELECT pg_advisory_xact_lock(741203518)');
     if(typeof mode==='object'){
      // Keep revocations and archive changes atomic with authorization and workspace writes.
      await client.unsafe('SELECT pg_advisory_xact_lock_shared(741203518)');
      await client.unsafe('SELECT pg_advisory_xact_lock(741203519, hashtext($1))',[mode.space]);
     }
     const sql:SQL={
      all:async(text,args=[])=>Array.from(await client.unsafe(statement(text),args)),
      run:async(text,args=[])=>{await client.unsafe(statement(text),args);},
     };
     return fn(sql);
    });
   },
   close:()=>pool.end({timeout:5}),
  };
 }
 await mkdir(path.dirname(filename),{recursive:true,mode:0o700});const db=new DatabaseSync(filename);await chmod(filename,0o600);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 let queue:Promise<unknown>=Promise.resolve();
 const sql:SQL={all:async(text,args=[])=>db.prepare(text).all(...args as (string|number|null)[]) as never,run:async(text,args=[])=>{db.prepare(text).run(...args as (string|number|null)[]);}};
 return{kind:'sqlite',transaction(fn){const operation=queue.catch(()=>{}).then(async()=>{db.exec('BEGIN IMMEDIATE');try{const value=await fn(sql);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}});queue=operation;return operation;},async close(){await queue.catch(()=>{});db.close();}};
}
export async function migrate(db:Database){await db.transaction(async sql=>{
 const statements=[
 'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created_at BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS auth_tokens (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),purpose TEXT NOT NULL,expires BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY,kind TEXT NOT NULL,parent_id TEXT REFERENCES resources(id),owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,created_at BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES resources(id),email TEXT NOT NULL,role TEXT NOT NULL,UNIQUE(scope_id,email))',
 'CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES resources(id),email TEXT NOT NULL,role TEXT NOT NULL,expires BIGINT NOT NULL,accepted INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,space_id TEXT NOT NULL REFERENCES resources(id),mode TEXT NOT NULL,emails TEXT NOT NULL,expires BIGINT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at BIGINT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,resource_id TEXT,created_at BIGINT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS "session_user" ON sessions(user_id)', 'CREATE INDEX IF NOT EXISTS member_email ON memberships(email)', 'CREATE INDEX IF NOT EXISTS resource_parent ON resources(parent_id)'];
 for(const statement of [...statements,adminSessionSchema,...adminOtpSchema,...historySchema,...managementSchema,...registrationSchema,...captchaSchema])await sql.run(statement);
 for(const [name,definition] of Object.entries({platform_role:"TEXT NOT NULL DEFAULT 'member'",login_name:'TEXT'})){
  const [column]=await sql.all(db.kind==='postgres'
   ? "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name=?"
   : "SELECT 1 FROM pragma_table_info('users') WHERE name=?",[name]);
  if(!column)await sql.run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
 }
 await sql.run('CREATE UNIQUE INDEX IF NOT EXISTS users_login_name ON users(login_name)');
 await sql.run("CREATE UNIQUE INDEX IF NOT EXISTS users_single_site_admin ON users(platform_role) WHERE platform_role='admin'");
 const [adminSessionUser]=await sql.all(db.kind==='postgres'
  ? "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='admin_sessions' AND column_name='user_id'"
  : "SELECT 1 FROM pragma_table_info('admin_sessions') WHERE name='user_id'");
 if(!adminSessionUser)await sql.run('ALTER TABLE admin_sessions ADD COLUMN user_id TEXT REFERENCES users(id)');
 const [expiryColumn]=await sql.all(db.kind==='postgres'
  ? "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='mail_outbox' AND column_name='expires_at'"
  : "SELECT 1 FROM pragma_table_info('mail_outbox') WHERE name='expires_at'");
 if(!expiryColumn){
  await sql.run('ALTER TABLE mail_outbox ADD COLUMN expires_at BIGINT NOT NULL DEFAULT 0');
  await sql.run(`UPDATE mail_outbox SET expires_at=CASE
   WHEN subject IN ('Verify your OmniDocs email','Reset your OmniDocs password') THEN COALESCE((
    SELECT MAX(t.expires) FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE u.email=mail_outbox.recipient
     AND t.purpose=CASE WHEN mail_outbox.subject='Verify your OmniDocs email' THEN 'verify' ELSE 'reset' END
   ),0) ELSE ? END WHERE delivered<>1`,[Date.now()+86400_000]);
 }
 await sql.run('DELETE FROM mail_outbox WHERE delivered=1 OR expires_at<=?',[Date.now()]);
 await sql.run('CREATE INDEX IF NOT EXISTS mail_outbox_expiry ON mail_outbox(expires_at)');
 await sql.run('CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limits(expires)');
 await sql.run('CREATE INDEX IF NOT EXISTS auth_token_expiry ON auth_tokens(expires)');
});}
