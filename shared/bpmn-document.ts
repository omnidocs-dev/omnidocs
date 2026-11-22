import {Parser} from 'saxen';

const modelNamespace='http://www.omg.org/spec/BPMN/20100524/MODEL';
const diagramNamespace='http://www.omg.org/spec/BPMN/20100524/DI';

export function canBindBpmnElement(type:string){
 return /^(?:(?:bpmn:)?(?:[a-zA-Z]*Task|[a-zA-Z]*SubProcess|[a-zA-Z]*CallActivity|transaction|participant|lane))$/i.test(type);
}

export function bpmnBindingIds(xml:string){
 if(/^ {0,3}(?:`{3,}|~{3,})[ \t]*\r?$/m.test(xml))throw new Error('BPMN XML cannot contain a Markdown fence line.');
 const parser=new Parser();
 parser.ns({[modelNamespace]:'bpmn',[diagramNamespace]:'bpmndi'});
 const ids=new Set<string>(),bindingIds=new Set<string>();
 let depth=0,hasDefinitions=false,hasDiagram=false,hasProcess=false;
 const invalid=()=>{throw new Error('Provide valid BPMN 2.0 XML.');};
 parser.on('error',invalid);
 parser.on('warn',invalid);
 parser.on('attention',invalid);
 parser.on('openTag',(type,attributes,decode)=>{
  if(depth===0){
   if(hasDefinitions||type!=='bpmn:definitions')invalid();
   hasDefinitions=true;
  }
  depth++;
  const id=attributes().id;
  if(id){
   const value=decode(id);
   if(ids.has(value))throw new Error('BPMN element IDs must be unique.');
   ids.add(value);
   if(type.startsWith('bpmn:')&&canBindBpmnElement(type))bindingIds.add(value);
  }
  if(type==='bpmndi:BPMNDiagram')hasDiagram=true;
  if(type==='bpmn:process'||type==='bpmn:collaboration')hasProcess=true;
 });
 parser.on('closeTag',()=>{depth--;});
 if(!xml.trim()||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))invalid();
 parser.parse(xml);
 if(!hasDefinitions||!hasProcess||!hasDiagram||depth!==0)throw new Error('BPMN XML needs a process and diagram interchange data.');
 return bindingIds;
}

export const starterBpmn=`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${modelNamespace}" xmlns:bpmndi="${diagramNamespace}" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="https://omnidocs.dev/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
