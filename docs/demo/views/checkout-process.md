---
id: checkout-process
kind: view
name: Checkout process
type: bpmn
scope: commerce
description: The happy path from checkout submission to accepted order.
bindings:
  Validate: checkout
  Authorize: payment-adapter
  Persist: repository
  Fulfill: worker
---

# Checkout process

An illustrative BPMN 2.0 process describing the successful checkout path. Error handling, payment rejection, and compensation are outside this example. Click a task to inspect the component that performs it.

```bpmn
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Orbit" targetNamespace="https://omnidocs.local/demo">
<bpmn:process id="CheckoutProcess" isExecutable="false">
<bpmn:startEvent id="Start" name="Order placed"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
<bpmn:task id="Validate" name="Validate checkout"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
<bpmn:task id="Authorize" name="Authorize payment"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:task>
<bpmn:task id="Persist" name="Save paid order"><bpmn:incoming>Flow_3</bpmn:incoming><bpmn:outgoing>Flow_4</bpmn:outgoing></bpmn:task>
<bpmn:task id="Fulfill" name="Start fulfillment"><bpmn:incoming>Flow_4</bpmn:incoming><bpmn:outgoing>Flow_5</bpmn:outgoing></bpmn:task>
<bpmn:endEvent id="End" name="Order accepted"><bpmn:incoming>Flow_5</bpmn:incoming></bpmn:endEvent>
<bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Validate"/>
<bpmn:sequenceFlow id="Flow_2" sourceRef="Validate" targetRef="Authorize"/>
<bpmn:sequenceFlow id="Flow_3" sourceRef="Authorize" targetRef="Persist"/>
<bpmn:sequenceFlow id="Flow_4" sourceRef="Persist" targetRef="Fulfill"/>
<bpmn:sequenceFlow id="Flow_5" sourceRef="Fulfill" targetRef="End"/>
</bpmn:process>
<bpmndi:BPMNDiagram id="Diagram_Orbit"><bpmndi:BPMNPlane id="Plane_Orbit" bpmnElement="CheckoutProcess">
<bpmndi:BPMNShape id="Shape_Start" bpmnElement="Start"><dc:Bounds x="60" y="140" width="36" height="36"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Shape_Validate" bpmnElement="Validate"><dc:Bounds x="160" y="118" width="150" height="80"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Shape_Authorize" bpmnElement="Authorize"><dc:Bounds x="370" y="118" width="150" height="80"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Shape_Persist" bpmnElement="Persist"><dc:Bounds x="580" y="118" width="150" height="80"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Shape_Fulfill" bpmnElement="Fulfill"><dc:Bounds x="790" y="118" width="150" height="80"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Shape_End" bpmnElement="End"><dc:Bounds x="1000" y="140" width="36" height="36"/></bpmndi:BPMNShape>
<bpmndi:BPMNEdge id="Edge_1" bpmnElement="Flow_1"><di:waypoint x="96" y="158"/><di:waypoint x="160" y="158"/></bpmndi:BPMNEdge>
<bpmndi:BPMNEdge id="Edge_2" bpmnElement="Flow_2"><di:waypoint x="310" y="158"/><di:waypoint x="370" y="158"/></bpmndi:BPMNEdge>
<bpmndi:BPMNEdge id="Edge_3" bpmnElement="Flow_3"><di:waypoint x="520" y="158"/><di:waypoint x="580" y="158"/></bpmndi:BPMNEdge>
<bpmndi:BPMNEdge id="Edge_4" bpmnElement="Flow_4"><di:waypoint x="730" y="158"/><di:waypoint x="790" y="158"/></bpmndi:BPMNEdge>
<bpmndi:BPMNEdge id="Edge_5" bpmnElement="Flow_5"><di:waypoint x="940" y="158"/><di:waypoint x="1000" y="158"/></bpmndi:BPMNEdge>
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>
```
