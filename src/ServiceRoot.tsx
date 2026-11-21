import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {freePlanLimits,freePlanLimitMessage,resourceUnits} from '../shared/free-plan';
import {AdminPanel} from './AdminPanel';
import {AccountFrame} from './AccountFrame';
import {WorkspaceImport} from './WorkspaceImport';
import {PasswordField} from './SignInFields';
import {SignInCaptcha,useCaptcha} from './SignInCaptcha';
import type {RegistrationMode} from '../shared/registration';
import {WorkspaceBrowser,resourceIcons,type Resource} from './WorkspaceBrowser';
import {Plus,X,CaretRight,Check,Users as UsersIcon,Stack} from '@phosphor-icons/react';
import App,{type ServiceEditor} from './App';
import brand from './assets/brand/omnidocs-mark.svg';
type Account={id:string;name:string;email:string;verified:boolean};
type AccessData={members:{id:string;email:string;role:string;scopeId:string;scopeName:string;inherited:boolean}[];invitations:{id:string;email:string;role:string}[];shares:{id:string;mode:string;emails:string;expires:number;revoked:number}[]};
const currentRoute=()=>location.hash.replace(/^#\/?/,'').split('/');
async function api(url:string,body?:unknown,csrf?:string,method=body===undefined?'GET':'POST',extraHeaders?:Record<string,string>){
 const response=await fetch(url,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'x-omnidocs-token':csrf}:{}),...extraHeaders},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Request failed.'),{captchaRequired:data.captchaRequired===true});return data;
}
export function StudioRoot(){
 const [connectionError,setConnectionError]=useState('');
 const [mode,setMode]=useState<'loading'|'local'|'service'|'error'>(window.__OMNIDOCS_SNAPSHOT__?'local':'loading');
 useEffect(()=>{if(window.__OMNIDOCS_SNAPSHOT__)return;let active=true;void fetch('/api/mode',{signal:AbortSignal.timeout(10000)}).then(async response=>{if(!response.ok)throw new Error(`The API returned HTTP ${response.status}.`);if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('This address is serving a page instead of the OmniDocs API. An older server may be using this port.');const data=await response.json();if(!['local','service'].includes(data.mode))throw new Error('The server returned an invalid mode.');if(active)setMode(data.mode);}).catch(error=>{if(active){setConnectionError(`${location.origin}/api/mode — ${error instanceof Error?error.message:'Connection failed.'} Start npm run service:local and open the address printed by the launcher.`);setMode('error');}});return()=>{active=false;};},[]);
 if(mode==='local')return <App/>;
 if(mode==='service')return /^\/admin(?:\/|$)/.test(location.pathname)?<AdminPanel/>:<ServiceRoot/>;
 return <div className="service-auth"><img src={brand} width="56" height="56" alt="OmniDocs"/><h1>{mode==='error'?'Cannot connect to OmniDocs':'Opening OmniDocs…'}</h1>{mode==='error'&&<p role="alert">{connectionError}</p>}{mode==='error'&&<button className="button primary" onClick={()=>location.reload()}>Retry</button>}</div>;
}
function ServiceRoot(){
 const [account,setAccount]=useState<Account|null>(null),[csrf,setCsrf]=useState(''),[ready,setReady]=useState(false),[route,setRoute]=useState(currentRoute);
 const [resources,setResources]=useState<Resource[]>([]),[invitations,setInvitations]=useState<{id:string;name:string;kind:string;role:string}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [developmentMail,setDevelopmentMail]=useState(false),[verificationUrl,setVerificationUrl]=useState(''),[verificationMessage,setVerificationMessage]=useState('');
 const [creation,setCreation]=useState<{kind:Resource['kind'];parentId?:string;name:string;description:string}|null>(null),[manage,setManage]=useState<Resource|null>(null);
 const [importProject,setImportProject]=useState<Resource|null>(null);
 const refreshAccount=useCallback(async()=>{const data=await api('/api/auth/me');setAccount(data.user);setCsrf(data.csrf??'');setDevelopmentMail(!!data.developmentMail);setReady(true);return data.user as Account|null;},[]);
 const refreshTree=useCallback(async()=>{const [tree,pending]=await Promise.all([api('/api/tree'),api('/api/invitations')]);setResources(tree.resources);setInvitations(pending.invitations);},[]);
 useEffect(()=>{void refreshAccount().catch(err=>{setError(err.message);setReady(true);});const change=()=>{setRoute(currentRoute());setError('');};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[refreshAccount]);
 useEffect(()=>{let active=true;setResources([]);setInvitations([]);if(account?.verified)void Promise.all([api('/api/tree'),api('/api/invitations')]).then(([tree,pending])=>{if(active){setResources(tree.resources);setInvitations(pending.invitations);}}).catch(err=>{if(active)setError(err.message);});return()=>{active=false;};},[account?.id,account?.verified]);
 const go=(value='')=>{location.hash=`/${value}`;if(!value)setRoute(['']);};
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();}catch(err){setError(err instanceof Error?err.message:'Request failed.');}finally{setBusy(false);}}
 useEffect(()=>{if(!account?.verified||['verify','reset'].includes(route[0]))return;const back=sessionStorage.getItem('omnidocs.return');if(back){sessionStorage.removeItem('omnidocs.return');location.hash=back;}},[account?.verified,route[0]]);
 const opened=route[0]==='space'?resources.find(resource=>resource.id===route[1]&&resource.kind==='space'&&resource.role):undefined;
 const owned=resources.reduce((counts,resource)=>{
  if(resource.via.some(grant=>grant.id===resource.id&&grant.role==='owner')) counts[resource.kind]++;
  return counts;
 },{organization:0,project:0,space:0});
 const remaining={
  organization:Math.max(0,freePlanLimits.organization-owned.organization),
  project:Math.max(0,freePlanLimits.project-owned.project),
  space:Math.max(0,freePlanLimits.space-owned.space),
 };
 const shared=route[0]==='share'&&!!route[1];
 const editor=useMemo<ServiceEditor|undefined>(()=>shared?{spaceId:'shared',name:'Shared space',endpoint:`/api/share/${encodeURIComponent(route[1])}/workspace`,canEdit:false,canManage:false,onExit:()=>go(),onManage:()=>{}}:opened?{spaceId:opened.id,name:opened.name,endpoint:`/api/spaces/${opened.id}/workspace`,canEdit:opened.role!=='viewer',canManage:opened.role==='owner',onExit:()=>go(),onManage:()=>setManage(opened)}:undefined,[shared,route[1],opened]);
 if(!ready)return <div className="service-auth">Loading your account…</div>;
 if(['verify','reset'].includes(route[0])||!account&&!shared)return <AuthScreen route={route} error={error} onComplete={async()=>{go();await refreshAccount();}}/>;
 if(editor)return <><App key={editor.endpoint} service={editor}/>{shared&&<div className="service-share-account">{account?.verified?<><span>Read-only link · {account.email}</span><button disabled={busy} onClick={()=>void action(async()=>{sessionStorage.setItem('omnidocs.return',location.hash);await api('/api/auth/logout',{},csrf);setAccount(null);go('login');})}>Switch account</button></>:<button onClick={()=>{sessionStorage.setItem('omnidocs.return',location.hash);go('login');}}>{account?'Verify email for this link':'Sign in for a restricted link'}</button>}</div>}{manage&&<AccessPanel resource={manage} csrf={csrf} onClose={()=>setManage(null)}/>}</>;
 if(!account)return <AuthScreen route={route} error={error} onComplete={async()=>{await refreshAccount();}}/>;
 if(!account.verified)return <AccountFrame title="Verify your email"
  description={developmentMail?'Generate and open a local verification link to activate this development account.':`Open the verification link sent to ${account.email}.`}>
  <div className="account-verify-actions">
   {error&&<p className="editor-error" role="alert">{error}</p>}
   {verificationMessage&&<p role="status">{verificationMessage}</p>}
   {verificationUrl&&<a className="button primary" href={verificationUrl}>Open local verification link</a>}
   <button className={verificationUrl?'button secondary':'button primary'} disabled={busy} onClick={()=>void action(async()=>{
    const result=await api('/api/auth/resend',{},csrf);setVerificationUrl(result.verificationUrl??'');setVerificationMessage(result.message);
   })}>{developmentMail?'Generate local verification link':'Send a new verification email'}</button>
   <button className="button secondary" disabled={busy} onClick={()=>void action(async()=>{
    const current=await refreshAccount();
    if(current&&!current.verified)setVerificationMessage('Your email is still unverified. Open the link and press “Verify email”, then check again.');
   })}>I verified my email</button>
   <button className="text-button" disabled={busy} onClick={()=>void action(async()=>{
    await api('/api/auth/logout',{},csrf);setAccount(null);setVerificationUrl('');setVerificationMessage('');go();
   })}>Sign out</button>
  </div>
 </AccountFrame>;
 return <div className="service-shell"><header className="service-header"><a href="#/"><img src={brand} width="38" height="38" alt=""/><strong>omnidocs.</strong></a><span>{account.name} · {account.email}</span><button className="button secondary" disabled={busy} onClick={()=>void action(async()=>{await api('/api/auth/logout',{},csrf);setAccount(null);setResources([]);setCsrf('');go();})}>Sign out</button></header>
  <main className="service-dashboard"><div className="service-dashboard-title"><div><h1>Your work, connected.</h1><p>From your organization to the details of your architecture.</p></div><div className="hub-summary" aria-label="Free plan usage"><strong>Free</strong>{(['organization','project','space'] as const).map(kind=>{
    const Icon=resourceIcons[kind];
    return <span key={kind}><Icon size={18}/>{owned[kind]}/{freePlanLimits[kind]} {resourceUnits[kind].plural}</span>;
   })}</div></div>
   {error&&<p className="editor-error" role="alert">{error}</p>}
   {!!invitations.length&&<section className="service-invitations"><h2>Invitations for {account.email}</h2>{invitations.map(invite=><div key={invite.id}><span>{invite.name} · {invite.kind} · {invite.role}</span><button className="button primary" disabled={busy} onClick={()=>void action(async()=>{await api(`/api/invitations/${invite.id}/accept`,{},csrf);await refreshTree();})}>Accept invitation</button></div>)}</section>}
   <WorkspaceBrowser key={account.id} resources={resources} busy={busy} remaining={remaining} onCreate={(kind,parentId)=>setCreation({kind,parentId,name:'',description:''})} onImport={project=>{setError('');setImportProject(project);}} onOpen={id=>go(`space/${id}`)} onAccess={setManage} onRefresh={()=>void action(refreshTree)}/>
  </main>
  {importProject&&<ServiceOverlay label="Import workspace" busy={busy} onClose={()=>setImportProject(null)}>
   <WorkspaceImport project={importProject.name} busy={busy} error={error} onClose={()=>setImportProject(null)} onImport={bundle=>void action(async()=>{
    const result=await api('/api/spaces/import',{parentId:importProject.id,bundle},csrf);
    setImportProject(null);await refreshTree();go(`space/${result.id}`);
   })}/>
  </ServiceOverlay>}
  {creation&&<ServiceOverlay label={`New ${creation.kind}`} busy={busy} onClose={()=>setCreation(null)}><section className="service-modal hub-creation"><div className="hub-creation-heading"><div><h2>Create {creation.kind==='organization'?'an organization':creation.kind==='project'?'a project':'a space'}</h2><p>{creation.kind==='organization'?'Bring your team and projects together.':creation.kind==='project'?'Give related documentation spaces a shared home.':'Start an independent space for your architecture.'}</p></div><button className="hub-icon-button" aria-label="Close creation form" disabled={busy} onClick={()=>setCreation(null)}><X size={21}/></button></div>{error&&<p className="editor-error" role="alert">{error}</p>}{!error&&remaining[creation.kind]===0&&<p role="status">{freePlanLimitMessage(creation.kind)}</p>}<div className="hub-create-path" aria-label="New item location">{(['organization','project','space'] as const).map((kind,index)=>{const PathIcon=resourceIcons[kind],active=kind===creation.kind;const parent=resources.find(r=>r.id===creation.parentId);const existing=kind==='project'?parent:kind==='organization'?(parent?.kind==='organization'?parent:resources.find(r=>r.id===parent?.parent_id)):undefined;return <span className={active?'is-current':existing?'is-complete':''} key={kind}>{index>0&&<CaretRight size={14}/>}<PathIcon size={19}/><span>{active?creation.name||`New ${kind}`:existing?.name??kind}</span>{existing&&<Check size={13}/>}</span>;})}</div><form className="editor-form" onSubmit={event=>{event.preventDefault();void action(async()=>{try{await api('/api/resources',creation,csrf);}catch(error){await refreshTree().catch(()=>{});throw error;}
    setCreation(null);await refreshTree();});}}><label>{creation.kind[0].toUpperCase()+creation.kind.slice(1)} name<input autoFocus required maxLength={160} placeholder={creation.kind==='organization'?'e.g. Platform team':creation.kind==='project'?'e.g. Customer platform':'e.g. System architecture'} value={creation.name} onChange={event=>setCreation({...creation,name:event.target.value})}/></label><label>Description<textarea required maxLength={2000} rows={3} placeholder="What will you document here?" value={creation.description} onChange={event=>setCreation({...creation,description:event.target.value})}/></label><div className="hub-create-note">{creation.kind==='space'?<><Stack size={21}/><p>Starts with a context diagram and an empty container view. Your documents and history stay together in this space.</p></>:<><UsersIcon/><p>You control who can view or edit. Access granted here also applies to everything created inside.</p></>}</div><div className="editor-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setCreation(null)}>Cancel</button><button className="button primary" disabled={busy||remaining[creation.kind]===0}><Plus size={18}/>{busy?'Creating…':`Create ${creation.kind}`}</button></div></form></section></ServiceOverlay>}
  {manage&&<AccessPanel resource={manage} csrf={csrf} onClose={()=>{setManage(null);void refreshTree();}}/>}
 </div>;
}
function ServiceOverlay({children,label,busy,onClose}:{children:ReactNode;label:string;busy:boolean;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();ref.current?.querySelector<HTMLInputElement>('input')?.focus();},[]);
 return <dialog ref={ref} className="service-overlay" aria-label={label} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>{children}</dialog>;
}
function AuthScreen({route,error:external,onComplete}:{route:string[];error:string;onComplete:()=>Promise<void>}){
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const mode=route[0];
 const verify=mode==='verify',reset=mode==='reset',register=mode==='register',forgot=mode==='forgot';
 const [registration,setRegistration]=useState<RegistrationMode>();
 const [zitadelEnabled,setZitadelEnabled]=useState(false);
 const login=!verify&&!reset&&!register&&!forgot;
 const automatic=register&&registration==='automatic';
 const [captchaPurpose,setCaptchaPurpose]=useState<'login'|'register'|null>(null);
 const purpose=register?'register':login?'login':null;
 const captchaRequired=!!purpose&&purpose===captchaPurpose;
 const captcha=useCaptcha(captchaRequired?purpose:null);
 const showEmail=!verify&&!reset;
 const isNewPassword=reset||verify||automatic;
 const title=verify?'Activate your account':reset?'Set a new password':register?'Create your account':forgot?'Reset your password':'Sign in';
 const description=verify?'Choose a password to activate your account.'
  :reset?'Choose a password for your OmniDocs account.'
   :register?'Start with a free workspace for your documentation.'
    :forgot?'Enter your account email to request a reset link.':'Open your organizations and workspaces.';
 useEffect(()=>{setPassword('');setError('');},[mode]);
 useEffect(()=>{
  if(!register&&!login)return;
  let active=true;setRegistration(undefined);
  void api('/api/auth/registration').then(data=>{if(active){setRegistration(data.mode);setZitadelEnabled(data.zitadelEnabled===true);}})
   .catch(error=>{if(active&&register)setError(error.message);});
  return ()=>{active=false;};
 },[register,login]);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||captchaRequired&&!captcha.ready||register&&!registration)return;
  setBusy(true);setError('');setMessage('');
  try{
   if(verify){await api('/api/auth/verify',{token:route[1],password});await onComplete();setMessage('Your account is active. Sign in to continue.');}
   else if(reset){await api('/api/auth/reset',{token:route[1],password});await onComplete();setMessage('Password updated. Sign in with your new password.');}
   else if(register){
    const result=await api('/api/auth/register',{email,name,...(automatic?{password}:{})},undefined,'POST',captcha.headers);
    setMessage(result.message);
    if(result.verificationUrl)location.hash=new URL(result.verificationUrl).hash;
   }else if(forgot){
    const result=await api('/api/auth/forgot',{email});setMessage(result.message);
   }else{await api('/api/auth/login',{email,password},undefined,'POST',captcha.headers);await onComplete();}
   if(purpose)setCaptchaPurpose(null);
  }catch(err){
   setError(err instanceof Error?err.message:'Cannot continue.');
   if(purpose&&err instanceof Error&&'captchaRequired' in err&&err.captchaRequired){
    setCaptchaPurpose(purpose);captcha.reload();
   }
  }finally{setBusy(false);}
 }

 return <AccountFrame title={title} description={description}>
  {login&&route[1]==='zitadel-error'&&<p className="editor-error" role="alert">SSO login failed. Check that your email is verified in ZITADEL or contact your administrator.</p>}
  <form className="editor-form account-form" onSubmit={event=>void submit(event)}>
   {register&&<label>Name<input required autoComplete="name" maxLength={160} value={name} onChange={event=>setName(event.target.value)}/></label>}
   {showEmail&&<label>Email<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label>}
   {(!register||automatic)&&!forgot&&<PasswordField key={mode} value={password} onChange={setPassword} isNew={isNewPassword} minLength={isNewPassword?12:1}/>}
   {isNewPassword&&<p className="account-field-note">Use at least 12 characters.</p>}
   {captchaRequired&&<SignInCaptcha {...captcha}/>}
   {(error||external)&&<p className="editor-error" role="alert">{error||external}</p>}
   {message&&<p role="status">{message}</p>}
   <button className="button primary" disabled={busy||captchaRequired&&!captcha.ready||register&&!registration}>{busy?'Please wait…':verify?'Activate account':reset?'Set new password':register?registration==='email'?'Send activation link':registration==='manual'?'Request approval':'Create account':forgot?'Send reset email':'Sign in'}</button>
   {login&&zitadelEnabled&&<a className="button secondary account-sso" href="/api/auth/zitadel/start">Login with SSO</a>}
  </form>
  {!verify&&!reset&&<nav className="account-links" aria-label="Account actions">
   {register||forgot?<a href="#/login" onClick={()=>setMessage('')}>Back to sign in</a>:<>
    <a href="#/register" onClick={()=>setMessage('')}>Create an account</a>
    <a href="#/forgot" onClick={()=>setMessage('')}>Forgot password?</a>
   </>}
  </nav>}
 </AccountFrame>;
}
function AccessPanel({resource,csrf,onClose}:{resource:Resource;csrf:string;onClose:()=>void}){
 const [data,setData]=useState<AccessData|null>(null),[email,setEmail]=useState(''),[role,setRole]=useState('viewer'),[mode,setMode]=useState('restricted'),[emails,setEmails]=useState(''),[days,setDays]=useState(30),[link,setLink]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>setData(await api(`/api/resources/${resource.id}/access`)),[resource.id]);
 useEffect(()=>{void refresh().catch(err=>setError(err.message));},[refresh]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();await refresh();}catch(err){setError(err instanceof Error?err.message:'Cannot change access.');}finally{setBusy(false);}}
 return <ServiceOverlay label="Manage access" busy={busy} onClose={onClose}><section className="service-modal service-access" role="dialog" aria-modal="true" aria-label="Manage access"><div className="service-resource-heading"><div><small>{resource.kind}</small><h2>Access to {resource.name}</h2></div><button className="button secondary" disabled={busy} onClick={onClose}>Close</button></div><p>Only owners can manage access. Parent grants apply to current and future descendants; a lower role here does not reduce inherited access.</p>
  {error&&<p className="editor-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <form className="editor-form" onSubmit={event=>{event.preventDefault();void run(async()=>{await api(`/api/resources/${resource.id}/invitations`,{email,role},csrf);setEmail('');setMessage('Invitation queued for email delivery.');});}}><h3>Invite by email</h3><label>Verified account email<input required type="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Role<select value={role} onChange={event=>setRole(event.target.value)}><option value="viewer">Viewer · read only</option><option value="editor">Editor · edit documents and diagrams</option></select></label><button className="button primary" disabled={busy}>Send invitation</button></form>
  <h3>Members</h3>{!data?.members.length&&<p>No invited members yet.</p>}{data?.members.map(member=><div className="service-access-row" key={member.id}><span><strong>{member.email}</strong><small>{member.role} · {member.inherited?`Inherited from ${member.scopeName}`:'Direct access'}</small></span>{!member.inherited&&<button className="text-button" disabled={busy} onClick={()=>void run(async()=>{await api(`/api/memberships/${member.id}`,undefined,csrf,'DELETE');})}>Revoke</button>}</div>)}
  <h3>Pending invitations</h3>{data?.invitations.map(invite=><div className="service-access-row" key={invite.id}><span>{invite.email} · {invite.role}</span><button className="text-button" disabled={busy} onClick={()=>void run(async()=>{await api(`/api/invitations/${invite.id}`,undefined,csrf,'DELETE');})}>Cancel invitation</button></div>)}
  {resource.kind==='space'&&<><form className="editor-form" onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await api(`/api/spaces/${resource.id}/shares`,{mode,emails:mode==='restricted'?emails.split(/[\s,;]+/).filter(Boolean):[],days},csrf);setLink(result.url);});}}><h3>Read-only share link</h3><label>Access mode<select value={mode} onChange={event=>setMode(event.target.value)}><option value="restricted">Sign in · only specified verified emails</option><option value="public">Public · anyone with the link</option></select></label>{mode==='restricted'&&<label>Allowed emails<textarea required placeholder="one@example.com, two@example.com" value={emails} onChange={event=>setEmails(event.target.value)}/></label>}<label>Expires in days<input required type="number" min={1} max={365} value={days} onChange={event=>setDays(Number(event.target.value))}/></label><button className="button primary" disabled={busy}>Create read-only link</button></form>
  {link&&<div className="service-share-result"><label>Copy this link now<input readOnly value={link} onFocus={event=>event.currentTarget.select()}/></label><button className="button secondary" onClick={()=>void navigator.clipboard.writeText(link).catch(()=>setMessage('Select the link and copy it manually.'))}>Copy</button></div>}
  {data?.shares.map(share=><div className="service-access-row" key={share.id}><span><strong>{share.mode} · read only</strong><small>{share.mode==='restricted'?JSON.parse(share.emails).join(', '):'Anyone with link'} · expires {new Date(Number(share.expires)).toLocaleDateString()}</small></span>{share.revoked?<small>Revoked</small>:<button className="text-button" disabled={busy} onClick={()=>void run(async()=>{await api(`/api/shares/${share.id}`,undefined,csrf,'DELETE');})}>Revoke link</button>}</div>)}</>}
 </section></ServiceOverlay>;
}
