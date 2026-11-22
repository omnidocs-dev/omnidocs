import {elementTypeLabel} from './element-types.ts';
import {flowLayersView} from './flow-layers.ts';
import {inlineContextView} from './inline-context.ts';
import {ownershipView} from './ownership-frames.ts';
import {arrangeShapes} from './arrangement.ts';
import {defaultArrangement,type Arrangement} from './layout-state.ts';
import { childView, relationsForView, type Entity, type Model, type Relation, type View } from './model.ts';

export type LayoutNode = {
 id: string; entity: Entity; view: View; child?: View; parentId?: string;
 expanded: boolean; position: { x: number; y: number }; width: number; height: number;
};
export type LayoutEdge = { id: string; source: string; target: string; relation: Relation; view: View; index: number };
export type LayoutFrame = View['boundaries'][number] & { view: View; parentId?: string; position: { x: number; y: number }; width: number; height: number };
export type CanvasLayout = { nodes: LayoutNode[]; frames: LayoutFrame[]; edges: LayoutEdge[]; width: number; height: number };
export function canvasNodeId(entityId: string, parentId?: string) {
 return `${parentId ? `${parentId}/` : ''}${encodeURIComponent(entityId)}`;
}
export function canvasLayoutKey(viewId: string, expanded: ReadonlySet<string>) {
 return expanded.size ? `${viewId}:${JSON.stringify([...expanded].sort())}` : viewId;
}

/** Context is an overview around an explicit scope, rather than a tall execution pipeline. */
function layoutContext(items: LayoutNode[], scope: string, relations: Relation[], spacing: Arrangement['spacing']) {
 const center = items.find(node => node.entity.id === scope);
 if (!center) return undefined;
 const isConsumer = (node: LayoutNode) => {
  const side = node.entity.properties['omnidocs.contextSide'];
  if (side === 'left' || side === 'right') return side === 'left';
  if (node.entity.kind === 'person') return true;
  const incoming = relations.filter(relation => relation.source === node.entity.id && relation.target === scope);
  const outgoing = relations.filter(relation => relation.source === scope && relation.target === node.entity.id);
  const usage = (relation: Relation) => relation.properties['doc.relationshipKind']?.toLowerCase() === 'usage';
  // A consumer can also receive callbacks/events. They do not make it a service dependency.
  return incoming.some(usage) && !outgoing.some(usage) || incoming.length > 0 && outgoing.length === 0;
 };
 const consumers = items.filter(node => node !== center && isConsumer(node));
 const providers = items.filter(node => node !== center && !isConsumer(node));
 const gapX = {compact: 58, comfortable: 88, wide: 144}[spacing];
 const gapY = gapX + 8;
 function band(nodes: LayoutNode[]) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length / 2)));
  const rows = Math.ceil(nodes.length / columns);
  const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...nodes.filter((_, index) => index % columns === column).map(node => node.width)));
  const heights = Array.from({ length: rows }, (_, row) => Math.max(...nodes.slice(row * columns, (row + 1) * columns).map(node => node.height)));
  nodes.forEach((node, index) => { const column = index % columns, row = Math.floor(index / columns); node.position = {
   x: widths.slice(0, column).reduce((sum, width) => sum + width + gapX, 0),
   y: heights.slice(0, row).reduce((sum, height) => sum + height + gapY, 0),
  }; });
  return { nodes, width: widths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * gapX,
   height: heights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * gapY };
 }
 const left = band(consumers), right = band(providers), gap = gapX + 122, padding = 40;
 const height = Math.max(left.height, center.height, right.height);
 const centerX = padding + (consumers.length ? left.width + gap : 0);
 for (const { nodes, height: bandHeight } of [left, right]) for (const node of nodes) {
  node.position.x += nodes === consumers ? padding : centerX + center.width + gap;
  node.position.y += padding + (height - bandHeight) / 2;
 }
 center.position = { x: centerX, y: padding + (height - center.height) / 2 };
 return { width: centerX + center.width + (providers.length ? gap + right.width : 0) + padding, height: height + padding * 2 };
}

