import {useCallback,useEffect,useState} from 'react';
import type {CaptchaChallenge} from '../shared/registration';
import {SixDigitField} from './SignInFields';

export function useCaptcha(purpose:'login'|'register'|'admin'|null){
 const [challenge,setChallenge]=useState<CaptchaChallenge>(),[answer,setAnswer]=useState(''),[error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>{setChallenge(undefined);setAnswer('');setError('');setRevision(value=>value+1);},[]);
 useEffect(()=>{
  setChallenge(undefined);setAnswer('');setError('');
  if(!purpose)return;
  const abort=new AbortController();
  const url=purpose==='admin'?'/admin/api/captcha':'/api/auth/captcha';
  void fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(purpose==='admin'?{}:{purpose}),signal:abort.signal}).then(async response=>{
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'CAPTCHA could not be loaded.');
   if(!abort.signal.aborted)setChallenge(data);
  }).catch(error=>{if(!abort.signal.aborted)setError(error instanceof Error?error.message:'CAPTCHA could not be loaded.');});
  return ()=>abort.abort();
 },[purpose,revision]);
 const ready=!!challenge&&/^\d{6}$/.test(answer);
 return {challenge,answer,setAnswer,error,reload,ready,
  headers:challenge?{'x-omnidocs-captcha-id':challenge.id,'x-omnidocs-captcha-answer':answer}:undefined};
}

export function SignInCaptcha({challenge,answer,setAnswer,error,reload}:ReturnType<typeof useCaptcha>){
 return <fieldset className="signin-captcha">
  <legend>Security check</legend>
  <div className="signin-captcha-image">
   {challenge?<img src={challenge.image} width={186} height={55} alt="Six-digit CAPTCHA"/>:
    <span role="status">{error?'Image unavailable':'Loading image…'}</span>}
   <button type="button" className="text-button" onClick={reload}>New image</button>
  </div>
  <SixDigitField label="Enter the six digits" disabled={!challenge} value={answer} onChange={setAnswer}/>
  {error&&<span className="editor-error" role="alert">{error}</span>}
 </fieldset>;
}
