import * as oidc from 'openid-client';
import {z} from 'zod';
import type {SQL} from './database.ts';

export const zitadelCallback='/api/auth/zitadel/callback';
export const zitadelSchema=[
 'CREATE TABLE IF NOT EXISTS zitadel_flows (hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, generation TEXT NOT NULL, expires BIGINT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS zitadel_flow_expiry ON zitadel_flows(expires)',
 'CREATE TABLE IF NOT EXISTS zitadel_identities (issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(issuer,subject), UNIQUE(issuer,user_id))',
];

export const zitadelSettingsInput=z.object({
 issuer:z.string().trim().max(2048).transform(value=>value.replace(/\/$/,'')).refine(value=>{
  try{
   const url=new URL(value);
   return url.protocol==='https:'&&url.origin===value;
  }catch{return false;}
 },'Enter the ZITADEL HTTPS origin, such as https://example.zitadel.cloud.'),
 clientId:z.string().trim().min(1).max(255),
}).strict();

export async function readZitadelSettings(sql:SQL){
 const rows=await sql.all<{key:string;value:string}>(
  "SELECT key,value FROM service_settings WHERE key IN ('zitadel_issuer','zitadel_client_id','zitadel_generation')");
 const values=Object.fromEntries(rows.map(row=>[row.key,row.value]));
 const config=zitadelSettingsInput.safeParse({issuer:values.zitadel_issuer,clientId:values.zitadel_client_id});
 return {config:config.success?config.data:undefined,generation:values.zitadel_generation||undefined};
}

export async function setZitadelGeneration(sql:SQL,generation:string){
 await sql.run("INSERT INTO service_settings(key,value) VALUES('zitadel_generation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[generation]);
 await sql.run('DELETE FROM zitadel_flows');
}

export function discoverZitadel({issuer,clientId}:z.infer<typeof zitadelSettingsInput>){
 return oidc.discovery(new URL(issuer),clientId,undefined,oidc.None(),{
  timeout:8,execute:[oidc.enableNonRepudiationChecks],
 });
}
