import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {ShieldCheck,SignOut} from '@phosphor-icons/react';
import {AccountFrame} from './AccountFrame';
import {PasswordField,SixDigitField} from './SignInFields';
import {AuthenticatorSettings,type AuthenticatorSession} from './AuthenticatorSettings';
import {SignInCaptcha,useCaptcha} from './SignInCaptcha';
import {adminRequest} from './admin-client';
import {AdminDashboard} from './AdminDashboard';
import brand from './assets/brand/omnidocs-mark.svg';

type Session={enabled:boolean;username:string|null;csrf?:string;mfaRequired?:boolean;enrollmentRequired?:boolean};
export function AdminPanel() {
 const [session,setSession]=useState<Session|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [username,setUsername]=useState(''),[password,setPassword]=useState('');
 const [code,setCode]=useState('');
 const captcha=useCaptcha(session?.enabled&&!session.username?'admin':null);
 const checkSession=useCallback(()=>{
  setError('');
  return adminRequest<Session>('me').then(setSession).catch(error=>setError(error.message));
 },[]);
 useEffect(()=>{void checkSession();},[checkSession]);

 async function signIn(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(busy||!captcha.ready)return;
  setBusy(true);setError('');
  try{
   const result=await adminRequest<Omit<Session,'enabled'>>('login',{username,password,...(session?.mfaRequired?{code}:{})},undefined,captcha.headers);
   setSession({...result,enabled:true});
  }catch(error){setError(error instanceof Error?error.message:'Sign-in failed.');captcha.reload();}
  finally{setPassword('');setCode('');setBusy(false);}
 }

 async function signOut() {
  setBusy(true);setError('');
  try{
   await adminRequest('logout',{},session?.csrf);
   setSession({enabled:true,username:null,mfaRequired:session?.mfaRequired});
  }catch(error){setError(error instanceof Error?error.message:'Sign-out failed.');}
  finally{setBusy(false);}
 }

 const onEnrolled=(next:AuthenticatorSession)=>setSession({...next,enabled:true});
 if(session?.enrollmentRequired&&session.username)return <AccountFrame title="Set up your authenticator" admin>
  <AuthenticatorSettings token={session.csrf??''} enabled={false} onEnrolled={onEnrolled}/>
  {error&&<p className="editor-error" role="alert">{error}</p>}
  <button className="text-button" type="button" onClick={()=>void signOut()}>Sign out</button>
 </AccountFrame>;

 if(session?.username)return <div className="service-shell admin-shell">
  <header className="service-header">
   <a href="/admin/"><img src={brand} width={38} height={38} alt=""/><strong>omnidocs.</strong></a>
   <span className="admin-identity"><ShieldCheck size={18}/>{session.username}</span>
   <button className="button secondary" disabled={busy} onClick={()=>void signOut()}><SignOut size={17}/>Sign out</button>
  </header>
  <AdminDashboard token={session.csrf??''} onExpired={checkSession} sessionError={error} mfaEnabled={!!session.mfaRequired} onEnrolled={onEnrolled}/>
 </div>;

 return <AccountFrame title="Administrator sign in" admin>
  {!session&&<>{error?<><p className="editor-error" role="alert">{error}</p><button className="button secondary" onClick={()=>void checkSession()}>Retry</button></>:<p role="status">Checking administrator access…</p>}</>}
  {session&&!session.enabled&&<p role="status">Administrator access is disabled. Configure an administrator on the server.</p>}
  {session?.enabled&&<form className="editor-form account-form" onSubmit={event=>void signIn(event)}>
   <label>Username<input required autoComplete="username" maxLength={64} value={username} onChange={event=>setUsername(event.target.value)}/></label>
   <PasswordField value={password} onChange={setPassword}/>
   {session.mfaRequired&&<SixDigitField label="Authentication code" value={code} onChange={setCode} autoComplete="one-time-code"/>}
   <SignInCaptcha {...captcha}/>
   {error&&<p className="editor-error" role="alert">{error}</p>}
   <button className="button primary" disabled={busy||!captcha.ready}>{busy?'Signing in…':'Sign in to admin'}</button>
  </form>}
 </AccountFrame>;
}
