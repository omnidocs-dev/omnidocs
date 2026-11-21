import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,Buildings,ChartBar,ClockCounterClockwise,FolderSimple,GearSix,MagnifyingGlass,Stack,Users} from '@phosphor-icons/react';
import {AdminRequestError,adminRequest} from './admin-client';
import type {AdminActivity,AdminOverview,AdminPage,AdminResource,AdminUser,AdminUserDetails,ResourceCounts} from '../shared/admin-directory';
import {registrationModes,type RegistrationMode,type RegistrationSettings} from '../shared/registration';
import {AuthenticatorSettings,type AuthenticatorSession} from './AuthenticatorSettings';

const tabs={overview:{label:'Overview',Icon:ChartBar},users:{label:'Users',Icon:Users},resources:{label:'Resources',Icon:FolderSimple},activity:{label:'Activity',Icon:ClockCounterClockwise},settings:{label:'Settings',Icon:GearSix}};
type Tab=keyof typeof tabs;
type Mutation=(endpoint:string,body:unknown)=>Promise<void>;
const dateFormat=new Intl.DateTimeFormat(undefined,{dateStyle:'medium'});
const timeFormat=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'});
const kindLabels={organization:'Organization',project:'Project',space:'Workspace'};
const resourceIcons={organization:Buildings,project:FolderSimple,space:Stack};
const actions:Record<string,string>={
 'account.sign_in':'Signed in','resource.create':'Created resource','workspace.import':'Imported workspace','workspace.save':'Saved workspace',
 'invitation.create':'Sent invitation','invitation.accept':'Accepted invitation','membership.revoke':'Revoked membership','share.create':'Created share link',
 'review.submitted':'Submitted change request','review.comment':'Commented on request','review.rebased':'Updated change request',
 'review.approved':'Approved change request','review.published':'Published change request','review.changes_requested':'Requested changes',
 'review.superseded':'Superseded change request','admin.user.rename':'Renamed account','admin.user.suspend':'Suspended account',
 'admin.user.restore':'Reactivated account','admin.user.revoke_sessions':'Revoked user sessions',
 'admin.user.approve':'Issued an account approval link','admin.registration.email':'Enabled email verification',
 'admin.registration.manual':'Enabled administrator approval','admin.registration.automatic':'Enabled automatic local registration',
 'admin.membership.change_role':'Changed member role','admin.membership.revoke':'Revoked member access',
 'admin.resource.edit':'Edited resource details','admin.resource.archive':'Archived resource','admin.resource.restore':'Restored resource',
};

function useAdminData<T>(endpoint:string,revision:number,onExpired:()=>Promise<void>):{data?:T;error?:string} {
 const [state,setState]=useState<{key:string;data?:T;error?:string}>({key:''});
 const key=endpoint+':'+revision;
 useEffect(()=>{
  let active=true;
  adminRequest<T>(endpoint).then(data=>{if(active)setState({key,data});}).catch(error=>{
   if(!active)return;
   if(error instanceof AdminRequestError&&error.status===401)void onExpired();
   setState({key,error:error instanceof Error?error.message:'The request failed.'});
  });
  return ()=>{active=false;};
 },[endpoint,key,onExpired]);
 return state.key===key?state:{};
}

