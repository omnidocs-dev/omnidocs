import {useState,type FormEvent} from 'react';
import {adminRequest} from './admin-client';
import {SixDigitField} from './SignInFields';

export type AuthenticatorSession={username:string;csrf:string;mfaRequired:true};

export function AuthenticatorSettings({token,enabled,onEnrolled}:{
 token:string;enabled:boolean;onEnrolled:(session:AuthenticatorSession)=>void;
}){
 const [key,setKey]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(key){
    const session=await adminRequest<AuthenticatorSession>('mfa/confirm',{code},token);
    setKey('');setNotice('Authenticator updated.');onEnrolled(session);
   }else{
    const result=await adminRequest<{key:string}>('mfa/start',enabled?{code}:{},token);
    setKey(result.key);
   }
   setCode('');
  }catch(error){setError(error instanceof Error?error.message:'Authenticator setup failed.');}
  finally{setBusy(false);}
 }
 return <form className="editor-form" onSubmit={event=>void submit(event)}>
  {key?<>
   <label>Setup key<input readOnly dir="ltr" value={key} onFocus={event=>event.target.select()}/></label>
   <p className="account-field-note">Add this key to your authenticator as a time-based entry. Enter its new six-digit code below.</p>
   <SixDigitField label="New authenticator code" value={code} onChange={setCode} autoComplete="one-time-code"/>
  </>:enabled?<>
   <p>Enter a fresh code from your current authenticator to replace it.</p>
   <SixDigitField label="Current authenticator code" value={code} onChange={setCode} autoComplete="one-time-code"/>
  </>:<p>Use an authenticator app to protect administrator access.</p>}
  {error&&<p role="alert" className="editor-error">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <button className="button primary" disabled={busy||((!!key||enabled)&&code.length!==6)}>
   {busy?'Saving…':key?'Confirm authenticator':enabled?'Replace authenticator':'Set up authenticator'}
  </button>
  {key&&<button className="button secondary" type="button" disabled={busy} onClick={()=>{setKey('');setCode('');setError('');}}>Start again</button>}
 </form>;
}
