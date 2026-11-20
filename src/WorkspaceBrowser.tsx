import {useState} from 'react';
import {freePlanLimitMessage,type ResourceKind} from '../shared/free-plan';
import {Buildings,FolderSimple,Stack,Plus,MagnifyingGlass,CaretRight,CaretDown,ArrowUpRight,Users,ArrowsClockwise,House,LockSimple,Eye,UploadSimple} from '@phosphor-icons/react';
export type Resource={id:string;kind:ResourceKind;parent_id:string|null;name:string;description:string;role:'owner'|'editor'|'viewer'|null;via:{id:string;name:string;role:string}[]};
export const resourceIcons={organization:Buildings,project:FolderSimple,space:Stack};
export function WorkspaceBrowser({resources,busy,remaining,onCreate,onImport,onOpen,onAccess,onRefresh}:{resources:Resource[];busy:boolean;remaining:Record<ResourceKind,number>;onCreate:(kind:Resource['kind'],parentId?:string)=>void;onImport:(project:Resource)=>void;onOpen:(id:string)=>void;onAccess:(resource:Resource)=>void;onRefresh:()=>void}){
 const [selectedId,setSelectedId]=useState<string|null>(null),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[query,setQuery]=useState('');
 const selected=resources.find(r=>r.id===selectedId),children=(id:string|null)=>resources.filter(r=>r.parent_id===id);
 const chain:Resource[]=[];let current=selected;const visited=new Set<string>();while(current&&!visited.has(current.id)){visited.add(current.id);chain.unshift(current);current=resources.find(r=>r.id===current?.parent_id);}
 const term=query.trim().toLocaleLowerCase();
 const matches=resources.filter(r=>`${r.name} ${r.description}`.toLocaleLowerCase().includes(term));
 const shown=term?matches:children(selected?.id??null);
 const nextKind=selected?.kind==='organization'?'project':selected?.kind==='project'?'space':!selected?'organization':null;
 const showCreate=nextKind&&!term&&(!selected||selected.role==='owner');
 const quotaReached=showCreate ? remaining[nextKind]===0 : false;
 const Icon=selected?resourceIcons[selected.kind]:Buildings;
 function select(id:string|null){setSelectedId(id);setQuery('');}
 function tree(resource:Resource){const childKind=resource.kind==='organization'?'project':'space';
  const descendants=children(resource.id),expanded=!!term||!collapsed.has(resource.id),NodeIcon=resourceIcons[resource.kind];
  if(term&&!matches.some(r=>r.id===resource.id||r.parent_id===resource.id||resources.find(p=>p.id===r.parent_id)?.parent_id===resource.id))return null;
  return <li key={resource.id} className={`hub-tree-item tree-${resource.kind}`}><div className={`hub-tree-row ${selected?.id===resource.id?'is-selected':''}`}>
   {descendants.length>0?<button className="hub-disclosure" aria-label={`${expanded?'Collapse':'Expand'} ${resource.name}`} aria-expanded={expanded} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);next.has(resource.id)?next.delete(resource.id):next.add(resource.id);return next;})}>{expanded?<CaretDown/>:<CaretRight/>}</button>:<span className="hub-tree-spacer"/>}
   <button className="hub-tree-label" onClick={()=>select(resource.id)} aria-current={selected?.id===resource.id?'page':undefined}><span className={`hub-tree-icon kind-${resource.kind}`}><NodeIcon weight="duotone"/></span><span className="hub-tree-name" dir="auto" title={resource.name}>{resource.name}</span>{descendants.length>0&&<small aria-label={`${descendants.length} ${resource.kind==='organization'?'projects':'spaces'}`}>{descendants.length}</small>}</button>
   {resource.role==='owner'&&resource.kind!=='space'&&<button className="hub-tree-action" aria-label={`New ${resource.kind==='organization'?'project':'space'} in ${resource.name}`} title={remaining[childKind]===0?freePlanLimitMessage(childKind):`New ${childKind}`} disabled={busy||remaining[childKind]===0} onClick={()=>onCreate(childKind,resource.id)}><Plus size={15}/></button>}
   {resource.kind==='space'&&resource.role&&<button className="hub-tree-action" aria-label={`${resource.role==='viewer'?'View':'Open'} ${resource.name}`} title={resource.role==='viewer'?'View diagrams':'Open editor'} onClick={()=>onOpen(resource.id)}><ArrowUpRight size={15}/></button>}
  </div>{expanded&&descendants.length>0&&<ul>{descendants.map(tree)}</ul>}</li>;
 }
 return <section className="hub-browser" aria-label="Workspace browser">
  <aside className="hub-nav"><div className="hub-nav-title"><strong>Explorer</strong><button className="hub-icon-button" aria-label="Refresh projects and invitations" disabled={busy} onClick={onRefresh}><ArrowsClockwise size={18}/></button></div>
   <button className={`hub-all ${!selected?'is-selected':''}`} onClick={()=>select(null)}><House size={19}/>All organizations<span>{children(null).length}</span></button>
   <nav aria-label="Organizations, projects and spaces"><ul className="hub-tree">{children(null).map(tree)}</ul></nav>
   <button className="hub-nav-create" title={remaining.organization===0?freePlanLimitMessage('organization'):undefined} disabled={busy||remaining.organization===0} onClick={()=>onCreate('organization')}><Plus size={18}/>New organization</button>
   <p className="hub-nav-note"><LockSimple size={16}/>Only people you invite can access your work.</p>
  </aside>
  <div className="hub-content"><div className="hub-toolbar"><nav className="hub-breadcrumb" aria-label="Workspace path"><button onClick={()=>select(null)}>Organizations</button>{chain.map(r=><span key={r.id}><CaretRight size={12}/><button onClick={()=>select(r.id)} aria-current={r.id===selected?.id?'page':undefined} dir="auto">{r.name}</button></span>)}</nav><label className="hub-search"><MagnifyingGlass size={19}/><input aria-label="Search organizations, projects and spaces" placeholder="Find a project or space…" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}>×</button>}</label></div>
   <div className="hub-location"><div className={`hub-kind-icon kind-${selected?.kind??'organization'}`}><Icon size={30} weight="duotone"/></div><div><h2 dir="auto">{term?'Search results':selected?.name??'Your organizations'}</h2><p dir="auto">{term?`${shown.length} matches across your workspace`:selected?.description??'Give every team a home. Keep projects together and documentation spaces independent.'}</p></div></div>
   {selected&&<div className="hub-context"><span className="service-role">{selected.role??'Shared descendant'}</span><span>{selected.kind}</span>{selected.role==='owner'&&<button className="text-button" onClick={()=>onAccess(selected)}><Users size={17}/>Manage access</button>}{selected.via.some(v=>v.id!==selected.id)&&<span className="hub-inherited">Access inherited from {selected.via.filter(v=>v.id!==selected.id).map(v=>v.name).join(', ')}</span>}</div>}
   {selected?.kind==='space'&&!term?<div className="hub-space-detail"><Stack size={48} weight="duotone"/><h3>Your architecture starts here</h3><p>Open this space to explore diagrams, connect elements and edit your documentation.</p>{selected.role&&<button className="button primary" onClick={()=>onOpen(selected.id)}>{selected.role==='viewer'?<Eye size={19}/>:<ArrowUpRight size={19}/>} {selected.role==='viewer'?'View diagrams':'Open editor'}</button>}{selected.role==='owner'&&<button className="text-button" onClick={()=>onAccess(selected)}>Invite people or create a viewing link</button>}</div>:<>
    <div className="hub-section-heading"><h3>{term?'Matching items':selected?.kind==='organization'?'Projects':selected?.kind==='project'?'Spaces':'Organizations'} <span>{shown.length}</span></h3><div className="hub-section-actions">{selected?.kind==='project'&&showCreate&&<button type="button" className="button secondary" disabled={busy||quotaReached} title={quotaReached?freePlanLimitMessage('space'):undefined} onClick={()=>onImport(selected)}><UploadSimple size={18}/>Import workspace</button>}{showCreate&&<button className="button primary" disabled={busy||quotaReached} title={quotaReached?freePlanLimitMessage(nextKind):undefined} onClick={()=>onCreate(nextKind,selected?.id)}><Plus size={18}/>New {nextKind}</button>}</div></div>
    {nextKind&&quotaReached&&<p className="hub-quota-note">{freePlanLimitMessage(nextKind)}</p>}
    <div className="hub-grid">{shown.map(resource=>{const ItemIcon=resourceIcons[resource.kind],parent=resources.find(r=>r.id===resource.parent_id),count=children(resource.id).length;return <article className={`hub-card kind-${resource.kind}`} key={resource.id}>
     <div className="hub-card-top"><div className={`hub-kind-icon kind-${resource.kind}`}><ItemIcon size={25} weight="duotone"/></div><span className="service-role">{resource.role??'Shared descendant'}</span></div>
     <button className="hub-card-name" onClick={()=>select(resource.id)} dir="auto">{resource.name}</button><p dir="auto">{resource.description}</p>{term&&parent&&<small className="hub-result-parent" dir="auto">{parent.name} / {resource.kind}</small>}
     <div className="hub-card-footer"><span>{resource.kind==='space'?'Independent space':`${count} ${resource.kind==='organization'?(count===1?'project':'projects'):(count===1?'space':'spaces')}`}</span>{resource.kind==='space'&&resource.role?<button onClick={()=>onOpen(resource.id)}>{resource.role==='viewer'?'View diagrams':'Open editor'}<ArrowUpRight size={17}/></button>:<button onClick={()=>select(resource.id)}>Explore<CaretRight size={16}/></button>}</div>
    </article>;})}{showCreate&&!quotaReached&&<button className="hub-create-card" disabled={busy} onClick={()=>onCreate(nextKind,selected?.id)}><span><Plus size={25}/></span><strong>New {nextKind}</strong><p>{nextKind==='organization'?'A home for your team and projects':nextKind==='project'?'Group spaces around one application':'An independent home for your diagrams'}</p></button>}</div>
    {!shown.length&&term&&<div className="hub-no-results"><MagnifyingGlass size={32}/><h3>No matching items</h3><p>Try a different name or description.</p><button className="text-button" onClick={()=>setQuery('')}>Clear search</button></div>}
   </>}
  </div>
 </section>;
}
