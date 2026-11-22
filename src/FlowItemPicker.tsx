import type {Entity,Model} from '../shared/model';
import {abstractionLevel} from '../shared/ownership-frames';

const layers=[
 ['L2','C2 · Containers'],
 ['L1','C1 · People and systems'],
 ['L3','C3 · Components'],
] as const;

export function FlowItemPicker({label,items,model,value,onChange,disabled,allowUnlinked=false}:{
 label:string;items:Entity[];model:Model;value:string;onChange:(id:string)=>void;disabled:boolean;allowUnlinked?:boolean;
}){
 const groups=allowUnlinked?[...layers,['L4','C4 · Code'],['deployment','Deployment']]:layers;
 const names=new Map(model.entities.map(item=>[item.id,item.name]));
 return <label>{label}<select value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>
  <option value="" disabled={!allowUnlinked}>{allowUnlinked?'No linked item':'Select a model item'}</option>
  {groups.map(([level,title])=>{
   const options=items.filter(item=>(abstractionLevel(item)??item.kind)===level);
   return options.length>0&&<optgroup key={level} label={title}>
    {options.map(item=><option key={item.id} value={item.id}>{item.parent?`${names.get(item.parent)} / `:''}{item.name} · {item.kind}</option>)}
   </optgroup>;
  })}
 </select></label>;
}
