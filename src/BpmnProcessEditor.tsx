import {useEffect,useRef,useState} from 'react';
import {ArrowCounterClockwise,ArrowClockwise,CornersOut,FloppyDisk,Rows} from '@phosphor-icons/react';
import type Modeler from 'bpmn-js/lib/Modeler';
import type {Model,View} from '../shared/model';
import {canBindBpmnElement} from '../shared/bpmn-document';
import {FlowItemPicker} from './FlowItemPicker';

type ProcessElement={
 id:string;type:string;
 businessObject?:{name?:string;$instanceOf?:(type:string)=>boolean};
 labelTarget?:ProcessElement;
};
type Registry={get:(id:string)=>ProcessElement|undefined};
type Rectangle={x:number;y:number;width:number;height:number};
interface Canvas {
 viewbox():{inner:Rectangle;outer:{width:number;height:number}};
 viewbox(bounds:Rectangle):void;
 getRootElement:()=>ProcessElement;
 resized:()=>void;
 addMarker:(id:string,marker:string)=>void;
 removeMarker:(id:string,marker:string)=>void;
};
function fitProcess(canvas:Canvas,container:HTMLElement){
 const {inner,outer}=canvas.viewbox();
 const left=(container.querySelector('.djs-palette')?.getBoundingClientRect().width??48)+26,right=28,vertical=34;
 if(!outer.width||!outer.height||!inner.width||!inner.height)return;
 const contentWidth=Math.max(60,outer.width-left-right),contentHeight=Math.max(60,outer.height-vertical*2);
 const scale=Math.min(1,contentWidth/inner.width,contentHeight/inner.height);
 canvas.viewbox({
  x:inner.x-(left+(contentWidth-inner.width*scale)/2)/scale,
  y:inner.y-(vertical+(contentHeight-inner.height*scale)/2)/scale,
  width:outer.width/scale,height:outer.height/scale,
 });
}
type Stack={undo:()=>void;redo:()=>void;canUndo:()=>boolean;canRedo:()=>boolean};
type Modeling={
 updateProperties:(element:ProcessElement,properties:{name:string})=>void;
 createShape:(shape:ProcessElement,position:{x:number;y:number},parent:ProcessElement)=>ProcessElement;
 addLane:(element:ProcessElement,position:'top'|'bottom')=>ProcessElement;
 splitLane:(element:ProcessElement,count:number)=>void;
};
type ElementFactory={
 createShape:(options:{type:string})=>ProcessElement;
 createParticipantShape:(options:{width:number;height:number;isHorizontal:boolean})=>ProcessElement;
};
type ContextPad={getEntries:(element:ProcessElement)=>Record<string,unknown>};
type AutoPlace={append:(source:ProcessElement,shape:ProcessElement)=>ProcessElement};
type Selection={select:(element:ProcessElement)=>void};
const appendOptions=[
 ['bpmn:Task','Append task'],['bpmn:ExclusiveGateway','Append gateway'],['bpmn:EndEvent','Append end event'],
] as const;