/** Layout explicit document boundaries independently of entity ownership or application names. */
async function layoutBoundaries(view: View, items: LayoutNode[], relations: Relation[], parentId?: string, options:Arrangement=defaultArrangement) {
 const boundaries = new Map(view.boundaries.map(boundary => [boundary.id, boundary]));
 const membership = new Map(view.boundaries.flatMap(boundary => boundary.nodes.map(id => [id, boundary.id] as const)));
 const frameId = (id: string) => `${parentId ? `${parentId}/` : ''}@frame:${id}`;
 const byEntity = new Map(items.map(node => [node.entity.id, node]));
 async function place(owner?: string): Promise<{ width: number; height: number; frames: LayoutFrame[] }> {
  const children = await Promise.all(view.boundaries.filter(boundary => boundary.parent === owner).map(async boundary => ({ boundary, result: await place(boundary.id) })));
  const direct = items.filter(node => membership.get(node.entity.id) === owner);
  const shapes = [...direct.map(node => ({ id: node.id, width: node.width, height: node.height })), ...children.map(({ boundary, result }) => ({ id: frameId(boundary.id), width: result.width, height: result.height }))];
  function representative(entityId: string): string | undefined {
   let group = membership.get(entityId);
   if (group === owner) return byEntity.get(entityId)?.id;
   while (group) {
    const parent = boundaries.get(group)?.parent;
    if (parent === owner) return frameId(group);
    group = parent;
   }
  }
  const links = relations.flatMap(relation => {
   const source = representative(relation.source), target = representative(relation.target);
   return source && target && source !== target ? [{ id: relation.id, sources: [source], targets: [target] }] : [];
  });
  const manualBands=!owner&&view.layout==='levels';
  const bandHeight=Math.max(360,...shapes.map(shape=>shape.height));let bandX=36;
  const result=manualBands?{children:shapes.map(shape=>{const node={...shape,x:bandX,y:36};bandX+=shape.width+80;return node;}),width:bandX-44,height:bandHeight+72}:await arrangeShapes(owner?frameId(owner):view.id,shapes,links,view.direction,options);
  const top = owner ? 76 : parentId ? 100 : 0;
  const point = (id: string) => { const node = result.children?.find(node => node.id === id); return { x: node?.x ?? 0, y: (node?.y ?? 0) + top }; };
  for (const node of direct) { node.parentId = owner ? frameId(owner) : parentId; node.position = point(node.id); }
  const frames: LayoutFrame[] = [];
  for (const { boundary, result: child } of children) {
   frames.push({ ...boundary, id: frameId(boundary.id), view, parentId: owner ? frameId(owner) : parentId, position: point(frameId(boundary.id)), width: child.width, height: manualBands?bandHeight:child.height }, ...child.frames);
  }
  return { width: Math.max(owner ? 390 : 0, result.width ?? 0), height: Math.max(view.layout==='levels'&&owner?300:0,(result.height ?? 72) + (owner ? 76 : 0)), frames };
 }
 return place();
}

