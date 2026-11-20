import type express from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {SQL} from './database.ts';
import {fail, requireAccess, type User, type Resource} from './security.ts';
import {prepareEdits} from '../../shared/edit-model.ts';
import {editCommandSchema, workspaceRevision} from '../../shared/edit-contract.ts';
import {compareSnapshots, conflictFields} from '../../shared/history-diff.ts';
import type {SourceFile} from '../../shared/model.ts';

const revision = z.string().regex(/^[a-f0-9]{64}$/);
const edits = z.array(editCommandSchema).min(1).max(100);
const uuid = z.string().uuid();
type Version = {id:string; parent_id:string|null; proposal_id:string|null; revision:string; files:string;
 version:number; title:string; author:string; author_id:string|null; created_at:number; presentation:number};
type Proposal = {id:string; base_id:string; parent_id:string|null; revision:string; files:string; commands:string;
 title:string; author_id:string; author:string; state:string; created_at:number; presentation:number};
type RequestContext = {sql:SQL;user:User|undefined;req:express.Request};
type Route = (method:'get'|'post', url:string, handler:(ctx:RequestContext)=>Promise<{status?:number;body?:unknown}>)=>void;

export const historySchema = [
 'CREATE TABLE IF NOT EXISTS space_versions (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES resources(id), parent_id TEXT, proposal_id TEXT, version INTEGER NOT NULL, revision TEXT NOT NULL, files TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL, author_id TEXT, created_at BIGINT NOT NULL, presentation INTEGER NOT NULL, UNIQUE(space_id, version))',
 'CREATE TABLE IF NOT EXISTS space_proposals (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES resources(id), base_id TEXT NOT NULL REFERENCES space_versions(id), parent_id TEXT, revision TEXT NOT NULL, files TEXT NOT NULL, commands TEXT NOT NULL, title TEXT NOT NULL, author_id TEXT NOT NULL, author TEXT NOT NULL, state TEXT NOT NULL, created_at BIGINT NOT NULL, presentation INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS space_history_events (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES space_proposals(id), action TEXT NOT NULL, actor TEXT NOT NULL, actor_id TEXT NOT NULL, note TEXT NOT NULL, created_at BIGINT NOT NULL, sequence INTEGER NOT NULL, UNIQUE(proposal_id, sequence))',
 'CREATE TABLE IF NOT EXISTS space_review_settings (space_id TEXT PRIMARY KEY REFERENCES resources(id), required INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS space_reviewers (space_id TEXT NOT NULL REFERENCES resources(id), email TEXT NOT NULL, PRIMARY KEY(space_id,email))',
 'CREATE INDEX IF NOT EXISTS proposal_space ON space_proposals(space_id, created_at)',
 'CREATE INDEX IF NOT EXISTS history_proposal ON space_history_events(proposal_id, created_at)',
];

const decode = (row: {files:string}):SourceFile[] => JSON.parse(row.files);
const versionColumns = 'id,parent_id,proposal_id,version,revision,title,author,author_id,created_at,presentation';
const proposalColumns = 'id,base_id,parent_id,revision,title,author,author_id,state,created_at,presentation';

async function head(sql:SQL, space:string) {
 return (await sql.all<Version>('SELECT * FROM space_versions WHERE space_id=? ORDER BY version DESC LIMIT 1',[space]))[0];
}

export async function publishedFiles(sql:SQL, space:string, seed:()=>Promise<SourceFile[]>) {
 const latest = await head(sql,space);
 return latest ? decode(latest) : seed();
}

export async function reviewRequired(sql:SQL, space:string) {
 const [row] = await sql.all<{required:number}>('SELECT required FROM space_review_settings WHERE space_id=?',[space]);
 return Boolean(row?.required);
}

