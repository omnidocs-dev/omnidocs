import {readFileSync} from 'node:fs';
import path from 'node:path';
import {connectDatabase,migrate,serviceDatabaseURL} from './service/database.ts';
import {readAdminAccount,resetAdminAuthenticator,resetAdminPassword} from './service/admin.ts';

const db=await connectDatabase(path.join(process.env.OMNIDOCS_SERVICE_DATA??'.service-data','metadata.sqlite'),serviceDatabaseURL(process.env));
try{
 switch(process.argv[2]){
  case 'status': {
   const admin=await db.transaction(readAdminAccount,'read');
   if(!admin){console.error('No administrator account is configured.');process.exitCode=1;}
   else console.log(`Administrator: ${admin.username}`);
   break;
  }
  case 'rotate-password': {
   await migrate(db);
   const username=await resetAdminPassword(db,process.env.OMNIDOCS_ADMIN_USERNAME||'admin',readFileSync(0,'utf8'));
   console.log(`Password updated for ${username}. Existing sessions were revoked.`);
   break;
  }
  case 'rotate-otp': {
   await migrate(db);
   const key=await resetAdminAuthenticator(db);
   console.log('Save the new authenticator setup key now. Existing sessions were revoked.');
   console.log(key);
   break;
  }
  default: throw new Error('Choose status, rotate-password or rotate-otp.');
 }
}catch(error){
 console.error(error instanceof Error?error.message:'Administrator maintenance failed.');
 process.exitCode=1;
}finally{await db.close();}
