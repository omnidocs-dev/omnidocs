export type FrameShape = {
 id:string; parentId?:string; type?:string; position:{x:number;y:number};
 style?:{width?:unknown;height?:unknown}; measured?:{width?:number;height?:number}; width?:number;height?:number;
 data?:Record<string,unknown>;
};
export const framePadding = {left:40,right:48,top:112,expandedTop:128,bottom:72,gap:40};
const size=(node:FrameShape,key:'width'|'height')=>Number(node.style?.[key]??node[key]??node.measured?.[key]??0)||0;
const isFrame=(node:FrameShape)=>node.type==='frame'||!!node.data?.expanded;

/** Keep header space clear and grow owners from deepest to outermost; dragging never shrinks a frame. */
export function fitParentFrames<T extends FrameShape>(input:T[]):T[]{
 const byId=new Map(input.map(node=>[node.id,node]));
 const depth=(node:T,seen=new Set<string>()):number=>{if(!node.parentId||seen.has(node.id))return 0;seen.add(node.id);const parent=byId.get(node.parentId);return parent?1+depth(parent,seen):0;};
 for(const original of [...input].sort((a,b)=>depth(b)-depth(a))){
  let node=byId.get(original.id)!;const parent=node.parentId?byId.get(node.parentId):undefined;if(!parent||!isFrame(parent))continue;
  const point={x:Math.max(framePadding.left,node.position.x),y:Math.max(parent.type==='frame'?framePadding.top:framePadding.expandedTop,node.position.y)};
  if(point.x!==node.position.x||point.y!==node.position.y){node={...node,position:point};byId.set(node.id,node);}
  const width=Math.max(size(parent,'width'),point.x+size(node,'width')+framePadding.right);
  const height=Math.max(size(parent,'height'),point.y+size(node,'height')+framePadding.bottom);
  if(width!==size(parent,'width')||height!==size(parent,'height'))byId.set(parent.id,{...parent,style:{...parent.style,width,height},width,height});
 }
 return separateFlowBands(input.map(node=>byId.get(node.id)!));
}

/** New layout items must not land on manually positioned siblings when a cached view is restored. */
export function reconcileFrameChildren<T extends FrameShape>(input:T[],restored:ReadonlySet<string>=new Set()):T[]{
 let nodes=fitParentFrames(input);const byId=new Map(nodes.map(node=>[node.id,node]));
 const depth=(node:T):number=>node.parentId&&byId.has(node.parentId)?1+depth(byId.get(node.parentId)!):0;
 for(const originalParent of nodes.filter(isFrame).sort((a,b)=>depth(b)-depth(a))){
  const parent=byId.get(originalParent.id)!;
  const placed:T[]=[];
  const children=[...byId.values()].filter(node=>node.parentId===parent.id).sort((a,b)=>Number(restored.has(b.id))-Number(restored.has(a.id)));
  for(const original of children){
   let node=original;
   for(let step=0;step<=placed.length;step++){
    const collision=placed.find(other=>node.position.x<other.position.x+size(other,'width')+framePadding.gap&&node.position.x+size(node,'width')+framePadding.gap>other.position.x&&node.position.y<other.position.y+size(other,'height')+framePadding.gap&&node.position.y+size(node,'height')+framePadding.gap>other.position.y);
    if(!collision)break;
    node={...node,position:{...node.position,y:collision.position.y+size(collision,'height')+framePadding.gap}};
   }
   byId.set(node.id,node);placed.push(node);
  }
  for(const node of fitParentFrames(input.map(node=>byId.get(node.id)!)))byId.set(node.id,node);
 }
 nodes=nodes.map(node=>byId.get(node.id)!);return fitParentFrames(nodes);
}

/** Growing a manual flow band pushes later bands right, carrying their children with them. */
export function separateFlowBands<T extends FrameShape>(input:T[]):T[]{
 const levels=['L1','L2','L3'];
 const bands=input.filter(node=>node.type==='frame'&&levels.includes(String(node.data?.flowLevel))).sort((a,b)=>levels.indexOf(String(a.data?.flowLevel))-levels.indexOf(String(b.data?.flowLevel)));
 const positions=new Map<string,{x:number;y:number}>();
 const rightEdges=new Map<string|undefined,number>();
 for(const band of bands){
  const previous=rightEdges.get(band.parentId),x=previous===undefined?band.position.x:Math.max(band.position.x,previous+80);
  if(x!==band.position.x)positions.set(band.id,{...band.position,x});
  rightEdges.set(band.parentId,x+size(band,'width'));
 }
 return positions.size?input.map(node=>positions.has(node.id)?{...node,position:positions.get(node.id)!}:node):input;
}
