import {childView,type Model,type View} from './model.ts';
import {canIncludeEntity} from './view-membership.ts';
/** Lift supporting elements of open descendants into their nearest visible owning context. */
export function inlineContextView(model:Model,view:View,expanded:ReadonlySet<string>,parentId?:string):View{
 const entities=new Map(model.entities.map(entity=>[entity.id,entity]));const support=new Set<string>();
 const ownedBy=(id:string,scope?:string)=>{let item=entities.get(id);const seen=new Set<string>();while(item?.parent&&!seen.has(item.id)){seen.add(item.id);if(item.parent===scope)return true;item=entities.get(item.parent);}return false;};
 const visit=(current:View,prefix:string|undefined,seen:ReadonlySet<string>)=>{
  for(const id of current.nodes){const occurrence=`${prefix?`${prefix}/`:''}${encodeURIComponent(id)}`,child=childView(model,id);
   if(!expanded.has(occurrence)||!child||seen.has(child.id))continue;
   for(const target of child.nodes)if(target!==child.scope&&!ownedBy(target,child.scope))support.add(target);
   visit(child,occurrence,new Set([...seen,child.id]));
  }
 };
 visit(view,parentId,new Set([view.id]));
 const added=[...support].filter(id=>{const entity=entities.get(id);return entity&&id!==view.scope&&!view.nodes.includes(id)&&canIncludeEntity(view,entity,model);});
 return added.length?{...view,nodes:[...view.nodes,...added]}:view;
}
