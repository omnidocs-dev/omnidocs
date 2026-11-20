import type {ReactNode} from 'react';
import {ArrowRight,Buildings,FolderSimple,ShieldCheck,Stack} from '@phosphor-icons/react';
import brand from './assets/brand/omnidocs-mark.svg';
import {freePlanLimits} from '../shared/free-plan';

export function AccountFrame({title,description,admin=false,children}:{
 title:string;description?:string;admin?:boolean;children:ReactNode;
}) {
 return <main className={`account-shell service-auth ${admin?'account-admin':''}`}>
  <div className="account-paper">
   <section className="account-entry" aria-labelledby="account-heading">
    <a className="account-brand" href={admin?'/admin/':'#/login'}>
     <img src={brand} width={38} height={38} alt=""/><strong>omnidocs.</strong>
    </a>
    <h1 id="account-heading">{title}</h1>
    {description&&<p className="account-description">{description}</p>}
    {children}
   </section>
   <aside className="account-aside" aria-label={admin?'Administrator console':'Free plan'}>
    {admin ? <><ShieldCheck size={64} weight="duotone" aria-hidden="true"/>
     <h2>Administrator console</h2><p>Manage accounts, workspace access and resources.</p></>
    : <>
     <h2>Your architecture,<br/>in one place.</h2>
     <ol className="account-structure">
      <li><Buildings size={23} weight="duotone"/><span>{freePlanLimits.organization} organization</span></li>
      <li><ArrowRight className="account-connector" aria-hidden="true"/><FolderSimple size={23} weight="duotone"/><span>{freePlanLimits.project} projects</span></li>
      <li><ArrowRight className="account-connector" aria-hidden="true"/><Stack size={23} weight="duotone"/><span>{freePlanLimits.space} workspaces</span></li>
     </ol>
     <p>Included in every Free account.</p>
    </>}
   </aside>
  </div>
 </main>;
}
