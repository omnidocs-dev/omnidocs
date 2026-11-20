import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeLabelLines } from '../shared/edge-labels.ts';

test('technical relationship labels retain a protocol line even with long descriptions', () => {
 const description = 'Accepts shipment requests and validates addresses then dispatches events and updates all tracking records for every registered customer';
 const lines = edgeLabelLines(`${description}\ngRPC / TLS`,36,4,'gRPC / TLS');
 assert.equal(lines.length,4); assert.equal(lines.at(-1),'gRPC / TLS'); assert(lines[2].endsWith('…'));
 assert.deepEqual(edgeLabelLines('Creates a shipment\nREST / HTTPS',36,4,'REST / HTTPS'),['Creates a shipment','REST / HTTPS']);
});
test('context labels remain descriptions only and recorded text is never mutated', () => {
 const label='Registers shipment requests';
 assert.deepEqual(edgeLabelLines(label),[label]);
 assert.deepEqual(edgeLabelLines('Description\nAlready documented protocol'),['Description','Already documented protocol']);
 assert.equal(label,'Registers shipment requests');
});
