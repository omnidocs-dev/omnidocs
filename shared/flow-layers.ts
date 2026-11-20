import type {Model,View} from './model.ts';
import {abstractionLevel} from './ownership-frames.ts';
export function flowLayersView(model:Model,view:View):View{
 if(view.type!=='dataflow'||view.layout!=='levels')return view;
 return{...view,boundaries:([
  ['L1','People & systems','blue'],['L2','Containers','sage'],['L3','Components','amber']
 ] as const).map(([level,name,tone])=>({id:`flow-level-${level}`,name:`${level} · ${name}`,category:'Abstraction band',description:'Add model items here, then draw connections manually.',tone,nodes:view.nodes.filter(id=>abstractionLevel(model.entities.find(entity=>entity.id===id)!)===level)}))};
}
