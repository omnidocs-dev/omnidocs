import {DeploymentPlane} from './DeploymentPlane';
import {DeploymentGlyph} from './DeploymentGlyph';
import {deploymentTypes} from '../shared/deployment-types';
import type {CanvasChanges} from '../shared/history-diff';
import {TechnologyLogos} from './technology-logos';
import {isC4FlowItem} from '../shared/view-membership';
import {abstractionLevel} from '../shared/ownership-frames';
import { createContext, useContext, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { ReactFlow, getViewportForBounds, ConnectionMode, SelectionMode, applyNodeChanges, type NodeChange, Background, Controls, MiniMap, Handle, Position, MarkerType, BaseEdge, getSmoothStepPath, useNodesState, useEdgesState, useNodesInitialized, useNodes, useReactFlow, useStore, useUpdateNodeInternals, type Node, type Edge, type EdgeProps, type NodeProps, type Viewport, type ReactFlowInstance } from '@xyflow/react';
import { ArrowUpRight, ChatDots, Cube, Database, User, Stack, Globe, Code, HardDrives, Queue, ArrowsOut, CaretUp, Info, Graph, TextT, Plus } from '@phosphor-icons/react';
import { elementTypeLabel,typeForEntity } from '../shared/element-types';
import { type Model, type Entity, type View, type Relation } from '../shared/model';
import {portSides} from '../shared/connection-ports';
import {defaultArrangement,type Arrangement,type LayoutSnapshot} from '../shared/layout-state';
import type {EditCommand} from '../shared/edit-contract';
import { canvasStacking, stackEdges } from '../shared/canvas-stacking';
import { fitParentFrames, reconcileFrameChildren } from '../shared/frame-sizing';
import { canvasLayoutKey, layoutCanvas } from '../shared/canvas-layout';
import { BpmnCanvas } from './BpmnCanvas';
import { ConnectionLegend } from './ConnectionLegend';
import { communicationDash, communicationText, protocolStyle, resolveCommunication, type Communication } from '../shared/communication';
import { edgeLabelLines } from '../shared/edge-labels';
import { parallelChannel } from '../shared/edge-routing';
import { routeConnections, orthogonalPath, type ConnectionRoute } from '../shared/connection-layout';
import { entityAppearance, appearanceIcons } from './entity-appearance';
import { graphFocus, type FocusTarget } from '../shared/graph-focus';
import { CanvasContextMenu, type ContextAction } from './CanvasContextMenu';
import { childView } from '../shared/model';
import type { EditorRequest, ConnectionRequest } from './WorkspaceEditor';
export const entityIcons = { person: User, system: Stack, external: Globe, container: Cube, database: Database, queue: Queue, component: Code, code: Code, deployment: HardDrives };
export const entityLabels = { person: 'Person', system: 'Software system', external: 'External system', container: 'Container', database: 'Container · Database', queue: 'Container · Queue', component: 'Component', code: 'Code', deployment: 'Deployment node' };
export const viewLabels = { context: 'System context', container: 'Containers', component: 'Components', code: 'Code', dataflow: 'Data flow', deployment: 'Deployment', bpmn: 'BPMN process' };
type DiagramData = { entity: Entity; viewId: string; editing: boolean; drill?: string; active: boolean; direction: 'RIGHT' | 'DOWN'; expanded: boolean; childLevel?: string; scopeTone?: string; entryLabel?: string; layoutKey: string; collapse: () => void; inspect: () => void; addNext?: () => void } & Record<string, unknown>;
type DiagramNode = Node<DiagramData, 'entity'>;
type FrameNode = Node<{ name: string; description: string; category: string; tone: string; contextEnvelope?:boolean; add?:()=>void; layoutKey: string } & Record<string, unknown>, 'frame'>;
type CanvasNode = DiagramNode | FrameNode;
const DeploymentAngle=createContext(false);
function BoundaryFrame({ data }: NodeProps<FrameNode>) {
 return <div className="deployment-frame" data-tone={data.tone} data-context-envelope={data.contextEnvelope}><div className="frame-title"><strong dir="auto">{data.name}</strong><span>{data.category}</span>{data.add&&<button className="flow-band-add nodrag nopan" onClick={event=>{event.stopPropagation();data.add?.();}}>＋ Add item</button>}</div><p dir="auto">{data.description}</p></div>;
}
function EntityNode({ id,data }: NodeProps<DiagramNode>) {
 const entity = data.entity, level=abstractionLevel(entity), appearance = entityAppearance(entity), Icon = appearanceIcons[appearance];
 const deployment=entity.kind==='deployment'?deploymentTypes.find(type=>type.id===typeForEntity(entity)):undefined;
 const angled=useContext(DeploymentAngle);
 const sculpted=angled&&!data.expanded;
 const updateNodeInternals=useUpdateNodeInternals();
 const previousSculpted=useRef(false);
 useEffect(()=>{
  if(previousSculpted.current!==sculpted)updateNodeInternals(id);
  previousSculpted.current=sculpted;
 },[id,sculpted,updateNodeInternals]);
 const symbol=deployment?<DeploymentGlyph type={deployment.id}/>:<Icon size={23} weight="duotone"/>;
 const zoom = useStore(state => state.transform[2]);
 const portSize = Math.min(44, Math.max(14, 16 / zoom));
 const handles=<>{portSides.flatMap(side=>[
  ...(['source','target'] as const).map(type=><Handle key={`${type}-${side}`} id={`${type}-${side}`} type={type} position={Position[({left:'Left',right:'Right',top:'Top',bottom:'Bottom'} as const)[side]]} isConnectable={false} className="legacy-route-port" style={{pointerEvents:'none',opacity:0}}/>),
  ...[0,1,2].map(slot=><Handle key={`${side}-${slot}`} id={`port-${side}-${slot}`} type="source" position={Position[({left:'Left',right:'Right',top:'Top',bottom:'Bottom'} as const)[side]]} isConnectable={data.editing} className="canvas-port" aria-label={`Connect ${entity.name}: ${side} point ${slot+1}`} title="Drag from or drop onto this connection point" style={{[side==='left'||side==='right'?'top':'left']:`${[25,50,75][slot]}%`,'--port-size':`${portSize}px`} as React.CSSProperties}/>)
 ])}</>;
 if (data.expanded) return <div className={`scope-boundary ${deployment ? 'deployment-scope' : ''} ${data.active ? 'is-active' : ''}`} data-level={data.scopeTone}>
  {handles}<div className="scope-heading"><span className="scope-symbol">{symbol}</span><div><strong>{entity.name}</strong><span>{deployment?<><b className="deployment-type-label">{deployment.label}</b> · {data.drill}</>:`${data.childLevel} · ${data.drill}`}</span></div><button className="nodrag nopan" aria-label={`Documentation for ${entity.name}`} title="Element documentation" onClick={event => { event.stopPropagation(); data.inspect(); }}><Info size={18}/></button><button className="nodrag nopan scope-collapse" aria-label={`Collapse ${entity.name}`} title="Collapse details" onClick={event => { event.stopPropagation(); data.collapse(); }}><CaretUp size={18}/>Collapse</button></div>
  <span className="scope-caption">{data.entryLabel && <strong className="scope-entry-marker">Data entry · {data.entryLabel} · </strong>}{entity.description}</span>
 </div>;
 if(sculpted){
  const shape=deployment?.shape??(entity.kind==='database'?'storage':entity.kind==='external'?'network':'cube');
  const glyphType=deployment?.id??(shape==='storage'?'infra-database':shape==='network'?'infra-network':'deployment');
  return <div className={`entity-node kind-deployment deployment-symbol-node ${data.active?'is-active':''}`} data-deployment-shape={shape}>
   <div className="deployment-symbol-anchor">{handles}<DeploymentGlyph type={glyphType} sculpted icon={deployment?undefined:Icon}/></div>
   <div className="deployment-symbol-label">
    <strong className="deployment-type-label" dir="auto">{deployment?.label??elementTypeLabel(entity)}</strong>
    <span className="deployment-resource-name" dir="auto" title={entity.name}>{entity.name}</span>
   </div>
  </div>;
 }
 return <div className={`entity-node kind-${entity.kind} theme-${appearance} ${data.active ? 'is-active' : ''}`} data-c4-level={level} data-deployment-shape={deployment?.shape}>
  {handles}{data.entryLabel && <div className="entry-marker">↳ Data entry · {data.entryLabel}</div>}<div className="entity-top"><span className="entity-symbol">{symbol}</span><span className={`entity-kind${deployment?' deployment-type-label':''}`}>{level&&<span className="entity-level">{level}</span>}{elementTypeLabel(entity)}</span>{data.drill && <ArrowUpRight size={17} className="drill-arrow"/>}</div>
  <div className="entity-name" dir="auto" title={entity.name}>{entity.name}</div><p dir="auto" title={entity.description}>{entity.description}</p>
  {data.active&&data.addNext?<button type="button" className="entity-bottom flow-node-next nodrag nopan" onClick={event=>{event.stopPropagation();data.addNext?.();}}><Plus size={18}/>Add next item</button>:<div className="entity-bottom"><TechnologyLogos technology={entity.technology}/>{data.drill ? <><Stack size={14}/><span>Double-click · {data.drill}</span><span className="node-next">＋</span></> : entity.code.length ? <><Code size={14}/><span>{entity.code.length} code {entity.code.length === 1 ? 'mapping' : 'mappings'}</span><ArrowUpRight size={13}/></> : <><span className="tech-dot"/><span className="entity-technology" dir="auto" title={entity.technology}>{entity.technology || 'View documentation'}</span><ArrowUpRight size={13}/></>}</div>}
 </div>;
}
const nodeTypes = { entity: EntityNode, frame: BoundaryFrame };
function diagramColor(token: string): string { return getComputedStyle(window.document.documentElement).getPropertyValue(token).trim(); }
const LinkLabels = createContext(true);
const linkLabelsPreference = 'omnidocs.canvas.linkLabels';

function LinkLabelHint({x, y, revealed}: {x: number; y: number; revealed: boolean}) {
 const scale = useStore(state => 1 / Math.max(0.12, state.transform[2]));
 return <g className="link-label-hint" transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
  {/* Keep the hover target in place when the icon gives way to the label. */}
  <rect className="link-label-hit" x={-10} y={-9} width={20} height={18} fill="transparent"/>
  {!revealed && <g className="link-label-symbol" pointerEvents="none">
   <rect x={-8} y={-7} width={16} height={14} rx={4}/>
   <ChatDots x={-6} y={-6} size={12} weight="bold"/>
  </g>}
 </g>;
}

function deploymentEdgePath(sourceX:number,sourceY:number,targetX:number,targetY:number,index:number,count:number){
 const dx=targetX-sourceX,dy=targetY-sourceY;
 const diagonal=1/Math.sqrt(3);
 const alongX=(dx+dy/diagonal)/2;
 const acrossX=dx-alongX;
 const offset=(index-(count-1)/2)*12;
 const firstX=sourceX+alongX/2+offset;
 const firstY=sourceY+(alongX/2+offset)*diagonal;
 const secondX=firstX+acrossX;
 const secondY=firstY-acrossX*diagonal;
 return [`M ${sourceX} ${sourceY} L ${firstX} ${firstY} L ${secondX} ${secondY} L ${targetX} ${targetY}`,(firstX+secondX)/2,(firstY+secondY)/2] as const;
}
function DirectedEdge(props: EdgeProps) {
 const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, markerStart, style, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth, selected, data } = props;
 const smooth = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
 const channel = Number(data?.routeCount) > 1 ? parallelChannel({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, sourcePosition, targetPosition, Number(data?.routeIndex), Number(data?.routeCount)) : undefined;
 const route = data?.route as ConnectionRoute | undefined;
 const [hover, setHover] = useState(false);
 const showLinkLabels = useContext(LinkLabels);
 const angled=useContext(DeploymentAngle);
 const validRoute = route && Math.abs(route.points[0].x - sourceX) < 8 && Math.abs(route.points[0].y - sourceY) < 8 && Math.abs(route.points[route.points.length - 1].x - targetX) < 8 && Math.abs(route.points[route.points.length - 1].y - targetY) < 8;
 const [path, labelX, labelY] = angled
  ? deploymentEdgePath(sourceX,sourceY,targetX,targetY,Number(data?.routeIndex??0),Number(data?.routeCount??1))
  : validRoute ? [orthogonalPath(route.points), route.labelX, route.labelY] : channel ? [channel.path, channel.labelX, channel.labelY] : smooth;
 const showLabel = selected || hover || (showLinkLabels && !data?.focusMuted);
 const communication = data?.communication as Communication | undefined;
 const color = communication ? protocolStyle(communication.protocol).color : diagramColor('--diagram-edge');
 const textLines = showLabel ? edgeLabelLines(String(label ?? ''), 36, 4, data?.protocolLabel as string | undefined) : [];
 const wrappedLabel = textLines.map((line, index) => <tspan key={index} x={0} dy={index ? '1.25em' : `${-(textLines.length - 1) * 0.625}em`} direction={/[\u0590-\u08ff]/.test(line) ? 'rtl' : 'ltr'} textAnchor={/[\u0590-\u08ff]/.test(line) ? 'end' : 'start'}>{line}</tspan>);
 const duration = Math.max(2.5, (Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)) / 90);
 return <g className="communication-path" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-protocol={communication?.protocol} data-mode={communication?.mode} data-channel={data?.routeIndex as number} data-routed={angled||!!validRoute} data-angled={angled||undefined}>
  <title>{communication ? `${protocolStyle(communication.protocol).label} · ${communication.mode === 'logical' ? 'Logical notification' : communication.mode === 'brokered' ? 'Via broker' : 'Direct'}` : 'Directed relationship'}{`\n${String(label ?? '')}`}</title>
  <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} label={showLabel ? wrappedLabel : undefined} labelX={labelX} labelY={labelY} labelStyle={labelStyle} labelShowBg={labelShowBg} labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding} labelBgBorderRadius={labelBgBorderRadius} interactionWidth={interactionWidth}/>
  {!showLinkLabels && String(label ?? '').trim() && <LinkLabelHint x={labelX} y={labelY} revealed={showLabel}/>}
  <g className="relation-motion" aria-hidden="true" pointerEvents="none">
   {[0, 1].map(index => <circle key={index} className="relation-particle" style={{ fill: color, stroke: color }} r={selected ? 3.6 : 3}>
    <animateMotion path={path} dur={`${duration}s`} begin={`${-index * duration / 2}s`} repeatCount="indefinite" calcMode="paced"/>
   </circle>)}
  </g>
 </g>;
}
const edgeTypes = { directed: DirectedEdge };
function absolutePositions(nodes: CanvasNode[]) {
 const byId = new Map(nodes.map(node => [node.id, node]));
 const absolute = (node: CanvasNode): { x: number; y: number } => { const parent = node.parentId && byId.get(node.parentId); const offset = parent ? absolute(parent) : { x: 0, y: 0 }; return { x: node.position.x + offset.x, y: node.position.y + offset.y }; };
 return new Map(nodes.map(node => [node.id, absolute(node)]));
}
function arrangeConnections(nodes: CanvasNode[], edges: Edge[], automatic = false) {
 const byId = new Map(nodes.map(node => [node.id, node]));
 const absolute = absolutePositions(nodes);
 const routes = routeConnections(nodes.filter(node => node.type === 'entity').map(node => ({ id: node.id, ...absolute.get(node.id)!, width: Number(node.style?.width), height: Number(node.style?.height), obstacle: !node.data.expanded })), edges.map(edge=>({...edge,sourceHandle:edge.data?.sourceHandle as string|undefined,targetHandle:edge.data?.targetHandle as string|undefined})), automatic);
 return edges.map(edge => { const route = routes.get(edge.id), source = byId.get(edge.source);
  return { ...edge, sourceHandle: route?.sourceHandle ?? (source?.data.direction === 'DOWN' ? 'source-bottom' : 'source-right'), targetHandle: route?.targetHandle ?? (source?.data.direction === 'DOWN' ? 'target-top' : 'target-left'), data: { ...edge.data, route } };
 });
}
function decorateEdge(edge: Edge, selection: string | null, flow?: View['flows'][number], focus?: ReturnType<typeof graphFocus>): Edge {
 const selected = selection === edge.data?.relationId;
 const step = flow?.relationships.indexOf(String(edge.data?.relationId)) ?? -1;
 const focusConnected = focus?.active && focus.connections.has(edge.id);
 const focusMuted = focus?.active && !focusConnected;
 const emphasized = selected || focusConnected || step >= 0;
 const communication = edge.data?.communication as Communication;
 const color = protocolStyle(communication.protocol).color;
 return { ...edge, selected, className: focus?.active ? focusConnected ? 'focus-connected' : 'focus-muted' : flow && step < 0 && !selected ? 'flow-muted' : step >= 0 ? 'input-path-edge' : '',
  data: { ...edge.data, focusMuted },
  label: step >= 0 ? `${step + 1}. ${edge.data?.baseLabel}` : String(edge.data?.defaultLabel ?? edge.data?.baseLabel ?? ''),
  markerEnd: { type: MarkerType.ArrowClosed, color, width: 17, height: 17 },
  style: { ...edge.style, stroke: color, strokeDasharray: communicationDash(communication), strokeWidth: selected ? 3.6 : emphasized ? 3 : 1.8 },
 };
}
export type CanvasPosition=LayoutSnapshot;
const easeCamera = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function ConnectionEscape() {
 const cancelConnection = useStore(state => state.cancelConnection);
 useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelConnection(); }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, [cancelConnection]);
 return null;
}
function ResponsiveViewport({ layoutKey, revision, positions, animate }: {
 layoutKey: string; revision: number; positions: Map<string, CanvasPosition>; animate: boolean;
}) {
 const initialized = useNodesInitialized(), nodes = useNodes<CanvasNode>();
 const width = useStore(state => state.width), height = useStore(state => state.height);
 const { fitView, setViewport, getViewport } = useReactFlow();
 const previous = useRef<{ layoutKey: string; revision: number; width: number; height: number } | null>(null);
 useEffect(() => {
  if (!initialized || !nodes.length || width <= 0 || height <= 0 || nodes.some(node => node.data.layoutKey !== layoutKey || Math.abs((node.measured?.width ?? 0) - Number(node.style?.width)) > 1 || Math.abs((node.measured?.height ?? 0) - Number(node.style?.height)) > 1)) return;
  const last = previous.current;
  if (last?.layoutKey === layoutKey && last.revision === revision && last.width === width && last.height === height) return;
  previous.current = { layoutKey, revision, width, height };
  // Resizing the canvas changes available space, not the user's zoom or focal point.
  if(last?.layoutKey===layoutKey&&last.revision===revision){const current=getViewport();void setViewport({...current,x:current.x+(width-last.width)/2,y:current.y+(height-last.height)/2});return;}
  const saved = positions.get(layoutKey);
  const canRestore = saved && Object.keys(saved.positions).length===nodes.length && nodes.every(node=>saved.positions[node.id]);
  const duration = animate && !reducedMotion() ? 480 : 0;
  if (canRestore) {
   const zoom = Math.max(0.05, saved.viewport.zoom * Math.min(1, width / saved.size.width, height / saved.size.height));
   const scale = zoom / saved.viewport.zoom;
   void setViewport({zoom, x: (saved.viewport.x - saved.size.width / 2) * scale + width / 2,
    y: (saved.viewport.y - saved.size.height / 2) * scale + height / 2}, {duration, ease: easeCamera});
  } else void fitView({ padding: 0.12, maxZoom: 1, minZoom: 0.05, duration, ease: easeCamera });
 }, [initialized, nodes, width, height, layoutKey, revision, positions, animate, fitView, setViewport,getViewport]);
 return null;
}
export function DiagramCanvas({ historyChanges,readOnly=false,fullscreen=false, model, view, selection, onEntity, onRelation, positions, navigationRevision, editing = false, connecting = false, onConnecting, onConnection, onAction, onNavigate,connectionPorts,onLayoutSave }: {
 historyChanges?:CanvasChanges;readOnly?:boolean;fullscreen?:boolean; model: Model; view: View; navigationRevision: number; selection: string | null; onEntity: (id: string) => void; onRelation: (r: Relation) => void; positions: Map<string, CanvasPosition>;
 connectionPorts:Record<string,{sourceHandle:string;targetHandle:string}>;onLayoutSave:(command:Extract<EditCommand,{op:'layout.save'}>)=>void;
 onAction?: (request:Omit<EditorRequest,'nonce'>)=>void; onNavigate?: (id:string)=>void;
 editing?: boolean; connecting?: boolean; onConnecting?: (value: boolean) => void; onConnection?: (request: ConnectionRequest) => void;
}) {
 const [angledDeployment,setAngledDeployment]=useState(true);
 const deploymentView=view.type==='deployment';
 const isometric=deploymentView&&angledDeployment;
 const [showLinkLabels, setShowLinkLabels] = useState(() => {
  try { return localStorage.getItem(linkLabelsPreference) !== 'off'; }
  catch { return true; }
 });
 function toggleLinkLabels() {
  const visible = !showLinkLabels;
  setShowLinkLabels(visible);
  try { localStorage.setItem(linkLabelsPreference, visible ? 'on' : 'off'); }
  catch { /* The preference still works for this session. */ }
 }
 const [nodes, setNodes] = useNodesState<CanvasNode>([]);
 const onNodesChange=useCallback((changes:NodeChange<CanvasNode>[])=>setNodes(current=>fitParentFrames(applyNodeChanges(changes,current))),[setNodes]);
 const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
 const [layoutError, setLayoutError] = useState(''), [loading, setLoading] = useState(true);
 const activeStackId=useRef<string|null>(null);
 const instance = useRef<ReactFlowInstance<CanvasNode> | null>(null), container = useRef<HTMLDivElement>(null);
 const promote=useCallback((id:string)=>{
  activeStackId.current=id;
  const current=instance.current?.getNodes();if(!current)return;
  const stacked=canvasStacking(current,view.id,id);setNodes(stacked.nodes);setEdges(edges=>stackEdges(edges,stacked.layers,view.id));
 },[view.id,setNodes,setEdges]);
 const [expansions, setExpansions] = useState<{ model: Model; viewId: string; navigationRevision: number; ids: Set<string> }>(() => ({ model, viewId: view.id, navigationRevision, ids: new Set() }));
 const expanded = (expansions.model === model || editing && expansions.model.project.id === model.project.id) && expansions.viewId === view.id && expansions.navigationRevision === navigationRevision ? expansions.ids : undefined;
 useEffect(() => { if (editing) setExpansions(state => state.model === model || state.model.project.id !== model.project.id ? state : { ...state, model }); }, [model, editing]);
 const layoutKey = canvasLayoutKey(view.id, expanded ?? new Set())+(isometric?':isometric':'');
 const displayNodes=useMemo(()=>historyChanges?nodes.map(node=>{
  const id=node.type==='entity' ? (node.data.entity as Entity).id : undefined;
  const change=(id && (historyChanges.items[id] ?? historyChanges.viewItems[view.id]?.[id]))
   || historyChanges.layouts[layoutKey]?.[node.id];
  return change ? {...node,className:`${node.className ?? ''} history-canvas-${change}`} : node;
 }):nodes,[nodes,historyChanges,layoutKey,view.id]);
 const displayEdges=useMemo(()=>historyChanges?edges.map(edge=>{
  const change=historyChanges.relations[String(edge.data?.relationId)];
  if (!change) return edge;
  const color={added:'#28735c',updated:'#a15c16',removed:'#ae3e46'}[change];
  return {...edge,className:`${edge.className ?? ''} history-canvas-${change}`,
   markerEnd:{type:MarkerType.ArrowClosed,color,width:18,height:18},style:{...edge.style,stroke:color,strokeWidth:4}};
 }):edges,[edges,historyChanges]);
 const [renderedKey, setRenderedKey] = useState(''), [revision, setRevision] = useState(0);
 const [arrangement, setArrangement] = useState(0);
 const [arrangeChoice,setArrangeChoice]=useState<{key:string;options:Arrangement}|null>(null);
 const arrangeOptions=arrangeChoice?.key===layoutKey?arrangeChoice.options:positions.get(layoutKey)?.arrangement??defaultArrangement;
 const arrangementRef=useRef(arrangeOptions);arrangementRef.current=arrangeOptions;
 const persistArrange=useRef<string|null>(null),layoutSaveRef=useRef(onLayoutSave);layoutSaveRef.current=onLayoutSave;
 const [drawing,setDrawing]=useState(false);
 const [focusChoice, setFocusChoice] = useState<{ model: Model; viewId: string; navigationRevision: number; target: FocusTarget } | null>(null);
 const focusTarget = focusChoice?.model === model && focusChoice.viewId === view.id && focusChoice.navigationRevision === navigationRevision ? focusChoice.target : null;
 const focusOn = (target: FocusTarget) => setFocusChoice({ model, viewId: view.id, navigationRevision, target });
 const [context,setContext]=useState<{x:number;y:number;entityId?:string;relationId?:string;nodeId?:string;viewId:string}|null>(null);
 useEffect(()=>setContext(null),[model,view.id,navigationRevision]);
 const [animating, setAnimating] = useState(false);
 const connectionCancelled = useRef(false);
 const [flowChoice, setFlowChoice] = useState<{ model: Model; viewId: string; id: string | null } | null>(null);
 const activeFlow = flowChoice?.model === model && flowChoice.viewId === view.id ? view.flows.find(flow => flow.id === flowChoice.id) : view.flows[0];
 const flowRef = useRef(activeFlow); flowRef.current = activeFlow;
 function fitInputPath() {
  if (!activeFlow || !instance.current) return;
  const endpoints = new Set(model.relations.filter(relation => activeFlow.relationships.includes(relation.id)).flatMap(relation => [relation.source, relation.target]));
  const pathNodes = instance.current.getNodes().filter(node => node.type === 'entity' && endpoints.has(node.data.entity.id));
  void instance.current.fitView({ nodes: pathNodes, padding: 0.2, maxZoom: 1, minZoom: 0.05, duration: reducedMotion() ? 0 : 400 });
 }
 const loadingRef = useRef(true), renderedKeyRef = useRef('');
 const automaticRouting = useRef(false);
 function canvasSize() {
  const canvas = container.current?.querySelector('.react-flow');
  return {width: canvas?.clientWidth || container.current?.clientWidth || 1,
   height: canvas?.clientHeight || container.current?.clientHeight || 1};
 }
 function snapshotFor(nodes: CanvasNode[], viewport: Viewport, size: CanvasPosition['size']): CanvasPosition {
  return {
   viewport, size, arrangement: arrangementRef.current, routing: automaticRouting.current ? 'automatic' : undefined,
   positions: Object.fromEntries(nodes.map(node => [node.id, node.position])),
   parents: Object.fromEntries(nodes.flatMap(node => node.parentId ? [[node.id, node.parentId]] : [])),
   dimensions: Object.fromEntries(nodes.filter(node => node.type === 'frame' || node.data.expanded)
    .map(node => [node.id, {width: Number(node.style?.width), height: Number(node.style?.height)}])),
  };
 }
 const savePosition = useCallback((viewport = instance.current?.getViewport(),persist=false) => {
  if (!instance.current || !container.current || !viewport || loadingRef.current || !renderedKeyRef.current) return;
  const snapshot = snapshotFor(instance.current.getNodes(), viewport, canvasSize());
  positions.set(renderedKeyRef.current,snapshot);
  if(persist)layoutSaveRef.current({op:'layout.save',viewId:view.id,key:renderedKeyRef.current,layout:snapshot});
 }, [positions,view.id]);
 function runArrange(options=arrangeOptions){setArrangeChoice({key:layoutKey,options});persistArrange.current=layoutKey;setAnimating(true);setArrangement(value=>value+1);}
 const toggle = useCallback((id: string) => {
  if (loadingRef.current) return;
  activeStackId.current=id;
  setFocusChoice(null);
  savePosition();
  setExpansions(state => {
   const next = new Set(state.model === model && state.viewId === view.id && state.navigationRevision === navigationRevision ? state.ids : []);
   if (next.has(id)) { for (const path of next) if (path === id || path.startsWith(`${id}/`)) next.delete(path); }
   else next.add(id);
   return { model, viewId: view.id, navigationRevision, ids: next };
  });
  setAnimating(true);
 }, [model, view.id, navigationRevision, savePosition]);
 useEffect(() => { if (!animating) return; const timer = setTimeout(() => setAnimating(false), 950); return () => clearTimeout(timer); }, [animating, layoutKey]);
 const selectionRef = useRef(selection); selectionRef.current = selection;
 const onEntityRef = useRef(onEntity); onEntityRef.current = onEntity;
 const onActionRef=useRef(onAction);onActionRef.current=onAction;
 useEffect(() => {
  if (view.type === 'bpmn') return;
  let cancelled = false;
  loadingRef.current = true; setLoading(true); setLayoutError('');
  async function layout() {
   try {
    const result = await layoutCanvas(model, view, expanded ?? new Set(),undefined,new Set(),new Map(),arrangeOptions,isometric);
    if (cancelled) return;
    const saved = persistArrange.current === layoutKey ? undefined : positions.get(layoutKey);
    automaticRouting.current = persistArrange.current === layoutKey || saved?.routing === 'automatic';
    const entityNodes: CanvasNode[] = result.nodes.map(node => ({ id: node.id, type: 'entity', parentId: node.parentId,
     position: saved?.positions[node.id] && saved.parents?.[node.id] === node.parentId ? saved.positions[node.id] : node.position, style: { width: node.width, height: node.height },
     ariaLabel: `${entityLabels[node.entity.kind]}: ${node.entity.name}${node.expanded ? ', expanded' : ''}`,
     data: { entity: node.entity, viewId: node.view.id, editing, direction: node.view.direction, drill: node.child ? (node.child.type === 'deployment' ? node.child.name.toLowerCase() : viewLabels[node.child.type].toLowerCase()) : undefined,
      expanded: node.expanded, childViewId:node.child?.id, childLevel: node.child ? node.child.type === 'deployment' ? 'Infrastructure' : `L${({ context: 1, container: 2, component: 3, code: 4 } as Record<string,number>)[node.child.type] ?? ''}` : undefined,
      scopeTone: node.child?.type === 'deployment' ? `L${Math.min(4, node.id.split('/').length + 1)}` : `L${({ context: 1, container: 2, component: 3, code: 4 } as Record<string,number>)[node.child?.type ?? ''] ?? 2}`,
      entryLabel: node.view.entryPoints.find(entry => entry.node === node.entity.id)?.label,
      addNext:editing&&!readOnly&&view.type==='dataflow'&&isC4FlowItem(node.entity)&&view.nodes.includes(node.entity.id)?()=>onActionRef.current?.({action:'flow-next',id:node.entity.id,viewId:view.id}):undefined,
      active: selectionRef.current === node.entity.id, layoutKey, collapse: () => toggle(node.id), inspect: () => onEntityRef.current(node.entity.id) },
    }));
    const frameNodes: CanvasNode[] = result.frames.map(frame => ({ id: frame.id, type: 'frame', parentId: frame.parentId, position: saved?.positions[frame.id] && saved.parents?.[frame.id] === frame.parentId ? saved.positions[frame.id] : frame.position,
     style: { width: frame.width, height: frame.height }, draggable: false, selectable: false, focusable: false, connectable: false,
     data: { viewId:frame.view.id, name: frame.name, description: frame.description, category: frame.category, tone: frame.tone, flowLevel:view.layout==='levels'?frame.id.slice(-2):undefined, contextEnvelope:frame.description.startsWith('Context envelope ·'), add:editing&&view.layout==='levels'?()=>onAction?.({action:'include',viewId:view.id,level:frame.id.slice(-2)}):undefined, layoutKey },
    }));
    const restored=new Set([...frameNodes,...entityNodes].filter(node=>saved?.positions[node.id]&&saved.parents?.[node.id] === node.parentId).map(node=>node.id));
    const sized=[...frameNodes,...entityNodes].map(node=>{const dimension=saved?.dimensions?.[node.id];return dimension&&(node.type==='frame'||node.data.expanded)?{...node,style:{...node.style,width:Math.max(Number(node.style?.width),dimension.width),height:Math.max(Number(node.style?.height),dimension.height)}}:node;});
    const allNodes = reconcileFrameChildren(sized,restored);
    const correctedBands = view.layout === 'levels' && saved && allNodes.some(node =>
     node.data.flowLevel && saved.positions[node.id] && node.position.x !== saved.positions[node.id].x);
    if (persistArrange.current === layoutKey || correctedBands) {
     persistArrange.current = null;
     const size = canvasSize();
     const absolute = absolutePositions(allNodes);
     const bounds = allNodes.reduce((bounds, node) => {
      const {x, y} = absolute.get(node.id)!;
      return {
       left: Math.min(bounds.left, x), top: Math.min(bounds.top, y),
       right: Math.max(bounds.right, x + Number(node.style?.width)),
       bottom: Math.max(bounds.bottom, y + Number(node.style?.height)),
      };
     }, {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity});
     const viewport = allNodes.length
      ? getViewportForBounds({x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top}, size.width, size.height, 0.05, 1, 0.12)
      : {x: 0, y: 0, zoom: 1};
     const snapshot = snapshotFor(allNodes, viewport, size);
     positions.set(layoutKey, snapshot);
     layoutSaveRef.current({op: 'layout.save', viewId: view.id, key: layoutKey, layout: snapshot});
    }
    const byId = new Map(allNodes.map(node => [node.id, node]));
    const depth = (node: CanvasNode): number => node.parentId && byId.has(node.parentId) ? 1 + depth(byId.get(node.parentId)!) : 0;
    const stacked=canvasStacking(allNodes.sort((a,b)=>depth(a)-depth(b)),view.id,activeStackId.current);
    setNodes(stacked.nodes);
    const pairs = new Map<string, string[]>();
    for (const edge of result.edges) { const pair = [edge.source, edge.target].sort().join('|'); pairs.set(pair, [...(pairs.get(pair) ?? []), edge.id]); }
    setEdges(stackEdges(arrangeConnections(allNodes, result.edges.map(({ id, source, target, relation: r, view: edgeView, index }) => ({ id, source, target,
     ...(edgeView.type === 'context' && edgeView.direction === 'RIGHT' && (byId.get(source)?.position.x ?? 0) > (byId.get(target)?.position.x ?? 0) ? { sourceHandle: 'source-left', targetHandle: 'target-right' } : {}),
     data: { ...connectionPorts[r.id],viewId:edgeView.id, relationId: r.id, protocolLabel: edgeView.type !== 'context' ? communicationText(r) : undefined, communication: resolveCommunication(r, model.entities), routeIndex: pairs.get([source, target].sort().join('|'))!.indexOf(id), routeCount: pairs.get([source, target].sort().join('|'))!.length, defaultLabel: `${edgeView.type === 'dataflow' ? `${index + 1}. ` : ''}${r.label}${communicationText(r) && edgeView.type !== 'context' ? `\n${communicationText(r)}` : ''}`, baseLabel: `${r.label}${communicationText(r) && edgeView.type !== 'context' ? `\n${communicationText(r)}` : ''}` },
     label: `${edgeView.type === 'dataflow' ? `${index + 1}. ` : ''}${r.label}${communicationText(r) && edgeView.type !== 'context' ? `\n${communicationText(r)}` : ''}`,
     type: 'directed', selected: selectionRef.current === r.id,
     markerEnd: { type: MarkerType.ArrowClosed, color: diagramColor('--diagram-edge'), width: 17, height: 17 },
     style: { stroke: diagramColor(selectionRef.current === r.id ? '--diagram-selected' : '--diagram-edge'), strokeWidth: selectionRef.current === r.id ? 2.5 : 1.5 },
     labelStyle: { fill: diagramColor('--diagram-label'), fontSize: 13, fontWeight: 500, whiteSpace: 'pre' },
     labelBgStyle: { fill: diagramColor('--diagram-label-bg'), fillOpacity: 0.96 }, labelBgPadding: [8, 6] as [number, number], labelBgBorderRadius: 4, interactionWidth: 25,
    })), automaticRouting.current).map(edge => decorateEdge(edge, selectionRef.current, flowRef.current)),stacked.layers,view.id));
    renderedKeyRef.current = layoutKey; setRenderedKey(layoutKey); setRevision(value => value + 1);
    loadingRef.current = false; setLoading(false);
   } catch (error) { if (!cancelled) { if (persistArrange.current === layoutKey) persistArrange.current = null; setLayoutError(error instanceof Error ? error.message : 'Layout failed'); loadingRef.current = false; setLoading(false); } }
  }
  void layout(); return () => { cancelled = true; };
 }, [model, view, expanded, layoutKey, positions, setNodes, setEdges, toggle, arrangement, editing,readOnly,arrangeOptions,connectionPorts,isometric]);
 useEffect(() => {
  const focus = graphFocus(instance.current?.getNodes() ?? [], instance.current?.getEdges() ?? [], focusTarget);
  setNodes(nodes => nodes.map(node => {
   const className = !focus.active ? '' : focus.selected.has(node.id) ? 'focus-selected' : focus.context.has(node.id) ? 'focus-context' : focus.related.has(node.id) ? 'focus-related' : 'focus-muted';
   return node.type === 'entity' ? { ...node, className, data: { ...node.data, active: focus.active ? focus.selected.has(node.id) : selection === node.data.entity.id } } : { ...node, className };
  }));
  setEdges(edges => edges.map(edge => decorateEdge(edge, selection, activeFlow, focus)));
 }, [selection, activeFlow, focusTarget, revision, setNodes, setEdges]);
 useEffect(() => { const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') { connectionCancelled.current = true; setDrawing(false); setFocusChoice(null); setNodes(nodes=>nodes.map(node=>({...node,selected:false}))); setEdges(edges=>edges.map(edge=>({...edge,selected:false}))); onConnecting?.(false); } }; window.addEventListener('keydown', clear); return () => window.removeEventListener('keydown', clear); }, [onConnecting]);
 const finishDrag=()=>{requestAnimationFrame(()=>{if(instance.current)setEdges(edges=>arrangeConnections(instance.current!.getNodes(),edges,automaticRouting.current));savePosition(undefined,true);});};
 const selectedCount=nodes.filter(node=>node.type==='entity'&&node.selected).length;
 const contextEntity=model.entities.find(entity=>entity.id===context?.entityId), contextRelation=model.relations.find(relation=>relation.id===context?.relationId);
 const child=contextEntity&&view.layout!=='levels'?childView(model,contextEntity.id):undefined;
 const actions:ContextAction[]=[];
 const request=(action:EditorRequest['action'],id?:string,viewId=context?.viewId)=>onAction?.({action,id,viewId});
 if(contextEntity){
  actions.push({label:'View documentation',run:()=>onEntity(contextEntity.id)});
  if(view.type==='dataflow'&&view.nodes.includes(contextEntity.id)&&isC4FlowItem(contextEntity))
   actions.push({label:'Add next item',run:()=>request('flow-next',contextEntity.id,view.id)});
  actions.push({label:'Edit item',run:()=>request('edit',contextEntity.id)});
  if(child){actions.push({label:'Add existing item inside',run:()=>request('include',contextEntity.id,child.id)},{label:'Open next level',run:()=>onNavigate?.(child.id)},{label:'Add item inside',run:()=>{if(context?.nodeId&&!nodes.find(node=>node.id===context.nodeId)?.data.expanded)toggle(context.nodeId);request('add',contextEntity.id,child.id);}});if(context?.nodeId)actions.push({label:nodes.find(node=>node.id===context.nodeId)?.data.expanded?'Collapse details':'Expand details here',run:()=>toggle(context.nodeId!)});}
  else if(view.layout!=='levels'&&['system','external','container','database','queue','deployment'].includes(contextEntity.kind))actions.push({label:'Create next level',run:()=>request('next',contextEntity.id)});
  actions.push({label:'Draw connection',run:()=>request('connect',contextEntity.id)},{label:view.type==='dataflow'?'Remove item from flow':'Delete item…',danger:true,run:()=>request('delete',contextEntity.id)});
 }else if(contextRelation)actions.push({label:'View relationship',run:()=>onRelation(contextRelation)},{label:'Edit connection',run:()=>request('edit',contextRelation.id)},{label:view.type==='dataflow'?'Remove connection from flow':'Delete connection',danger:true,run:()=>request('delete',contextRelation.id)});
 else actions.push({label:'Add existing item',run:()=>request('include')},{label:'Add item',run:()=>request('add')},{label:'Draw connection',run:()=>request('connect')},{label:'Fit diagram',run:()=>void instance.current?.fitView({padding:0.12,maxZoom:1,minZoom:0.05})},{label:'Clear focus',run:()=>setFocusChoice(null)});
 if(readOnly||model.importInfo&&(!model.importInfo.authoritativeSource||model.importInfo.integrity!=='verified')) for(const action of actions)if(!['View documentation','View relationship','Open next level','Expand details here','Collapse details','Fit diagram','Clear focus'].includes(action.label)){action.disabled=true;action.title=readOnly?'Read-only access.':'View only: connect a verified editable model.';}
 if (view.type === 'bpmn') return editing?null:<BpmnCanvas view={view} onEntity={onEntity}/>;
 return <div className="diagram-canvas" ref={container} data-deployment-view={deploymentView||undefined} data-isometric={isometric||undefined} data-editing={editing} data-connecting={editing && (connecting||drawing)} data-transition={animating ? 'expanding' : 'idle'} aria-busy={loading}>
  {context&&<CanvasContextMenu x={context.x} y={context.y} title={contextEntity?.name??contextRelation?.label??'Canvas'} actions={actions} onClose={()=>setContext(null)}/>}
  <DeploymentAngle.Provider value={isometric}>
  <LinkLabels.Provider value={showLinkLabels}>
  <ReactFlow ariaLabelConfig={{'controls.fitView.ariaLabel':'Fit diagram to canvas (changes zoom)'}} connectionMode={ConnectionMode.Loose} zIndexMode="manual" elevateNodesOnSelect={false} elevateEdgesOnSelect={false} nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
   onInit={flow => { instance.current = flow; }}
   onNodeClick={(event, node) => { event.stopPropagation(); if (loadingRef.current || node.type !== 'entity') return; promote(node.id); if(event.shiftKey||event.metaKey||event.ctrlKey){setFocusChoice(null);return;} focusOn({ kind: 'node', id: node.id }); onEntity(node.data.entity.id); }}
   onNodeDoubleClick={(event, node) => { event.stopPropagation(); if (loadingRef.current || node.type !== 'entity' || view.layout==='levels' || node.data.expanded || !node.data.drill) return; toggle(node.id); }}
   onNodeContextMenu={(event,node)=>{event.preventDefault();event.stopPropagation();if(node.type!=='entity'){setContext({x:event.clientX,y:event.clientY,viewId:view.id});return;}promote(node.id);onEntity(node.data.entity.id);setContext({x:event.clientX,y:event.clientY,entityId:node.data.entity.id,nodeId:node.id,viewId:node.data.viewId});}}
   onEdgeContextMenu={(event,edge)=>{event.preventDefault();event.stopPropagation();const relation=model.relations.find(relation=>relation.id===edge.data?.relationId);if(relation){onRelation(relation);setContext({x:event.clientX,y:event.clientY,relationId:relation.id,viewId:view.id});}}}
   onPaneContextMenu={event=>{event.preventDefault();setContext({x:event.clientX,y:event.clientY,viewId:view.id});}}
   onPaneClick={() => {setContext(null);setFocusChoice(null);}}
   onNodeDragStart={(_event,node)=>{promote(node.id);setFocusChoice(null);}}
   selectionOnDrag={!connecting} selectionMode={SelectionMode.Full} panOnDrag={[1]} panActivationKeyCode="Space" multiSelectionKeyCode={['Shift','Meta','Control']}
   onSelectionStart={()=>{setContext(null);setFocusChoice(null);}}
   onSelectionDragStart={()=>setFocusChoice(null)} onSelectionDragStop={finishDrag}
   nodesDraggable={!connecting&&!readOnly}
   onConnectStart={() => { connectionCancelled.current = false;setDrawing(true); }} onConnectEnd={()=>setDrawing(false)}
   isValidConnection={connection => {
    const source = instance.current?.getNode(connection.source), target = instance.current?.getNode(connection.target);
    return !!editing && source?.type === 'entity' && target?.type === 'entity' && source.id !== target.id && model.views.some(view => view.type !== 'bpmn' && view.nodes.includes(source.data.entity.id) && view.nodes.includes(target.data.entity.id));
   }}
   onConnect={connection => {
    const source = instance.current?.getNode(connection.source), target = instance.current?.getNode(connection.target);
    if (!editing || connectionCancelled.current || source?.type !== 'entity' || target?.type !== 'entity') return;
    const candidates = [model.views.find(view => view.id === source.data.viewId), model.views.find(view => view.id === target.data.viewId), ...model.views];
    const candidate = candidates.find(view => view?.nodes.includes(source.data.entity.id) && view.nodes.includes(target.data.entity.id));
    if (candidate) onConnection?.({ source: source.data.entity.id, target: target.data.entity.id, viewId: candidate.id,sourceHandle:connection.sourceHandle??undefined,targetHandle:connection.targetHandle??undefined });
   }}
   onEdgeClick={(_event, edge) => { const relation = model.relations.find(relation => relation.id === edge.data?.relationId); if (relation) { focusOn({ kind: 'edge', id: edge.id }); onRelation(relation); } }}
   onMoveEnd={(_event, viewport) => { if (!animating) savePosition(viewport); }} onNodeDragStop={finishDrag}
   minZoom={0.05} maxZoom={2} zoomOnDoubleClick={false} connectOnClick={false} nodesConnectable={editing} deleteKeyCode={null} proOptions={{ hideAttribution: false }}>
   <ResponsiveViewport layoutKey={renderedKey} revision={revision} positions={positions} animate={animating}/>
   <ConnectionEscape/>
   {isometric?<DeploymentPlane/>:<Background color={diagramColor('--diagram-grid')} gap={22} size={1}/>}<Controls showInteractive={false}/>
   <MiniMap pannable zoomable nodeBorderRadius={4} nodeColor={node => node.type === 'frame' ? diagramColor(`--frame-${node.data.tone}-bg`) : node.data.expanded ? diagramColor(`--scope-${String(node.data.scopeTone).toLowerCase()}-bg`) : (node.data.entity as Entity).kind === 'system' ? diagramColor('--accent') : diagramColor('--diagram-map-node')} maskColor={diagramColor('--diagram-map-mask')}/>
  </ReactFlow>
  </LinkLabels.Provider>
  </DeploymentAngle.Provider>
  <button type="button" className="canvas-link-labels nodrag nopan" aria-label="Link labels"
   aria-pressed={showLinkLabels} title={showLinkLabels ? 'Show labels only on hover or selection' : 'Show link labels'}
   onClick={toggleLinkLabels}><TextT size={17} aria-hidden="true"/><span>Link labels</span></button>
  {deploymentView&&<button type="button" className="canvas-link-labels deployment-angle-toggle nodrag nopan"
   aria-label="Isometric deployment view" title={isometric?'Switch to flat view':'Switch to isometric view'} aria-pressed={isometric}
   onClick={()=>setAngledDeployment(angle=>!angle)}><Cube size={17} aria-hidden="true"/><span>3D view</span></button>}
  <ConnectionLegend compact={fullscreen} key={view.id} initiallyOpen={view.type !== 'context' && !deploymentView}/>
  <div className="canvas-arrange nodrag nopan"><button title="Arrange by connections and save layout" disabled={loading} onClick={()=>runArrange()}><Graph size={17}/>Arrange</button><select aria-label="Arrangement mode" value={arrangeOptions.mode} disabled={loading} onChange={event=>runArrange({...arrangeOptions,mode:event.target.value as Arrangement['mode']})}><option value="auto">Auto · Connections</option><option value="horizontal">Horizontal flow</option><option value="vertical">Vertical flow</option><option value="row">Single row</option><option value="column">Single column</option><option value="grid">Related grid</option></select><select aria-label="Arrangement spacing" value={arrangeOptions.spacing} disabled={loading} onChange={event=>runArrange({...arrangeOptions,spacing:event.target.value as Arrangement['spacing']})}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="wide">Wide spacing</option></select></div>
  {focusTarget && <button className="canvas-clear-focus nodrag nopan" onClick={() => setFocusChoice(null)}>Clear focus</button>}
  {!!view.flows.length && <div className="deployment-flow-bar" aria-label="Data input paths"><span>Input path</span>{view.flows.map(flow => <button key={flow.id} aria-pressed={activeFlow?.id === flow.id} title={flow.description} onClick={() => setFlowChoice({ model, viewId: view.id, id: flow.id })}>{flow.name}</button>)}<button aria-pressed={!activeFlow} onClick={() => setFlowChoice({ model, viewId: view.id, id: null })}>All connections</button>{activeFlow && <button onClick={fitInputPath} title="Zoom to the selected data path"><ArrowsOut size={13}/> Fit path</button>}</div>}
  {loading && !nodes.length && <div className="canvas-message">Arranging your architecture…</div>}
  {layoutError && <div className="canvas-message error">Unable to arrange this diagram: {layoutError}</div>}
  {!loading && !nodes.length && !layoutError && view.layout!=='levels' && <div className="canvas-message">{editing ? 'This view is empty. Choose Add item to create its first element.' : 'This view is empty. Choose Edit workspace, then Add item to start documenting it.'}</div>}
  {editing && connecting && <div className="connection-draw-guide" role="status"><span className="draw-output-dot"/>Drag from any point<span>→</span><span className="draw-input-dot"/>Drop on another box's point<span>· Esc to cancel</span></div>}
  <div className="canvas-hint"><ArrowsOut size={14}/>{selectedCount>1 ? `${selectedCount} boxes selected · Drag to move together · Esc to clear` : editing ? 'Drag empty space to select · Space + drag to pan · Hover a box to connect' : 'Drag empty space to select · Space + drag to pan · Double-click to expand'}</div>
 </div>;
}
