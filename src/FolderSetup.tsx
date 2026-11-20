import { useEffect, useRef, useState } from 'react';
import { CheckCircle, WarningCircle, X, FileMd } from '@phosphor-icons/react';
import { scaffoldSpace } from '../shared/space-scaffold';
import { inspectWorkspace, type WorkspaceInspection } from '../shared/workspace-inspection';
import type { SourceFile } from '../shared/model';
import { initializeDirectory, readDirectory } from './folder-write';

export type FolderReview = { handle: FileSystemDirectoryHandle | null; name: string; sources: SourceFile[]; inspection: WorkspaceInspection; empty: boolean; startEditing: boolean };
export function FolderSetup({ folder, onCreated, onClose }: { folder: FolderReview; onCreated: (files: SourceFile[]) => void; onClose: () => void }) {
 const ref = useRef<HTMLDialogElement>(null);
 const [name, setName] = useState(folder.name), [description, setDescription] = useState(''), [systemName, setSystemName] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 useEffect(() => { ref.current?.showModal(); }, []);
 let preview: SourceFile[] = [];
 try { preview = scaffoldSpace({name:name || 'Application',description:description || 'Describe the purpose of your application.',...(systemName.trim() ? {systemName} : {})}); } catch { /* Show form validation before creating files. */ }
 async function create() {
  if (!folder.handle || busy) return;
  setBusy(true); setError('');
  try {
   const files = scaffoldSpace({name,description,...(systemName.trim() ? {systemName} : {})});
   await initializeDirectory(folder.handle,files);
   const actual = await readDirectory(folder.handle), report = inspectWorkspace(actual);
   if (!report.compatible) throw new Error(`Created files require review: ${report.errors.join('\n')}`);
   onCreated(actual);
  } catch (err) { setError(err instanceof Error ? err.message : 'Cannot create documentation.'); }
  finally { setBusy(false); }
 }
 const report = folder.inspection;
 return <dialog ref={ref} className="modal folder-setup-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
  <div className="modal-header"><h2>{folder.empty ? 'Create documentation in this folder?' : report.compatible ? 'Folder validated · Compatible' : 'Folder validation · Not compatible'}</h2><button className="icon-button" aria-label="Close folder validation" disabled={busy} onClick={onClose}><X size={19}/></button></div>
  {folder.empty ? <form className="editor-form" onSubmit={event => { event.preventDefault(); void create(); }}>
   <p><strong dir="auto">{folder.name}/</strong> is empty. Review the structure below, then confirm to create your documentation here. Cancel leaves the folder unchanged.</p>
   <label>Project name<input required maxLength={160} dir="auto" value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>
   <label>Purpose / description<textarea required maxLength={2000} rows={3} dir="auto" value={description} disabled={busy} onChange={event => setDescription(event.target.value)}/></label>
   <label>Primary software system<input maxLength={160} dir="auto" placeholder={name} value={systemName} disabled={busy} onChange={event => setSystemName(event.target.value)}/></label>
   <p>Creates a C1 context and an empty C2 container view. You can add C3 components later. The canonical model is Structurizr DSL in Markdown; JSON and diagram previews are synchronized. Official Structurizr export/inspection remains pending.</p>
   <div className="folder-file-preview">{preview.map(file => <details key={file.path}><summary><FileMd size={16}/>{file.path} · new file</summary><pre className="source-code">{file.content}</pre></details>)}</div>
   {error && <p className="editor-error" role="alert">{error}</p>}
   <div className="editor-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy || !preview.length}>{busy ? 'Creating…' : 'Confirm · Create these files'}</button></div>
  </form> : <div className="editor-form">
   <p><strong dir="auto">{folder.name}/</strong></p>
   <p className="folder-validation-result">{report.compatible ? <CheckCircle size={20}/> : <WarningCircle size={20}/>} {report.compatible ? 'Compatible with the supported OmniDocs document structure. Loaded into the Studio.' : 'This folder cannot be rendered as an OmniDocs model. The previous project remains open; no files were changed.'}</p>
   <p>{report.documents} Markdown documents · {report.elements} elements · {report.views} views</p>
   {report.compatible && <p>Format: {report.format} · {report.editable ? 'Visual editing supported' : 'View only'}</p>}
   {!report.documents && <p>This folder contains other files but no Markdown documents. Choose an empty folder to initialize a new project, or a folder containing a supported architecture model.</p>}
   {!!report.errors.length && <ul className="diagnostics">{report.errors.map((issue,index) => <li key={index}><WarningCircle size={17}/><span>{issue}</span></li>)}</ul>}
   {!!report.notes.length && <details><summary>Validation notes ({report.notes.length})</summary>{report.notes.map((note,index)=><p key={index}>{note}</p>)}<p>These checks validate supported structure, references and declared source digests. They are not official Structurizr parser certification.</p></details>}
   {!!folder.sources.length && <details><summary>Inspected Markdown files</summary><ul>{folder.sources.map(file=><li key={file.path}><code>{file.path}</code></li>)}</ul></details>}
   <div className="editor-actions"><button className="button primary" onClick={onClose}>{report.compatible ? 'Continue to project' : 'Close report'}</button></div>
  </div>}
 </dialog>;
}
