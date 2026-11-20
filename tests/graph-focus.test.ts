import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphFocus } from '../shared/graph-focus.ts';

const nodes = [
 { id: 'cloud' }, { id: 'cloud/api', parentId: 'cloud' }, { id: 'cloud/db', parentId: 'cloud' },
 { id: 'courier' }, { id: 'other-cloud/api' }, { id: 'unrelated' },
];
const edges = [
 { id: 'storage', source: 'cloud/api', target: 'cloud/db' },
 { id: 'courier-call', source: 'cloud/api', target: 'courier' },
 { id: 'callback', source: 'courier', target: 'cloud/api' },
 { id: 'other', source: 'other-cloud/api', target: 'unrelated' },
];
test('node focus includes incoming and outgoing relationships across scopes without selecting another occurrence', () => {
 const focus = graphFocus(nodes, edges, { kind: 'node', id: 'cloud/api' });
 assert(focus.active);
 assert.deepEqual([...focus.selected], ['cloud/api']);
 assert.deepEqual([...focus.related].sort(), ['cloud/db', 'courier']);
 assert.deepEqual([...focus.connections].sort(), ['callback', 'courier-call', 'storage']);
 assert.deepEqual([...focus.context], ['cloud']);
 assert(!focus.related.has('other-cloud/api'));
});
test('edge focus isolates its exact directed connection while preserving both endpoint scopes', () => {
 const focus = graphFocus(nodes, edges, { kind: 'edge', id: 'courier-call' });
 assert.deepEqual([...focus.connections], ['courier-call']);
 assert.deepEqual([...focus.selected], ['cloud/api', 'courier']);
 assert.deepEqual([...focus.context], ['cloud']);
 assert.equal(focus.related.size, 0);
});
test('background clearing and stale targets restore the full graph; isolated nodes can still be focused', () => {
 for (const target of [null, { kind: 'node', id: 'missing' }, { kind: 'edge', id: 'missing' }] as const) {
  const focus = graphFocus(nodes, edges, target);
  assert.equal(focus.active, false); assert.equal(focus.connections.size, 0);
 }
 const isolated = graphFocus(nodes, edges, { kind: 'node', id: 'cloud' });
 assert(isolated.active); assert.equal(isolated.connections.size, 0);
});
