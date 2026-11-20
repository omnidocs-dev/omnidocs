import {randomBytes,scrypt as derive,timingSafeEqual,createHash} from 'node:crypto';
import {BlockList,isIP} from 'node:net';
import type {SQL} from './database.ts';
import type {ResourceKind} from '../../shared/free-plan.ts';
export const secret=()=>randomBytes(32).toString('base64url');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export class ServiceError extends Error {constructor(readonly status:number,message:string){super(message);}}
export function fail(status:number,message:string):never{throw new ServiceError(status,message);}
export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
let activePasswordChecks=0;
async function key(password:string,salt:string){
 if(activePasswordChecks>=4)fail(503,'Authentication is busy. Try again in a moment.');
 activePasswordChecks++;
 try{return await new Promise<Buffer>((resolve,reject)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,result)=>error?reject(error):resolve(result)));}
 finally{activePasswordChecks--;}
}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${(await key(password,salt)).toString('hex')}`;}
export async function checkPassword(password:string,stored?:string){const [salt,expected]=(stored??'00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');const result=await key(password,salt);const target=Buffer.from(expected,'hex');return target.length===result.length&&timingSafeEqual(target,result);}
export function adminIPCheck(networks='127.0.0.1/32 ::1/128'){
 const allowed=new BlockList();
 for(const value of networks.trim().split(/\s+/).filter(Boolean)){
  const [address,bits,...extra]=value.split('/'),family=isIP(address);
  const max=family===4?32:128;
  if(!family||extra.length||bits!==undefined&&(!/^\d+$/.test(bits)||Number(bits)<1||Number(bits)>max))throw new Error('Configure OMNIDOCS_ADMIN_NETWORKS with explicit management IP addresses or CIDRs.');
  allowed.addSubnet(address,bits===undefined?max:Number(bits),family===4?'ipv4':'ipv6');
 }
 return(address:string|undefined)=>!!address&&!!isIP(address)&&allowed.check(address,isIP(address)===4?'ipv4':'ipv6');
}
export type User={id:string;email:string;name:string;verified:number};
export type Resource={id:string;kind:ResourceKind;parent_id:string|null;owner_id:string;name:string;description:string;created_at:number};
export type Role='owner'|'editor'|'viewer';
export async function ancestors(sql:SQL,id:string){const nodes:(Resource&{archived:number})[]=[];const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const [node]=await sql.all<Resource&{archived:number}>('SELECT r.*, CASE WHEN a.resource_id IS NULL THEN 0 ELSE 1 END AS archived FROM resources r LEFT JOIN archived_resources a ON a.resource_id=r.id WHERE r.id=?',[id]);if(!node)break;nodes.push(node);id=node.parent_id??'';}return nodes;}
export async function access(sql:SQL,user:User|undefined,id:string){
 const chain=await ancestors(sql,id);if(!chain.length||!user?.verified||chain.some(node=>node.archived))return {role:null as Role|null,via:[] as {id:string;name:string;role:Role}[]};
 const via:{id:string;name:string;role:Role}[]=[];
 for(const node of chain){if(node.owner_id===user.id)via.push({id:node.id,name:node.name,role:'owner'});const [member]=await sql.all<{role:Role}>('SELECT role FROM memberships WHERE scope_id=? AND email=?',[node.id,user.email]);if(member)via.push({id:node.id,name:node.name,role:member.role});}
 const role=via.some(item=>item.role==='owner')?'owner':via.some(item=>item.role==='editor')?'editor':via.length?'viewer':null;
 return{role:role as Role|null,via};
}
export async function requireAccess(sql:SQL,user:User|undefined,id:string,role:Role='viewer'){
 if(!user)fail(401,'Sign in to continue.');if(!user.verified)fail(403,'Verify your email before opening private workspaces.');
 const result=await access(sql,user,id);if(!result.role)fail(404,'Resource unavailable.');
 if(role==='owner'&&result.role!=='owner'||role==='editor'&&result.role==='viewer')fail(403,'You do not have permission for this action.');return result;
}
export async function rateLimit(sql:SQL,bucket:string,limit:number,window=15*60_000){
 const now=Date.now();
 const [record]=await sql.all<{count:number}>(`INSERT INTO rate_limits(bucket,count,expires) VALUES(?,1,?)
  ON CONFLICT(bucket) DO UPDATE SET
   count=CASE WHEN rate_limits.expires<=? THEN 1 ELSE rate_limits.count+1 END,
   expires=CASE WHEN rate_limits.expires<=? THEN excluded.expires ELSE rate_limits.expires END
  WHERE rate_limits.expires<=? OR rate_limits.count<? RETURNING count`,[bucket,now+window,now,now,now,limit]);
 if(!record)fail(429,'Too many attempts. Try again later.');
}
