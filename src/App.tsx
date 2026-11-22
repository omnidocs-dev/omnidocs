import {abstractionLevel} from '../shared/ownership-frames';
import {SpaceHistory, type HistoryPreview} from './SpaceHistory';
import {ExplorerViews} from './ExplorerViews';
import {workspaceBundleSchema,workspaceImportMaxBytes} from '../shared/workspace-transfer';
import {workspaceRevision} from '../shared/edit-contract';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornersOut, CornersIn, ArrowDown, ArrowLeft, ArrowRight, ArrowSquareOut, ArrowUpRight, BookOpen, CaretDown, CaretRight, CheckCircle, Circle, ClockCounterClockwise, Code, Cube, DownloadSimple, FileMd, Files, FolderOpen, GitBranch, HardDrives, Info, MagnifyingGlass, Path, PlugsConnected, SidebarSimple, Stack, TreeStructure, WarningCircle, X } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { compileModel, childView, relationsForView, type Model, type SourceFile, type View, type Relation } from '../shared/model';
import {layoutSnapshotSchema, readLayoutState, layoutPath} from '../shared/layout-state';
import { elementTypeLabel } from '../shared/element-types';
import { communicationText, resolveCommunication } from '../shared/communication';
import brandMarkUrl from './assets/brand/omnidocs-mark.svg';
import { entityAppearance, appearanceIcons, EntityTypeLegend } from './entity-appearance';
import { FolderSetup, type FolderReview } from './FolderSetup';
import { inspectWorkspace } from '../shared/workspace-inspection';
import { readDirectory, ensureDirectoryWritable, directoryIsEmpty } from './folder-write';
import { SpaceManager, type Space } from './SpaceManager';
import { WorkspaceEditor, type ConnectionRequest, type EditorRequest, type LayoutRequest } from './WorkspaceEditor';
import { DocumentReader } from './DocumentReader';
import { ModelProperties } from './ModelProperties';
import { CodeMappings } from './CodeMappings';
import { LayerSwitcher } from './LayerSwitcher';
import { DiagramCanvas, entityLabels, viewLabels, type CanvasPosition } from './Canvas';

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
 return <dialog ref={ref} className="modal" onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19}/></button></div>{children}</dialog>;
}
export type ServiceEditor={spaceId:string;name:string;endpoint:string;canEdit:boolean;canManage:boolean;onExit:()=>void;onManage:()=>void};
export default function App({service}:{service?:ServiceEditor}={}) {
 const [liveModel, setModel] = useState<Model | null>(null), [viewId, setViewId] = useState('');
 const [exportingWorkspace,setExportingWorkspace]=useState(false);
 const [historyOpen,setHistoryOpen]=useState(false);
 const [historyPreview,setHistoryPreview]=useState<HistoryPreview|null>(null);
 const [historyProposal,setHistoryProposal]=useState<string>();
 const [requiresReview,setRequiresReview]=useState(false);
 const historyAvailable=!!service && !service.endpoint.startsWith('/api/share/');
 const model=useMemo(()=>historyPreview ? compileModel(historyPreview.files) : liveModel,[historyPreview,liveModel]);
 const viewBeforeHistory=useRef('');
 const [processDirty,setProcessDirty]=useState(false);
 const [toolboxTarget,setToolboxTarget]=useState<HTMLDivElement|null>(null);
 const [navigationRevision, setNavigationRevision] = useState(0);
 const [selection, setSelection] = useState<string | null>(null), [tab, setTab] = useState<'docs' | 'source' | 'relations' | 'code'>('docs');
 const [error, setError] = useState(''), [diagnostics, setDiagnostics] = useState<string[]>([]);
 const [modal, setModal] = useState<'search' | 'help' | 'errors' | 'files' | 'raw' | 'document' | 'spaces' | null>(null), [query, setQuery] = useState('');
 const [rawFile, setRawFile] = useState<SourceFile | null>(null);
 const [folderName, setFolderName] = useState('demo'), [isDemo, setIsDemo] = useState(true), [imported, setImported] = useState(false), [live, setLive] = useState(false);
 const [sidebar, setSidebar] = useState(() => window.innerWidth > 700), [inspector, setInspector] = useState(() => window.innerWidth > 1050), [showModel, setShowModel] = useState(true);
 const [canvasExpanded,setCanvasExpanded]=useState(false);
 const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
 const [connecting, setConnecting] = useState(false);
 const [editing, setEditing] = useState(false), [apiToken, setApiToken] = useState<string | null>(null), [connectionRequest, setConnectionRequest] = useState<ConnectionRequest | null>(null);
 const serviceReadOnly=!!service&&(!service.canEdit||!apiToken);
 const readOnlyReason=historyOpen ? 'History preview' : serviceReadOnly ? 'Read-only access' : undefined;
 const [layoutRequest,setLayoutRequest]=useState<LayoutRequest|null>(null);
 const persistedLayoutKeys=useRef(new Set<string>());
 const [editorRequest,setEditorRequest]=useState<EditorRequest|null>(null);
 const [spaceId, setSpaceId] = useState<string | null>(null);
 const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null), [folderBusy, setFolderBusy] = useState(false);
 const [folderReview, setFolderReview] = useState<FolderReview | null>(null);
 const activeSpace = useRef<string | null>(null);
 const editingRef = useRef(false); editingRef.current = editing;
 const [liveFiles, setFiles] = useState<SourceFile[]>([]), [notice, setNotice] = useState('');
 const files=historyPreview?.files ?? liveFiles;
 const presentation=useMemo(()=>readLayoutState(files),[files]);
 const folderInput = useRef<HTMLInputElement>(null), mode = useRef(false), positions = useRef(new Map<string, CanvasPosition>()), currentModel = useRef<Model | null>(null);
 const previewPositions=useMemo(()=>historyPreview ? new Map(Object.entries(readLayoutState(historyPreview.files).layouts)) : null,[historyPreview]);
 currentModel.current = liveModel;
 const acceptedRevision = useRef('');
 const acceptedModelRevision = useRef('');
 const browserLayoutKey = useRef('');
 const accept = useCallback((sources: SourceFile[], name: string, reset: boolean, presentationOnly=false, restoreBrowserLayout=false) => {
  const revision = workspaceRevision(sources);
  if (!reset && revision === acceptedRevision.current) return true;
  const next = compileModel(sources);
  setDiagnostics(next.errors);
  if (next.errors.length) { setError('The document folder has model errors. Fix the listed files and reload.'); setModal('errors'); return false; }
  const modelRevision = workspaceRevision(sources.filter(file => file.path !== layoutPath));
  if (reset || !presentationOnly && acceptedModelRevision.current !== modelRevision) setModel(next);
  acceptedRevision.current = revision;
  acceptedModelRevision.current = modelRevision;
  if (reset) browserLayoutKey.current = `omnidocs.layout.${name}.${modelRevision}`;
  setError(''); setFiles(sources); setFolderName(name);
  if (reset) { setEditorRequest(null); setConnectionRequest(null); setWorkspaceGeneration(value => value + 1); positions.current.clear(); setViewId(next.project.home); setSelection(next.views.find(v => v.id === next.project.home)?.scope ?? null); }
  else { setViewId(id => next.views.some(v => v.id === id) ? id : next.project.home); setSelection(id => next.entities.some(e => e.id === id) || next.relations.some(r => r.id === id) ? id : null); }
  const layouts=readLayoutState(sources).layouts;
  if (reset && restoreBrowserLayout) {
   try {
    const local = JSON.parse(localStorage.getItem(browserLayoutKey.current) ?? '{}');
    for (const [key, value] of Object.entries(local)) {
     const saved = layoutSnapshotSchema.safeParse(value);
     if (saved.success) layouts[key] = saved.data;
    }
   } catch { /* Standalone layouts can still stay in memory when browser storage is unavailable. */ }
  }
  for(const key of persistedLayoutKeys.current)if(!layouts[key])positions.current.delete(key);
  for(const [key,snapshot]of Object.entries(layouts))positions.current.set(key,snapshot);
  persistedLayoutKeys.current=new Set(Object.keys(layouts));
  if(reset)setLayoutRequest(null);
  return true;
 }, []);
 const loadLocal = useCallback(async (reset = false) => {
  try {
   if (editingRef.current) return;
   if(service){const response=await fetch(service.endpoint);const data=await response.json();if(editingRef.current)return;if(!response.ok){setModel(null);throw new Error(data.error||'Workspace access unavailable.');}setLive(true);setRequiresReview(Boolean(data.reviewRequired));setApiToken(service.canEdit&&data.writable?data.editToken:null);setSpaceId(service.spaceId);activeSpace.current=service.spaceId;if(accept(data.files,data.name,reset||!currentModel.current)){mode.current=false;setImported(false);setIsDemo(false);}return;}
   const snapshot = window.__OMNIDOCS_SNAPSHOT__;
   if (snapshot) {
    if (mode.current && !reset) return;
    if (accept(snapshot.files, snapshot.name, true, false, true)) { mode.current = true; setImported(true); setDirectoryHandle(null); setIsDemo(snapshot.demo === true); }
    return;
   }
   if (!activeSpace.current) {
    const response = await fetch('/api/spaces');
    if (!response.ok) throw new Error('Cannot load spaces.');
    const catalog = await response.json();
    let remembered: string | null = null; try { remembered = localStorage.getItem('omnidocs.space'); } catch { /* storage optional */ }
    const space = catalog.spaces.find((space: Space) => space.id === remembered) ?? catalog.spaces.find((space: Space) => space.default) ?? catalog.spaces[0];
    if (space) { activeSpace.current = space.id; setSpaceId(space.id); }
   }
   const response = await fetch(activeSpace.current ? `/api/spaces/${encodeURIComponent(activeSpace.current)}/workspace` : '/api/workspace');
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Document service is unavailable.');
   setApiToken(data.writable ? data.editToken : null);
   if (mode.current && !reset) return;
   if (accept(data.files, data.name, reset || !currentModel.current)) { mode.current = false; setDirectoryHandle(null); setImported(false); setIsDemo(data.demo === true); }
  } catch (err) { setError(err instanceof Error ? err.message : 'Cannot load workspace'); }
 }, [accept,service]);
 useEffect(() => {
  void loadLocal();
  if (window.__OMNIDOCS_SNAPSHOT__) return;
  if(service){const timer=setInterval(()=>void loadLocal(),15000);return()=>clearInterval(timer);}
  const events = new EventSource('/api/events');
  events.onopen = () => setLive(true); events.onerror = () => setLive(false);
  events.onmessage = () => { if (!mode.current) void loadLocal(); };
  return () => events.close();
 }, [loadLocal]);
 useEffect(() => { function onKey(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); setModal('search'); } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
 useEffect(()=>{if(!canvasExpanded)return;const exit=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!window.document.querySelector('dialog[open],[role="menu"],[role="dialog"]'))setCanvasExpanded(false);};window.addEventListener('keydown',exit);return()=>window.removeEventListener('keydown',exit);},[canvasExpanded]);
 useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
 const previewHistory=useCallback((preview:HistoryPreview|null, destination?:string)=>{
  setHistoryPreview(preview);
  if (destination) setViewId(destination);
  setSelection(null);
 },[]);
 function openHistory(proposal?:string) {
  viewBeforeHistory.current=viewId;
  setHistoryProposal(proposal);
  setCanvasExpanded(false);
  setHistoryOpen(true);
 }
 function closeHistory() {
  setHistoryOpen(false);setHistoryPreview(null);setHistoryProposal(undefined);setSelection(null);
  setViewId(viewBeforeHistory.current);
 }
 const view = model?.views.find(v => v.id === viewId) ?? model?.views.find(v => v.id === model.project.home);
 const navigate = (id: string) => { const target = model?.views.find(v => v.id === id); if (!target) return; if(processDirty&&id!==view?.id&&!window.confirm('Leave this process without saving changes?'))return; setNavigationRevision(value => value + 1); setViewId(id); setSelection(target.scope ?? null); setTab('docs'); setModal(null); };
 const selectEntity = (id: string) => { setSelection(id); setTab(model?.entities.find(entity => entity.id === id)?.kind === 'code' ? 'code' : 'docs'); setInspector(true); };
 const selectRelation = (relation: Relation) => { setSelection(relation.id); setTab('docs'); setInspector(true); };
 async function openFolder(startEditing = false) {
  if (editingRef.current || folderBusy) return;
  const picker = (window as Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) {
   if (startEditing) setError('This browser can only read folder snapshots. Run npm run studio and open the local Studio to edit the current project.');
   else folderInput.current?.click();
   return;
  }
  setFolderBusy(true);
  try {
   const handle = await picker.call(window, { id: 'omnidocs-project', mode: 'readwrite' });
   await ensureDirectoryWritable(handle);
   const sources = await readDirectory(handle);
   const inspection = inspectWorkspace(sources), empty = !sources.length && await directoryIsEmpty(handle);
   const review = {handle, name: handle.name, sources, inspection, empty, startEditing};
   if (inspection.compatible) connectFolder(handle, sources, startEditing && inspection.editable);
   setFolderReview(review);

  } catch (err) { if ((err as DOMException).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Cannot open the project folder.'); }
  finally { setFolderBusy(false); }
 }
 function connectFolder(handle: FileSystemDirectoryHandle, sources: SourceFile[], startEditing: boolean) {
  if (!accept(sources, handle.name, true)) return;
  mode.current = true; setImported(true); setDirectoryHandle(handle); setApiToken(null); setIsDemo(false); setConnecting(false); setConnectionRequest(null); setEditing(startEditing);
  setNotice(`Connected to ${handle.name} · changes save in this folder`);
 }
 async function reloadFolder() {
  if (!directoryHandle || editingRef.current || folderBusy) return;
  setFolderBusy(true);
  try { const sources = await readDirectory(directoryHandle), inspection = inspectWorkspace(sources); if (inspection.compatible) { accept(sources, directoryHandle.name, false); setNotice('Reloaded the current project folder'); } setFolderReview({handle:directoryHandle,name:directoryHandle.name,sources,inspection,empty:false,startEditing:false}); }
  catch (err) { setError(err instanceof Error ? err.message : 'Cannot reload the project folder.'); }
  finally { setFolderBusy(false); }
 }
 async function importFolder(list: FileList | null) {
  if (!list?.length) return;
  try {
   const entries = Array.from(list).filter(file => /\.md$/i.test(file.name));
   if (!entries.length) throw new Error('This folder has no Markdown files. Choose a folder containing an OmniDocs workspace.');
   const sources = await Promise.all(entries.map(async file => ({ path: file.webkitRelativePath.split('/').slice(1).join('/') || file.name, content: await file.text() })));
   const name = entries[0].webkitRelativePath.split('/')[0] || 'Imported folder';
   const inspection = inspectWorkspace(sources);
   setFolderReview({handle:null,name,sources,inspection,empty:false,startEditing:false});
   if (inspection.compatible && accept(sources, name, true, false, true)) { mode.current = true; setImported(true); setDirectoryHandle(null); setApiToken(null); setNotice(`Opened ${sources.length} Markdown files`); }
  } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open folder'); }
  if (folderInput.current) folderInput.current.value = '';
 }
 async function openSpace(space: Space) {
  const response = await fetch(`/api/spaces/${encodeURIComponent(space.id)}/workspace`), data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Cannot load space.');
  if (!accept(data.files, data.name, true)) throw new Error('This space contains model errors.');
  setDirectoryHandle(null); activeSpace.current = space.id; setSpaceId(space.id); setApiToken(data.editToken); mode.current = false; setImported(false); setIsDemo(false); setEditing(false); setConnecting(false); setConnectionRequest(null);
  try { localStorage.setItem('omnidocs.space', space.id); } catch { /* storage optional */ }
 }
 function exportModel() {
  if (!model) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a'); link.href = url; link.download = `${model.project.id}-model.json`; link.click(); URL.revokeObjectURL(url); setNotice('Application model exported');
 }
 async function exportWorkspace() {
  if(!service||!liveModel||exportingWorkspace)return;
  setExportingWorkspace(true);
  try{
   const response=await fetch(service.endpoint);
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Unable to export this workspace.');
   const bundle=workspaceBundleSchema.parse({
    format:'omnidocs-workspace',version:1,name:data.name||liveModel.project.name,
    description:data.description||liveModel.project.description||'Architecture documentation.',
    files:data.files,
   });
   const archive=new Blob([JSON.stringify(bundle)],{type:'application/json'});
   if(archive.size>workspaceImportMaxBytes)throw new Error('The workspace is too large for a transferable export (10 MiB limit).');
   const url=URL.createObjectURL(archive),link=window.document.createElement('a');
   const filename=bundle.name.replace(/[\\/:*?"<>|]+/g,'-').trim();
   link.href=url;link.download=`${filename || liveModel.project.id}.omnidocs.json`;link.click();URL.revokeObjectURL(url);
   setNotice('Workspace exported');
  }catch(error){setError(error instanceof Error?error.message:'Unable to export this workspace.');}
  finally{setExportingWorkspace(false);}
 }
 const selectedEntity = model?.entities.find(e => e.id === selection);
 const selectedRelation = model?.relations.find(r => r.id === selection);
 const document = selectedEntity ?? view;
 const selectedRelations = model?.relations.filter(r => r.source === selectedEntity?.id || r.target === selectedEntity?.id) ?? [];
 const c4Level=selectedEntity?abstractionLevel(selectedEntity):undefined;
 const c4ViewType=c4Level==='L1'?'context':c4Level==='L2'?'container':c4Level==='L3'?'component':undefined;
 const c4Views=view?.type==='dataflow'&&selectedEntity&&c4ViewType?model?.views.filter(item=>item.type===c4ViewType&&item.nodes.includes(selectedEntity.id))??[]:[];
 const originalView=c4Views.find(item=>item.scope===selectedEntity?.parent)??c4Views[0];
 const relatedViews = model?.views.filter(v => v.id !== view?.id && (v.scope === selectedEntity?.id || v.nodes.includes(selectedEntity?.id ?? '') || Object.values(v.bindings).includes(selectedEntity?.id ?? ''))) ?? [];
 const breadcrumbs: View[] = [];
 if (view && model) { let parent = view.parentView; const seen = new Set<string>(); while (parent && !seen.has(parent)) { seen.add(parent); const item = model.views.find(v => v.id === parent); if (!item) break; breadcrumbs.unshift(item); parent = item.parentView; } }
 const searchResults = model?.entities.filter(e => `${e.name} ${e.description} ${e.technology ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
 function locateEntity(id: string) {
  const containing = model?.views.find(v => ['context','container','component','code'].includes(v.type) && v.nodes.includes(id));
  if (containing) navigate(containing.id);
  selectEntity(id); setModal(null); setQuery('');
 }
 return <div className={`studio ${canvasExpanded?'canvas-expanded':''} ${!sidebar ? 'without-sidebar' : ''} ${historyOpen ? 'has-space-history' : !inspector ? 'without-inspector' : ''}`}>
  <input ref={folderInput} type="file" multiple {...{ webkitdirectory: '', directory: '' }} hidden onChange={e => void importFolder(e.target.files)}/>
  <header className="app-header"><a href="#" className="brand" onClick={event => { event.preventDefault(); if (model) navigate(model.project.home); }}><span className="brand-mark"><img src={brandMarkUrl} alt="" width="36" height="36"/></span><strong>omnidocs<span className="brand-dot">.</span></strong><span className="studio-label">studio</span></a>
   <div className="header-project"><span className="header-divider"/><Cube size={17}/><span>{model?.project.name ?? 'Document workspace'}</span><span className="demo-label">{service?'Service':imported ? 'Local folder' : isDemo ? 'Demo workspace' : 'Local workspace'}</span></div>
   <div className="header-actions">{historyAvailable && <button type="button" className="button secondary" aria-pressed={historyOpen} disabled={editing}
    onClick={()=>historyOpen?closeHistory():openHistory()}><ClockCounterClockwise size={17}/>History</button>}{service?.canManage&&<button className="button secondary" onClick={service.onManage} disabled={editing}>Access</button>}<button className="button secondary" disabled={editing || folderBusy} onClick={() => service?service.onExit():setModal('spaces')}><Stack size={17}/>{service?'Projects':'Spaces'}</button><span className="sync-status"><span className={`status-dot ${directoryHandle || live && !imported ? 'online' : ''}`}/>{service?(readOnlyReason ?? 'Authenticated workspace'):directoryHandle ? `Connected · ${directoryHandle.name}` : imported ? 'Folder snapshot' : live ? 'Live from Markdown' : 'Connecting…'}</span><button hidden={!!service} className="button secondary" disabled={editing || folderBusy} onClick={() => void openFolder()}><FolderOpen size={17}/>{folderBusy ? 'Opening…' : directoryHandle ? 'Change folder' : 'Open folder'}</button>{service&&<button type="button" className="button secondary workspace-export" disabled={!liveModel||exportingWorkspace} title="Export workspace" aria-label="Export workspace" onClick={()=>void exportWorkspace()}><DownloadSimple size={17}/><span>{exportingWorkspace?'Exporting…':'Export workspace'}</span></button>}<button className="icon-button export" title="Export model as JSON" aria-label="Export model as JSON" onClick={exportModel} disabled={!model}><DownloadSimple size={20}/></button></div>
  </header>
  <nav className="rail" aria-label="Studio tools"><button className={`rail-button ${modal !== 'files' ? 'active' : ''}`} aria-label="Show architecture explorer" title="Architecture explorer" onClick={() => { setModal(null); setSidebar(true); }}><Stack size={23}/></button><button className={`rail-button ${modal === 'files' ? 'active' : ''}`} aria-label="Browse Markdown files" title="Markdown files" onClick={() => setModal('files')}><Files size={23}/></button><button className="rail-button" aria-label="Search model" title="Search model" onClick={() => setModal('search')}><MagnifyingGlass size={22}/></button><div className="rail-bottom"><button className="rail-button" aria-label="Open studio guide" title="Studio guide" onClick={() => setModal('help')}><BookOpen size={22}/></button><span className="avatar" aria-label="OmniDocs"><img src={brandMarkUrl} alt="" width="28" height="28"/></span></div></nav>
  {sidebar && <aside className="sidebar"><div className="workspace-label">Workspace</div><button className="project-switch" disabled={editing || folderBusy} onClick={() => service?service.onExit():setModal('spaces')}><span className="project-icon"><Cube size={21}/></span><span><strong>{model?.project.name ?? 'Your application'}</strong><small>{model?.fileCount ?? 0} Markdown documents</small></span><CaretDown size={14}/></button>
   <button className="search-trigger" onClick={() => { setQuery(''); setModal('search'); }}><MagnifyingGlass size={16}/><span>Find anything…</span><kbd>⌘ K</kbd></button>
   <div className="sidebar-scroll"><div className="section-heading">Explore your application</div>
    <ExplorerViews key={workspaceGeneration} views={model?.views ?? []} activeId={view?.id} navigate={navigate}/>
    <div className="model-heading"><button onClick={() => setShowModel(!showModel)}><CaretDown size={13} style={{ transform: showModel ? undefined : 'rotate(-90deg)' }}/> Application model</button><span>{model?.entities.length ?? 0}</span></div>
    {showModel && model?.entities.filter(e => !e.parent || e.parent === model.views.find(v => v.id === model.project.home)?.scope).map(e => { const Icon = appearanceIcons[entityAppearance(e)]; return <button key={e.id} className={`model-link theme-${entityAppearance(e)} ${selection === e.id ? 'selected' : ''}`} onClick={() => locateEntity(e.id)}><Icon size={15}/><span dir="auto">{e.name}</span></button>; })}
   </div>
   <div className="sidebar-bottom"><div><FileMd size={18}/><span>{folderName}/</span><span className="read-only">{historyOpen?'history preview':serviceReadOnly?'read only':editing ? 'editing' : directoryHandle ? 'connected' : imported ? 'snapshot' : 'editable'}</span></div><p>{historyOpen?'Return to the live workspace to edit.':serviceReadOnly?'This space is read only.':directoryHandle ? 'Reading and saving in this project folder.' : imported ? 'Connect a project folder once to enable editing.' : 'Edit on the canvas or in Markdown. Files stay connected.'}</p>{directoryHandle && <button className="text-button" disabled={editing || folderBusy} onClick={() => void reloadFolder()}>Reload current folder</button>}{imported && <button className="text-button" disabled={editing} onClick={() => void loadLocal(true)}>{window.__OMNIDOCS_SNAPSHOT__ ? 'Reload bundled workspace' : 'Return to local workspace'}</button>}</div>
  </aside>}
  <main className="main-workspace">
   <div className="workspace-toolbar"><div className="breadcrumbs"><button className="icon-button" title="Toggle explorer" aria-label="Toggle explorer" onClick={() => setSidebar(!sidebar)}><SidebarSimple size={18}/></button><span className="toolbar-divider"/><button onClick={() => model && navigate(model.project.home)}>Workspace</button>{breadcrumbs.map(v => <span className="crumb" key={v.id}><CaretRight size={12}/><button onClick={() => navigate(v.id)}>{v.name}</button></span>)}<span className="crumb current"><CaretRight size={12}/>{view?.name ?? 'Loading'}</span></div><button className={`icon-button ${inspector ? 'toggled' : ''}`} title="Toggle details" aria-label="Toggle details" onClick={() => setInspector(!inspector)}><SidebarSimple size={18} style={{ transform:'scaleX(-1)' }}/></button></div>
   {historyPreview&&<div className="history-preview-banner"><ClockCounterClockwise size={16}/><strong>{historyPreview.side==='before'?'Before':'After'}</strong><span dir="auto">{historyPreview.title}</span><button className="text-button" type="button" onClick={closeHistory}>Back to live</button></div>}
   {error && <div className="error-banner"><WarningCircle size={17}/><span>{error}</span>{diagnostics.length > 0 && <button onClick={() => setModal('errors')}>View {diagnostics.length} issues</button>}</div>}
   {model && view ? <>{model.importInfo && <details className="model-import-status"><summary><span>Structurizr JSON</span><span>{model.importInfo.integrity === 'verified' ? 'DSL snapshot verified' : 'Snapshot freshness unverified'}</span><span>{model.views.length} available views</span>{model.importInfo.notes.length > 0 && <span>Source inspection notes</span>}</summary><div><p>Model: {model.importInfo.source}{model.importInfo.authoritativeSource && ` · Source: ${model.importInfo.authoritativeSource}`}</p>{model.importInfo.notes.map((note, index) => <p key={index}>{note}</p>)}<button className="text-button" onClick={() => setModal('files')}>Browse source documents</button></div></details>}<div className="view-header"><div><div className="view-eyebrow"><span className="view-type-icon"><TreeStructure size={14}/></span>{viewLabels[view.type]}{view.scope && <><span>/</span>{model.entities.find(e => e.id === view.scope)?.name}</>}</div><h1><span className="view-title-text" dir="auto">{view.name}</span><span className="view-badge">{view.type === 'bpmn' ? 'BPMN 2.0' : ['context','container','component','code'].includes(view.type) ? `C4 · Level ${{context:1,container:2,component:3,code:4}[view.type as 'context'|'container'|'component'|'code']}` : view.type === 'deployment' ? 'Infrastructure' : 'Request journey'}</span></h1><p dir="auto">{view.description}</p></div><div className="view-stats"><span><Cube size={15}/>{view.type === 'bpmn' ? Object.keys(view.bindings).length : view.nodes.length} {view.type === 'bpmn' ? 'linked tasks' : 'elements'}</span>{view.type !== 'bpmn' && <span><GitBranch size={15}/>{relationsForView(model,view).length} relationships</span>}<button className="icon-button" aria-label="View diagram documentation" title="Diagram documentation" onClick={() => { setSelection(null); setInspector(true); setTab('docs'); }}><Info size={19}/></button></div></div>
   <WorkspaceEditor processDirty={processDirty} onProcessDirty={setProcessDirty} onEntity={selectEntity} reviewRequired={requiresReview} onSubmitted={historyAvailable?openHistory:undefined} toolboxTarget={toolboxTarget} readOnlyReason={readOnlyReason} layoutRequest={layoutRequest} onLayoutError={message=>setError(`Layout not saved: ${message}`)} key={workspaceGeneration} files={files} model={model} view={view} selection={selection} editing={editing} connecting={connecting} onConnecting={setConnecting} request={editorRequest} directoryHandle={directoryHandle} onConnectFolder={() => void openFolder(true)} spaceId={imported ? null : spaceId} onViewCreated={id => { setViewId(id); setNavigationRevision(value => value + 1); setSelection(null); }} apiToken={imported ? null : apiToken} connection={connectionRequest} onEditing={value => { setEditing(value); setConnecting(false); if (!value && !imported) { editingRef.current = false; void loadLocal(); } }} onPreview={sources => { accept(sources, folderName, false); }} onSaved={(sources, message, keepEditing,presentationOnly) => { accept(sources, folderName, false,presentationOnly); if(!presentationOnly){setEditing(!!keepEditing); setConnecting(false);} setNotice(message); }}/>
   <div className={`canvas-wrapper ${editing?'has-edit-tools':''}`}><div className="canvas-toolbox-host nodrag nopan" ref={setToolboxTarget}/><button className="canvas-expand-toggle nodrag nopan" aria-label={canvasExpanded?'Exit canvas fullscreen':'Enter canvas fullscreen'} title={canvasExpanded?'Exit full canvas · Esc':'Full canvas'} aria-pressed={canvasExpanded} onClick={()=>setCanvasExpanded(value=>!value)}>{canvasExpanded?<CornersIn size={21}/>:<CornersOut size={21}/>}</button><LayerSwitcher model={model} view={view} selection={selection} onNavigate={navigate}/><DiagramCanvas historyChanges={historyPreview?.changes} key={historyPreview?.key ?? workspaceGeneration} readOnly={!!readOnlyReason} fullscreen={canvasExpanded} connectionPorts={presentation.connections} onLayoutSave={command=>{if(readOnlyReason)return;if (imported && !directoryHandle) {
    try {
     const key = browserLayoutKey.current;
     const cached = JSON.parse(localStorage.getItem(key) ?? '{}');
     localStorage.setItem(key, JSON.stringify({...cached, [command.key]: command.layout}));
     setNotice('Layout saved in this browser');
    } catch {
     setNotice('Browser storage unavailable. Layout kept for this session.');
    }
    return;
   }setLayoutRequest({...command,nonce:Date.now()+Math.random()});}} model={model} view={view} navigationRevision={navigationRevision} selection={selection} onEntity={selectEntity} onRelation={selectRelation} positions={previewPositions ?? positions.current} onNavigate={navigate} onAction={request=>{if(readOnlyReason){setNotice(readOnlyReason);return;}if(request.id)setSelection(request.id);setEditorRequest({...request,nonce:Date.now()+Math.random()});}} editing={editing} connecting={connecting} onConnecting={setConnecting} onConnection={request => { setConnectionRequest(request); setConnecting(false); }}/></div>
   <div className="canvas-footer"><div className="legend"><span>Legend</span>{view.type === 'bpmn' ? <><span><i className="legend-dot accent"/>Linked application task</span><span>○ Event</span><span>→ Sequence flow</span></> : <><EntityTypeLegend entities={model.entities}/><span>→ Directed relationship</span>{view.boundaries.length > 0 && <span>▱ Frame · document boundary</span>}{view.flows.length > 0 && <span>Thick arrows · selected input path</span>}</>}</div><button className="text-button" onClick={() => setModal('help')}><Info size={14}/>Canvas guide</button></div></> : <div className="empty-workspace"><img src={brandMarkUrl} alt="OmniDocs" width="56" height="56"/><h1>{error ? 'Open your document workspace' : 'Loading your workspace'}</h1><p>Explore application architecture from a folder of Markdown files.</p><button className="button primary" disabled={editing} onClick={() => service?service.onExit():folderInput.current?.click()}><FolderOpen size={18}/>Open folder</button></div>}
  </main>
  {historyOpen && service && <SpaceHistory spaceId={service.spaceId} token={apiToken} initialProposal={historyProposal}
    onClose={closeHistory} onPreview={previewHistory} onPublished={required=>{setRequiresReview(required);void loadLocal();}}/>}
  {inspector && !historyOpen && <aside className="inspector"><div className="inspector-top"><span>{selectedRelation ? 'Relationship details' : selectedEntity ? 'Element details' : 'View documentation'}</span><button className="icon-button" aria-label="Close details" onClick={() => setInspector(false)}><X size={17}/></button></div>
   <div className="inspector-title">{selectedRelation ? <><span className="detail-symbol"><GitBranch size={25}/></span><span className="detail-type">Directed relationship</span><h2 dir="auto">{selectedRelation.label}</h2><p dir="auto">{selectedRelation.description}</p></> : document ? <>{(() => { const Icon = selectedEntity ? appearanceIcons[entityAppearance(selectedEntity)] : TreeStructure; return <span className={`detail-symbol ${selectedEntity ? `theme-${entityAppearance(selectedEntity)}` : ''}`}><Icon size={27} weight="duotone"/></span>; })()}<span className="detail-type">{selectedEntity ? entityLabels[selectedEntity.kind] : viewLabels[view!.type]}</span><h2 dir="auto">{document.name}</h2><p dir="auto">{document.description}</p>{selectedEntity?.tags.length ? <div className="tags">{selectedEntity.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null}</> : <p>Select an element to explore its details.</p>}</div>
   <div className="detail-tabs"><button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')} title="Overview documentation">Docs</button><button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>Relations{selectedEntity && <span>{selectedRelations.length}</span>}</button><button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}>Code{selectedEntity && <span>{selectedEntity.code.length}</span>}</button><button className={tab === 'source' ? 'active' : ''} onClick={() => setTab('source')} title="Markdown source" aria-label="Markdown source">MD</button></div>
   <div className="inspector-content">
    {tab === 'code' && model && <CodeMappings project={model.project} entity={selectedEntity}/>}
    {tab === 'source' && <><div className="source-filename"><FileMd size={16}/>{selectedRelation?.file ?? document?.source}</div><pre className="source-code"><code>{selectedRelation ? model?.entities.find(e => e.id === selectedRelation.source)?.raw : document?.raw}</code></pre></>}
    {tab === 'docs' && selectedRelation && <><div className="relation-path"><button onClick={() => selectEntity(selectedRelation.source)}><Cube size={17}/>{model?.entities.find(e => e.id === selectedRelation.source)?.name}</button><ArrowDown size={20}/><button onClick={() => selectEntity(selectedRelation.target)}><Cube size={17}/>{model?.entities.find(e => e.id === selectedRelation.target)?.name}</button></div><dl className="properties"><div><dt>Protocol</dt><dd>{communicationText(selectedRelation) || 'Not specified at this level'}</dd></div><div><dt>Link mode</dt><dd>{resolveCommunication(selectedRelation, model?.entities).mode === 'logical' ? 'Logical notification · transport not inferred' : resolveCommunication(selectedRelation, model?.entities).mode === 'brokered' ? 'Via message broker' : 'Direct'}</dd></div><div><dt>Relationship ID</dt><dd><code>{selectedRelation.id}</code></dd></div></dl><ModelProperties properties={selectedRelation.properties}/><h3 className="detail-section-title">Documented payload</h3>{selectedRelation.payload.length ? <div className="payload">{selectedRelation.payload.map(field => <code key={field}>{field}</code>)}</div> : <p className="muted">Payload fields are not defined for this relationship.</p>}<p className="flow-note"><Info size={16}/>Arrows describe documented interactions. They do not represent live application traffic.</p></>}
    {tab === 'docs' && !selectedRelation && document && <>
     {selectedEntity && <><dl className="properties">{selectedEntity.technology && <div><dt>Technology</dt><dd>{selectedEntity.technology}</dd></div>}{selectedEntity.owner && <div><dt>Owner</dt><dd>{selectedEntity.owner}</dd></div>}<div><dt>Model ID</dt><dd><code>{selectedEntity.id}</code></dd></div></dl>{model && childView(model, selectedEntity.id) && <button className="button primary explore-button" onClick={() => navigate(childView(model,selectedEntity.id)!.id)}><Stack size={17}/>Explore {viewLabels[childView(model,selectedEntity.id)!.type].toLowerCase()}<ArrowRight size={16}/></button>}</>}
     {originalView&&selectedEntity&&<button className="button secondary explore-button" onClick={()=>{navigate(originalView.id);selectEntity(selectedEntity.id);}}><ArrowUpRight size={16}/>Open in C4 model</button>}
     {selectedEntity && selectedEntity.code.length > 0 && <button className="code-mapping-teaser" onClick={() => setTab('code')}><Code size={17}/><span><strong>Linked code</strong><small>{selectedEntity.code.length} mappings · repositories and symbols</small></span><ArrowRight size={15}/></button>}
     <ModelProperties properties={selectedEntity?.properties}/>
     <article className="markdown" dir="auto"><ReactMarkdown remarkPlugins={[remarkGfm]}>{document.body.replace(/```bpmn[\s\S]*?```/g, '')}</ReactMarkdown></article>
     {relatedViews.length > 0 && <div className="related-views"><h3 className="detail-section-title">Explore connected views</h3>{relatedViews.map(v => <button key={v.id} onClick={() => navigate(v.id)}><span><GitBranch size={16}/>{v.name}</span><ArrowUpRight size={15}/></button>)}</div>}
    </>}
    {tab === 'relations' && <>{selectedEntity ? selectedRelations.length ? selectedRelations.map(r => <button key={r.id} className="relationship-card" onClick={() => selectRelation(r)}><span className="relation-direction">{r.source === selectedEntity.id ? 'Outgoing' : 'Incoming'}<ArrowUpRight size={14}/></span><strong>{r.label}</strong><span>{model?.entities.find(e => e.id === (r.source === selectedEntity.id ? r.target : r.source))?.name}</span>{r.protocol && <small>{r.protocol}</small>}</button>) : <p className="muted">No relationships are defined for this element.</p> : selectedRelation ? <div className="relation-path"><button onClick={() => selectEntity(selectedRelation.source)}>Inspect source element<ArrowUpRight size={16}/></button><button onClick={() => selectEntity(selectedRelation.target)}>Inspect target element<ArrowUpRight size={16}/></button></div> : <p className="muted">Select an element to see its incoming and outgoing relationships.</p>}</>}
   </div><div className="inspector-source"><FileMd size={15}/><span>{selectedRelation?.file ?? document?.source ?? 'Markdown workspace'}</span><CheckCircle size={15}/></div>
  </aside>}
  <footer className="statusbar"><span><PlugsConnected size={13}/>{model ? `${model.entities.length} elements connected` : 'Document studio'}</span><span>{model ? `${model.views.length} views` : ''}<span className="status-separator"/>{diagnostics.length ? <button onClick={() => setModal('errors')}><WarningCircle size={13}/>{diagnostics.length} model issues</button> : model ? <><CheckCircle size={13}/>Model references valid</> : 'Waiting for documents'}</span><span>Markdown is the source of truth<FileMd size={14}/></span></footer>
  {notice && <div className="toast" role="status"><CheckCircle size={18}/>{notice}</div>}
  {folderReview && <FolderSetup folder={folderReview} onClose={() => setFolderReview(null)} onCreated={sources => { if (!folderReview.handle) return; connectFolder(folderReview.handle,sources,folderReview.startEditing); setFolderReview({...folderReview,sources,empty:false,inspection:inspectWorkspace(sources)}); }}/>}
  {modal === 'spaces' && <SpaceManager active={spaceId} onOpen={openSpace} onClose={() => setModal(null)}/>}
  {modal === 'search' && <Modal title="Find in your application" onClose={() => setModal(null)}><div className="modal-search"><MagnifyingGlass size={20}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search elements, responsibilities, or technology…" aria-label="Search application model"/></div><div className="search-results">{searchResults.map(e => { const Icon = appearanceIcons[entityAppearance(e)]; return <button key={e.id} onClick={() => locateEntity(e.id)}><Icon size={21}/><span><strong>{e.name}</strong><small>{entityLabels[e.kind]}{e.technology ? ` / ${e.technology}` : ''}</small></span><ArrowUpRight size={16}/></button>; })}{!searchResults.length && <p className="muted">No matching elements. Try a name or technology.</p>}</div></Modal>}
  {modal === 'files' && <Modal title="Workspace documents" onClose={() => setModal(null)}><p className="modal-description">{files.length} documents in {folderName}/. Select a document to read it or inspect its source.</p><div className="file-list">{files.map(file => <button key={file.path} onClick={() => { setRawFile(file); setModal('document'); }}><FileMd size={18}/><span>{file.path}</span><ArrowUpRight size={14}/></button>)}</div></Modal>}
  {modal === 'document' && rawFile && <Modal title={rawFile.path} onClose={() => setModal(null)}><div className="document-actions"><button className="text-button" onClick={() => setModal('files')}>All documents</button><button className="text-button" onClick={() => setModal('raw')}>Raw Markdown</button></div><DocumentReader file={rawFile} files={files} onOpen={file => { setRawFile(file); setModal('document'); }} onMissing={path => setNotice(`Document not found: ${path}`)}/></Modal>}
  {modal === 'raw' && rawFile && <Modal title={rawFile.path} onClose={() => setModal(null)}><div className="guide"><button className="text-button" onClick={() => setModal('document')}>Read document</button><pre className="source-code"><code>{rawFile.content}</code></pre></div></Modal>}
  {modal === 'errors' && <Modal title="Document model issues" onClose={() => setModal(null)}><p className="modal-description">{model ? 'The last valid model remains visible. ' : ''}Correct these issues in the source files. Imported folders must be reopened after editing.</p><ul className="diagnostics">{diagnostics.map((issue,i) => <li key={i}><WarningCircle size={18}/><span>{issue}</span></li>)}</ul></Modal>}
  {modal === 'help' && <Modal title="Your application, connected" onClose={() => setModal(null)}><div className="guide"><p>OmniDocs turns a folder of structured Markdown into an application explorer.</p><h3>Explore the architecture</h3><p>Single-click an element to focus it and its direct connections; unrelated elements fade. Double-click a system to expand its containers inside the same diagram, or double-click a container to see its components. Click the background, Clear focus, or press Escape to restore the full diagram. Use Collapse to close an expanded box. The Layers icon changes the entire canvas level; breadcrumbs and the explorer open full diagrams. Other elements open their documentation.</p><h3>Open the implementation</h3><p>Code elements open their declared file and symbol mappings. The Code tab groups Backend and Frontend repositories separately, with an explicit version/ref for every link. MD shows the architecture document source. Repository contents are not fetched or analyzed.</p><h3>Follow the connections</h3><p>Click an arrow to see its source, target, protocol, and documented payload. Moving markers follow the arrows from source to target. They show documented direction, not live traffic or process execution. Data flow numbers follow the relationship order defined in the view.</p><h3>Read a business process</h3><p>Open Processes to explore BPMN. Highlighted tasks link to application components. BPMN is a complementary view, not another C4 level.</p><h3>Bring your own documents</h3><p>Use Open folder to import an OmniDocs Markdown folder. Frontmatter defines entities and views; the document body supplies the details. See <code>docs/FORMAT.md</code> for the schema. Use Edit workspace to add or change model items and directed connections. Select an arrow and choose Delete connection, or press Delete/Backspace, to remove it from the draft. Undo reverses the latest draft change. Review & save writes the Markdown files with backups. Open folder connects the project folder with read/write access once. All later saves use that folder. The local backend writes directly to the selected Space folder.</p><h3>Navigate the canvas</h3><p>Drag the background to pan. Scroll or use the controls to zoom. Use the fit button to frame the diagram. Node positions and viewports are retained while switching views in this session.</p><div className="guide-note"><Info size={20}/><p>{isDemo ? 'The included Orbit Commerce workspace is fictional.' : 'This workspace is loaded from your source documents.'} Diagrams describe documented architecture, not monitored traffic. OmniDocs frontmatter and supported Structurizr JSON are separate input adapters.</p></div></div></Modal>}
 </div>;
}
