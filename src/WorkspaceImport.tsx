import {useState} from 'react';
import {FolderOpen,UploadSimple,X} from '@phosphor-icons/react';
import {inspectWorkspace,type WorkspaceInspection} from '../shared/workspace-inspection';
import {workspaceBundleSchema,workspaceDocumentsSchema,workspaceImportMaxBytes,workspaceImportMaxFiles,
 type WorkspaceBundle} from '../shared/workspace-transfer';

type ImportPreview={bundle:WorkspaceBundle;inspection:WorkspaceInspection};

export function WorkspaceImport({project,busy,error,onImport,onClose}:{
 project:string;busy:boolean;error:string;onImport:(bundle:WorkspaceBundle)=>void;onClose:()=>void;
}) {
 const [preview,setPreview]=useState<ImportPreview|null>(null);
 const [reading,setReading]=useState(false);
 const [inputError,setInputError]=useState('');

 async function load(selection:File[],folder:boolean) {
  if(!selection.length)return;
  setReading(true);setInputError('');setPreview(null);
  try{
   let bundle:WorkspaceBundle;
   if(folder){
    const documents=selection.map(file=>({file,path:file.webkitRelativePath.split('/').slice(1).join('/')}))
     .filter(({path})=>/\.md$/i.test(path)&&!path.split('/').some(part=>part.startsWith('.')||part==='node_modules'));
    if(documents.length>workspaceImportMaxFiles)throw new Error('Choose a folder with no more than 2,000 Markdown files.');
    if(documents.reduce((size,{file})=>size+file.size,0)>workspaceImportMaxBytes)throw new Error('The workspace exceeds the 10 MiB import limit.');
    const files=workspaceDocumentsSchema.parse(await Promise.all(documents.map(async ({file,path})=>({path,content:await file.text()}))));
    const inspection=inspectWorkspace(files);
    bundle={format:'omnidocs-workspace',version:1,files,name:inspection.projectName.slice(0,160),
     description:inspection.projectDescription.slice(0,2000)||'Imported architecture documentation.'};
    setPreview({bundle,inspection});
   }else{
    const file=selection[0];
    if(file.size>workspaceImportMaxBytes)throw new Error('The workspace exceeds the 10 MiB import limit.');
    const parsed=workspaceBundleSchema.safeParse(JSON.parse(await file.text()));
    if(!parsed.success)throw new Error('Choose a version 1 OmniDocs workspace export (.omnidocs.json).');
    bundle=parsed.data;
    setPreview({bundle,inspection:inspectWorkspace(bundle.files)});
   }
  }catch(error){
   setInputError(error instanceof SyntaxError?'Unable to read this workspace export. The file must contain valid JSON.':
    error instanceof Error?error.message:'Unable to read the selected workspace.');
  }finally{setReading(false);}
 }

 return <section className="service-modal hub-creation workspace-import">
  <div className="hub-creation-heading">
   <div><h2>Import workspace</h2><p>Create a workspace in <strong dir="auto">{project}</strong> from a Markdown folder or an OmniDocs export.</p></div>
   <button type="button" className="hub-icon-button" aria-label="Close import" disabled={busy} onClick={onClose}><X size={21}/></button>
  </div>
  <div className="workspace-import-sources">
   <label className="button secondary"><FolderOpen size={19}/>Choose folder<input type="file" multiple
    {...{webkitdirectory:''}} disabled={busy||reading} aria-label="Choose Markdown folder" onChange={event=>{
     const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';void load(files,true);
    }}/></label>
   <label className="button secondary"><UploadSimple size={19}/>Choose export<input type="file" accept=".json,application/json"
    disabled={busy||reading} aria-label="Choose OmniDocs export" onChange={event=>{
     const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';void load(files,false);
    }}/></label>
  </div>
  {reading&&<p role="status">Checking workspace documents…</p>}
  {(inputError||error)&&<p className="editor-error" role="alert">{inputError||error}</p>}
  {preview&&<form className="editor-form" onSubmit={event=>{
   event.preventDefault();
   if(!busy&&preview.inspection.compatible)onImport(preview.bundle);
  }}>
   <p role="status">{preview.inspection.format} · {preview.inspection.documents} files · {preview.inspection.views} views</p>
   {!preview.inspection.compatible&&<ul className="editor-error" role="alert">{preview.inspection.errors.slice(0,5).map((message,index)=>
    <li key={index}>{message}</li>)}</ul>}
   {!!preview.inspection.notes.length&&<details open={!preview.inspection.editable}>
    <summary>Validation notes</summary>
    <ul>{preview.inspection.notes.map((note,index)=><li key={index}>{note}</li>)}</ul>
   </details>}
   {preview.inspection.compatible&&<>
    <label>Workspace name<input required maxLength={160} value={preview.bundle.name} onChange={event=>
     setPreview({...preview,bundle:{...preview.bundle,name:event.target.value}})}/></label>
    <label>Description<textarea required maxLength={2000} rows={2} value={preview.bundle.description} onChange={event=>
     setPreview({...preview,bundle:{...preview.bundle,description:event.target.value}})}/></label>
   </>}
   <div className="editor-actions">
    <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
    <button className="button primary" disabled={busy||!preview.inspection.compatible}>{busy?'Importing…':'Import workspace'}</button>
   </div>
  </form>}
 </section>;
}
