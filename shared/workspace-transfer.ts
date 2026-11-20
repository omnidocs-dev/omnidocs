import {z} from 'zod';

export const workspaceImportMaxBytes = 10 * 1024 * 1024;
export const workspaceImportMaxFiles = 2000;

export function isWorkspaceDocument(path:string) {
 return /\.md$/i.test(path) && path.split('/').every(part=>
  part.length>0 && !part.startsWith('.') && part.toLowerCase()!=='node_modules' &&
  !/[\u0000-\u001f\\:*?"<>|]/.test(part) && !/[. ]$/.test(part),
 );
}

export const workspaceDocumentsSchema=z.array(z.object({
 path:z.string().max(800).refine(isWorkspaceDocument,'A workspace document must have a relative Markdown path.'),
 content:z.string(),
}).strict()).min(1,'No Markdown documents were found.').max(workspaceImportMaxFiles).superRefine((files,ctx)=>{
 const paths=new Set<string>();
 const folders=new Set<string>();
 for(const [index,{path}] of files.entries()){
  const key=path.normalize('NFC').toLowerCase();
  const parts=key.split('/');
  const parents=parts.slice(0,-1).map((_,idx)=>parts.slice(0,idx+1).join('/'));
  if(paths.has(key)||folders.has(key)||parents.some(parent=>paths.has(parent))){
   ctx.addIssue({code:'custom',path:[index,'path'],message:`Conflicting workspace path: ${path}`});
  }
  paths.add(key);
  for(const parent of parents)folders.add(parent);
 }
});

export const workspaceMetadataSchema=z.object({
 name:z.string().trim().min(1).max(160),
 description:z.string().trim().min(1).max(2000),
});

export const workspaceBundleSchema=workspaceMetadataSchema.extend({
 format:z.literal('omnidocs-workspace'),
 version:z.literal(1),
 files:workspaceDocumentsSchema,
}).strict();
export type WorkspaceBundle=z.infer<typeof workspaceBundleSchema>;
