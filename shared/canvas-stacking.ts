export type StackNode={id:string;parentId?:string;type?:string;zIndex?:number;data?:Record<string,unknown>};
export type StackEdge={zIndex?:number;data?:Record<string,unknown>};

/** Paint whole expanded branches after the overview; selection never elevates unrelated overview nodes. */
export function canvasStacking<T extends StackNode>(input:T[],viewId:string,activeId?:string|null){
 const byId=new Map(input.map(node=>[node.id,node]));const children=new Map<string|undefined,T[]>();
 for(const node of input){const parent=node.parentId&&byId.has(node.parentId)?node.parentId:undefined;children.set(parent,[...(children.get(parent)??[]),node]);}
 const active=new Set<string>();let current=activeId?byId.get(activeId):undefined;
 while(current&&!active.has(current.id)){active.add(current.id);current=current.parentId?byId.get(current.parentId):undefined;}
 const expandedMemo=new Map<string,boolean>();
 const containsExpanded=(node:T,seen=new Set<string>()):boolean=>{
  if(expandedMemo.has(node.id))return expandedMemo.get(node.id)!;if(seen.has(node.id))return false;seen.add(node.id);
  const result=!!node.data?.expanded||(children.get(node.id)??[]).some(child=>containsExpanded(child,new Set(seen)));expandedMemo.set(node.id,result);return result;
 };
 let next=10;const layers=new Map<string,number>([[viewId,5]]),z=new Map<string,number>();
 const rank=(node:T)=>containsExpanded(node)?2:node.type==='frame'?0:1;
 const paint=(siblings:T[])=>{
  const ordered=[...siblings].sort((a,b)=>rank(a)-rank(b)||Number(active.has(a.id))-Number(active.has(b.id)));
  for(const node of ordered){
   if(z.has(node.id))continue;z.set(node.id,next++);
   if(node.type==='frame'&&typeof node.data?.viewId==='string')layers.set(node.data.viewId,next++);
   if(node.data?.expanded&&typeof node.data.childViewId==='string')layers.set(node.data.childViewId,next++);
   paint(children.get(node.id)??[]);
  }
 };
 paint(children.get(undefined)??[]);
 return {nodes:input.map(node=>({...node,zIndex:z.get(node.id)??0})),layers};
}
export function stackEdges<T extends StackEdge>(edges:T[],layers:ReadonlyMap<string,number>,viewId:string):(T&{zIndex:number})[]{
 return edges.map(edge=>({...edge,zIndex:layers.get(typeof edge.data?.viewId==='string'?edge.data.viewId:viewId)??5}));
}
