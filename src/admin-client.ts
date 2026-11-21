export class AdminRequestError extends Error {
 constructor(message:string,readonly status:number,readonly captchaRequired=false){super(message);}
}

export async function adminRequest<T>(path:string,body?:unknown,token?:string,extraHeaders?:Record<string,string>):Promise<T> {
 const response=await fetch(`/admin/api/${path}`,body===undefined?undefined:{
  method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-omnidocs-token':token}:{}),...extraHeaders},
  body:JSON.stringify(body),
 });
 const data=await response.json();
 if(!response.ok)throw new AdminRequestError(data.error??'The administrator request failed.',response.status,data.captchaRequired===true);
 return data;
}
