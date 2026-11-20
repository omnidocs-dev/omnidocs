import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {z} from 'zod';
import type {SQL} from './database.ts';
import {fail} from './security.ts';
import {registrationModes} from '../../shared/registration.ts';
import {issueAccountLink,registrationMode} from './registration.ts';
import type {AdminActivity,AdminMembership,AdminResource,AdminUser,ResourceCounts} from '../../shared/admin-directory.ts';
import type {ResourceKind} from '../../shared/free-plan.ts';

export const managementSchema=[
 'CREATE TABLE IF NOT EXISTS suspended_users (user_id TEXT PRIMARY KEY REFERENCES users(id))',
 'CREATE TABLE IF NOT EXISTS archived_resources (resource_id TEXT PRIMARY KEY REFERENCES resources(id))',
 'CREATE TABLE IF NOT EXISTS admin_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, user_id TEXT REFERENCES users(id), resource_id TEXT REFERENCES resources(id), created_at BIGINT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS resource_owner_kind ON resources(owner_id,kind)',
 'CREATE INDEX IF NOT EXISTS audit_user_time ON audit_events(user_id,created_at)',
 'CREATE INDEX IF NOT EXISTS admin_action_time ON admin_events(created_at)',
];

type Context={sql:SQL;req:Request;prepared?:unknown};
export type ManagementRoute=(method:'get'|'post',path:string,handler:(ctx:Context)=>Promise<{body?:unknown;cookie?:string}>,csrf:false,prepare?:(req:Request)=>Promise<unknown>)=>void;
const pagination=z.object({q:z.string().trim().max(160).default(''),page:z.coerce.number().int().min(1).max(1_000_000).default(1)});
const userFilters=pagination.extend({status:z.enum(['all','verified','pending','suspended']).default('all')});
const resourceFilters=pagination.extend({kind:z.enum(['all','organization','project','space']).default('all'),status:z.enum(['all','active','archived']).default('all')});
const activityFilters=pagination.pick({page:true}).extend({source:z.enum(['all','users','admin']).default('all')});
const name=z.string().trim().min(1).max(160);
const userMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('rename'),name}).strict(),
 z.object({action:z.enum(['suspend','restore','revoke_sessions','approve'])}).strict(),
]);
const resourceMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('edit'),name,description:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.enum(['archive','restore'])}).strict(),
]);
const membershipMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('change_role'),role:z.enum(['viewer','editor'])}).strict(),
 z.object({action:z.literal('revoke')}).strict(),
]);
const idSchema=z.string().uuid();
const search=(q:string)=>`%${q.toLowerCase().replace(/[!%_]/g,'!$&')}%`;
const pageSize=25;

type UserRow=Omit<AdminUser,'owned'|'verified'|'suspended'|'created_at'>&{
 verified:number;suspended:number;created_at:number|string;organization_count:number|string;project_count:number|string;space_count:number|string;
};
type ResourceRow=Omit<AdminResource,'archived'|'blocked'|'created_at'>&{archived:number;blocked:number;created_at:number|string};
type ActivityRow=Omit<AdminActivity,'management'|'created_at'>&{management:number;created_at:number|string};

const userSelect=`SELECT u.id,u.name,u.email,u.verified,u.created_at,u.platform_role,u.login_name,
 CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END AS suspended,
 (SELECT COUNT(*) FROM resources r WHERE r.owner_id=u.id AND r.kind='organization') AS organization_count,
 (SELECT COUNT(*) FROM resources r WHERE r.owner_id=u.id AND r.kind='project') AS project_count,
 (SELECT COUNT(*) FROM resources r WHERE r.owner_id=u.id AND r.kind='space') AS space_count`;
const userFrom='FROM users u LEFT JOIN suspended_users s ON s.user_id=u.id';
const resourceFrom=`FROM resources r
 JOIN users u ON u.id=r.owner_id
 LEFT JOIN resources p ON p.id=r.parent_id
 LEFT JOIN resources g ON g.id=p.parent_id
 LEFT JOIN archived_resources ar ON ar.resource_id=r.id
 LEFT JOIN archived_resources ap ON ap.resource_id=p.id
 LEFT JOIN archived_resources ag ON ag.resource_id=g.id`;
const resourceSelect=`SELECT r.id,r.kind,r.parent_id,p.name AS parent_name,r.owner_id,u.name AS owner_name,
 u.email AS owner_email,r.name,r.description,r.created_at,CASE WHEN ar.resource_id IS NULL THEN 0 ELSE 1 END AS archived,
 CASE WHEN ap.resource_id IS NULL AND ag.resource_id IS NULL THEN 0 ELSE 1 END AS blocked`;

