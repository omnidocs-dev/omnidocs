import {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ClockCounterClockwise, X} from '@phosphor-icons/react';
import {compareSnapshots, type CanvasChanges, type ModelChange} from '../shared/history-diff';
import {compileModel, type SourceFile} from '../shared/model';

type Version = {id:string; title:string; author:string; revision:string; version:number; presentation:number;
 created_at:number|string; parent_id:string|null; proposal_id:string|null};
type Proposal = {id:string; title:string; author:string; revision:string; state:string; presentation:number;
 created_at:number|string; base_id:string; parent_id:string|null};
type History = {versions:Version[]; proposals:Proposal[]; canManage:boolean; reviewRequired:boolean; reviewers:string[]};
type Entry = (Version & {kind:'versions'}) | (Proposal & {kind:'proposals'});
type Event = {id:string; action:string; actor:string; note:string; created_at:number|string};
type Detail = {before:SourceFile[]; after:SourceFile[]; events?:Event[]; stale?:boolean; canReview?:boolean; canRebase?:boolean};
export type HistoryPreview = {key:string; title:string; files:SourceFile[]; changes:CanvasChanges; side:'before'|'after'};
type Action = 'approve'|'request_changes'|'comment'|'rebase';

const statusLabels:Record<string,string> = {
 pending:'In review', changes_requested:'Changes requested', published:'Published', superseded:'Superseded',
 approved:'Approved', submitted:'Submitted', comment:'Commented', rebased:'Updated against latest version',
};

function formatDate(time:number|string) {
 return new Date(Number(time)).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
}

function valueText(value:unknown) {
 if (value === null || value === undefined) return '—';
 return typeof value === 'string' ? value : JSON.stringify(value,null,2);
}

