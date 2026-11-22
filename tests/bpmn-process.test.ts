import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEdits} from '../shared/edit-model.ts';
import {compileModel} from '../shared/model.ts';
import {scaffoldSpace} from '../shared/space-scaffold.ts';
import {bpmnBindingIds,starterBpmn} from '../shared/bpmn-document.ts';
import {readWorkspace} from '../server/workspace-store.ts';

const create={op:'process.create',id:'checkout-approval',name:'Checkout approval',description:'Documents how orders are approved.'};
const xml=starterBpmn.replace('<bpmn:startEvent id="StartEvent_1" />',()=>'<bpmn:startEvent id="StartEvent_1" /><bpmn:userTask id="Review" name="Validate $&amp; approve" />');
const update={op:'process.update',viewId:create.id,xml,bindings:{Review:'reviewer'}};

test('BPMN companion documents persist XML and model bindings without rewriting the C4 model',()=>{
 const initial=prepareEdits(scaffoldSpace({name:'Process test',description:'Architecture'}),[
  {op:'entity.create',id:'reviewer',viewId:'SystemContext',kind:'person',name:'Reviewer',description:'Reviews orders'},
 ]).files;
 const edited=prepareEdits(initial,[create,update]);
 const view=compileModel(edited.files).views.find(item=>item.id===create.id)!;
 assert.equal(view.bpmn,xml);
 assert.deepEqual(view.bindings,{Review:'reviewer'});
 for(const file of initial)assert.equal(edited.files.find(item=>item.path===file.path)?.content,file.content);
 const deleted=prepareEdits(edited.files,[{op:'entity.delete',viewId:'SystemContext',id:'reviewer'}]);
 assert.deepEqual(deleted.model.views.find(item=>item.id===create.id)?.bindings,{});
 assert.equal(deleted.model.views.find(item=>item.id===create.id)?.bpmn,xml);
});

test('native BPMN revisions reject invalid XML and dangling or non-activity bindings',async()=>{
 const files=await readWorkspace('docs/demo'),view=compileModel(files).views.find(item=>item.id==='checkout-process')!;
 assert(bpmnBindingIds(view.bpmn!).has('Validate'));
 const command={op:'process.update',viewId:view.id,xml:view.bpmn!,bindings:{Validate:'checkout'}};
 assert.deepEqual(prepareEdits(files,[command]).model.views.find(item=>item.id===view.id)?.bindings,{Validate:'checkout'});
 assert.throws(()=>prepareEdits(files,[{...command,bindings:{Validate:'missing'}}]),/existing model item/);
 assert.throws(()=>prepareEdits(files,[{...command,bindings:{Unknown:'checkout'}}]),/existing activity/);
 assert.throws(()=>prepareEdits(files,[{...command,xml:'<invalid />'}]),/BPMN 2.0 XML/);
 assert.throws(()=>prepareEdits(files,[{...command,xml:'<!DOCTYPE definitions>'+view.bpmn}]),/BPMN 2.0 XML/);
});