export function BpmnProcessEditor({view,model,onSave,onDirtyChange,onEntity}:{
 view:View;model:Model;onSave:(xml:string,bindings:Record<string,string>)=>Promise<boolean>;
 onDirtyChange:(dirty:boolean)=>void;onEntity:(id:string)=>void;
}){
 const root=useRef<HTMLDivElement>(null), modeler=useRef<Modeler>(null);
 const [bindings,setBindings]=useState(view.bindings);
 const [selection,setSelection]=useState<ProcessElement|null>(null);
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [changed,setChanged]=useState(false),[revision,setRevision]=useState(0);
 const markers=useRef(new Set<string>());
 const dirty=changed||JSON.stringify(bindings)!==JSON.stringify(view.bindings);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange(false),[onDirtyChange]);
 const sourceBindings=JSON.stringify(view.bindings);
 useEffect(()=>{
  let disposed=false,instance:Modeler|undefined,observer:ResizeObserver|undefined;
  setReady(false);setLoading(true);setSelection(null);setChanged(false);setError('');
  async function open(){
   try{
    const {default:ProcessModeler}=await import('bpmn-js/lib/Modeler');
    if(disposed||!root.current)return;
    instance=new ProcessModeler({container:root.current});
    await instance.importXML(view.bpmn??'');
    if(disposed)return;
    modeler.current=instance;
    markers.current=new Set();
    const canvas=instance.get<Canvas>('canvas');
    fitProcess(canvas,root.current);
    observer=new ResizeObserver(()=>canvas.resized());
    observer.observe(root.current);
    instance.on('selection.changed',({newSelection}:{newSelection:ProcessElement[]})=>{
     const element=newSelection.length===1?newSelection[0]:null;
     setSelection(element?.labelTarget??element);
    });
    instance.on('commandStack.changed',()=>{
     setChanged(true);
     setRevision(value=>value+1);
    });
    setReady(true);
   }catch(err){if(!disposed)setError(err instanceof Error?err.message:'Unable to open the process editor.');}
   finally{if(!disposed)setLoading(false);}
  }
  void open();
  return()=>{disposed=true;observer?.disconnect();instance?.destroy();modeler.current=null;};
 },[view.id,view.bpmn]);
 useEffect(()=>{setBindings(JSON.parse(sourceBindings));},[view.id,sourceBindings]);
 useEffect(()=>{
  const instance=modeler.current;
  if(!ready||!instance)return;
  const canvas=instance.get<Canvas>('canvas'),registry=instance.get<Registry>('elementRegistry');
  for(const id of markers.current)if(registry.get(id))canvas.removeMarker(id,'linked-task');
  const ids=Object.keys(bindings).filter(id=>registry.get(id));
  for(const id of ids)canvas.addMarker(id,'linked-task');
  markers.current=new Set(ids);
 },[bindings,ready,revision]);
 const stack=modeler.current?.get<Stack>('commandStack');
 const registry=modeler.current?.get<Registry>('elementRegistry');
 const selected=selection&&registry?.get(selection.id);
 const canBind=!!selected&&canBindBpmnElement(selected.type);
 const linked=canBind&&selected?bindings[selected.id]:'';
 const canAppend=selected?.type!=='bpmn:EndEvent'&&selected?.businessObject?.$instanceOf?.('bpmn:FlowNode');

 function append(type:string){
  const instance=modeler.current;
  if(!instance||!selected||!canAppend||saving)return;
  setError('');
  try{
   const shape=instance.get<ElementFactory>('elementFactory').createShape({type});
   const appended=instance.get<AutoPlace>('autoPlace').append(selected,shape);
   instance.get<Selection>('selection').select(appended);
   if(root.current)fitProcess(instance.get<Canvas>('canvas'),root.current);
  }catch(err){setError(err instanceof Error?err.message:'Unable to append this BPMN element.');}
 }


 const canvasRoot=modeler.current?.get<Canvas>('canvas').getRootElement();
 const canAddPool=canvasRoot?.type==='bpmn:Process'||canvasRoot?.type==='bpmn:Collaboration';
 const isSwimlane=selected?.type==='bpmn:Lane'||selected?.type==='bpmn:Participant';
 const laneEntries=isSwimlane&&selected?modeler.current?.get<ContextPad>('contextPad').getEntries(selected):undefined;

 function addPool(){
  const instance=modeler.current;
  if(!instance||!root.current||!canvasRoot||!canAddPool||saving)return;
  setError('');
  try{
   const canvas=instance.get<Canvas>('canvas');
   const {inner}=canvas.viewbox();
   const firstPool=canvasRoot.type==='bpmn:Process';
   const width=firstPool?Math.max(640,inner.width+142):640;
   const height=firstPool?Math.max(230,inner.height+180):230;
   const shape=instance.get<ElementFactory>('elementFactory').createParticipantShape({width,height,isHorizontal:true});
   const x=firstPool?inner.x+inner.width/2-15:inner.x+width/2;
   // Leave more room below the original activities so splitting the pool does not put its center row on the divider.
   const y=firstPool?inner.y+inner.height/2+45:inner.y+inner.height+65+height/2;
   const pool=instance.get<Modeling>('modeling').createShape(shape,{x,y},canvasRoot);
   instance.get<Selection>('selection').select(pool);
   fitProcess(canvas,root.current);
  }catch(err){setError(err instanceof Error?err.message:'Unable to add a BPMN pool.');}
 }

 function changeLanes(action:'top'|'bottom'|2|3){
  const instance=modeler.current;
  if(!instance||!root.current||!selected||saving)return;
  setError('');
  try{
   const modeling=instance.get<Modeling>('modeling');
   if(typeof action==='number')modeling.splitLane(selected,action);
   else instance.get<Selection>('selection').select(modeling.addLane(selected,action));
   fitProcess(instance.get<Canvas>('canvas'),root.current);
  }catch(err){setError(err instanceof Error?err.message:'Unable to change BPMN lanes.');}
 }

 async function save(){
  const instance=modeler.current;
  if(!instance||saving||!dirty)return;
  setSaving(true);setError('');
  try{
   const {xml}=changed?await instance.saveXML({format:true}):{xml:view.bpmn};
   if(!xml)throw new Error('Unable to export BPMN XML.');
   const registry=instance.get<Registry>('elementRegistry');
   const savedBindings=Object.fromEntries(Object.entries(bindings).filter(([id])=>{
    const element=registry.get(id);
    return element&&canBindBpmnElement(element.type);
   }));
   if(await onSave(xml,savedBindings)){setBindings(savedBindings);setChanged(false);}
   else setError('The process could not be saved. Your changes are still in the editor.');
  }catch(err){setError(err instanceof Error?err.message:'Unable to save the process.');}
  finally{setSaving(false);}
 }

 return <section className="bpmn-process-editor" aria-label="BPMN process editor">
  <div className="bpmn-process-actions">
   <button type="button" className="icon-button" aria-label="Undo BPMN change" disabled={saving||!stack?.canUndo()} onClick={()=>stack?.undo()}><ArrowCounterClockwise size={18}/></button>
   <button type="button" className="icon-button" aria-label="Redo BPMN change" disabled={saving||!stack?.canRedo()} onClick={()=>stack?.redo()}><ArrowClockwise size={18}/></button>
   <button type="button" className="icon-button" aria-label="Fit process to screen" disabled={!ready||saving} onClick={()=>{if(modeler.current&&root.current)fitProcess(modeler.current.get<Canvas>('canvas'),root.current);}}><CornersOut size={18}/></button>
   {error&&<span className="editor-error" role="alert">{error}</span>}
   <button type="button" className="button primary" disabled={!ready||!dirty||saving} onClick={()=>void save()}><FloppyDisk size={16}/>{saving?'Saving…':'Save process'}</button>
  </div>
  <div className="bpmn-process-body">
   <div className="bpmn-space bpmn-modeler-region" inert={saving}>
    <div className="bpmn-canvas" ref={root}/>
    {loading&&<div className="canvas-message">Loading BPMN editor…</div>}
   </div>
   <aside className="bpmn-properties" aria-label="BPMN element properties">
    <button type="button" className="button secondary bpmn-add-pool" disabled={!ready||!canAddPool||saving} onClick={addPool}><Rows size={16}/>Add pool</button>
    {selected?<form className="editor-form" onSubmit={event=>event.preventDefault()}>
     <h3>{selected.type==='bpmn:Participant'?'Pool / Participant':selected.type.replace(/^bpmn:/,'').replace(/([a-z])([A-Z])/g,'$1 $2')}</h3>
     {selected.businessObject&&<label>Name<input key={selected.id+':'+revision} defaultValue={selected.businessObject.name??''} maxLength={250} disabled={saving}
      onBlur={event=>{
       const name=event.target.value.trim();
       if(name!==(selected.businessObject?.name??''))modeler.current?.get<Modeling>('modeling').updateProperties(selected,{name});
      }} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/></label>}
     {canBind&&<FlowItemPicker label="Linked model item" items={model.entities} model={model} value={linked??''} disabled={saving} allowUnlinked
      onChange={id=>setBindings(previous=>{
       const next={...previous};if(id)next[selected.id]=id;else delete next[selected.id];
       return next;
      })}/>}
     {canAppend&&<div className="bpmn-append-actions" role="group" aria-label="Append BPMN element">
      {appendOptions.map(([type,label])=><button type="button" className="button secondary" key={type} disabled={saving} onClick={()=>append(type)}>{label}</button>)}
     </div>}
     {laneEntries&&<div className="bpmn-append-actions" role="group" aria-label="Swimlane controls">
      {!!laneEntries['lane-insert-above']&&<button type="button" className="button secondary" disabled={saving} onClick={()=>changeLanes('top')}>Add lane above</button>}
      {!!laneEntries['lane-insert-below']&&<button type="button" className="button secondary" disabled={saving} onClick={()=>changeLanes('bottom')}>Add lane below</button>}
      {!!laneEntries['lane-divide-two']&&<button type="button" className="button secondary" disabled={saving} onClick={()=>changeLanes(2)}>Split into 2 lanes</button>}
      {!!laneEntries['lane-divide-three']&&<button type="button" className="button secondary" disabled={saving} onClick={()=>changeLanes(3)}>Split into 3 lanes</button>}
     </div>}
     {linked&&<button type="button" className="button secondary" onClick={()=>onEntity(linked)}>Open linked item</button>}
    </form>:<p>Select a BPMN element to edit its properties. Activities, pools and lanes can link to workspace items.</p>}
   </aside>
  </div>
 </section>;
}