async function request<T>(url:string, token?:string|null, payload?:unknown):Promise<T> {
 const response = await fetch(url,payload===undefined?undefined:{
  method:'POST',headers:{'content-type':'application/json','x-omnidocs-token':token ?? ''},body:JSON.stringify(payload),
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error ?? 'Unable to load change history.');
 return result;
}

export function SpaceHistory({spaceId,token,onClose,onPreview,onPublished,initialProposal}:{
 spaceId:string; token:string|null; onClose:()=>void;
 onPreview:(preview:HistoryPreview|null,viewId?:string)=>void;
 onPublished:(required:boolean)=>void;
 initialProposal?:string;
}) {
 const [history,setHistory]=useState<History|null>(null);
 const [selected,setSelected]=useState(initialProposal ?? '');
 const [loaded,setLoaded]=useState<{endpoint:string;data:Detail}|null>(null);
 const [side,setSide]=useState<'before'|'after'>('after');
 const [filter,setFilter]=useState<'all'|'architecture'|'layout'|'review'>('all');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [note,setNote]=useState('');
 const [reviewerText,setReviewerText]=useState('');
 const [requiredDraft,setRequiredDraft]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const endpoint=`/api/spaces/${encodeURIComponent(spaceId)}/history`;

 useEffect(()=>{
  let active=true;
  request<History>(endpoint).then(data=>{
   if (!active) return;
   setHistory(data);
   setReviewerText(data.reviewers.join(', '));
   setRequiredDraft(data.reviewRequired);
  }).catch(error=>{if(active)setError(error.message);});
  return ()=>{active=false;};
 },[endpoint,refresh]);

 const entries=useMemo<Entry[]>(()=>history ? [
  ...history.versions.map(version=>({...version,kind:'versions' as const})),
  ...history.proposals.map(proposal=>({...proposal,kind:'proposals' as const})),
 ].sort((a,b)=>Number(b.created_at)-Number(a.created_at)
  || (a.kind==='versions' && b.kind==='versions' ? b.version-a.version : a.kind===b.kind ? a.id.localeCompare(b.id) : a.kind==='versions' ? -1 : 1)) : [],[history]);
 const list=entries.filter(entry=>filter==='all' || (filter==='review' ? entry.kind==='proposals'
  : filter==='layout' ? Boolean(entry.presentation) : !entry.presentation && entry.kind==='versions'));
 const entry=list.find(item=>item.id===selected) ?? list[0];
 const detailEndpoint=entry ? `${endpoint}/${entry.kind}/${entry.id}` : '';
 const detail=loaded?.endpoint===detailEndpoint ? loaded.data : null;
 const index=entry?list.findIndex(item=>item.id===entry.id):-1;
 const base=history?.versions.find(version=>version.id===(entry?.kind==='proposals'?entry.base_id:entry?.parent_id));
 const related=entry?.kind==='proposals' ? history?.proposals.find(proposal=>proposal.id===entry.parent_id)
  : history?.proposals.find(proposal=>proposal.id===entry?.proposal_id);

 useEffect(()=>{
  if (!detailEndpoint) return;
  let active=true;
  request<Detail>(detailEndpoint).then(data=>{if(active)setLoaded({endpoint:detailEndpoint,data});})
   .catch(error=>{if(active)setError(error.message);});
  return ()=>{active=false;};
 },[detailEndpoint,refresh]);

 const diff=useMemo(()=>detail && compareSnapshots(detail.before,detail.after),[detail]);
 const views=useMemo(()=>detail && new Map([...compileModel(detail.before).views,...compileModel(detail.after).views]
  .map(view=>[view.id,view.name])),[detail]);
 const changesByView=useMemo(()=>{
  const map=new Map<string,ModelChange[]>();
  for (const change of diff?.changes ?? []) {
   const key=change.afterViews[0] ?? change.beforeViews[0] ?? '';
   map.set(key,[...(map.get(key)??[]),change]);
  }
  return [...map.entries()];
 },[diff]);

 function makePreview(snapshot:'before'|'after'):HistoryPreview|null {
  if(!detail||!entry||!diff) return null;
  const changes:CanvasChanges={items:{},relations:{},layouts:{},viewItems:{}};
  for (const change of diff.changes) {
   if (change.kind==='item') changes.items[change.id]=change.change;
   if (change.kind==='relationship' || change.kind==='connection points') changes.relations[change.id]=change.change;
   if (change.kind==='layout') {
    const positions=change.fields.find(field=>field.field==='positions');
    const before=(positions?.before ?? {}) as Record<string,unknown>;
    const after=(positions?.after ?? {}) as Record<string,unknown>;
    changes.layouts[change.id]=Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])]
     .filter(id=>JSON.stringify(before[id])!==JSON.stringify(after[id])).map(id=>[id,'updated']));
   }
   if (change.kind==='view') {
    const membership=change.fields.find(field=>field.field==='nodes');
    const before=new Set((membership?.before ?? []) as string[]);
    const after=new Set((membership?.after ?? []) as string[]);
    const visible=snapshot==='before'?[...before].filter(id=>!after.has(id)):[...after].filter(id=>!before.has(id));
    changes.viewItems[change.id]=Object.fromEntries(visible.map(id=>[id,snapshot==='before'?'removed':'added']));
   }
  }
  return {key:`${entry.id}:${snapshot}`,title:entry.title,files:detail[snapshot],changes,side:snapshot};
 }
 useEffect(()=>{
  onPreview(makePreview(side));
 },[detail,entry,side,onPreview]);

 function select(id:string) {
  setSelected(id);setSide('after');setError('');setNote('');
 }
 function reveal(change:ModelChange) {
  const snapshot=change.change==='removed'?'before':change.change==='added'?'after':side;
  const preview=makePreview(snapshot);
  if(!preview)return;
  setSide(snapshot);
  onPreview(preview,(snapshot==='before'?change.beforeViews:change.afterViews)[0]);
 }
 async function mutate(action:Action) {
  if (!entry||busy) return;
  setBusy(true);setError('');
  try {
   const result=await request<{id?:string}>(detailEndpoint,token,{action,revision:entry.revision,note});
   if(result.id)select(result.id);
   setNote('');
   setRefresh(value=>value+1);
   if(action==='approve')onPublished(history?.reviewRequired??false);
  }catch(error){setError(error instanceof Error?error.message:'Unable to update this request.');}
  finally{setBusy(false);}
 }
 async function saveSettings(required:boolean) {
  setBusy(true);setError('');
  try {
   const emails=reviewerText.split(/[\s,;]+/).filter(Boolean);
   await request(`${endpoint}/settings`,token,{required,emails});
   setRefresh(value=>value+1);onPublished(required);
  }catch(error){setError(error instanceof Error?error.message:'Unable to save settings.');}
  finally{setBusy(false);}
 }

 return <aside className="inspector space-history" aria-label="Change history">
  <div className="history-title"><ClockCounterClockwise size={19}/><strong>Change history</strong><button type="button" className="icon-button" aria-label="Close history" onClick={onClose}><X size={17}/></button></div>
  <div className="history-scroll">
   {error && <p className="editor-error" role="alert">{error}</p>}
   {history?.canManage && <details className="history-settings">
    <summary>Review settings · {history.reviewRequired?'Required':'Optional'}</summary>
    <p>Owners and designated editors can review other people’s changes.</p>
    <label>Reviewer emails<input value={reviewerText} placeholder="editor@example.com" onChange={event=>setReviewerText(event.target.value)}/></label>
    <label className="history-review-toggle"><input type="checkbox" checked={requiredDraft} onChange={event=>setRequiredDraft(event.target.checked)}/>Require review before publishing</label>
    <button type="button" className="button secondary" disabled={busy} onClick={()=>void saveSettings(requiredDraft)}>Save review settings</button>
   </details>}
   <div className="history-filters" role="group" aria-label="Filter change history">
    {(['all','architecture','layout','review'] as const).map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>{setError('');setFilter(value);setSide('after');}}>{value}</button>)}
   </div>
   <div className="history-stepper">
    <button type="button" className="icon-button" title="Older change" aria-label="Older change" disabled={index<0||index+1>=list.length} onClick={()=>select(list[index+1].id)}><ArrowLeft size={16}/></button>
    <span>{index>=0?`${index+1} / ${list.length}`:'—'}</span>
    <button type="button" className="icon-button" title="Newer change" aria-label="Newer change" disabled={index<=0} onClick={()=>select(list[index-1].id)}><ArrowRight size={16}/></button>
   </div>
   <ol className="history-timeline">
    {list.map(item=><li key={item.id}><button type="button" aria-current={item.id===entry?.id?'step':undefined} onClick={()=>select(item.id)}>
     <span>{item.kind==='versions'?`v${item.version}`:statusLabels[item.state]}{item.presentation?' · Layout':''}</span>
     <strong dir="auto">{item.title}</strong><small>{item.author} · {formatDate(item.created_at)}</small>
    </button></li>)}
   </ol>
   {!history && !error && <p role="status">Loading history…</p>}
   {history && !list.length && <p>No changes under this filter.</p>}
   {entry && !detail && !error && <p role="status">Loading this version…</p>}
   {detail && diff && <section className="history-detail" aria-label="Selected change">
    {base && <p>Based on v{base.version}{related && <> · <button type="button" className="text-button" onClick={()=>{setFilter('all');select(related.id);}}>{entry?.kind==='proposals'?'Previous request':'Review activity'}</button></>}</p>}
    <div className="history-compare" role="group" aria-label="Canvas version">
     <button type="button" aria-pressed={side==='before'} onClick={()=>setSide('before')}>Before</button>
     <button type="button" aria-pressed={side==='after'} onClick={()=>setSide('after')}>After</button>
    </div>
    <p className="history-key"><span data-difference="added">Added</span><span data-difference="updated">Updated</span><span data-difference="removed">Removed</span></p>
    <h3>Change tree</h3>
    {!diff.changes.length && <p>{diff.files.length?'Document changes only.':'Initial workspace snapshot.'}</p>}
    {changesByView.map(([viewId,changes])=><details className="history-tree" open key={viewId}>
     <summary dir="auto">{views?.get(viewId) ?? 'Workspace'} <small>{changes.length}</small></summary>
     {changes.map(change=><details className="history-tree-item" key={`${change.kind}:${change.id}`}>
      <summary><span data-difference={change.change}>{change.change}</span> <span dir="auto">{change.name}</span><small>{change.kind}</small></summary>
      {!!(change.beforeViews.length||change.afterViews.length) && <button type="button" className="text-button" onClick={()=>reveal(change)}>Show on canvas</button>}
      {change.fields.map(field=><div key={field.field} className="history-field">
       <strong>{field.field}</strong><pre dir="auto" data-difference="removed">{valueText(field.before)}</pre>
       <pre dir="auto" data-difference="added">{valueText(field.after)}</pre>
      </div>)}
     </details>)}
    </details>)}
    {!!diff.files.length && <details className="history-tree">
     <summary>Markdown files <small>{diff.files.length}</small></summary>
     {diff.files.map(file=><details key={file.path} className="history-tree-item">
      <summary>{file.path}</summary>
      <div className="history-field"><strong>Before</strong><pre dir="auto">{valueText(file.before)}</pre><strong>After</strong><pre dir="auto">{valueText(file.after)}</pre></div>
     </details>)}
    </details>}
    {!!detail.events?.length && <ol className="history-events">{detail.events.map(event=><li key={event.id}>
     <strong>{statusLabels[event.action] ?? event.action}</strong><small>{event.actor} · {formatDate(event.created_at)}</small>{event.note&&<p dir="auto">{event.note}</p>}
    </li>)}</ol>}
    {entry?.kind==='proposals' && entry.state==='pending' && <>
     {detail.stale && <p>The published version has advanced. Update this request before approval.</p>}
     <label className="history-note">Review note<textarea rows={2} value={note} onChange={event=>setNote(event.target.value)}/></label>
     <div className="history-review-actions">
      <button type="button" className="button secondary" disabled={busy||!note.trim()} onClick={()=>void mutate('comment')}>Comment</button>
      {detail.canRebase && <button type="button" className="button secondary" disabled={busy} onClick={()=>void mutate('rebase')}>Update request</button>}
      {detail.canReview && <><button type="button" className="button secondary" disabled={busy||!note.trim()} onClick={()=>void mutate('request_changes')}>Request changes</button>
       <button type="button" className="button primary" disabled={busy||detail.stale} onClick={()=>void mutate('approve')}><Check size={16}/>Approve & publish</button></>}
     </div>
    </>}
   </section>}
  </div>
 </aside>;
}
