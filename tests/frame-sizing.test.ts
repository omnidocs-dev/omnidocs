import test from 'node:test';
import assert from 'node:assert/strict';
import {fitParentFrames,reconcileFrameChildren,framePadding,type FrameShape} from '../shared/frame-sizing.ts';
const frame=(id:string,parentId?:string):FrameShape=>({id,parentId,type:'frame',position:{x:0,y:0},style:{width:390,height:420}});
const card=(id:string,parentId:string,x:number,y:number):FrameShape=>({id,parentId,type:'entity',position:{x,y},style:{width:274,height:246}});
test('a card can move below the old bottom and its frame grows with reserved header and bottom margins',()=>{
 const nodes=[frame('scope'),card('a','scope',40,112),card('b','scope',40,650)];const result=fitParentFrames(nodes),parent=result[0];
 assert.equal(result[2].position.y,650);assert(Number(parent.style!.height)>=650+246+framePadding.bottom);assert.equal(nodes[0].style!.height,420);
 const next=fitParentFrames(result.map(node=>node.id==='b'?{...node,position:{x:800,y:node.position.y}}:node));assert(Number(next[0].style!.width)>=800+274+framePadding.right);
});
test('legacy child positions cannot cover a boundary heading and overlapping new cards are placed below restored cards',()=>{
 const result=reconcileFrameChildren([frame('scope'),card('old','scope',5,20),card('new','scope',40,112)],new Set(['old']));
 assert.equal(result[1].position.y,framePadding.top);assert.equal(result[1].position.x,framePadding.left);
 assert(result[2].position.y>=result[1].position.y+246+framePadding.gap);assert(Number(result[0].style!.height)>=result[2].position.y+246+framePadding.bottom);
});
test('deeply nested growth reaches every enclosing frame and separates enlarged sibling groups',()=>{
 const outer=frame('outer'),inner=frame('inner','outer'),sibling=frame('sibling','outer');inner.position={x:40,y:112};sibling.position={x:40,y:600};
 const result=reconcileFrameChildren([outer,inner,sibling,card('a','inner',40,112),card('b','inner',40,112)]);
 const byId=new Map(result.map(node=>[node.id,node]));const nested=byId.get('inner')!,other=byId.get('sibling')!;
 assert(other.position.y>=nested.position.y+Number(nested.style!.height)+framePadding.gap);
 assert(Number(byId.get('outer')!.style!.height)>=other.position.y+Number(other.style!.height)+framePadding.bottom);
});
test('expanded scopes grow, root cards remain freely positioned, and dragging inward never shrinks an owner',()=>{
 const owner={...frame('scope'),type:'entity',data:{expanded:true}},root={...card('root','',-200,-100),parentId:undefined};
 let result=fitParentFrames([owner,card('child','scope',50,1000),root]);const height=Number(result[0].style!.height);
 result=fitParentFrames(result.map(node=>node.id==='child'?{...node,position:{x:50,y:20}}:node));assert.equal(Number(result[0].style!.height),height);assert.equal(result[1].position.y,framePadding.expandedTop);assert.deepEqual(result[2].position,root.position);
});

test('growing L1 pushes L2 and L3 right by the required amount while preserving local child positions',()=>{
 const bands=['L1','L2','L3'].map((level,i)=>({...frame(`band-${level}`),position:{x:36+i*470,y:36},data:{flowLevel:level}}));
 const children=[card('one','band-L1',800,112),card('two','band-L2',70,150),card('three','band-L3',80,180)];
 const result=fitParentFrames([...bands,...children]),byId=new Map(result.map(node=>[node.id,node]));
 assert.equal(byId.get('band-L1')!.position.x,36);
 assert.equal(byId.get('band-L2')!.position.x,36+800+274+48+80);
 assert.equal(byId.get('band-L3')!.position.x,byId.get('band-L2')!.position.x+Number(byId.get('band-L2')!.style?.width)+80);
 assert.deepEqual(byId.get('two')!.position,children[1].position);assert.deepEqual(byId.get('three')!.position,children[2].position);
 assert.deepEqual(fitParentFrames(result),result,'settled geometry must not drift on repeated sizing');
 assert.deepEqual(bands[1].position,{x:506,y:36},'input nodes remain unchanged');
});

test('middle-band growth leaves L1 fixed and repairs already overlapping saved bands during reconciliation',()=>{
 const bands=['L1','L2','L3'].map((level,i)=>({...frame(`band-${level}`),position:{x:36+i*470,y:36},data:{flowLevel:level}}));
 const child=card('middle','band-L2',1000,112);
 const result=reconcileFrameChildren([...bands,child],new Set([...bands.map(n=>n.id),child.id]));
 assert.deepEqual(result[0].position,bands[0].position);assert.deepEqual(result[1].position,bands[1].position);
 assert(result[2].position.x>=result[1].position.x+Number(result[1].style?.width)+80);
 const untouched=fitParentFrames([frame('ordinary-a'),frame('ordinary-b')]);
 assert.deepEqual(untouched.map(n=>n.position),[{x:0,y:0},{x:0,y:0}],'ordinary architecture frames are not rearranged by band packing');
});