async function insertVersion(sql:SQL, space:string, files:SourceFile[], parent:Version|undefined,
 title:string, author:{name:string;id:string|null}, presentation:boolean, proposalId:string|null=null) {
 const version = {id:randomUUID(),parent_id:parent?.id ?? null,proposal_id:proposalId,version:(parent?.version ?? 0)+1,
  revision:workspaceRevision(files),files:JSON.stringify(files),title,author:author.name,author_id:author.id,created_at:Date.now(),presentation:Number(presentation)};
 await sql.run('INSERT INTO space_versions(id,space_id,parent_id,proposal_id,version,revision,files,title,author,author_id,created_at,presentation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  [version.id,space,version.parent_id,proposalId,version.version,version.revision,version.files,title,author.name,author.id,version.created_at,version.presentation]);
 return version;
}

async function ensureHead(sql:SQL,space:string,seed:()=>Promise<SourceFile[]>) {
 return await head(sql,space) ?? insertVersion(sql,space,await seed(),undefined,'Initial workspace',{name:'OmniDocs',id:null},false);
}

export async function initializeImportedHistory(sql:SQL,space:string,files:SourceFile[],author:User) {
 await insertVersion(sql,space,files,undefined,'Imported workspace',author,false);
}

function prepare(files:SourceFile[],commands:unknown[]) {
 try { return prepareEdits(files,commands); }
 catch(error) { fail(422,error instanceof Error ? error.message : 'Invalid workspace changes.'); }
}

function guardBase(current:Version, expected:string) {
 if (current.revision !== expected) fail(409,'The workspace changed. Review the latest version before submitting.');
}

function changeTitle(before:SourceFile[],after:SourceFile[],presentation:boolean) {
 if (presentation) return 'Canvas layout changed';
 const {changes}=compareSnapshots(before,after);
 const primary=changes.find(change=>change.kind==='item'||change.kind==='relationship') ?? changes[0];
 if (!primary) return 'Markdown documents updated';
 const verb={added:'Added',updated:'Updated',removed:'Removed'}[primary.change];
 const others=changes.length-1;
 return `${verb} ${primary.name}${others ? ` · ${others} more` : ''}`;
}

export async function savePublished(sql:SQL,space:string,actor:User,input:unknown,seed:()=>Promise<SourceFile[]>) {
 const body = z.object({revision,commands:edits}).strict().parse(input);
 const presentation = body.commands.every(command=>command.op==='layout.save');
 if (!presentation && await reviewRequired(sql,space)) fail(403,'This space requires review. Submit changes from Review & submit.');
 const current = await ensureHead(sql,space,seed);
 guardBase(current,body.revision);
 const before=decode(current);
 const {files,changes} = prepare(before,body.commands);
 const version = changes.length ? await insertVersion(sql,space,files,current,
  changeTitle(before,files,presentation),actor,presentation) : current;
 return {files,revision:version.revision,changed:changes.map(file=>file.path),backup:`History · version ${version.version}`};
}

async function event(sql:SQL,id:string,action:string,actor:User,note='') {
 const [row] = await sql.all<{next:number}>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM space_history_events WHERE proposal_id=?',[id]);
 await sql.run('INSERT INTO space_history_events(id,proposal_id,action,actor,actor_id,note,created_at,sequence) VALUES(?,?,?,?,?,?,?,?)',
  [randomUUID(),id,action,actor.name,actor.id,note,Date.now(),Number(row.next)]);
}

async function createProposal(sql:SQL,space:string,current:Version,actor:User,title:string,commands:unknown[],parentId:string|null=null) {
 const {files,changes} = prepare(decode(current),commands);
 if (!changes.length) fail(422,'There are no changes to review.');
 const id = randomUUID();
 const draftRevision = workspaceRevision(files);
 await sql.run('INSERT INTO space_proposals(id,space_id,base_id,parent_id,revision,files,commands,title,author_id,author,state,created_at,presentation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  [id,space,current.id,parentId,draftRevision,JSON.stringify(files),JSON.stringify(commands),title,actor.id,actor.name,'pending',Date.now(),
   Number(changes.every(file=>file.path==='studio/layout.md'))]);
 await event(sql,id,'submitted',actor);
 return {id,revision:draftRevision};
}

