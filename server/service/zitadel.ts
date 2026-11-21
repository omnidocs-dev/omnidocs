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

const oauthErrors=new Set([
 'access_denied','invalid_request','invalid_client','invalid_grant','invalid_scope','unauthorized_client',
 'unsupported_grant_type','unsupported_response_type','interaction_required','login_required','consent_required',
 'account_selection_required','server_error','temporarily_unavailable',
]);
const diagnosticCodes=new Set([
 'OAUTH_INVALID_RESPONSE','OAUTH_INVALID_SERVER_METADATA','OAUTH_MISSING_SERVER_METADATA',
 'OAUTH_JWT_CLAIM_COMPARISON_FAILED','OAUTH_JWT_TIMESTAMP_CHECK_FAILED','OAUTH_KEY_SELECTION_FAILED',
 'OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED','OAUTH_PARSE_ERROR','OAUTH_RESPONSE_IS_NOT_JSON',
 'OAUTH_RESPONSE_IS_NOT_CONFORM','OAUTH_UNSUPPORTED_OPERATION','OAUTH_WWW_AUTHENTICATE_CHALLENGE',
 'OAUTH_REQUEST_PROTOCOL_FORBIDDEN','OAUTH_HTTP_REQUEST_FORBIDDEN','OAUTH_JWT_USERINFO_EXPECTED',
 'OAUTH_INVALID_REQUEST','OAUTH_TIMEOUT','OAUTH_ABORT',
 'ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT',
 'CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
 'ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);
const claimNames=new Set(['iss','sub','aud','azp','nonce','iat','exp','nbf','auth_time']);
export function zitadelErrorDetails(error:unknown){
 if(error instanceof oidc.AuthorizationResponseError||error instanceof oidc.ResponseBodyError){
  return {
   reason:error instanceof oidc.AuthorizationResponseError?'provider_authorization_error':'provider_endpoint_error',
   providerError:oauthErrors.has(error.error)?error.error:'unrecognized',
   upstreamStatus:error instanceof oidc.ResponseBodyError?error.status:undefined,
  };
 }
 const details:{reason:string;code?:string;claim?:string;upstreamStatus?:number}={reason:'unexpected_error'};
 // Error messages, causes and response bodies may contain URLs, claims or credentials.
 for(let current=error,depth=0;depth<5&&current&&typeof current==='object';depth++){
  if('code' in current&&typeof current.code==='string'&&diagnosticCodes.has(current.code)){
   details.reason='provider_or_network_error';
   details.code??=current.code;
  }
  if(current instanceof Error&&current.name==='TimeoutError')details.reason='upstream_timeout';
  if(current instanceof Response)details.upstreamStatus=current.status;
  if('response' in current&&current.response instanceof Response)details.upstreamStatus=current.response.status;
  if('claim' in current&&typeof current.claim==='string'&&claimNames.has(current.claim))details.claim=current.claim;
  current='cause' in current?current.cause:undefined;
 }
 return details;
}