export function AdminDashboard({token,onExpired,sessionError,mfaEnabled,onEnrolled}:{token:string;onExpired:()=>Promise<void>;sessionError:string;
 mfaEnabled:boolean;onEnrolled:(session:AuthenticatorSession)=>void}) {
 const [tab,setTab]=useState<Tab>('overview'),[revision,setRevision]=useState(0);
 const [userId,setUserId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [activationUrl,setActivationUrl]=useState('');
 const summary=useAdminData<AdminOverview>('overview',revision,onExpired);

 function navigate(next:Tab,id:string|null=null){
  setTab(next);setUserId(id);setNotice('');setError('');setActivationUrl('');
 }
 async function mutate(endpoint:string,body:unknown){
  if(busy)return;
  setBusy(true);setNotice('');setError('');setActivationUrl('');
  try{
   const result=await adminRequest<{activationUrl?:string}>(endpoint,body,token);
   setActivationUrl(result.activationUrl??'');
   setNotice(result.activationUrl?'Approval link created.':'Changes saved.');setRevision(value=>value+1);
  }catch(error){
   if(error instanceof AdminRequestError&&error.status===401)void onExpired();
   const message=error instanceof Error?error.message:'Unable to save changes.';
   setError(message);throw new Error(message);
  }finally{setBusy(false);}
 }
 const loadProps={revision,onExpired};
 return <div className="admin-layout">
  <nav aria-label="Administrator pages" className="admin-navigation">
   {(Object.keys(tabs) as Tab[]).map(id=>{const {label,Icon}=tabs[id];return <button type="button"
    key={id} aria-current={tab===id?'page':undefined} onClick={()=>navigate(id)}><Icon weight="duotone" size={23}/>{label}</button>;})}
  </nav>
  <main className="admin-dashboard">
   {(error||sessionError)&&<p role="alert" className="editor-error">{error||sessionError}</p>}
   {notice&&<p role="status" className="admin-feedback">{notice}</p>}
   {activationUrl&&<section className="admin-list admin-management-card editor-form">
    <label>One-time activation link<input readOnly value={activationUrl} onFocus={event=>event.target.select()}/></label>
    <p>Send it privately to the account owner. It expires in 24 hours.</p>
   </section>}
   {tab==='overview'&&<>
    <DashboardTitle title="Overview" description="Accounts, workspaces and recent activity"/>
    <DataFeedback state={summary}/>
    {summary.data&&<Overview data={summary.data} navigate={next=>navigate(next)}/>}
   </>}
   {tab==='users'&&(userId?<UserDetails key={userId} id={userId} {...loadProps} busy={busy} mutate={mutate}
    onBack={()=>navigate('users')}/>:<UserDirectory {...loadProps} onOpen={id=>navigate('users',id)}/>)}
   {tab==='resources'&&<ResourceDirectory {...loadProps} busy={busy} mutate={mutate} onOwner={id=>navigate('users',id)}/>}
   {tab==='activity'&&<ActivityDirectory {...loadProps}/>}
   {tab==='settings'&&<>
    <RegistrationPanel {...loadProps} busy={busy} mutate={mutate}/>
    <section className="admin-list admin-management-card">
     <h2>Authenticator</h2>
     <AuthenticatorSettings token={token} enabled={mfaEnabled} onEnrolled={onEnrolled}/>
    </section>
   </>}
  </main>
 </div>;
}

const registrationOptions={
 email:{title:'Email verification',description:'Users open a link sent to their inbox and choose a password.'},
 manual:{title:'Administrator approval',description:'Review pending accounts in Users and send each owner a one-time activation link.'},
 automatic:{title:'Automatic activation',description:'Users choose a password at sign-up and can sign in immediately. Available on localhost.'},
};
function RegistrationPanel({revision,onExpired,busy,mutate}:{revision:number;onExpired:()=>Promise<void>;busy:boolean;mutate:Mutation}){
 const state=useAdminData<RegistrationSettings>('registration',revision,onExpired);
 const zitadel=useAdminData<{issuer:string;clientId:string;enabled:boolean;callbackUrl:string}>('zitadel',revision,onExpired);
 const [selected,setSelected]=useState<RegistrationMode>();
 const active=selected??state.data?.mode;
 return <>
  <DashboardTitle title="Settings" description="Account registration and sign-in"/>
  <DataFeedback state={state}/>
  {state.data&&<form className="admin-list admin-management-card editor-form" onSubmit={event=>{
   event.preventDefault();void mutate('registration',{mode:active}).then(()=>setSelected(undefined)).catch(()=>{});
  }}>
   <h2>New accounts</h2>
   <div className="admin-registration-options">
    {registrationModes.map(mode=><label key={mode}>
     <input type="radio" name="registration-mode" checked={active===mode}
      disabled={busy||mode==='automatic'&&!state.data?.automaticAvailable||mode==='email'&&!state.data?.emailAvailable} onChange={()=>setSelected(mode)}/>
     <span><strong>{registrationOptions[mode].title}</strong><span>{mode==='email'&&!state.data?.emailAvailable?'Configure email delivery to enable this option.':registrationOptions[mode].description}</span></span>
    </label>)}
   </div>
   <button className="button primary" disabled={busy||active===state.data.mode}>Save settings</button>
  </form>}
  <section className="admin-list admin-management-card editor-form">
   <h2>ZITADEL SSO</h2>
   <DataFeedback state={zitadel}/>
   {zitadel.data&&<>
    <form className="editor-form" onSubmit={event=>{
     event.preventDefault();
     const fields=new FormData(event.currentTarget);
     void mutate('zitadel/config',{issuer:fields.get('issuer'),clientId:fields.get('clientId')}).catch(()=>{});
    }}>
     <label>Issuer URL<input name="issuer" type="url" required maxLength={2048} defaultValue={zitadel.data.issuer} placeholder="https://example.zitadel.cloud"/></label>
     <label>Client ID<input name="clientId" required maxLength={255} defaultValue={zitadel.data.clientId}/></label>
     <label>Redirect URI<input readOnly value={zitadel.data.callbackUrl} onFocus={event=>event.target.select()}/></label>
     {zitadel.data.enabled&&<p>Changing the issuer or Client ID disables SSO until you enable it again.</p>}
     <button className="button primary" disabled={busy}>Save ZITADEL settings</button>
    </form>
    <p>{zitadel.data.enabled?'Enabled':'Disabled'}</p>
    <button type="button" className="button secondary" disabled={busy||!zitadel.data.clientId}
     onClick={()=>void mutate('zitadel',{enabled:!zitadel.data!.enabled}).catch(()=>{})}>
     {zitadel.data.enabled?'Disable ZITADEL SSO':'Enable ZITADEL SSO'}
    </button>
   </>}
  </section>
 </>;
}

function DashboardTitle({title,description}:{title:string;description?:string}) {
 return <div className="service-dashboard-title admin-heading"><div><h1 dir="auto">{title}</h1>{description&&<p>{description}</p>}</div></div>;
}
function DataFeedback({state}:{state:{data?:unknown;error?:string}}){
 if(state.error)return <p className="editor-error" role="alert">{state.error}</p>;
 if(!state.data)return <p className="admin-list-message" role="status">Loading…</p>;
 return null;
}

function Overview({data,navigate}:{data:AdminOverview;navigate:(tab:Tab)=>void}) {
 const {users,resources}=data;
 const statuses=[{name:'Verified',count:users.verified,tone:'verified'},{name:'Pending',count:users.pending,tone:'pending'},
  {name:'Suspended',count:users.suspended,tone:'suspended'}];
 return <>
  <div className="admin-overview">
   <section className="admin-list admin-account-overview">
    <div className="admin-overview-title"><Users size={24} weight="duotone"/><h2>Accounts</h2></div>
    <p className="admin-total"><strong>{users.total.toLocaleString()}</strong> registered</p>
    {users.total>0&&<div className="admin-account-bar" aria-hidden="true">{statuses.map(status=><span key={status.tone}
     data-tone={status.tone} style={{flexGrow:status.count}}/>)}</div>}
    <dl className="admin-status-legend">{statuses.map(status=><div key={status.tone}><dt><i data-tone={status.tone}/>{status.name}</dt><dd>{status.count.toLocaleString()}</dd></div>)}</dl>
    <button type="button" className="button secondary" onClick={()=>navigate('users')}>Manage users <ArrowRight size={17}/></button>
   </section>
   <section className="admin-list admin-resource-overview">
    <div className="admin-overview-title"><Buildings size={24} weight="duotone"/><h2>Workspace inventory</h2></div>
    <dl className="admin-inventory">{(Object.keys(resources) as (keyof ResourceCounts)[]).map(kind=>{
     const Icon=resourceIcons[kind];
     return <div key={kind} data-kind={kind}><dt><Icon size={22} weight="duotone"/>{kindLabels[kind]}s</dt><dd>{resources[kind].toLocaleString()}</dd></div>;
    })}</dl>
    <p className="admin-archive-count">{data.archived.toLocaleString()} directly archived</p>
    <button type="button" className="button secondary" onClick={()=>navigate('resources')}>Manage resources <ArrowRight size={17}/></button>
   </section>
  </div>
  <div className="admin-section-title"><h2>Recent activity</h2><button type="button" className="text-button" onClick={()=>navigate('activity')}>Open activity <ArrowRight size={16}/></button></div>
  <Activity events={data.activity.slice(0,6)}/>
 </>;
}

function Activity({events}:{events:AdminActivity[]}) {
 return <section className="admin-list" aria-label="Activity log">
  {events.length===0?<p className="admin-list-message">No recorded activity to show.</p>:
   <ol className="admin-activity">{events.map(event=><li key={event.id}>
    <span className="admin-event-icon" data-management={event.management}><ClockCounterClockwise size={18}/></span>
    <div><strong>{actions[event.action]??event.action}</strong>
     <span><bdi>{event.actor}</bdi>{event.target&&<> · <bdi>{event.target}</bdi></>}</span></div>
    <time dateTime={new Date(event.created_at).toISOString()}>{timeFormat.format(event.created_at)}</time>
   </li>)}</ol>}
 </section>;
}

function ActivityDirectory({revision,onExpired}:LoadProps) {
 const [filters,setFilters]=useState({source:'all',page:1});
 const state=useAdminData<AdminPage<AdminActivity>>(`activity?${new URLSearchParams({...filters,page:String(filters.page)})}`,revision,onExpired);
 return <>
  <DashboardTitle title="Activity" description="Workspace, account and administrator events"/>
  <div className="admin-toolbar admin-activity-filter"><label>Show
   <select value={filters.source} onChange={event=>setFilters({source:event.target.value,page:1})}>
    <option value="all">All activity</option><option value="users">User activity</option><option value="admin">Administrator actions</option>
   </select>
  </label></div>
  <DataFeedback state={state}/>
  {state.data&&<>
   <Activity events={state.data.items}/>
   <Pagination page={filters.page} total={state.data.total} pageSize={state.data.pageSize} onPage={page=>setFilters({...filters,page})}/>
  </>}
 </>;
}

function SearchToolbar({value,onChange,onSearch,placeholder,children}:{value:string;onChange:(value:string)=>void;onSearch:()=>void;placeholder:string;children?:ReactNode}) {
 return <form className="admin-toolbar admin-search-toolbar" onSubmit={event=>{event.preventDefault();onSearch();}}>
  <label className="hub-search"><MagnifyingGlass size={19}/><input type="search" aria-label={placeholder} maxLength={160}
   placeholder={placeholder+'…'} value={value} onChange={event=>onChange(event.target.value)}/></label>
  {children}<button className="button secondary">Search</button>
 </form>;
}
function Pagination({page,total,pageSize,onPage}:{page:number;total:number;pageSize:number;onPage:(value:number)=>void}) {
 const pages=Math.max(1,Math.ceil(total/pageSize));
 return <nav className="admin-pagination" aria-label="Result pages">
  <span>{total.toLocaleString()} results</span>
  {pages>1&&<>
   <button className="icon-button" type="button" aria-label="Previous page" disabled={page<=1} onClick={()=>onPage(page-1)}><ArrowLeft size={18}/></button>
   <span>Page {page} of {pages}</span>
   <button className="icon-button" type="button" aria-label="Next page" disabled={page>=pages} onClick={()=>onPage(page+1)}><ArrowRight size={18}/></button>
  </>}
 </nav>;
}
function UserStatus({user}:{user:AdminUser}){
 return <span className="admin-status" data-verified={user.verified&&!user.suspended} data-suspended={user.suspended}>
  {user.suspended?'Suspended':user.platform_role==='admin'?'Administrator':user.verified?'Verified':'Pending'}
 </span>;
}
function ResourceStatus({resource}:{resource:AdminResource}){
 return <span className="admin-status" data-verified={!resource.archived&&!resource.blocked}>
  {resource.archived?'Archived':resource.blocked?'Parent archived':'Active'}
 </span>;
}

type LoadProps={revision:number;onExpired:()=>Promise<void>};
function UserDirectory({revision,onExpired,onOpen}:LoadProps&{onOpen:(id:string)=>void}) {
 const [query,setQuery]=useState(''),[filters,setFilters]=useState({q:'',page:1,status:'all'});
 const state=useAdminData<{users:AdminUser[];total:number;page:number;pageSize:number}>(`users?${new URLSearchParams({...filters,page:String(filters.page)})}`,revision,onExpired);
 return <>
  <DashboardTitle title="Users" description="Accounts, verification status and resource ownership"/>
  <section className="admin-list" aria-label="Registered users">
   <SearchToolbar value={query} onChange={setQuery} onSearch={()=>setFilters({...filters,q:query.trim(),page:1})} placeholder="Search by name or email">
    <select aria-label="Account status" value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value,page:1})}>
     <option value="all">All statuses</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
    </select>
   </SearchToolbar>
   <DataFeedback state={state}/>
   {state.data&&(state.data.users.length?<div className="admin-table-scroll"><table className="admin-table">
    <thead><tr><th scope="col">Account</th><th scope="col">Status</th><th scope="col">Organizations</th><th scope="col">Projects</th><th scope="col">Workspaces</th><th scope="col">Registered</th></tr></thead>
    <tbody>{state.data.users.map(user=><tr key={user.id}>
     <th scope="row"><button className="admin-row-link" type="button" dir="auto" onClick={()=>onOpen(user.id)}>{user.name}</button><small>{user.login_name??user.email}</small></th>
     <td><UserStatus user={user}/></td><td>{user.owned.organization}</td><td>{user.owned.project}</td><td>{user.owned.space}</td><td>{dateFormat.format(user.created_at)}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-list-message">No matching accounts.</p>)}
   {state.data&&<Pagination page={filters.page} total={state.data.total} pageSize={state.data.pageSize} onPage={page=>setFilters({...filters,page})}/>}
  </section>
 </>;
}

function UserDetails({id,revision,onExpired,busy,mutate,onBack}:LoadProps&{id:string;busy:boolean;mutate:Mutation;onBack:()=>void}) {
 const state=useAdminData<AdminUserDetails>(`users/${id}`,revision,onExpired);
 return <>
  <button type="button" className="text-button admin-back" onClick={onBack}><ArrowLeft size={17}/>Back to users</button>
  <DataFeedback state={state}/>
  {state.data&&<UserRecord key={state.data.user.name} data={state.data} busy={busy} mutate={mutate}/>}
 </>;
}

function UserRecord({data,busy,mutate}:{data:AdminUserDetails;busy:boolean;mutate:Mutation}) {
 const {user,resources,memberships,activity,sessions}=data;
 const [name,setName]=useState(user.name);
 const endpoint=`users/${user.id}`;
 const run=(action:string,confirmText?:string)=>{
  if(!confirmText||window.confirm(confirmText))void mutate(endpoint,{action}).catch(()=>{});
 };
 const children=(parent:string|null)=>resources.filter(resource=>resource.parent_id===parent||
  parent===null&&resource.parent_id!==null&&!resources.some(item=>item.id===resource.parent_id));
 function tree(items:AdminResource[]){
  return <ul>{items.map(item=><li key={item.id}><div><strong dir="auto">{item.name}</strong><span>{kindLabels[item.kind]}</span><ResourceStatus resource={item}/></div>
   {children(item.id).length>0&&tree(children(item.id))}</li>)}</ul>;
 }
 return <>
  <DashboardTitle title={user.name} description={user.login_name??user.email}/>
  <div className="admin-user-columns">
   <section className="admin-list admin-management-card">
    <div className="admin-section-title"><h2>Manage account</h2><UserStatus user={user}/></div>
    <form className="editor-form" onSubmit={event=>{
     event.preventDefault();void mutate(endpoint,{action:'rename',name}).catch(()=>{});
    }}>
     <label>Display name<input required maxLength={160} value={name} onChange={event=>setName(event.target.value)}/></label>
     <button className="button secondary" disabled={busy||!name.trim()||name.trim()===user.name}>Save name</button>
    </form>
    <div className="admin-session-actions">
     {!user.verified&&!user.suspended&&<button type="button" className="button primary" disabled={busy} onClick={()=>run('approve')}>Approve account</button>}
     <p>{sessions} active {sessions===1?'session':'sessions'}</p>
     <button type="button" className="button secondary" disabled={busy||sessions===0} onClick={()=>run('revoke_sessions','Sign this user out of all sessions?')}>Revoke sessions</button>
     {user.platform_role!=='admin'&&<button type="button" className="button secondary" disabled={busy} onClick={()=>user.suspended?run('restore'):run('suspend','Suspend this account and sign it out of all sessions?')}>
      {user.suspended?'Reactivate account':'Suspend account'}
     </button>}
    </div>
   </section>
   <section className="admin-list admin-management-card">
    <h2>Owned resources</h2>
    {resources.length?<div className="admin-owned-tree">{tree(children(null))}</div>:<p>This account owns no resources.</p>}
   </section>
  </div>
  <div className="admin-section-title"><h2>Shared access</h2></div>
  <section className="admin-list" aria-label="Shared access grants">
   {memberships.length?<div className="admin-table-scroll"><table className="admin-table">
    <thead><tr><th scope="col">Granted at</th><th scope="col">Role</th><th scope="col">Manage</th></tr></thead>
    <tbody>{memberships.map(membership=>{
     const target=`${endpoint}/memberships/${membership.id}`;
     return <tr key={membership.id}>
      <th scope="row"><span dir="auto">{membership.name}</span><small>{kindLabels[membership.kind]}{membership.archived?' · Archived':''}</small></th>
      <td><select aria-label={`Role for ${membership.name}`} value={membership.role} disabled={busy}
       onChange={event=>void mutate(target,{action:'change_role',role:event.target.value}).catch(()=>{})}>
       <option value="viewer">Viewer</option><option value="editor">Editor</option>
      </select></td>
      <td><button className="text-button" type="button" disabled={busy} onClick={()=>{
       if(window.confirm('Revoke this access grant? Independent grants will still apply.'))void mutate(target,{action:'revoke'}).catch(()=>{});
      }}>Revoke</button></td>
     </tr>;
    })}</tbody>
   </table></div>:<p className="admin-list-message">This account has no shared access grants.</p>}
  </section>
  <div className="admin-section-title"><h2>Account activity</h2></div>
  <Activity events={activity}/>
 </>;
}

function ResourceDirectory({revision,onExpired,busy,mutate,onOwner}:LoadProps&{busy:boolean;mutate:Mutation;onOwner:(id:string)=>void}) {
 const [query,setQuery]=useState(''),[filters,setFilters]=useState({q:'',page:1,kind:'all',status:'all'});
 const [editing,setEditing]=useState<AdminResource|null>(null);
 const state=useAdminData<AdminPage<AdminResource>>(`resources?${new URLSearchParams({...filters,page:String(filters.page)})}`,revision,onExpired);
 async function save(event:FormEvent){
  event.preventDefault();
  if(!editing)return;
  await mutate(`resources/${editing.id}`,{action:'edit',name:editing.name,description:editing.description});
  setEditing(null);
 }
 return <>
  <DashboardTitle title="Resources" description="Organizations, projects and workspaces across OmniDocs"/>
  <section className="admin-list" aria-label="Workspace inventory">
   <SearchToolbar value={query} onChange={setQuery} onSearch={()=>setFilters({...filters,q:query.trim(),page:1})} placeholder="Search resource or owner">
    <select aria-label="Resource kind" value={filters.kind} onChange={event=>setFilters({...filters,kind:event.target.value,page:1})}>
     <option value="all">All types</option><option value="organization">Organizations</option><option value="project">Projects</option><option value="space">Workspaces</option>
    </select>
    <select aria-label="Resource status" value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value,page:1})}>
     <option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option>
    </select>
   </SearchToolbar>
   <DataFeedback state={state}/>
   {state.data&&(state.data.items.length?<div className="admin-table-scroll"><table className="admin-table">
    <thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Manage</th></tr></thead>
    <tbody>{state.data.items.map(resource=><tr key={resource.id}>
     <th scope="row"><span dir="auto">{resource.name}</span>{resource.parent_name&&<small dir="auto">{resource.parent_name}</small>}</th>
     <td>{kindLabels[resource.kind]}</td>
     <td><button type="button" className="admin-row-link" onClick={()=>onOwner(resource.owner_id)}>{resource.owner_name}</button><small>{resource.owner_email}</small></td>
     <td><ResourceStatus resource={resource}/></td>
     <td><div className="admin-resource-actions">
      <button type="button" className="text-button" disabled={busy} onClick={()=>setEditing(resource)}>Edit</button>
      {(resource.archived||!resource.blocked)&&<button type="button" className="text-button" disabled={busy} onClick={()=>{
       if(resource.archived||window.confirm('Archive this resource? Access to it and its descendants will be paused.')){
        void mutate(`resources/${resource.id}`,{action:resource.archived?'restore':'archive'}).catch(()=>{});
       }
      }}>{resource.archived?'Restore':'Archive'}</button>}
     </div></td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-list-message">No matching resources.</p>)}
   {state.data&&<Pagination page={filters.page} total={state.data.total} pageSize={state.data.pageSize} onPage={page=>setFilters({...filters,page})}/>}
  </section>
  {editing&&<section className="admin-list admin-management-card admin-resource-edit">
   <h2>Edit {kindLabels[editing.kind].toLowerCase()} details</h2>
   <form className="editor-form" onSubmit={event=>void save(event).catch(()=>{})}>
    <label>Name<input autoFocus required maxLength={160} value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
    <label>Description<textarea required maxLength={2000} value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
    <div className="admin-resource-actions"><button className="button primary" disabled={busy}>Save details</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div>
   </form>
  </section>}
 </>;
}
