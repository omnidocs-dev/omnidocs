import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communicationDash, communicationProtocols, communicationText, resolveCommunication } from '../shared/communication.ts';
import { parallelChannel } from '../shared/edge-routing.ts';
import { compileModel } from '../shared/model.ts';
import { genericWorkspace } from './fixtures/projects.ts';

test('documented application protocols take precedence over their lower-level transport', () => {
 for (const [raw, protocol, mode] of [
  ['REST / HTTPS / JSON', 'rest', 'direct'], ['gRPC / HTTP2', 'grpc', 'direct'],
  ['WSS / TLS', 'websocket', 'direct'], ['WebSocket over TCP', 'websocket', 'direct'],
  ['TCP :443', 'tcp', 'direct'], ['HTTPS / JSON', 'http', 'direct'],
  ['AMQP over TCP / TLS', 'amqp', 'brokered'], ['Kafka / TLS', 'kafka', 'brokered'],
  ['MQTT / TLS', 'mqtt', 'brokered'], ['PostgreSQL / TLS', 'sql', 'direct'],
  ['ConfigMap volume', 'configuration', 'direct'], ['unknown-wire', 'other', 'direct'],
 ] as const) assert.deepEqual(resolveCommunication({ protocol: raw }), { protocol, mode });
 assert.equal(resolveCommunication({ protocol: 'HTTP / JSON' }).protocol, 'http');
 assert.equal(resolveCommunication({}).protocol, 'other');
});

test('explicit protocol and mode are independent, and a queue does not imply AMQP', () => {
 assert.deepEqual(resolveCommunication({ protocol: 'HTTP / JSON', communication: { protocol: 'rest', mode: 'direct' } }), { protocol: 'rest', mode: 'direct' });
 assert.deepEqual(resolveCommunication({ protocol: 'HTTP', communication: { mode: 'brokered' } }), { protocol: 'http', mode: 'brokered' });
 const model = compileModel(genericWorkspace('test', 'Any project', ['User', 'System', 'Application'], 'VM'));
 const queue = { ...model.entities[0], id: 'queue-x', kind: 'queue' as const };
 assert.deepEqual(resolveCommunication({ source: 'queue-x', target: 'test-app' }, [queue]), { protocol: 'messaging', mode: 'brokered' });
 assert.deepEqual(resolveCommunication({ source: 'queue-x', communication: { mode: 'direct' }, protocol: 'TCP' }, [queue]), { protocol: 'tcp', mode: 'direct' });
 assert.equal(communicationText({ protocol: 'HTTPS / JSON', communication: { protocol: 'rest' } }), 'REST · HTTPS / JSON');
 assert.equal(communicationText({ communication: { protocol: 'grpc' } }), 'gRPC');
});

test('protocol palette is unique and brokered patterns differ from direct links', () => {
 assert.equal(new Set(communicationProtocols.map(item => item.id)).size, communicationProtocols.length);
 assert.equal(new Set(communicationProtocols.map(item => item.color)).size, communicationProtocols.length);
 assert.equal(communicationDash({ protocol: 'rest', mode: 'direct' }), undefined);
 assert.equal(communicationDash({ protocol: 'rest', mode: 'brokered' }), '9 6');
 assert.equal(communicationDash({ protocol: 'configuration', mode: 'direct' }), '2 5');
});

test('parallel connections receive distinct finite channels with unchanged directed endpoints', () => {
 for (const [sourceSide, targetSide] of [['right','left'], ['bottom','top'], ['left','right'], ['top','bottom']] as const) {
  const routes = [0, 1, 2].map(index => parallelChannel({ x: 100, y: 100 }, { x: 500, y: 100 }, sourceSide, targetSide, index, 3));
  assert.equal(new Set(routes.map(route => route.path)).size, 3);
  for (const route of routes) {
   assert(route.path.startsWith('M 100,100')); assert(route.path.endsWith('L 500,100'));
   assert(!/NaN|Infinity/.test(route.path));
   assert(Number.isFinite(route.labelX) && Number.isFinite(route.labelY));
  }
 }
});