/** Each occurrence has its own ID: an external system may occur at several levels. */
export async function layoutCanvas(model: Model, view: View, expanded: ReadonlySet<string>, parentId?: string, ancestors: ReadonlySet<string> = new Set(), visible: ReadonlyMap<string, string> = new Map(), options:Arrangement=defaultArrangement, symbols=false): Promise<CanvasLayout> {
 const stack = new Set(ancestors).add(view.id);
 const originalView = view;
 view=inlineContextView(model,view,expanded,parentId);
 if(!parentId)view=flowLayersView(model,ownershipView(model,view));
 const belongsToScope = (entityId: string) => {
  let entity = model.entities.find(entity => entity.id === entityId);
  const visited = new Set<string>();
  while (entity?.parent && !visited.has(entity.id)) {
   if (entity.parent === view.scope) return true;
   visited.add(entity.id); entity = model.entities.find(item => item.id === entity!.parent);
  }
  return false;
 };
 const reused = new Map(view.nodes.filter(id => parentId && id !== view.scope && !belongsToScope(id) && visible.has(id)).map(id => [id, visible.get(id)!]));
 const endpoint = (id: string) => reused.get(id) ?? canvasNodeId(id, parentId);
 const occurrences = new Map([...visible, ...view.nodes.map(id => [id, endpoint(id)] as const)]);
 if (reused.size) view = { ...view, nodes: view.nodes.filter(id => !reused.has(id)), boundaries: view.boundaries.map(boundary => ({ ...boundary, nodes: boundary.nodes.filter(id => !reused.has(id)) })) };
 // The expanded scope itself supplies the generated ownership frame.
 if (parentId && view.boundaries.length === 1 && view.boundaries[0].id === 'structurizr-scope') view = { ...view, boundaries: [] };
 const prepared = await Promise.all(view.nodes.map(async entityId => {
  const entity = model.entities.find(entity => entity.id === entityId);
  if (!entity) return undefined;
  const id = canvasNodeId(entityId, parentId), child = view.layout==='levels'?undefined:childView(model, entityId);
  const open = expanded.has(id) && child && !stack.has(child.id);
  const inner = open ? await layoutCanvas(model, child, expanded, id, stack, occurrences, options, symbols) : undefined;
  const node: LayoutNode = { id, entity, view, child: child && !stack.has(child.id) ? child : undefined, parentId,
   expanded: !!inner, position: { x: 0, y: 0 }, width: inner ? Math.max(390, inner.width) : symbols ? 196 : 274, height: inner ? Math.max(230, inner.height + 100) : symbols ? 176+(elementTypeLabel(entity).length>18?25:0)+(entity.name.length>22?23:0) : (view.entryPoints.some(entry => entry.node === entityId) ? 276 : 246) + (entity.name.length > 24 ? 24 : 0) + (entity.description.length > 110 ? 22 : 0) };
  return { node, inner };
 }));
 const items = prepared.filter((item): item is NonNullable<typeof item> => !!item);
 const relations = relationsForView(model, originalView);
 const edgesForView = (): LayoutEdge[] => relations.map((relation, index) => ({ id: `${parentId ?? ''}/edge:${encodeURIComponent(relation.id)}`, source: endpoint(relation.source), target: endpoint(relation.target), relation, view: originalView, index }));
 if (options.mode==='auto'&&!relations.length&&parentId && !view.boundaries.length && ['container', 'component'].includes(view.type)) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(items.length))), gapX = 160, gapY = 120, padding = 48;
  const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...items.filter((_, index) => index % columns === column).map(item => item.node.width)));
  const rows = Math.ceil(items.length / columns);
  const heights = Array.from({ length: rows }, (_, row) => Math.max(...items.slice(row * columns, (row + 1) * columns).map(item => item.node.height)));
  items.forEach(({ node }, index) => { const column = index % columns, row = Math.floor(index / columns); node.position = {
   x: padding + widths.slice(0, column).reduce((sum, width) => sum + width + gapX, 0),
   y: 130 + padding + heights.slice(0, row).reduce((sum, height) => sum + height + gapY, 0),
  }; });
  return { width: widths.reduce((sum, width) => sum + width, padding * 2) + Math.max(0, columns - 1) * gapX,
   height: heights.reduce((sum, height) => sum + height, padding * 2 + 130) + Math.max(0, rows - 1) * gapY,
   nodes: items.flatMap(({ node, inner }) => [node, ...(inner?.nodes ?? [])]), frames: items.flatMap(item => item.inner?.frames ?? []),
   edges: [...edgesForView(), ...items.flatMap(item => item.inner?.edges ?? [])] };
 }
 if (options.mode==='auto'&&view.type === 'context' && view.direction === 'RIGHT' && view.scope && !view.boundaries.length && !parentId) {
  const dimensions = layoutContext(items.map(item => item.node), view.scope, relations, options.spacing);
  if (dimensions) return { ...dimensions,
   nodes: items.flatMap(({ node, inner }) => [node, ...(inner?.nodes ?? [])]),
   frames: items.flatMap(item => item.inner?.frames ?? []),
   edges: [...edgesForView(), ...items.flatMap(item => item.inner?.edges ?? [])],
  };
 }
 if (view.boundaries.length) {
  const layout = await layoutBoundaries(view, items.map(item => item.node), relations, parentId, options);
  return { ...layout, nodes: items.flatMap(({ node, inner }) => [node, ...(inner?.nodes ?? [])]),
   frames: [...layout.frames, ...items.flatMap(item => item.inner?.frames ?? [])],
   edges: [...edgesForView(), ...items.flatMap(item => item.inner?.edges ?? [])],
  };
 }
 const result=await arrangeShapes(parentId??view.id,items.map(({node})=>({id:node.id,width:node.width,height:node.height})),relations.filter(relation=>!reused.has(relation.source)&&!reused.has(relation.target)).map(relation=>({id:relation.id,sources:[endpoint(relation.source)],targets:[endpoint(relation.target)]})),view.direction,options);
 const nodes: LayoutNode[] = [], frames: LayoutFrame[] = [], edges: LayoutEdge[] = edgesForView();
 for (const { node, inner } of items) {
  const point = result.children?.find(point => point.id === node.id);
  node.position = { x: point?.x ?? 0, y: (point?.y ?? 0) + (parentId ? 100 : 0) };
  nodes.push(node);
  if (inner) { nodes.push(...inner.nodes); frames.push(...inner.frames); edges.push(...inner.edges); }
 }
 return { nodes, frames, edges, width: result.width ?? 390, height: result.height ?? 144 };
}
