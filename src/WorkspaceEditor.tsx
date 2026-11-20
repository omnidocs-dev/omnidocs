import {ViewLevelPicker} from './ViewLevelPicker';
import {TechnologyField} from './TechnologyField';
import {ItemTypePicker} from './ItemTypePicker';
import {abstractionLevel} from '../shared/ownership-frames';
import {existingViewCandidates} from '../shared/view-membership';
import {createPortal} from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { PencilSimple, Plus, GitBranch, FloppyDisk, X, Trash, ArrowCounterClockwise, Path, PlusCircle, FolderSimple, Cube, ArrowDownRight } from '@phosphor-icons/react';
import { planEntityDeletion } from '../shared/entity-deletion';
import { viewDocumentMoves } from '../shared/organize-views';
import { elementTypes, elementKind, typesForView, typeForEntity, componentScopes } from '../shared/element-types';
import { prepareEdits } from '../shared/edit-model';
import { fileChanges, workspaceRevision, type EditCommand } from '../shared/edit-contract';
import type { Model, SourceFile, View } from '../shared/model';
import { childView, compileModel, relationsForView } from '../shared/model';
import { saveDirectory, ensureDirectoryWritable } from './folder-write';

export type EditorRequest = {nonce: number; action: 'edit'|'delete'|'add'|'next'|'connect'|'include'; id?:string; viewId?:string;level?:string};
export type ConnectionRequest = { source: string; target: string; viewId: string; sourceHandle?:string;targetHandle?:string };
export type LayoutRequest=Extract<EditCommand,{op:'layout.save'}>&{nonce:number};
type FormCommand = Exclude<EditCommand, { op: 'relation.delete' | 'view.create' | 'workspace.organize' | 'entity.delete' | 'layout.save' | 'view.include' | 'flow.create' }>;
type Props = {reviewRequired?:boolean; onSubmitted?:(id:string)=>void; toolboxTarget?:HTMLElement|null;readOnlyReason?:string; files: SourceFile[]; model: Model; view: View; selection: string | null; editing: boolean; connecting: boolean; onConnecting: (value: boolean) => void; directoryHandle: FileSystemDirectoryHandle | null; onConnectFolder: () => void; apiToken: string | null; spaceId: string | null; onViewCreated: (id: string) => void; layoutRequest:LayoutRequest|null; onLayoutError:(message:string)=>void; request: EditorRequest | null; connection: ConnectionRequest | null; onEditing: (value: boolean) => void; onPreview: (files: SourceFile[]) => void; onSaved: (files: SourceFile[], message: string, keepEditing?: boolean,presentationOnly?:boolean) => void };
export function WorkspaceEditor(props: Props) {
 const { files, model, view, selection, editing } = props;
 const [base, setBase] = useState<SourceFile[]>(files), [commands, setCommands] = useState<EditCommand[]>([]);
 const [autoSavePreference, setAutoSave] = useState(!!(props.apiToken || props.directoryHandle));
 const autoSave = autoSavePreference && !props.reviewRequired;
 const [reviewTitle, setReviewTitle] = useState('');
 const [form, setForm] = useState<FormCommand | null>(null), [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
 const [viewForm, setViewForm] = useState<{scope: string; name: string; description: string} | null>(null);
 const [flowForm,setFlowForm]=useState<{name:string;description:string}|null>(null);
 const [includeForm,setIncludeForm]=useState<{viewId:string;ids:string[];query:string;level?:string}|null>(null);
 const [deleteId,setDeleteId]=useState<string|null>(null);
 const deletion=deleteId?planEntityDeletion(model,deleteId):null;
 const scopes = componentScopes(model);
 const processedLayout=useRef<LayoutRequest|null>(null);
 const dialog = useRef<HTMLDialogElement>(null), processedRequest = useRef<EditorRequest|null>(null);
 const changes = editing ? fileChanges(base, files) : [];
 useEffect(() => { if ((form || review || viewForm || deletion || includeForm || flowForm) && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [form, review, viewForm, deleteId,includeForm,flowForm]);
 useEffect(() => {
  if (!editing || (!commands.length && !busy)) return;
  const pending = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', pending); return () => window.removeEventListener('beforeunload', pending);
 }, [editing, commands.length, busy]);
 useEffect(() => { if (props.connection && editing) openRelation(props.connection); }, [props.connection]);
 const selectedEntity = model.entities.find(entity => entity.id === selection), selectedRelation = model.relations.find(relation => relation.id === selection);
 useEffect(() => {
  if (!editing || (!selectedRelation && !selectedEntity) || busy || form || review || viewForm || deletion || includeForm || flowForm || props.connecting) return;
  const remove = (event: KeyboardEvent) => {
   if (!['Delete','Backspace'].includes(event.key) || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
   const target = event.target;
   if (target instanceof Element && (target.closest('input,textarea,select,dialog') || (target as HTMLElement).isContentEditable)) return;
   event.preventDefault(); if(selectedRelation)removeSelectedConnection();else if(selectedEntity)setDeleteId(selectedEntity.id);
  };
  window.addEventListener('keydown', remove); return () => window.removeEventListener('keydown', remove);
 }, [editing, selectedEntity, selectedRelation, busy, form, review, viewForm, deleteId, includeForm, flowForm, props.connecting, commands, base, model, view]);
 useEffect(()=>{
  const request=props.request;if(!request||processedRequest.current===request)return;
  if(busy){processedRequest.current=request;return;}
  if(request.id&&!model.entities.some(item=>item.id===request.id)&&!model.relations.some(item=>item.id===request.id)){processedRequest.current=request;return;}
  if(!editing){if(!props.apiToken&&!props.directoryHandle){processedRequest.current=request;props.onConnectFolder();return;}begin();return;}
  processedRequest.current=request;
  if(request.action==='edit'){if(selectedRelation)openRelation();else openEntity(true);}
  if(request.action==='delete'){if(selectedEntity)setDeleteId(selectedEntity.id);else if(selectedRelation)removeSelectedConnection();}
  if(request.action==='add')openEntity(false,request.viewId);
  if(request.action==='include')openInclude(request.viewId,request.level);
  if(request.action==='next')nextLevel();
  if(request.action==='connect')props.onConnecting(true);
 },[props.request,editing]);
 useEffect(()=>{
  const request=props.layoutRequest;if(!request||processedLayout.current===request||busy)return;processedLayout.current=request;
  const {nonce:_nonce,...command}=request;void apply(command);
 },[props.layoutRequest,busy]);
 const ids = () => `studio.${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`;
 function begin() { if(props.readOnlyReason)return; if (!props.apiToken && !props.directoryHandle) { props.onConnectFolder(); return; } setBase(files); setCommands([]); setError(''); setMessage(''); props.onEditing(true); }
 function closeDialog() { setFlowForm(null);setIncludeForm(null);setDeleteId(null); setViewForm(null); setForm(null); setReview(false); setError(''); dialog.current?.close(); }
 function targetView(entityId?: string) {
  if (entityId && !view.nodes.includes(entityId)) return model.views.find(candidate => candidate.nodes.includes(entityId)) ?? view;
  return view;
 }
 function openInclude(viewId=view.id,level?:string){props.onConnecting(false);setError('');setIncludeForm({viewId,ids:[],query:'',level});}
 function openEntity(update = false, requestedViewId?:string) {
  if(!update&&view.layout==='levels'){openInclude();return;}
  props.onConnecting(false);
  const entity = update ? selectedEntity : undefined, target = model.views.find(view=>view.id===requestedViewId) ?? targetView(entity?.id);
  const kind = entity?.kind ?? (target.type === 'context' ? 'person' : target.type === 'container' ? 'container' : target.type === 'component' ? 'component' : target.type === 'code' ? 'code' : 'deployment');
  setError(''); setForm({ op: entity ? 'entity.update' : 'entity.create', id: entity?.id ?? ids(), viewId: target.id, kind, ...(entity ? { elementType: typeForEntity(entity) } : {}), name: entity?.name ?? '', description: entity?.description ?? '', technology: entity?.technology ?? '' });
 }
 function openRelation(request?: ConnectionRequest) {
  const relation = request ? undefined : selectedRelation;
  const target = request ? model.views.find(view => view.id === request.viewId)! : relation ? model.views.find(candidate => candidate.id === view.id && candidate.nodes.includes(relation.source) && candidate.nodes.includes(relation.target)) ?? model.views.find(candidate => candidate.nodes.includes(relation.source) && candidate.nodes.includes(relation.target)) ?? view : view;
  setError(''); setForm({ op: relation ? 'relation.update' : 'relation.create', id: relation?.id ?? ids(), viewId: target.id, source: request?.source ?? relation?.source ?? target.nodes[0] ?? '', target: request?.target ?? relation?.target ?? target.nodes[1] ?? '', label: relation?.label ?? '', protocol: relation?.protocol ?? '',...(request?.sourceHandle?{sourceHandle:request.sourceHandle,targetHandle:request.targetHandle}:{}) });
 }
 async function apply(command: EditCommand) {
  if(props.readOnlyReason)return;
  if (busy) return;
  setError('');
  try {
   const writable = props.apiToken || props.directoryHandle;
   if (command.op === 'layout.save' && editing && commands.length && !autoSave && writable &&
    compileModel(base).views.some(view => view.id === command.viewId)) {
    // Save presentation independently while keeping pending architecture changes in the draft.
    const pending = commands.filter(change => change.op !== 'layout.save' || change.key !== command.key);
    setBusy(true);
    const result = await persist([command], base);
    setBase(result.files);
    setCommands(pending);
    const draft = pending.length ? prepareEdits(result.files, pending).files : result.files;
    props.onSaved(draft, 'Layout saved · draft kept', true, true);
    return;
   }
   const original=editing?base:files,next = editing?[...commands,command]:[command], prepared = prepareEdits(original, next);
   if ((autoSave||!editing && !props.reviewRequired||command.op === 'layout.save' && !commands.length) && (props.apiToken || props.directoryHandle)) {
    setBusy(true);
    const result = await persist(next,original);
    setBase(result.files); setCommands([]); props.onSaved(result.files, command.op==='layout.save'?'Layout saved':'Saved to Markdown', editing,command.op==='layout.save');
    setMessage(props.onSubmitted?'Saved in workspace history.':'Saved to Markdown · backup created.');
   } else {
    setCommands(next); props.onPreview(prepared.files);
    setMessage(props.reviewRequired?'Draft updated. Choose Review & submit when ready.':'Draft updated. Choose Review & save when ready.');
   }
   if(command.op!=='layout.save')closeDialog();
   if (command.op === 'view.create'||command.op==='flow.create') props.onViewCreated(command.id);
  } catch (error) { const message=error instanceof Error?error.message:'Cannot apply this change.';setError(message);if(command.op==='layout.save')props.onLayoutError(message); }
  finally { setBusy(false); }
 }
 function preview() {
  if (!form) return;
  if ('kind' in form && !typeOptions.some(option => option.id === form.elementType)) {
   setError('Choose an item type to continue.');
   dialog.current?.querySelector<HTMLInputElement>('.item-type-search input')?.focus();
   return;
  }
  void apply(form);
 }
 async function persist(next: EditCommand[],original=base) {
  if (!props.apiToken) {
   if (!props.directoryHandle) throw new Error('Connect the project folder before editing. No save destination has been selected.');
   await ensureDirectoryWritable(props.directoryHandle);
   const prepared = prepareEdits(original, next);
   const result = await saveDirectory(props.directoryHandle, original, prepared.files);
   return { ...result, files: prepared.files };
  }
  const endpoint = props.spaceId ? `/api/spaces/${encodeURIComponent(props.spaceId)}/edits` : '/api/edits';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-omnidocs-token': props.apiToken! }, body: JSON.stringify({ revision: workspaceRevision(original), commands: next }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Save failed.');
  return result;
 }
 function openComponentView() {
  props.onConnecting(false); setError('');
  const candidate = scopes.find(scope => scope.entity.id === selectedEntity?.id) ?? scopes.find(scope => scope.parent.id === view.id) ?? scopes[0];
  setViewForm({ scope: candidate?.entity.id ?? '', name: candidate ? `${candidate.entity.name} · Components` : '', description: candidate ? `Components inside ${candidate.entity.name}` : '' });
 }
 function createComponentView() {
  const selected = scopes.find(scope => scope.entity.id === viewForm?.scope);
  if (!selected || !viewForm) return;
  if (selected.existing) { closeDialog(); props.onViewCreated(selected.existing.id); return; }
  void apply({op: 'view.create', id: ids().replaceAll('.', '_'), viewId: selected.parent.id, scope: selected.entity.id, name: viewForm.name, description: viewForm.description});
 }
 function nextLevel() {
  if (!selectedEntity) return;
  const existing = childView(model, selectedEntity.id);
  if (existing) { props.onViewCreated(existing.id); return; }
  if (['container','database','queue'].includes(selectedEntity.kind)) { openComponentView(); return; }
  void apply({ op: 'view.create', id: ids().replaceAll('.', '_'), viewId: targetView(selectedEntity.id).id, scope: selectedEntity.id, name: `${selectedEntity.name} · Containers`, description: `Internal structure of ${selectedEntity.name}` });
 }
 function removeSelectedConnection() {
  if (!selectedRelation) return;
  props.onConnecting(false);
  const targetView = [view, ...model.views].find(candidate => relationsForView(model, candidate).some(relation => relation.id === selectedRelation.id));
  if (!targetView) return;
  void apply({ op: 'relation.delete', id: selectedRelation.id, viewId: targetView.id });
 }
 function undo() {
  try { const next = commands.slice(0,-1); const restored = next.length ? prepareEdits(base, next).files : base; setCommands(next); props.onPreview(restored); setMessage('Last draft change undone.'); setError(''); }
  catch (error) { setError(error instanceof Error ? error.message : 'Cannot undo this change.'); }
 }
 async function submitForReview() {
  if (!props.spaceId || !props.apiToken || busy) return;
  setError('');setBusy(true);
  try {
   const response=await fetch(`/api/spaces/${encodeURIComponent(props.spaceId)}/history/proposals`,{
    method:'POST',headers:{'content-type':'application/json','x-omnidocs-token':props.apiToken},
    body:JSON.stringify({revision:workspaceRevision(base),commands,title:reviewTitle}),
   });
   const data=await response.json();
   if (!response.ok) throw new Error(data.error || 'Unable to submit this change.');
   setCommands([]);setReviewTitle('');closeDialog();
   props.onSaved(base,'Submitted for review');
   props.onSubmitted?.(data.id);
  } catch (error) {setError(error instanceof Error ? error.message : 'Unable to submit this change.');}
  finally {setBusy(false);}
 }
 async function save() {
  setError(''); setBusy(true);
  try {
   const result = await persist(commands);
   const next = result.files;
   const message = props.onSubmitted?`Published ${result.changed.length} changed files · ${result.backup}`
    :`Saved ${result.changed.length} files · Backup: ${result.backup}`;
   setBase(next); setCommands([]); props.onSaved(next, message); closeDialog();
  } catch (error) { setError(error instanceof Error ? error.message : 'Save failed.'); }
  finally { setBusy(false); }
 }
 const includeView=model.views.find(item=>item.id===includeForm?.viewId);
 const includeCandidates=includeView?existingViewCandidates(model,includeView):[];
 const includeMatches=includeCandidates.filter(item=>(!includeForm?.level||abstractionLevel(item)===includeForm.level)&&(!includeForm?.query||`${item.name} ${item.id} ${item.kind}`.toLowerCase().includes(includeForm.query.toLowerCase())));
 const chosenView = form && model.views.find(view => view.id === form.viewId);
 const typeOptions = form && 'kind' in form && chosenView ? elementTypes.filter(type => {
  if (form.op === 'entity.update') return elementKind(type.id, !!model.importInfo) === form.kind;
  return typesForView(chosenView, !!model.importInfo).some(option => option.id === type.id);
 }) : [];
 const typeHint = form && 'kind' in form ? elementTypes.find(type => type.id === form.elementType)?.hint : undefined;
 if(props.readOnlyReason)return <div className="workspace-editor"><span>{props.readOnlyReason} · Explore the diagrams and documentation</span></div>;
 const tool=(label:string,icon:React.ReactNode,run:()=>void,disabled=false,className='',pressed?:boolean)=><button type="button" className={`canvas-edit-tool ${className}`} title={label} aria-label={label} aria-pressed={pressed} onClick={run} disabled={busy||disabled}>{icon}<span className="canvas-tool-label">{label}</span></button>;
 const editingTools=<div className="canvas-edit-toolbox" aria-label="Workspace editing tools">
  <div className="canvas-toolbox-status" role="status" title={`${busy?'Saving…':autoSave?'Editing · Auto-save on':'Editing'} · ${commands.length?`${commands.length} draft changes`:'No unsaved changes'}`}><PencilSimple size={17}/><small>{busy?'Saving':commands.length?`${commands.length} draft`:'Editing'}</small></div>
  <div className="canvas-toolbox-buttons" role="toolbar" aria-label="Edit workspace" aria-orientation="vertical" onKeyDown={event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}>
   {tool('Add item',<Plus size={20}/>,()=>openEntity(),view.type==='bpmn')}
   {tool('Add existing item',<PlusCircle size={20}/>,()=>openInclude(),view.type==='bpmn')}
   {tool(props.connecting?'Cancel drawing':'Draw connection',<GitBranch size={20}/>,()=>props.onConnecting(!props.connecting),view.type==='bpmn',props.connecting?'editor-draw-active':'',props.connecting)}
   {tool('New manual data flow',<Path size={20}/>,()=>{props.onConnecting(false);setError('');setFlowForm({name:'',description:''});})}
   {tool('C3 · Components',<Cube size={20}/>,openComponentView,view.type==='bpmn')}
   {viewDocumentMoves(model).size>0&&tool('Organize view folders',<FolderSimple size={20}/>,()=>void apply({op:'workspace.organize'}))}
   <span className="canvas-toolbox-divider"/>
   {tool('Edit selected',<PencilSimple size={20}/>,()=>selectedRelation?openRelation():openEntity(true),!selectedEntity&&!selectedRelation)}
   {selectedEntity&&['system','external','container','database','queue'].includes(selectedEntity.kind)&&tool(childView(model,selectedEntity.id)?'Open next level':'Create next level',<ArrowDownRight size={20}/>,nextLevel)}
   {selectedEntity&&tool('Delete item',<Trash size={20}/>,()=>setDeleteId(selectedEntity.id),false,'editor-delete')}
   {selectedRelation&&tool('Delete connection',<Trash size={20}/>,removeSelectedConnection,false,'editor-delete')}
   {commands.length>0&&tool('Undo',<ArrowCounterClockwise size={20}/>,undo)}
   <span className="canvas-toolbox-divider"/>
   {tool(props.reviewRequired?'Review & submit':'Review & save',<FloppyDisk size={20}/>,()=>{setError('');setReview(true);},!changes.length,'editor-save')}
   {tool(changes.length?'Discard draft':'Finish editing',<X size={20}/>,()=>{props.onPreview(base);setCommands([]);props.onEditing(false);setError('');setMessage('');})}
  </div>
  {!props.reviewRequired&&(props.apiToken||props.directoryHandle)&&<label className="canvas-toolbox-autosave" title="Automatically save changes to Markdown"><input type="checkbox" checked={autoSave} disabled={busy||commands.length>0} onChange={event=>setAutoSave(event.target.checked)}/>Auto-save</label>}
 </div>;
 const feedback=editing&&!form&&!review&&!viewForm&&!deletion&&!includeForm&&!flowForm&&(error||message)?<p className={`canvas-toolbox-feedback ${error?'is-error':''}`} role={error?'alert':'status'}>{error||message}</p>:null;
 return <>
  {!editing&&<div className="workspace-editor"><span>Explore your architecture</span><button className="button secondary" onClick={begin} disabled={view.type === 'bpmn' || !!model.importInfo && (!model.importInfo.authoritativeSource || model.importInfo.integrity !== 'verified')} title={model.importInfo && (!model.importInfo.authoritativeSource || model.importInfo.integrity !== 'verified') ? 'View only: a verified canonical DSL source and synchronized snapshot are required for editing.' : undefined}><PencilSimple size={16}/>{props.apiToken || props.directoryHandle ? 'Edit workspace' : 'Connect folder & edit'}</button></div>}
  {editing&&(props.toolboxTarget?createPortal(<>{editingTools}{feedback}</>,props.toolboxTarget):<>{editingTools}{feedback}</>)}
  {(form || review || viewForm || deletion || includeForm || flowForm) && <dialog className="modal editor-dialog" ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) closeDialog(); }}>
   <div className="modal-header"><h2>{flowForm ? 'Create a manual data flow' : includeForm ? 'Add existing items to view' : deletion ? 'Delete item' : review ? props.reviewRequired?'Submit changes for review':'Review changes' : viewForm ? 'C3 · Components inside a container' : form?.op.startsWith('entity') ? form.op.endsWith('create') ? 'Add item' : 'Edit item' : form?.op.endsWith('create') ? 'Add connection' : 'Edit connection'}</h2><button className="icon-button" aria-label="Close editor" onClick={closeDialog} disabled={busy}><X size={19}/></button></div>
   {flowForm ? <form className="editor-form" onSubmit={event=>{event.preventDefault();void apply({op:'flow.create',id:ids(),name:flowForm.name,description:flowForm.description});}}>
    <p>Start with three empty bands: L1 people/systems, L2 containers and L3 components. Add model items to their band and draw connections yourself. No sample or path is generated.</p>
    <label>Name<input autoFocus required value={flowForm.name} onChange={event=>setFlowForm({...flowForm,name:event.target.value})}/></label>
    <label>Description<textarea required value={flowForm.description} onChange={event=>setFlowForm({...flowForm,description:event.target.value})}/></label>
    {error&&<p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button type="button" className="button secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="button primary" disabled={busy}>Create empty flow</button></div>
   </form> : includeForm ? <form className="editor-form" onSubmit={event=>{event.preventDefault();void apply({op:'view.include',viewId:includeForm.viewId,ids:includeForm.ids});}}>
    <p>Reuse existing model items in this view. Their identity and ownership stay unchanged. {includeView?.layout==='levels'?'Only the items are added; draw each connection manually.':'Existing relationships to items in this view are shown too.'}</p>
    <ViewLevelPicker views={model.views.filter(item => item.type !== 'bpmn')} value={includeForm.viewId}
     disabled={busy} onChange={target => setIncludeForm({viewId: target.id, ids: [], query: ''})}/>
    {includeView?.layout==='levels'&&<label>Layer<select aria-label="Flow layer" value={includeForm.level??''} onChange={event=>setIncludeForm({...includeForm,level:event.target.value,ids:[]})}><option value="">All three layers</option><option>L1</option><option>L2</option><option>L3</option></select></label>}
    <label>Find existing items<input autoFocus type="search" value={includeForm.query} disabled={busy} onChange={event=>setIncludeForm({...includeForm,query:event.target.value})}/></label>
    <div className="existing-items-list">{[...new Set(includeMatches.map(item=>item.kind))].map(kind=><fieldset key={kind}><legend>{kind}</legend>{includeMatches.filter(item=>item.kind===kind).map(item=><label className="existing-item-choice" key={item.id}><input type="checkbox" disabled={busy} checked={includeForm.ids.includes(item.id)} onChange={event=>setIncludeForm({...includeForm,ids:event.target.checked?[...includeForm.ids,item.id]:includeForm.ids.filter(id=>id!==item.id)})}/><span><strong dir="auto">{item.name}</strong><small>{item.id}</small><span dir="auto">{item.description}</span></span></label>)}</fieldset>)}</div>
    {!includeMatches.length&&<p role="status">{includeCandidates.length?'No matching items.':'All eligible items are already in this view, or no other items match this C4 level.'}</p>}
    <p>{includeForm.ids.length} selected · Only items suitable for this view’s level are listed.</p>
    {error&&<p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button type="button" className="button secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="button primary" disabled={busy||!includeForm.ids.length}>{busy?'Saving…':autoSave?'Add to view & save':'Add to draft'}</button></div>
   </form> : deletion ? <div className="editor-form"><p>Delete <strong dir="auto">{deletion.entity.name}</strong> from the model and all views?</p><p>{deletion.entities.length} items · {deletion.relations.length} connected relationships · {deletion.views.length} owned views</p>{deletion.requiresCascade&&<><p className="editor-note">Its child items and owned views will also be deleted.</p><ul>{deletion.entities.map(item=><li key={item.id} dir="auto">{item.name}</li>)}</ul></>}{deletion.blocked&&<p className="editor-error">{deletion.blocked}</p>}<p>{autoSave?'Confirmed deletion is saved immediately with a backup.':'Deletion changes the draft. Undo can restore it before saving.'}</p>{error&&<p className="editor-error" role="alert">{error}</p>}<div className="editor-actions"><button className="button secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button className="button primary editor-confirm-delete" disabled={busy||!!deletion.blocked} onClick={()=>void apply({op:'entity.delete',id:deletion.entity.id,viewId:targetView(deletion.entity.id).id,cascade:true})}>{busy?'Deleting…':'Delete item'}</button></div></div> : viewForm ? <form className="editor-form" onSubmit={event => { event.preventDefault(); createComponentView(); }}>
    <p>Choose the application/container whose internal components you want to document. C3 belongs inside one C2 container.</p>
    {!scopes.length ? <p className="editor-note">No C2 containers exist yet. Open the Containers (C2) view, choose Add item and create an Application, API, Database or another container first.</p> : <>
     <label>Owner application / Container<select required value={viewForm.scope} disabled={busy} onChange={event => { const entity = scopes.find(scope => scope.entity.id === event.target.value)!.entity; setViewForm({scope: entity.id, name: `${entity.name} · Components`, description: `Components inside ${entity.name}`}); }}>{scopes.map(scope => <option key={scope.entity.id} value={scope.entity.id}>{scope.entity.name} · {scope.parent.name}{scope.existing ? ' · C3 exists' : ''}</option>)}</select></label>
     {!scopes.find(scope => scope.entity.id === viewForm.scope)?.existing && <><label>View name<input required dir="auto" value={viewForm.name} disabled={busy} onChange={event => setViewForm({...viewForm, name:event.target.value})}/></label><label>Description<textarea required rows={3} dir="auto" value={viewForm.description} disabled={busy} onChange={event => setViewForm({...viewForm, description:event.target.value})}/></label></>}
    </>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="button secondary" type="button" disabled={busy} onClick={closeDialog}>Cancel</button><button className="button primary" disabled={busy || !scopes.length} type="submit">{busy ? 'Saving…' : scopes.find(scope => scope.entity.id === viewForm.scope)?.existing ? 'Open C3 view' : 'Create C3 view'}</button></div>
   </form> : review ? <div className="editor-form"><p>{props.onSubmitted ? props.reviewRequired ? 'A reviewer must approve this draft before it is published.' : 'Save a published version or send this draft to a reviewer.' : props.directoryHandle ? `Changes will be saved in ${props.directoryHandle.name}/ with a backup.` : 'Changes will be saved to the selected Space folder with a backup.'}</p>{props.onSubmitted && <label>Change request title<input value={reviewTitle} maxLength={160} onChange={event=>setReviewTitle(event.target.value)} placeholder="Summarize this change"/></label>}<p>{commands.length} changes · {changes.length} files</p>{model.importInfo && <p className="editor-note">DSL source and JSON snapshot are patched together. References and source hashes are checked. A fresh official Structurizr export/inspection remains pending.</p>}{changes.map(change => <details className="editor-file-change" key={change.path}><summary>{change.path} · {change.after === null ? 'deleted' : change.before === null ? 'new file' : 'modified'}</summary><div className="editor-diff"><div><strong>Before</strong><pre>{change.before ?? '(new file)'}</pre></div><div><strong>After</strong><pre>{change.after ?? '(deleted file)'}</pre></div></div></details>)}{error && <p className="editor-error" role="alert">{error}</p>}<div className="editor-actions"><button className="button secondary" disabled={busy} onClick={closeDialog}>Back to draft</button>{!props.reviewRequired && <button className="button primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : props.onSubmitted ? 'Publish now' : 'Save to files'}</button>}
    {props.onSubmitted && <button className="button primary" onClick={()=>void submitForReview()} disabled={busy||!reviewTitle.trim()}>Submit for review</button>}</div></div> : form && <form className="editor-form" onSubmit={event => { event.preventDefault(); preview(); }}>
    {'name' in form ? <div className="editor-item-layout">
     <aside className="editor-item-destination" aria-label="Item destination">
      {form.op === 'entity.update' ? <>
       <span className="item-type-label">Destination view</span>
       <p className="editor-selected-view" dir="auto">{chosenView?.name}</p>
      </> : <ViewLevelPicker views={model.views.filter(target => typesForView(target, !!model.importInfo).length > 0)}
       value={form.viewId} disabled={busy} onChange={target => {
        if (target.id === form.viewId) return;
        const options = typesForView(target, !!model.importInfo);
        const selected = options.find(option => option.id === form.elementType);
        setForm({...form, viewId: target.id, elementType: selected?.id,
         kind: elementKind((selected ?? options[0]).id, !!model.importInfo)});
        setError('');
       }}/>}
      {form.op === 'entity.create' && chosenView?.type !== 'component' &&
       <button className="text-button" type="button" onClick={() => { setForm(null); openComponentView(); }}>Create or open a C3 view</button>}
     </aside>
     <div className="editor-item-details">
      <label>Name<input required dir="auto" value={form.name} onChange={event => setForm({...form, name: event.target.value})}/></label>
      <label>Description<textarea required dir="auto" rows={3} value={form.description} onChange={event => setForm({...form, description: event.target.value})}/></label>
      <ItemTypePicker key={form.viewId} options={typeOptions} value={form.elementType} disabled={busy}
       onChange={elementType => { setError(''); setForm({...form, elementType, kind: elementKind(elementType, !!model.importInfo)}); }}/>
      <p className="editor-type-hint">{typeHint ?? (chosenView?.type === 'context' ? 'C1 contains people and software systems. Choose C2 for an application, database, cache or broker.' : chosenView?.type === 'container' ? 'Choose an application, data store or messaging type. Internal components belong in a C3 view.' : 'Choose an item type for the selected view.')}</p>
      <TechnologyField required={['container','database','queue','component'].includes(form.kind)} value={form.technology ?? ''} onChange={technology => setForm({...form, technology})}/>
      <label>Stable ID<input required value={form.id} disabled={form.op === 'entity.update'} onChange={event => setForm({...form, id: event.target.value})}/></label>
     </div>
    </div> : <>
     <p>{chosenView?.name}</p>
     <div className="drawn-connection-endpoints" aria-label="Drawn connection direction">
      <span dir="auto">{model.entities.find(entity => entity.id === form.source)?.name}</span>
      <span aria-label="to">→</span>
      <span dir="auto">{model.entities.find(entity => entity.id === form.target)?.name}</span>
     </div>
     <label>Relationship description<input required dir="auto" value={form.label} onChange={event => setForm({ ...form, label: event.target.value })}/></label>
     {chosenView?.type === 'context' ? <details className="editor-protocol-details"><summary>Advanced · Protocol (optional){form.protocol ? ` · ${form.protocol}` : ''}</summary><p>C1 focuses on who interacts with the system and why. A protocol is not needed here. If recorded, it is saved and available in relationship details; C1 arrows show the interaction description.</p><label>Protocol / technology (optional)<input dir="auto" placeholder="Only if explicitly documented" value={form.protocol} onChange={event => setForm({ ...form, protocol: event.target.value })}/></label></details> : <><label>Protocol / technology (optional)<input dir="auto" placeholder="REST / HTTPS, gRPC, TCP, WebSocket…" value={form.protocol} onChange={event => setForm({ ...form, protocol: event.target.value })}/></label><p>Recommended for container-to-container communication. When documented, it appears on a separate line below the relationship description. Do not guess an unknown protocol.</p></>}
    </>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="button secondary" type="button" disabled={busy} onClick={closeDialog}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : autoSave && (props.apiToken || props.directoryHandle) ? 'Save to Markdown' : 'Apply to draft'}</button></div>
   </form>}
  </dialog>}
 </>;
}
