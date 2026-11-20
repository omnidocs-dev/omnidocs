import type {RegistrationMode} from '../../shared/registration.ts';
import type {SQL} from './database.ts';
import {digest,secret} from './security.ts';

export const registrationSchema=[
 'CREATE TABLE IF NOT EXISTS service_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS local_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id))',
];

export async function registrationMode(sql:SQL,local:boolean,emailAvailable:boolean):Promise<RegistrationMode>{
 const [setting]=await sql.all<{value:string}>("SELECT value FROM service_settings WHERE key='registration_mode'");
 if(setting?.value==='automatic'&&local)return 'automatic';
 return setting?.value==='manual'||!emailAvailable?'manual':'email';
}

export async function issueAccountLink(sql:SQL,userId:string,purpose:'verify'|'reset'){
 const token=secret(),expires=Date.now()+(purpose==='verify'?86400_000:3600_000);
 await sql.run('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?',[userId,purpose]);
 await sql.run('INSERT INTO auth_tokens(hash,user_id,purpose,expires) VALUES(?,?,?,?)',[digest(token),userId,purpose,expires]);
 return {token,expires};
}
