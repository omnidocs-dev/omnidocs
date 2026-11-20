import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {insertAdmin,readAdminAccount} from './admin.ts';
import {connectDatabase,migrate,resolveServiceDataRoot} from './database.ts';
import {hashPassword,secret} from './security.ts';

type InitialAdmin={username:string;password?:string;passwordHash?:string};
export type PersonalCredentials={role:'admin'|'member';login:string;password:string};

export async function initializePersonalAccounts(directory:string,initialAdmin?:InitialAdmin){
 const root=await resolveServiceDataRoot(directory);
 const db=await connectDatabase(path.join(root,'metadata.sqlite'));
 try{
  await migrate(db);
  return await db.transaction(async sql=>{
   const created:PersonalCredentials[]=[];
   if(!await readAdminAccount(sql)){
    const username=initialAdmin?.username??'admin';
    const generated=initialAdmin?.password||initialAdmin?.passwordHash?undefined:secret();
    const hash=initialAdmin?.passwordHash??await hashPassword(initialAdmin?.password??generated!);
    await insertAdmin(sql,username,hash);
    if(generated)created.push({role:'admin',login:username,password:generated});
   }
   const [initialized]=await sql.all("SELECT 1 FROM service_settings WHERE key='personal_member_id'");
   if(!initialized){
    const id=randomUUID(),password=secret(),preferred='personal@omnidocs.local';
    const [existing]=await sql.all('SELECT 1 FROM users WHERE email=?',[preferred]);
    const email=existing?`personal-${id}@omnidocs.local`:preferred;
    await sql.run('INSERT INTO users(id,email,name,password,verified,created_at) VALUES(?,?,?,?,1,?)',
     [id,email,'Personal user',await hashPassword(password),Date.now()]);
    await sql.run('INSERT INTO local_accounts(user_id) VALUES(?)',[id]);
    await sql.run("INSERT INTO service_settings(key,value) VALUES('personal_member_id',?)",[id]);
    created.push({role:'member',login:email,password});
   }
   return created;
  });
 }finally{await db.close();}
}
