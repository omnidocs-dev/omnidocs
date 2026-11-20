import { parseDocument } from 'yaml';
import type { Model, SourceFile } from './model.ts';

export function planEntityDeletion(model: Model, id: string) {
 const entity=model.entities.find(entity=>entity.id===id);
 if (!entity) throw new Error('This item no longer exists.');
 const ids=new Set([id]);
 let changed=true;
 while(changed) { changed=false; for(const item of model.entities) if(item.parent&&ids.has(item.parent)&&!ids.has(item.id)){ids.add(item.id);changed=true;} }
 const entities=model.entities.filter(item=>ids.has(item.id));
 const relations=model.relations.filter(relation=>ids.has(relation.source)||ids.has(relation.target));
 const views=model.views.filter(view=>view.scope&&ids.has(view.scope));
 const home=model.views.find(view=>view.id===model.project.home);
 const blocked=home?.scope&&ids.has(home.scope) || views.some(view=>view.id===model.project.home) ? 'The primary system owning the home view cannot be deleted. Delete its internal items individually.' : entities.length===model.entities.length ? 'The last model item cannot be deleted.' : '';
 return {entity,entities,relations,views,blocked,requiresCascade:entities.length>1||views.length>0};
}
export type EntityDeletion = ReturnType<typeof planEntityDeletion>;
export function deleteNativeEntity(files: SourceFile[], model: Model, plan: EntityDeletion) {
 const ids=new Set(plan.entities.map(item=>item.id)), relations=new Set(plan.relations.map(item=>item.id)), views=new Set(plan.views.map(item=>item.id));
 const deletedFiles=new Set([...plan.entities,...plan.views].map(item=>item.source));
 const edit=(file:SourceFile, callback:(doc:ReturnType<typeof parseDocument>)=>void)=>{
  const match=file.content.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match)throw new Error(`${file.path}: YAML frontmatter required.`);
  const doc=parseDocument(match[1]);if(doc.errors.length)throw new Error(`${file.path}: Invalid YAML.`);callback(doc);
  return {...file,content:`---\n${doc.toString()}---\n${file.content.slice(match[0].length)}`};
 };
 return files.filter(file=>!deletedFiles.has(file.path)).map(file=>{
  const owner=model.entities.find(entity=>entity.source===file.path);
  const view=model.views.find(view=>view.source===file.path);
  if(owner&&owner.relationships.some(relation=>relations.has(relation.id)))return edit(file,doc=>doc.set('relationships',(doc.get('relationships')?.toJSON()??[]).filter((relation:any)=>!relations.has(relation.id))));
  if(!view)return file;
  return edit(file,doc=>{
   doc.set('nodes',view.nodes.filter(id=>!ids.has(id)));
   if(view.relationships)doc.set('relationships',view.relationships.filter(id=>!relations.has(id)));
   if(view.parentView&&views.has(view.parentView))doc.delete('parentView');
   const frames=view.boundaries.map(frame=>({...frame,nodes:frame.nodes.filter(id=>!ids.has(id))})).filter(frame=>frame.nodes.length);
   const frameIds=new Set(frames.map(frame=>frame.id));
   if(view.boundaries.length)doc.set('boundaries',frames.map(frame=>({...frame,parent:frame.parent&&frameIds.has(frame.parent)?frame.parent:undefined})));
   if(view.entryPoints.length)doc.set('entryPoints',view.entryPoints.filter(entry=>!ids.has(entry.node)));
   if(view.flows.length)doc.set('flows',view.flows.map(flow=>({...flow,relationships:flow.relationships.filter(id=>!relations.has(id))})).filter(flow=>flow.relationships.length));
   if(Object.keys(view.bindings).length)doc.set('bindings',Object.fromEntries(Object.entries(view.bindings).filter(([,id])=>!ids.has(id))));
  });
 });
}
