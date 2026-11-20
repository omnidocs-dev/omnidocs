import type {Entity,Model,View} from './model.ts';
type Boundary=View['boundaries'][number];
/** Derive presentation boundaries from ownership, without editing document-defined membership. */
export function ownershipView(model:Model,view:View):View{
 if(!['container','component'].includes(view.type)||!view.scope)return view;
 const entities=new Map(model.entities.map(entity=>[entity.id,entity]));
 const scope=entities.get(view.scope);if(!scope)return view;
 const ancestors:Entity[]=[];const seen=new Set<string>();let current:Entity|undefined=scope;
 while(current&&!seen.has(current.id)){
  seen.add(current.id);if(['system','external','container','database','queue'].includes(current.kind))ancestors.unshift(current);
  current=current.parent?entities.get(current.parent):undefined;
 }
 if(!ancestors.length)return view;
 const explicit=view.boundaries.filter(boundary=>boundary.id!=='structurizr-scope');
 const used=new Set(explicit.map(boundary=>boundary.id));
 const unique=(base:string)=>{let id=base;while(used.has(id))id=`_${id}`;used.add(id);return id;};
 const ownerIds=new Map(ancestors.map(entity=>[entity.id,unique(entity.id===scope.id?'structurizr-scope':`ownership-${entity.id}`)]));
 const boundaryParent=new Map<string,string|undefined>();
 const generated:Boundary[]=ancestors.map((entity,index)=>{
  const id=ownerIds.get(entity.id)!,parent=index?ownerIds.get(ancestors[index-1].id):undefined;boundaryParent.set(id,parent);
  const system=['system','external'].includes(entity.kind);
  return{id,parent,name:entity.name,description:entity.description,category:system?'Software system · L1':'Container · L2',nodes:[],tone:system?'blue':'sage'};
 });
 const ownerFor=(id:string)=>{
  let entity=entities.get(id);const visited=new Set<string>();
  while(entity?.parent&&!visited.has(entity.id)){visited.add(entity.id);const owner=ownerIds.get(entity.parent);if(owner)return owner;entity=entities.get(entity.parent);}
  return undefined;
 };
 const membership=new Map(view.nodes.map(id=>[id,ownerFor(id)]));
 const customMembership=new Set(explicit.flatMap(boundary=>boundary.nodes));
 for(const id of view.nodes)if(!customMembership.has(id)){const owner=membership.get(id);generated.find(boundary=>boundary.id===owner)?.nodes.push(id);}
 // Keep custom group hierarchies, placing each whole group under its nearest common owner.
 const commonOwner=(owners:(string|undefined)[])=>{
  if(!owners.length)return ownerIds.get(scope.id);
  let owner=owners[0];while(owner&&!owners.every(candidate=>{while(candidate){if(candidate===owner)return true;candidate=boundaryParent.get(candidate);}return false;}))owner=boundaryParent.get(owner);
  return owner;
 };
 const customNodes=(id:string):string[]=>[...explicit.find(boundary=>boundary.id===id)!.nodes,...explicit.filter(boundary=>boundary.parent===id).flatMap(boundary=>customNodes(boundary.id))];
 const custom=explicit.map(boundary=>({...boundary,nodes:[...boundary.nodes],parent:boundary.parent??commonOwner(customNodes(boundary.id).map(id=>membership.get(id)))}));
 const boundaries=[...generated,...custom];
 const outside=view.nodes.filter(id=>!membership.get(id));
 if(outside.length){
  const context=unique('ownership-context');
  const ungrouped=outside.filter(id=>!customMembership.has(id));
  for(const boundary of boundaries)if(!boundary.parent)boundary.parent=context;
  boundaries.unshift({id:context,name:'Related people & systems',description:'Context envelope · visual grouping, not an ownership boundary',category:'Surrounding context',nodes:ungrouped,tone:'neutral'});
 }
 return{...view,boundaries};
}
export function abstractionLevel(entity:Pick<Entity,'kind'>){
 if(['person','system','external'].includes(entity.kind))return 'L1';
 if(['container','database','queue'].includes(entity.kind))return 'L2';
 if(entity.kind==='component')return 'L3';
 if(entity.kind==='code')return 'L4';
 return undefined;
}
