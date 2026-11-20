import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasStacking,stackEdges,type StackNode} from '../shared/canvas-stacking.ts';
import {fitParentFrames} from '../shared/frame-sizing.ts';
const node=(id:string,parentId?:string,expanded=false,childViewId?:string):StackNode=>({id,parentId,type:'entity',data:{expanded,childViewId}});
test('expanded scope, internal edges and cards are above every overview node even when an overview item is selected',()=>{
 const nodes=[{...node('person'),selected:true},node('system',undefined,true,'C2'),node('system/api','system'),node('external')];
 const result=canvasStacking(nodes,'C1','person'),byId=new Map(result.nodes.map(item=>[item.id,item]));
 const contextMax=Math.max(byId.get('person')!.zIndex,byId.get('external')!.zIndex);
 assert(byId.get('system')!.zIndex>contextMax);assert(result.layers.get('C2')!>byId.get('system')!.zIndex);assert(byId.get('system/api')!.zIndex>result.layers.get('C2')!);
 const edges=stackEdges([{data:{viewId:'C1'},selected:true},{data:{viewId:'C2'}}],result.layers,'C1');assert(edges[0].zIndex!<byId.get('system')!.zIndex);assert(edges[1].zIndex!>byId.get('system')!.zIndex);
 assert.deepEqual(result.nodes.map(item=>item.id),nodes.map(item=>item.id));
});
test('nested C3 scopes are above C2 siblings and retain their own edge layer',()=>{
 const nodes=[node('system',undefined,true,'C2'),node('api','system',true,'C3'),node('worker','system'),node('handler','api')];
 const result=canvasStacking(nodes,'C1','handler'),byId=new Map(result.nodes.map(item=>[item.id,item]));
 assert(byId.get('api')!.zIndex>byId.get('worker')!.zIndex);assert(result.layers.get('C3')!>byId.get('api')!.zIndex);assert(byId.get('handler')!.zIndex>result.layers.get('C3')!);assert(result.layers.get('C2')!<byId.get('api')!.zIndex);
});
test('interacting with an older expanded branch promotes its entire subtree over another expanded branch',()=>{
 const nodes=[node('a',undefined,true,'A2'),node('a/api','a'),node('b',undefined,true,'B2'),node('b/api','b')];
 const result=canvasStacking(nodes,'C1','a/api'),byId=new Map(result.nodes.map(item=>[item.id,item]));
 assert(byId.get('a')!.zIndex>byId.get('b/api')!.zIndex);assert(byId.get('a/api')!.zIndex>byId.get('a')!.zIndex);
 const collapsed=canvasStacking([node('a'),node('b',undefined,true,'B2'),node('b/api','b')],'C1','a');assert(collapsed.nodes.find(item=>item.id==='a')!.zIndex<collapsed.nodes.find(item=>item.id==='b')!.zIndex);
});
test('ordinary boundary backgrounds, edges and cards retain an operable order in standalone views',()=>{
 const result=canvasStacking([{id:'frame',type:'frame',data:{viewId:'C2'}},node('api','frame')],'C2');
 assert(result.nodes[0].zIndex<result.layers.get('C2')!);assert(result.nodes[1].zIndex>result.layers.get('C2')!);
});
test('growing a frame preserves foreground order and geometry remains independent of layer calculation',()=>{
 const input=[{...node('external'),position:{x:900,y:0},style:{width:274,height:246}},{...node('scope',undefined,true,'C2'),position:{x:0,y:0},style:{width:400,height:400}},{...node('child','scope'),position:{x:40,y:900},style:{width:274,height:246}}];
 const stacked=canvasStacking(input,'C1','child');const grown=fitParentFrames(stacked.nodes);
 assert(Number(grown[1].style.height)>400);assert(grown[1].zIndex>grown[0].zIndex);assert(grown[2].zIndex>grown[1].zIndex);assert.deepEqual(grown[2].position,input[2].position);
});
