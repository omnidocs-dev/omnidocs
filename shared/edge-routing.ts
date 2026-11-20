type Point = { x: number; y: number };
type Side = 'left' | 'right' | 'top' | 'bottom';

/** Separate parallel channels without changing the documented source or target. */
export function parallelChannel(source: Point, target: Point, sourceSide: Side, targetSide: Side, index: number, count: number) {
 const shift = (index - (count - 1) / 2) * 84;
 const horizontal = sourceSide === 'left' || sourceSide === 'right';
 const sourceOut = horizontal ? { x: source.x + (sourceSide === 'right' ? 24 : -24), y: source.y } : { x: source.x, y: source.y + (sourceSide === 'bottom' ? 24 : -24) };
 const targetOut = targetSide === 'left' || targetSide === 'right' ? { x: target.x + (targetSide === 'right' ? 24 : -24), y: target.y } : { x: target.x, y: target.y + (targetSide === 'bottom' ? 24 : -24) };
 const channel = horizontal ? (source.y + target.y) / 2 + shift : (source.x + target.x) / 2 + shift;
 const points = [source, sourceOut,
  horizontal ? { x: sourceOut.x, y: channel } : { x: channel, y: sourceOut.y },
  horizontal ? { x: targetOut.x, y: channel } : { x: channel, y: targetOut.y }, targetOut, target,
 ].filter((point, i, all) => !i || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
 let path = `M ${source.x},${source.y}`;
 for (let i = 1; i < points.length - 1; i++) {
  const previous = points[i - 1], point = points[i], next = points[i + 1];
  const before = Math.hypot(point.x - previous.x, point.y - previous.y), after = Math.hypot(next.x - point.x, next.y - point.y);
  const radius = Math.min(8, before / 2, after / 2);
  const start = { x: point.x + (previous.x - point.x) / before * radius, y: point.y + (previous.y - point.y) / before * radius };
  const end = { x: point.x + (next.x - point.x) / after * radius, y: point.y + (next.y - point.y) / after * radius };
  path += ` L ${start.x},${start.y} Q ${point.x},${point.y} ${end.x},${end.y}`;
 }
 path += ` L ${target.x},${target.y}`;
 return { path, labelX: horizontal ? (sourceOut.x + targetOut.x) / 2 : channel, labelY: horizontal ? channel : (sourceOut.y + targetOut.y) / 2 };
}
