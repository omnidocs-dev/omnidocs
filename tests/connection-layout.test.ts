import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeConnections, orthogonalPath } from '../shared/connection-layout.ts';

test('parallel and return connections retain distinct orthogonal paths around an intervening card', () => {
 const shapes = [
  { id: 'client', x: 0, y: 200, width: 200, height: 200 },
  { id: 'obstacle', x: 400, y: 200, width: 200, height: 200 },
  { id: 'service', x: 800, y: 200, width: 200, height: 200 },
 ];
 const routes = routeConnections(shapes, [
  { id: 'request', source: 'client', target: 'service' },
  { id: 'event', source: 'service', target: 'client' },
  { id: 'other-request', source: 'client', target: 'service' },
 ]);
 assert.equal(routes.size, 3);
 assert.equal(new Set([...routes.values()].map(route => JSON.stringify(route.points))).size, 3);
 assert.equal(routes.get('request')!.sourceHandle, 'source-right');
 assert.equal(routes.get('event')!.sourceHandle, 'source-left');
 for (const route of routes.values()) for (let index = 1; index < route.points.length; index++) {
  const a = route.points[index - 1], b = route.points[index];
  assert(a.x === b.x || a.y === b.y);
  for (const shape of shapes) assert(!(a.x === b.x ? a.x > shape.x && a.x < shape.x + shape.width && Math.max(a.y, b.y) > shape.y && Math.min(a.y, b.y) < shape.y + shape.height : a.y > shape.y && a.y < shape.y + shape.height && Math.max(a.x, b.x) > shape.x && Math.min(a.x, b.x) < shape.x + shape.width));
 }
 for (const route of routes.values()) {
  const tokens = orthogonalPath(route.points).match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!;
  let previous = { x: 0, y: 0 }, index = 0;
  const point = () => ({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
  while (index < tokens.length) {
   const command = tokens[index++];
   if (command === 'M') { previous = point(); continue; }
   const control = command === 'Q' ? point() : undefined, end = point();
   for (let sample = 0; sample <= 32; sample++) {
    const t = sample / 32, u = 1 - t;
    const p = control ? { x: u*u*previous.x+2*u*t*control.x+t*t*end.x, y: u*u*previous.y+2*u*t*control.y+t*t*end.y } : { x: u*previous.x+t*end.x, y: u*previous.y+t*end.y };
    for (const shape of shapes) assert(!(p.x > shape.x + 0.01 && p.x < shape.x + shape.width - 0.01 && p.y > shape.y + 0.01 && p.y < shape.y + shape.height - 0.01), 'rounded path must not cut through a card');
   }
   previous = end;
  }
 }
});

test('rounded routes retain exact directed endpoints and handle very short segments without invalid coordinates', () => {
 const points = [{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:180,y:80}];
 const path = orthogonalPath(points);
 assert(path.startsWith('M0,0'));
 assert(path.endsWith('L180,80'));
 assert(path.includes('Q100,0'));
 const reverse = orthogonalPath([...points].reverse());
 assert(reverse.startsWith('M180,80') && reverse.endsWith('L0,0'));
 const short = orthogonalPath([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1}]);
 assert(!/NaN|Infinity/.test(short));
 assert.equal(orthogonalPath([]), '');
});

test('automatic routing can ignore drawn ports and uses clear, directed paths for diagonal cards', () => {
 const shapes = [
  {id:'source',x:0,y:0,width:180,height:180},
  {id:'blocker',x:200,y:0,width:180,height:180},
  {id:'target',x:400,y:400,width:180,height:180},
 ];
 const connections = [{id:'edge',source:'source',target:'target',sourceHandle:'port-left-0',targetHandle:'port-bottom-2'}];
 const route = routeConnections(shapes, connections, true).get('edge')!;
 assert.match(route.sourceHandle, /^port-(right|bottom)-/);
 assert.match(route.targetHandle, /^port-(left|top)-/);
 assert.deepEqual(routeConnections(shapes, connections, true).get('edge'), route);
 assert(route.points[0].x <= 180 && route.points[0].y <= 180);
 assert(route.points.at(-1)!.x >= 400 && route.points.at(-1)!.y >= 400);
 for (let index = 1; index < route.points.length; index++) {
  const a = route.points[index - 1], b = route.points[index];
  assert(a.x === b.x || a.y === b.y);
  assert(!(a.x === b.x
   ? a.x > 200 && a.x < 380 && Math.min(a.y,b.y) < 180 && Math.max(a.y,b.y) > 0
   : a.y > 0 && a.y < 180 && Math.min(a.x,b.x) < 380 && Math.max(a.x,b.x) > 200));
 }
});