function publicUser(row:UserRow):AdminUser {
 const {organization_count,project_count,space_count,...user}=row;
 return {...user,verified:Boolean(user.verified),suspended:Boolean(user.suspended),created_at:Number(user.created_at),
  owned:{organization:Number(organization_count),project:Number(project_count),space:Number(space_count)}};
}
function publicResource(row:ResourceRow):AdminResource {
 return {...row,archived:Boolean(row.archived),blocked:Boolean(row.blocked),created_at:Number(row.created_at)};
}
function activitySource(userId?:string) {
 const actFilter=userId?'WHERE a.user_id=?':'';
 const reviewFilter=userId?'WHERE h.actor_id=?':'';
 const managementFilter=userId?'WHERE a.user_id=?':'';
 return `
  SELECT a.id AS id,a.action,a.created_at AS created_at,COALESCE(u.name,'Former user') AS actor,r.name AS target,0 AS management
  FROM audit_events a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN resources r ON r.id=a.resource_id ${actFilter}
  UNION ALL
  SELECT h.id,'review.' || h.action AS action,h.created_at,h.actor,r.name AS target,0 AS management
  FROM space_history_events h JOIN space_proposals p ON p.id=h.proposal_id JOIN resources r ON r.id=p.space_id ${reviewFilter}
  UNION ALL
  SELECT a.id,a.action,a.created_at,a.actor,COALESCE(r.name,u.name) AS target,1 AS management
  FROM admin_events a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN resources r ON r.id=a.resource_id ${managementFilter}
 `;
}
function publicActivity(row:ActivityRow):AdminActivity {
 return {...row,management:Boolean(row.management),created_at:Number(row.created_at)};
}
async function readActivity(sql:SQL,userId?:string) {
 const rows=await sql.all<ActivityRow>(`${activitySource(userId)} ORDER BY created_at DESC,id DESC LIMIT 30`,
  userId?[userId,userId,userId]:[]);
 return rows.map(publicActivity);
}

