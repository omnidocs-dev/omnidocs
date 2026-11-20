import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspace} from '../server/workspace-store.ts';
import {compileModel} from '../shared/model.ts';
import {ownershipView,abstractionLevel} from '../shared/ownership-frames.ts';
import {layoutCanvas} from '../shared/canvas-layout.ts';
import {fitParentFrames} from '../shared/frame-sizing.ts';
const source=compileModel(await readWorkspace('docs/demo'));
function fixture(){const model=structuredClone(source),view=model.views.find(v=>v.id==='api-components')!;view.nodes=[...new Set([...view.nodes,'worker','notifications','customer'])];view.relationships=undefined;view.boundaries=[];return {model,view};}

test('standalone C3 places components, sibling containers and external systems under their true owners',async()=>{
 const {model,view}=fixture(),before=JSON.stringify(model);const derived=ownershipView(model,view);
 const context=derived.boundaries.find(b=>b.category==='Surrounding context')!,system=derived.boundaries.find(b=>b.name==='Orbit Commerce')??derived.boundaries.find(b=>b.category==='Software system · L1')!,container=derived.boundaries.find(b=>b.category==='Container · L2')!;
 assert.equal(system.parent,context.id);assert.equal(container.parent,system.id);
 assert(container.nodes.includes('checkout'));assert(system.nodes.includes('worker'));assert(system.nodes.includes('database'));
 assert(context.nodes.includes('notifications'));assert(context.nodes.includes('customer'));
 assert(!system.nodes.includes('notifications'));assert(!container.nodes.includes('worker'));
 const graph=await layoutCanvas(model,view,new Set()),all=new Map([...graph.frames,...graph.nodes].map(node=>[node.id,node]));
 for(const node of all.values())if(node.parentId){const parent=all.get(node.parentId)!;assert(parent);assert(node.position.x+node.width<=parent.width+1);assert(node.position.y+node.height<=parent.height+1);}
 for(const edge of graph.edges){assert(all.has(edge.source));assert(all.has(edge.target));}
 assert.equal(JSON.stringify(model),before,'presentation derivation must not mutate canonical model');
 assert.equal(abstractionLevel(model.entities.find(e=>e.id==='checkout')!),'L3');assert.equal(abstractionLevel(model.entities.find(e=>e.id==='worker')!),'L2');assert.equal(abstractionLevel(model.entities.find(e=>e.id==='notifications')!),'L1');
});

test('document groups stay nested under their common owner and do not duplicate membership',()=>{
 const {model,view}=fixture();view.boundaries=[{id:'custom',name:'Order processing',category:'Domain grouping',description:'Authored grouping',nodes:['checkout','orders'],tone:'amber'}];
 const derived=ownershipView(model,view),custom=derived.boundaries.find(b=>b.id==='custom')!,container=derived.boundaries.find(b=>b.category==='Container · L2')!;
 assert.equal(custom.parent,container.id);assert.deepEqual(custom.nodes,['checkout','orders']);
 for(const id of view.nodes)assert.equal(derived.boundaries.filter(b=>b.nodes.includes(id)).length,1);
});

test('inline C3 hoists missing providers outside the system and missing siblings into the enclosing C2',async()=>{
 const {model,view}=fixture();const sms={...model.entities.find(e=>e.id==='notifications')!,id:'new-sms',name:'New SMS provider',relationships:[]};model.entities.push(sms);view.nodes.push(sms.id);
 const c2=model.views.find(v=>v.id==='containers')!;c2.nodes=c2.nodes.filter(id=>id!=='worker');c2.relationships=undefined;
 const rel={...model.relations[0],id:'sender.new-sms',source:'checkout',target:sms.id,label:'Sends SMS',protocol:'HTTPS'};model.relations.push(rel);
 const graph=await layoutCanvas(model,model.views.find(v=>v.id==='system-context')!,new Set(['commerce','commerce/api']));
 const provider=graph.nodes.find(n=>n.entity.id===sms.id)!;assert(provider);assert.equal(provider.parentId,undefined);assert.equal(graph.nodes.filter(n=>n.entity.id===sms.id).length,1);
 const worker=graph.nodes.find(n=>n.entity.id==='worker')!;assert.equal(worker.parentId,'commerce');
 assert(!graph.nodes.some(n=>n.id==='commerce/api/worker'));
 const edge=graph.edges.find(e=>e.relation.id===rel.id)!;assert.equal(edge.source,'commerce/api/checkout');assert.equal(edge.target,provider.id);
});

test('saved nested frame growth reaches system and context without changing membership',async()=>{
 const {model,view}=fixture(),graph=await layoutCanvas(model,view,new Set());
 const input=[...graph.frames.map(frame=>({...frame,type:'frame'})),...graph.nodes.map(node=>({...node,type:'entity'}))].map(node=>({...node,style:{width:node.width,height:node.height}}));
 const moved=input.map(node=>node.id==='checkout'?{...node,position:{x:1600,y:1200}}:node),result=fitParentFrames(moved),byId=new Map(result.map(n=>[n.id,n]));
 let child=byId.get('checkout')!;while(child.parentId){const parent=byId.get(child.parentId)!;assert(Number(parent.style.width)>=child.position.x+Number(child.style.width));assert(Number(parent.style.height)>=child.position.y+Number(child.style.height));child=parent;}
});
