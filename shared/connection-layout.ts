import {parsePort, portSides} from './connection-ports.ts';
type Point = { x: number; y: number };
type Side = 'left' | 'right' | 'top' | 'bottom';
export type RoutingShape = { id: string; x: number; y: number; width: number; height: number; obstacle?: boolean };
export type ConnectionRoute = { points: Point[]; sourceHandle: string; targetHandle: string; labelX: number; labelY: number };
type Connection = { id: string; source: string; target: string; sourceHandle?:string|null;targetHandle?:string|null };

/** Orthogonal visibility grid: channels run through gaps, never through card interiors. */
export function routeConnections(shapes: RoutingShape[], connections: Connection[], automatic = false): Map<string, ConnectionRoute> {
 const byId = new Map(shapes.map(shape => [shape.id, shape]));
 const pairs = new Map<string, string[]>();
 const pairKey = (connection: Connection) => [connection.source, connection.target].sort().join('|');
 for (const connection of connections) { const key = pairKey(connection); pairs.set(key, [...(pairs.get(key) ?? []), connection.id]); }
 const offsets = [...new Set([...pairs.values()].flatMap(ids => ids.map((_, index) => (index - (ids.length - 1) / 2) * 36)))];
 const lead = automatic ? 24 : 36;
 const obstacles = shapes.filter(shape => shape.obstacle !== false).map(shape => ({ id: shape.id, left: shape.x - 16, right: shape.x + shape.width + 16, top: shape.y - 16, bottom: shape.y + shape.height + 16 }));
 const fractions=(shape:RoutingShape,axis:'x'|'y')=>automatic?[0.25,0.5,0.75]:[0.5,...connections.flatMap(connection=>[...(connection.source===shape.id?[parsePort(connection.sourceHandle)]:[]),...(connection.target===shape.id?[parsePort(connection.targetHandle)]:[])]).flatMap(port=>port&&(axis==='x'?['top','bottom']:['left','right']).includes(port.side)?[port.fraction]:[])];
 const xs = [...new Set(shapes.flatMap(shape => [shape.x - lead, ...fractions(shape,'x').flatMap(fraction=>offsets.map(offset=>shape.x+shape.width*fraction+offset)), shape.x + shape.width + lead]))].sort((a, b) => a - b);
 const ys = [...new Set(shapes.flatMap(shape => [shape.y - lead, ...fractions(shape,'y').flatMap(fraction=>offsets.map(offset=>shape.y+shape.height*fraction+offset)), shape.y + shape.height + lead]))].sort((a, b) => a - b);
 const occupiedAxes = new Map<number, number>();
 const portUses = new Map<string, number>();
 const width = xs.length, segmentCache = new Map<string, boolean>(), occupied = new Map<string, number>();
 const segmentKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
 const point = (index: number): Point => ({ x: xs[index % width], y: ys[Math.floor(index / width)] });
 function intersects(p: Point, q: Point, rect: typeof obstacles[number]) {
  return p.x === q.x
   ? p.x > rect.left && p.x < rect.right && Math.max(p.y, q.y) > rect.top && Math.min(p.y, q.y) < rect.bottom
   : p.y > rect.top && p.y < rect.bottom && Math.max(p.x, q.x) > rect.left && Math.min(p.x, q.x) < rect.right;
 }
 function clear(a: number, b: number) {
  const key = segmentKey(a, b), saved = segmentCache.get(key);
  if (saved !== undefined) return saved;
  const p = point(a), q = point(b);
  const blocked = obstacles.some(rect => intersects(p, q, rect));
  segmentCache.set(key, !blocked); return !blocked;
 }
 function port(shape: RoutingShape, side: Side, offset: number, fraction=0.5) {
  const p = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, exit = { ...p };
  if (side === 'left' || side === 'right') { p.y=shape.y+shape.height*fraction;exit.y=p.y; p.x = shape.x + (side === 'right' ? shape.width : 0); exit.x = p.x + (side === 'right' ? lead : -lead); }
  else { p.x=shape.x+shape.width*fraction;exit.x=p.x; p.y = shape.y + (side === 'bottom' ? shape.height : 0); exit.y = p.y + (side === 'bottom' ? lead : -lead); }
  const stem = { ...exit };
  if (side === 'left' || side === 'right') exit.y += offset; else exit.x += offset;
  return { point: p, stem, exit, index: ys.indexOf(exit.y) * width + xs.indexOf(exit.x) };
 }
 const routes = new Map<string, ConnectionRoute>();
 const ordered = automatic ? [...connections].sort((a, b) => a.id.localeCompare(b.id)) : connections;
 for (const connection of ordered) {
  const source = byId.get(connection.source), target = byId.get(connection.target);
  if (!source || !target || source === target) continue;
  let sourceSide: Side, targetSide: Side;
  if (target.x >= source.x + source.width) { sourceSide = 'right'; targetSide = 'left'; }
  else if (source.x >= target.x + target.width) { sourceSide = 'left'; targetSide = 'right'; }
  else if (target.y >= source.y + source.height) { sourceSide = 'bottom'; targetSide = 'top'; }
  else { sourceSide = 'top'; targetSide = 'bottom'; }
  const fixedSource = automatic ? undefined : parsePort(connection.sourceHandle);
  const fixedTarget = automatic ? undefined : parsePort(connection.targetHandle);
  if (fixedSource) sourceSide = fixedSource.side;
  if (fixedTarget) targetSide = fixedTarget.side;
  const siblings = pairs.get(pairKey(connection))!;
  const offset = (siblings.indexOf(connection.id) - (siblings.length - 1) / 2) * 36;
  const horizontal = (side: Side) => side === 'left' || side === 'right';
  const bendCost = 96;

  function candidates(shape: RoutingShape, other: RoutingShape, preferred: Side, kind: 'source' | 'target', fixed?: number) {
   return (automatic ? portSides : [preferred]).flatMap(side => {
    const along = horizontal(side);
    const center = along ? other.y + other.height / 2 : other.x + other.width / 2;
    const fraction = (center - (along ? shape.y : shape.x)) / (along ? shape.height : shape.width);
    const preferredSlot = fraction < 0.375 ? 0 : fraction > 0.625 ? 2 : 1;
    const slots = automatic ? [0, 1, 2] : [preferredSlot];
    return slots.flatMap(slot => {
     const anchor = port(shape, side, offset, automatic ? [0.25, 0.5, 0.75][slot] : fixed);
     if (automatic && obstacles.some(rect => rect.id !== shape.id && (
      intersects(anchor.point, anchor.stem, rect) || intersects(anchor.stem, anchor.exit, rect)
     ))) return [];
     const axis = along !== !!offset ? 0 : 1;
     const handle = automatic ? `port-${side}-${slot}`
      : fixed ? connection[kind === 'source' ? 'sourceHandle' : 'targetHandle']! : `${kind}-${side}`;
     const portKey = `${shape.id}:${handle}`;
     const congestion = automatic ? Math.min(120, (portUses.get(portKey) ?? 0) * 32) : 0;
     const penalty = (side === preferred ? 0 : 24) + Math.abs(slot - preferredSlot) * 12 + congestion;
     return [{...anchor, axis, handle, portKey, penalty}];
    });
   });
  }
  const starts = candidates(source, target, sourceSide, 'source', fixedSource?.fraction);
  const ends = candidates(target, source, targetSide, 'target', fixedTarget?.fraction);
  if (!starts.length || !ends.length) continue;
  const origins = new Map<number, typeof starts[number]>();
  const distance = new Map<number, number>(), previous = new Map<number, number>();
  let best: {state: number; end: typeof ends[number]; cost: number} | undefined;
  const remainingCost = (p: Point) => Math.min(...ends.map(end => Math.abs(p.x - end.exit.x) + Math.abs(p.y - end.exit.y) + end.penalty));
  const queue: { index: number; cost: number; score: number }[] = [];
  function push(item: typeof queue[number]) {
   queue.push(item); let index = queue.length - 1;
   while (index) { const parent = (index - 1) >> 1; if (queue[parent].score <= item.score) break; queue[index] = queue[parent]; index = parent; } queue[index] = item;
  }
  function pop() {
   const first = queue[0], tail = queue.pop()!;
   if (queue.length) { let index = 0; while (index * 2 + 1 < queue.length) { let child = index * 2 + 1; if (child + 1 < queue.length && queue[child + 1].score < queue[child].score) child++; if (queue[child].score >= tail.score) break; queue[index] = queue[child]; index = child; } queue[index] = tail; }
   return first;
  }
  for (const start of starts) {
   const state = start.index * 2 + start.axis;
   origins.set(state, start);
   distance.set(state, start.penalty);
   push({index: state, cost: start.penalty, score: start.penalty + remainingCost(start.exit)});
  }
  while (queue.length) {
   const current = pop();
   if (current.cost !== distance.get(current.index)) continue;
   if (best && current.score >= best.cost) break;
   const currentPoint = Math.floor(current.index / 2), axis = current.index % 2;
   for (const end of ends) {
    if (currentPoint !== end.index) continue;
    const cost = current.cost + end.penalty + (axis === end.axis ? 0 : bendCost);
    if (!best || cost < best.cost) best = {state: current.index, end, cost};
   }
   const x = currentPoint % width, y = Math.floor(currentPoint / width), p = point(currentPoint);
   const adjacent = [x > 0 ? currentPoint - 1 : -1, x + 1 < width ? currentPoint + 1 : -1, y > 0 ? currentPoint - width : -1, y + 1 < ys.length ? currentPoint + width : -1];
   for (const next of adjacent) {
    if (next < 0 || !clear(currentPoint, next)) continue;
    const q = point(next), key = segmentKey(currentPoint, next), nextAxis = p.x === q.x ? 1 : 0;
    const nextState = next * 2 + nextAxis;
    // Length-based sharing cost avoids zigzags caused by uneven grid subdivision.
    // Heading is part of the search state, so a route can trade a short detour for fewer bends.
    const length = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    const crosses = automatic && ((occupiedAxes.get(currentPoint) ?? 0) & (1 << (1 - nextAxis)));
    const shared = occupied.get(key) ?? 0;
    const cost = current.cost + length * (1 + Math.min(automatic ? 1.5 : 0.4, shared * (automatic ? 0.45 : 0.06)))
     + (axis === nextAxis ? 0 : bendCost) + (crosses && axis === nextAxis ? 44 : 0);
    if (cost >= (distance.get(nextState) ?? Infinity)) continue;
    distance.set(nextState, cost); previous.set(nextState, current.index);
    push({ index: nextState, cost, score: cost + remainingCost(q) });
   }
  }
  // A disconnected exit can occur after a manual overlapping drag. Keep the caller's fallback.
  if (!best) continue;
  const end = best.end;
  const states = [best.state];
  while (previous.has(states.at(-1)!)) states.push(previous.get(states.at(-1)!)!);
  const start = origins.get(states.at(-1)!)!;
  for (const {portKey} of [start, end]) portUses.set(portKey, (portUses.get(portKey) ?? 0) + 1);
  const indices = states.reverse().map(state => Math.floor(state / 2));
  indices.slice(1).forEach((index, i) => {
   const key = segmentKey(indices[i], index);
   occupied.set(key, (occupied.get(key) ?? 0) + 1);
   if (i === 0 || i === indices.length - 2) return;
   const axis = states[i + 1] % 2;
   if (axis === states[i] % 2) occupiedAxes.set(indices[i], (occupiedAxes.get(indices[i]) ?? 0) | (1 << axis));
  });
  const all = [start.point, start.stem, ...indices.map(point), end.stem, end.point].filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  const points = all.filter((p, index) => { const a = all[index - 1], b = all[index + 1]; return !a || !b || !((a.x === p.x && p.x === b.x && (p.y - a.y) * (b.y - p.y) >= 0) || (a.y === p.y && p.y === b.y && (p.x - a.x) * (b.x - p.x) >= 0)); });
  const segments = points.slice(1).map((p, index) => ({ a: points[index], b: p, length: Math.abs(p.x - points[index].x) + Math.abs(p.y - points[index].y) })).sort((a, b) => b.length - a.length);
  const label = segments[0];
  routes.set(connection.id, { points, sourceHandle: start.handle, targetHandle: end.handle, labelX: (label.a.x + label.b.x) / 2, labelY: (label.a.y + label.b.y) / 2 });
 }
 return routes;
}

/** Round only inside the reserved routing clearance; endpoints/tangents keep arrow direction. */
export function orthogonalPath(points: Point[], radius = 18) {
 if (!points.length) return '';
 let path = `M${points[0].x},${points[0].y}`;
 for (let index = 1; index < points.length - 1; index++) {
  const a = points[index - 1], p = points[index], b = points[index + 1];
  const before = Math.hypot(p.x - a.x, p.y - a.y), after = Math.hypot(b.x - p.x, b.y - p.y);
  const r = Math.min(radius, before / 2, after / 2);
  if (!r || (a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y)) { path += ` L${p.x},${p.y}`; continue; }
  const entry = { x: p.x + (a.x - p.x) / before * r, y: p.y + (a.y - p.y) / before * r };
  const exit = { x: p.x + (b.x - p.x) / after * r, y: p.y + (b.y - p.y) / after * r };
  path += ` L${entry.x},${entry.y} Q${p.x},${p.y} ${exit.x},${exit.y}`;
 }
 const end = points[points.length - 1];
 return points.length === 1 ? path : `${path} L${end.x},${end.y}`;
}
