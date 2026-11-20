import ELK from 'elkjs/lib/elk.bundled.js';
import {defaultArrangement,type Arrangement} from './layout-state.ts';
const elk=new ELK();
type Shape={id:string;width:number;height:number};type Link={id:string;sources:string[];targets:string[]};
export function relationshipOrder(shapes:Shape[],links:Link[]):Shape[]{
 const ids=new Set(shapes.map(shape=>shape.id)),index=new Map(shapes.map((shape,i)=>[shape.id,i]));
 const outgoing=new Map(shapes.map(shape=>[shape.id,new Set<string>()])),neighbours=new Map(shapes.map(shape=>[shape.id,new Set<string>()])),incoming=new Map(shapes.map(shape=>[shape.id,0]));
 for(const edge of links){const a=edge.sources[0],b=edge.targets[0];if(!ids.has(a)||!ids.has(b)||a===b||outgoing.get(a)!.has(b))continue;outgoing.get(a)!.add(b);neighbours.get(a)!.add(b);neighbours.get(b)!.add(a);incoming.set(b,incoming.get(b)!+1);}
 const remaining=new Set(ids),order:string[]=[];
 while(remaining.size){
  const seed=[...remaining].sort((a,b)=>neighbours.get(b)!.size-neighbours.get(a)!.size||index.get(a)!-index.get(b)!)[0],component=new Set([seed]),queue=[seed];
  while(queue.length){for(const id of neighbours.get(queue.shift()!)!)if(remaining.has(id)&&!component.has(id)){component.add(id);queue.push(id);}}
  const pending=new Set(component);
  while(pending.size){const available=[...pending].filter(id=>incoming.get(id)===0);const id=(available.length?available:[...pending]).sort((a,b)=>neighbours.get(b)!.size-neighbours.get(a)!.size||index.get(a)!-index.get(b)!)[0];order.push(id);pending.delete(id);remaining.delete(id);for(const next of outgoing.get(id)!)incoming.set(next,incoming.get(next)!-1);}
 }
 const byId=new Map(shapes.map(shape=>[shape.id,shape]));return order.map(id=>byId.get(id)!);
}
export async function arrangeShapes(id:string,shapes:Shape[],links:Link[],direction:'RIGHT'|'DOWN',options:Arrangement=defaultArrangement){
 const gap={compact:48,comfortable:88,wide:144}[options.spacing];
 if(['row','column','grid'].includes(options.mode)){
  const ordered=relationshipOrder(shapes,links),columns=options.mode==='row'?Math.max(1,ordered.length):options.mode==='column'?1:Math.max(1,Math.ceil(Math.sqrt(ordered.length)));
  const widths=Array.from({length:columns},(_,column)=>Math.max(0,...ordered.filter((_,i)=>i%columns===column).map(node=>node.width)));
  const heights=Array.from({length:Math.ceil(ordered.length/columns)},(_,row)=>Math.max(0,...ordered.slice(row*columns,(row+1)*columns).map(node=>node.height)));
  const children=ordered.map((node,i)=>({...node,x:36+widths.slice(0,i%columns).reduce((sum,width)=>sum+width+gap,0),y:36+heights.slice(0,Math.floor(i/columns)).reduce((sum,height)=>sum+height+gap,0)}));
  return{children,width:72+widths.reduce((a,b)=>a+b,0)+Math.max(0,columns-1)*gap,height:72+heights.reduce((a,b)=>a+b,0)+Math.max(0,heights.length-1)*gap};
 }
 return elk.layout({id,children:shapes,edges:links,layoutOptions:{'elk.algorithm':'layered','elk.direction':options.mode==='horizontal'?'RIGHT':options.mode==='vertical'?'DOWN':direction,'elk.spacing.nodeNode':String(gap),'elk.spacing.componentComponent':String(gap),'elk.layered.spacing.nodeNodeBetweenLayers':String(gap+100),'elk.layered.nodePlacement.strategy':'NETWORK_SIMPLEX','elk.layered.nodePlacement.favorStraightEdges':'true','elk.layered.thoroughness':'12','elk.layered.spacing.edgeNodeBetweenLayers':'30','elk.layered.spacing.edgeEdgeBetweenLayers':'18','elk.edgeRouting':'ORTHOGONAL','elk.padding':'[top=36,left=36,bottom=36,right=36]'}});
}
