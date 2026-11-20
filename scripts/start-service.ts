import {spawn,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chooseServicePort,waitForService} from '../server/service-startup.ts';
import {adminCredentialsFromEnvironment} from '../server/service/admin.ts';
import {initializePersonalAccounts} from '../server/service/personal-accounts.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let running:ChildProcess|undefined,stopping=false;
function stop(){stopping=true;running?.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
 const opensAdmin=process.argv.includes('--admin');
 const admin=opensAdmin?adminCredentialsFromEnvironment(process.env):undefined;
 const port=await chooseServicePort(Number(process.env.OMNIDOCS_PORT||4174));
 const url=`http://127.0.0.1:${port}`;
 const browserUrl=opensAdmin?`${url}/admin/`:url;
 const dataDirectory=path.resolve(process.env.OMNIDOCS_SERVICE_DATA||path.join(root,'.service-data'));
 console.log(`Preparing OmniDocs service on ${url}`);
 const npm=process.env.npm_execpath;
 const buildEnv={...process.env};
 for(const variable of ['OMNIDOCS_ADMIN_USERNAME','OMNIDOCS_ADMIN_PASSWORD','OMNIDOCS_ADMIN_PASSWORD_HASH','OMNIDOCS_ADMIN_TOTP_SECRET',
  'DATABASE_URL','OMNIDOCS_POSTGRES_HOST','OMNIDOCS_POSTGRES_PASSWORD','OMNIDOCS_ADMIN_NETWORKS','OMNIDOCS_MAIL_WEBHOOK',
  'OMNIDOCS_MAIL_TOKEN','OMNIDOCS_SECURITY_ALERT_WEBHOOK','OMNIDOCS_SECURITY_ALERT_TOKEN'])delete buildEnv[variable];
 const build=spawn(npm?process.execPath:'npm',npm?[npm,'run','build']:['run','build'],{cwd:root,stdio:'inherit',env:buildEnv});running=build;
 await new Promise<void>((resolve,reject)=>{build.on('error',reject);build.on('exit',code=>code===0?resolve():reject(new Error('Build failed or was interrupted.')));});
 if(stopping)throw new Error('Startup cancelled.');
 const created=await initializePersonalAccounts(dataDirectory,admin);
 if(created.length){
  console.log('\nSave these initial OmniDocs credentials. This launcher displays each password only when it creates the account.');
  for(const account of created){
   console.log(`\n${account.role==='admin'?'Administrator':'Personal user'}  ${account.role==='admin'?url+'/admin/':url}`);
   console.log(`  Login     ${account.login}\n  Password  ${account.password}`);
  }
 }
 const serviceEnv:NodeJS.ProcessEnv={...buildEnv,OMNIDOCS_MODE:'service',OMNIDOCS_DATABASE_ENGINE:'sqlite',OMNIDOCS_SERVICE_DATA:dataDirectory,
  OMNIDOCS_DEV_MAIL:'1',OMNIDOCS_HOST:'127.0.0.1',OMNIDOCS_PORT:String(port),OMNIDOCS_PUBLIC_URL:url,OMNIDOCS_BEHIND_PROXY:'0'};
 if(admin?.totpSecret)serviceEnv.OMNIDOCS_ADMIN_TOTP_SECRET=admin.totpSecret;
 const child=spawn(process.execPath,['--import','tsx','server/index.ts','--production'],{cwd:root,stdio:'inherit',env:serviceEnv});running=child;
 let exited=false;child.on('exit',()=>{exited=true;});child.on('error',()=>{exited=true;});
 await waitForService(url,{alive:()=>!exited&&!stopping});
 console.log(`\nOmniDocs is ready: ${url}\nKeep this terminal open. Press Ctrl+C to stop.`);
 console.log(`Administrator panel: ${url}/admin/`);
 if(process.env.OMNIDOCS_OPEN_BROWSER!=='0'){
  const browser=process.platform==='darwin'?spawn('open',[browserUrl],{stdio:'ignore'}):process.platform==='linux'?spawn('xdg-open',[browserUrl],{stdio:'ignore'}):undefined;
  browser?.on('error',()=>console.log(`Open ${browserUrl} in your browser.`));browser?.unref();
 }
 const code=await new Promise<number|null>(resolve=>{if(exited)resolve(child.exitCode);else child.on('exit',resolve);});process.exitCode=stopping?0:code??1;
}catch(error){running?.kill('SIGTERM');const code=(error as NodeJS.ErrnoException).code;console.error(code==='EPERM'?'Cannot open a local port: this execution environment blocks listening sockets (EPERM). Run this launcher in your own terminal.':error instanceof Error?error.message:String(error));process.exitCode=1;}
