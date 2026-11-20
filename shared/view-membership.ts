import type {Entity,Model,View} from './model.ts';
/** Reuse a model element without changing its ownership or C4 abstraction. */
export function canIncludeEntity(view:View,entity:Entity,model:Model){
 if(view.type==='bpmn')return false;
 if(view.type==='context')return ['person','system','external'].includes(entity.kind);
 if(entity.id===view.scope)return false;
 if(view.type==='container')return ['person','system','external'].includes(entity.kind)||(['container','database','queue'].includes(entity.kind)&&entity.parent===view.scope);
 if(view.type==='component'){const owner=model.entities.find(item=>item.id===view.scope);return entity.id!==owner?.parent&&(['person','system','external'].includes(entity.kind)||(['container','database','queue'].includes(entity.kind)&&entity.parent===owner?.parent)||(entity.kind==='component'&&entity.parent===view.scope));}
 if(view.type==='code')return entity.kind==='code'&&entity.parent===view.scope;
 if(view.type==='deployment')return entity.kind==='deployment';
 return view.type==='dataflow'&&(view.layout!=='levels'||['person','system','external','container','database','queue','component'].includes(entity.kind));
}
export function existingViewCandidates(model:Model,view:View){return model.entities.filter(entity=>!view.nodes.includes(entity.id)&&canIncludeEntity(view,entity,model));}