export function registerHistoryRoutes(route:Route, seed:(space:string)=>Promise<SourceFile[]>) {
 const prefix = '/api/spaces/:id/history';
 async function access(sql:SQL,user:User|undefined,space:string,role:'viewer'|'editor'|'owner'='viewer') {
  const permission = await requireAccess(sql,user,space,role);
  const [resource] = await sql.all<Resource>('SELECT kind FROM resources WHERE id=?',[space]);
  if (resource.kind !== 'space') fail(404,'Space unavailable.');
  return permission.role;
 }
 async function reviewers(sql:SQL,space:string) {
  return (await sql.all<{email:string}>('SELECT email FROM space_reviewers WHERE space_id=? ORDER BY email',[space])).map(row=>row.email);
 }
 async function isReviewer(sql:SQL,space:string,user:User|undefined,role:string|null) {
  return role==='owner' || role==='editor' && !!user && (await reviewers(sql,space)).includes(user.email);
 }
 async function version(sql:SQL,space:string,id:string) {
  const [row] = await sql.all<Version>('SELECT * FROM space_versions WHERE space_id=? AND id=?',[space,id]);
  if (!row) fail(404,'Version unavailable.');
  return row;
 }
 async function proposal(sql:SQL,space:string,id:string,actor:User|undefined,role:string|null,reviewer:boolean) {
  const [row] = await sql.all<Proposal>('SELECT * FROM space_proposals WHERE space_id=? AND id=?',[space,id]);
  if (!row || !reviewer && (role!=='editor' || row.author_id!==actor?.id)) fail(404,'Change request unavailable.');
  return row;
 }

 route('get',prefix,async({sql,user,req})=>{
  const space=String(req.params.id), role=await access(sql,user,space);
  await ensureHead(sql,space,()=>seed(space));
  const versions=await sql.all(`SELECT ${versionColumns} FROM space_versions WHERE space_id=? ORDER BY version DESC`,[space]);
  const proposals=await isReviewer(sql,space,user,role) ? await sql.all(`SELECT ${proposalColumns} FROM space_proposals WHERE space_id=? ORDER BY created_at DESC,id DESC`,[space])
   : role==='editor' ? await sql.all(`SELECT ${proposalColumns} FROM space_proposals WHERE space_id=? AND author_id=? ORDER BY created_at DESC,id DESC`,[space,user!.id]) : [];
  return {body:{versions,proposals,reviewRequired:await reviewRequired(sql,space),canManage:role==='owner',reviewers:role==='owner'?await reviewers(sql,space):[]}};
 });
 route('post',`${prefix}/settings`,async({sql,user,req})=>{
  const space=String(req.params.id);
  await access(sql,user,space,'owner');
  const {required, emails}=z.object({required:z.boolean(),emails:z.array(z.string().trim().email().max(254)).max(50).default([])}).strict().parse(req.body);
  await sql.run('INSERT INTO space_review_settings(space_id,required) VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET required=excluded.required',[space,Number(required)]);
  await sql.run('DELETE FROM space_reviewers WHERE space_id=?',[space]);
  for (const email of new Set(emails.map(item=>item.toLowerCase()))) {
   await sql.run('INSERT INTO space_reviewers(space_id,email) VALUES(?,?)',[space,email]);
  }
  return {body:{required}};
 });
 route('get',`${prefix}/versions/:entry`,async({sql,user,req})=>{
  const space=String(req.params.id);
  await access(sql,user,space);
  const row=await version(sql,space,uuid.parse(req.params.entry));
  const after=decode(row), before=row.parent_id ? decode(await version(sql,space,row.parent_id)) : after;
  return {body:{before,after}};
 });
 route('post',`${prefix}/proposals`,async({sql,user,req})=>{
  const space=String(req.params.id);
  await access(sql,user,space,'editor');
  const body=z.object({revision,commands:edits,title:z.string().trim().min(1).max(160)}).strict().parse(req.body);
  const current=await ensureHead(sql,space,()=>seed(space));
  guardBase(current,body.revision);
  return {status:201,body:await createProposal(sql,space,current,user!,body.title,body.commands)};
 });
 route('get',`${prefix}/proposals/:entry`,async({sql,user,req})=>{
  const space=String(req.params.id), role=await access(sql,user,space);
  const reviewer=await isReviewer(sql,space,user,role);
  const row=await proposal(sql,space,uuid.parse(req.params.entry),user,role,reviewer);
  const base=await version(sql,space,row.base_id), latest=await head(sql,space);
  const events=await sql.all('SELECT id,action,actor,note,created_at FROM space_history_events WHERE proposal_id=? ORDER BY sequence',[row.id]);
  const stale=base.id!==latest.id;
  return {body:{before:decode(base),after:decode(row),events,stale,
   canReview:reviewer&&user!.id!==row.author_id&&row.state==='pending',
   canRebase:row.author_id===user!.id&&row.state==='pending'&&stale}};
 });
 route('post',`${prefix}/proposals/:entry`,async({sql,user,req})=>{
  const space=String(req.params.id), role=await access(sql,user,space,'editor');
  const reviewer=await isReviewer(sql,space,user,role);
  const row=await proposal(sql,space,uuid.parse(req.params.entry),user,role,reviewer);
  const body=z.object({action:z.enum(['approve','request_changes','comment','rebase']),revision,note:z.string().trim().max(2000).default('')}).strict().parse(req.body);
  if (row.revision!==body.revision || row.state!=='pending') fail(409,'This request changed. Reload the timeline.');
  if (body.action==='comment') {
   if (!body.note) fail(422,'Add a comment first.');
   await event(sql,row.id,'comment',user!,body.note);
   return {};
  }
  const current=await head(sql,space);
  if (body.action==='rebase') {
   if (user!.id!==row.author_id) fail(403,'Only the author can update this request.');
   if (current.id===row.base_id) fail(409,'The request is already current.');
   const base=decode(await version(sql,space,row.base_id)), draft=decode(row), latest=decode(current);
   const conflicts=conflictFields(base,draft,latest);
   if (conflicts.length) fail(409,`Conflicting changes in ${conflicts.join(', ')}. Recreate this request from the current version.`);
   const commands:unknown[]=JSON.parse(row.commands);
   const intended=compareSnapshots(base,draft).changes;
   const replay=compareSnapshots(latest,prepare(latest,commands).files).changes;
   const unexpected=replay.find(change=>!intended.some(plan=>plan.kind===change.kind&&plan.id===change.id&&
    plan.change===change.change&&change.fields.every(field=>plan.fields.some(target=>target.field===field.field&&JSON.stringify(target.after)===JSON.stringify(field.after)))));
   if (unexpected) fail(409,`Replaying would alter another change in ${unexpected.name}. Recreate this request from the current version.`);
   const replacement=await createProposal(sql,space,current,user!,row.title,commands,row.id);
   await sql.run("UPDATE space_proposals SET state='superseded' WHERE id=?",[row.id]);
   await event(sql,row.id,'superseded',user!);
   await event(sql,replacement.id,'rebased',user!);
   return {body:replacement};
  }
  if (!reviewer || user!.id===row.author_id) fail(403,'A different authorized reviewer must review this request.');
  if (body.action==='request_changes') {
   if (!body.note) fail(422,'Explain what should change.');
   await sql.run("UPDATE space_proposals SET state='changes_requested' WHERE id=?",[row.id]);
   await event(sql,row.id,'changes_requested',user!,body.note);
   return {};
  }
  if (current.id!==row.base_id) fail(409,'A newer version was published. The author must update this request before approval.');
  const published=await insertVersion(sql,space,decode(row),current,row.title,{name:row.author,id:row.author_id},Boolean(row.presentation),row.id);
  await sql.run("UPDATE space_proposals SET state='published' WHERE id=?",[row.id]);
  await event(sql,row.id,'approved',user!,body.note);
  await event(sql,row.id,'published',user!,`Version ${published.version}`);
  return {body:{version:published.version}};
 });
}