export function registerManagementRoutes(route:ManagementRoute,origin:string,local:boolean,emailAvailable:boolean,authorize:(ctx:Context,write?:boolean)=>Promise<string>) {
 const prefix='/admin/api';
 async function log(sql:SQL,actor:string,action:string,userId:string|null,resourceId:string|null) {
  await sql.run('INSERT INTO admin_events(id,actor,action,user_id,resource_id,created_at) VALUES(?,?,?,?,?,?)',
   [randomUUID(),actor,action,userId,resourceId,Date.now()]);
 }
 route('get',`${prefix}/registration`,async ctx=>{
  await authorize(ctx);
  return {body:{mode:await registrationMode(ctx.sql,local,emailAvailable),automaticAvailable:local,emailAvailable}};
 },false);
 route('post',`${prefix}/registration`,async ctx=>{
  const actor=await authorize(ctx,true);
  const {sql,req}=ctx,{mode}=z.object({mode:z.enum(registrationModes)}).strict().parse(req.body);
  if(mode==='automatic'&&!local)fail(403,'Automatic registration is available only on a loopback service URL.');
  if(mode==='email'&&!emailAvailable)fail(409,'Configure email delivery before enabling email verification.');
  await sql.run("INSERT INTO service_settings(key,value) VALUES('registration_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[mode]);
  await log(sql,actor,`admin.registration.${mode}`,null,null);
  return {body:{mode,automaticAvailable:local,emailAvailable}};
 },false);
 route('get',`${prefix}/overview`,async ctx=>{
  await authorize(ctx);
  const {sql}=ctx;
  const [accounts]=await sql.all<{total:number;verified:number;pending:number;suspended:number}>(`
   SELECT COUNT(*) AS total,
   COUNT(CASE WHEN s.user_id IS NULL AND u.verified=1 THEN 1 END) AS verified,
   COUNT(CASE WHEN s.user_id IS NULL AND u.verified=0 THEN 1 END) AS pending,
   COUNT(s.user_id) AS suspended ${userFrom}`);
  const counts:ResourceCounts={organization:0,project:0,space:0};
  for(const row of await sql.all<{kind:ResourceKind;total:number}>('SELECT kind,COUNT(*) AS total FROM resources GROUP BY kind')){
   counts[row.kind]=Number(row.total);
  }
  const [archived]=await sql.all<{total:number}>('SELECT COUNT(*) AS total FROM archived_resources');
  return {body:{users:{total:Number(accounts.total),verified:Number(accounts.verified),pending:Number(accounts.pending),suspended:Number(accounts.suspended)},
   resources:counts,archived:Number(archived.total),activity:await readActivity(sql)}};
 },false);

 route('get',`${prefix}/activity`,async ctx=>{
  await authorize(ctx);
  const {sql,req}=ctx,{page,source}=activityFilters.parse(req.query);
  const from=`FROM (${activitySource()}) AS activity${source==='all'?'':' WHERE management=?'}`;
  const args=source==='all'?[]:[Number(source==='admin')];
  const [count]=await sql.all<{total:number}>(`SELECT COUNT(*) AS total ${from}`,args);
  const rows=await sql.all<ActivityRow>(`SELECT * ${from} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]);
  return {body:{items:rows.map(publicActivity),total:Number(count.total),page,pageSize}};
 },false);

 route('get',`${prefix}/users`,async ctx=>{
  await authorize(ctx);
  const {sql,req}=ctx,{q,page,status}=userFilters.parse(req.query);
  const statusClause={all:'',verified:' AND s.user_id IS NULL AND u.verified=1',pending:' AND s.user_id IS NULL AND u.verified=0',suspended:' AND s.user_id IS NOT NULL'}[status];
  const where=`WHERE (LOWER(u.name) LIKE ? ESCAPE '!' OR LOWER(u.email) LIKE ? ESCAPE '!' OR LOWER(COALESCE(u.login_name,'')) LIKE ? ESCAPE '!')${statusClause}`;
  const args=[search(q),search(q),search(q)];
  const [count]=await sql.all<{total:number}>(`SELECT COUNT(*) AS total ${userFrom} ${where}`,args);
  const users=await sql.all<UserRow>(`${userSelect} ${userFrom} ${where} ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]);
  return {body:{users:users.map(publicUser),total:Number(count.total),page,pageSize}};
 },false);

 route('get',`${prefix}/users/:id`,async ctx=>{
  await authorize(ctx);
  const {sql,req}=ctx,id=idSchema.parse(req.params.id);
  const [user]=await sql.all<UserRow>(`${userSelect} ${userFrom} WHERE u.id=?`,[id]);
  if(!user)fail(404,'User unavailable.');
  const resources=await sql.all<ResourceRow>(`${resourceSelect} ${resourceFrom} WHERE r.owner_id=? ORDER BY r.created_at,r.id`,[id]);
  const memberships=await sql.all<Omit<AdminMembership,'archived'>&{archived:number}>(`
   SELECT m.id,m.scope_id,r.name,r.kind,m.role,
    CASE WHEN ar.resource_id IS NULL AND ap.resource_id IS NULL AND ag.resource_id IS NULL THEN 0 ELSE 1 END AS archived
   ${resourceFrom} JOIN memberships m ON m.scope_id=r.id WHERE m.email=? ORDER BY r.name,r.id`,[user.email]);
  const [sessions]=user.platform_role==='admin'
   ?await sql.all<{total:number}>('SELECT COUNT(*) AS total FROM admin_sessions WHERE user_id=? AND expires>?',[id,Date.now()])
   :await sql.all<{total:number}>('SELECT COUNT(*) AS total FROM sessions WHERE user_id=? AND expires>?',[id,Date.now()]);
  return {body:{user:publicUser(user),resources:resources.map(publicResource),
   memberships:memberships.map(membership=>({...membership,archived:Boolean(membership.archived)})),
   sessions:Number(sessions.total),activity:await readActivity(sql,id)}};
 },false);

 route('post',`${prefix}/users/:id`,async ctx=>{
  const actor=await authorize(ctx,true);
  const {sql,req}=ctx,id=idSchema.parse(req.params.id),change=userMutation.parse(req.body);
  const [account]=await sql.all<{id:string;email:string;verified:number;suspended:number;platform_role:string}>(`SELECT u.id,u.email,u.verified,u.platform_role,CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END AS suspended ${userFrom} WHERE u.id=?`,[id]);
  if(!account)fail(404,'User unavailable.');
  if(account.platform_role==='admin'&&(change.action==='suspend'||change.action==='restore'))fail(409,'The site administrator account cannot be suspended.');
  switch(change.action){
   case 'approve': {
    if(account.suspended||account.verified)fail(409,'Only pending, active accounts can receive an approval link.');
    const {token}=await issueAccountLink(sql,id,'verify');
    await sql.run("DELETE FROM mail_outbox WHERE recipient=? AND subject='Verify your OmniDocs email'",[account.email]);
    await log(sql,actor,'admin.user.approve',id,null);
    return {body:{activationUrl:`${origin}/#/verify/${token}`}};
   }
   case 'rename':
    await sql.run('UPDATE users SET name=? WHERE id=?',[change.name,id]);break;
   case 'suspend':
    if(account.suspended)fail(409,'This account is already suspended.');
    await sql.run('INSERT INTO suspended_users(user_id) VALUES(?)',[id]);
    await sql.run('DELETE FROM sessions WHERE user_id=?',[id]);break;
   case 'restore':
    if(!account.suspended)fail(409,'This account is already active.');
    await sql.run('DELETE FROM suspended_users WHERE user_id=?',[id]);break;
   case 'revoke_sessions':
    if(account.platform_role==='admin')await sql.run('DELETE FROM admin_sessions WHERE user_id=?',[id]);
    await sql.run('DELETE FROM sessions WHERE user_id=?',[id]);break;
  }
  await log(sql,actor,`admin.user.${change.action}`,id,null);
  return {};
 },false);

 route('post',`${prefix}/users/:id/memberships/:membership`,async ctx=>{
  const actor=await authorize(ctx,true);
  const {sql,req}=ctx,id=idSchema.parse(req.params.id),membership=idSchema.parse(req.params.membership);
  const change=membershipMutation.parse(req.body);
  const [grant]=await sql.all<{scope_id:string}>(
   'SELECT m.scope_id FROM memberships m JOIN users u ON u.email=m.email WHERE u.id=? AND m.id=?',[id,membership]);
  if(!grant)fail(404,'Membership unavailable.');
  if(change.action==='change_role')await sql.run('UPDATE memberships SET role=? WHERE id=?',[change.role,membership]);
  else await sql.run('DELETE FROM memberships WHERE id=?',[membership]);
  await log(sql,actor,`admin.membership.${change.action}`,id,grant.scope_id);
  return {};
 },false);

 route('get',`${prefix}/resources`,async ctx=>{
  await authorize(ctx);
  const {sql,req}=ctx,{q,page,kind,status}=resourceFilters.parse(req.query);
  const filters=["(LOWER(r.name) LIKE ? ESCAPE '!' OR LOWER(u.email) LIKE ? ESCAPE '!' OR LOWER(u.name) LIKE ? ESCAPE '!')"];
  const args:unknown[]=[search(q),search(q),search(q)];
  if(kind!=='all'){filters.push('r.kind=?');args.push(kind);}
  if(status==='active')filters.push('ar.resource_id IS NULL AND ap.resource_id IS NULL AND ag.resource_id IS NULL');
  if(status==='archived')filters.push('(ar.resource_id IS NOT NULL OR ap.resource_id IS NOT NULL OR ag.resource_id IS NOT NULL)');
  const where='WHERE '+filters.join(' AND ');
  const [count]=await sql.all<{total:number}>(`SELECT COUNT(*) AS total ${resourceFrom} ${where}`,args);
  const rows=await sql.all<ResourceRow>(`${resourceSelect} ${resourceFrom} ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]);
  return {body:{items:rows.map(publicResource),total:Number(count.total),page,pageSize}};
 },false);

 route('post',`${prefix}/resources/:id`,async ctx=>{
  const actor=await authorize(ctx,true);
  const {sql,req}=ctx,id=idSchema.parse(req.params.id),change=resourceMutation.parse(req.body);
  const [row]=await sql.all<ResourceRow>(`${resourceSelect} ${resourceFrom} WHERE r.id=?`,[id]);
  if(!row)fail(404,'Resource unavailable.');
  if(change.action==='edit'){
   await sql.run('UPDATE resources SET name=?,description=? WHERE id=?',[change.name,change.description,id]);
  }else if(change.action==='archive'){
   if(row.archived)fail(409,'This resource is already archived.');
   await sql.run('INSERT INTO archived_resources(resource_id) VALUES(?)',[id]);
  }else{
   if(!row.archived)fail(409,'This resource is already active or its parent is archived.');
   await sql.run('DELETE FROM archived_resources WHERE resource_id=?',[id]);
  }
  await log(sql,actor,`admin.resource.${change.action}`,row.owner_id,id);
  return {};
 },false);
}
