import {createServer} from 'node:net';
export async function probeLocalPort(port:number):Promise<void>{
 await new Promise<void>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):resolve()));});
}
export async function chooseServicePort(start:number,probe:(port:number)=>Promise<void>=probeLocalPort){
 if(!Number.isInteger(start)||start<1||start>65535)throw new Error('OMNIDOCS_PORT must be a valid TCP port.');
 for(let port=start;port<=Math.min(start+19,65535);port++){
  try{await probe(port);return port;}catch(error){if((error as NodeJS.ErrnoException).code!=='EADDRINUSE')throw error;}
 }
 throw new Error(`No free local port found starting at ${start}.`);
}
export async function waitForService(url:string,{get=fetch,alive=()=>true,pause=()=>new Promise<void>(resolve=>setTimeout(resolve,250)),attempts=120}:{get?:typeof fetch;alive?:()=>boolean;pause?:()=>Promise<void>;attempts?:number}={}){
 for(let index=0;index<attempts;index++){
  if(!alive())throw new Error('The service stopped before its API became ready.');
  try{const response=await get(`${url}/api/mode`,{signal:AbortSignal.timeout(1500)});if(response.ok&&response.headers.get('content-type')?.includes('application/json')&&(await response.json()).mode==='service')return;}catch{/* Retry until the new service accepts requests. */}
  await pause();
 }
 throw new Error(`The service did not return a valid API response at ${url}/api/mode.`);
}
