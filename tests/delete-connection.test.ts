import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileModel } from '../shared/model.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { indexDsl,removeDslRelationship } from '../shared/dsl-patch.ts';
import { readWorkspace } from '../server/workspace-store.ts';

const demo = await readWorkspace('docs/demo');

test('DSL removal cleans exact/quoted aliases without touching similar aliases and rejects dependent syntax', () => {
 const dsl = `workspace {\n model {\n r = a -> b "Calls" {\n properties { "doc.id" "r" }\n }\n }\n views {\n systemContext a "context" {\n include r r_extra\n exclude "r"\n description "r"\n // keep r in comments\n }\n }\n}\n`;
 const block = indexDsl(dsl).all.find(block => block.tokens[0]?.value === 'r')!;
 const next = removeDslRelationship(dsl, block, 'r');
 assert(next.includes('include  r_extra'));
 assert(next.includes('description "r"'));
 assert(next.includes('// keep r in comments'));
 assert(!next.includes('exclude "r"'));
 const dependent = dsl.replace('description "r"','animation { r }');
 assert.throws(() => removeDslRelationship(dependent, indexDsl(dependent).all.find(block => block.tokens[0]?.value === 'r')!, 'r'), /unsupported statement/);
});

test('native deletion clears explicit view/flow references while keeping unrelated connections and document bodies', () => {
 const original = compileModel(demo), view = original.views.find(view => view.flows.length)!;
 const id = view.flows[0].relationships[0], relation = original.relations.find(relation => relation.id === id)!;
 const result = prepareEdits(demo, [{ op: 'relation.delete', id, viewId: view.id }]);
 assert.deepEqual(result.model.errors, []);
 assert.equal(result.model.relations.length, original.relations.length - 1);
 assert.equal(result.model.entities.length, original.entities.length);
 for (const candidate of result.model.views) {
  assert(!candidate.relationships?.includes(id));
  assert(!candidate.flows.some(flow => flow.relationships.includes(id)));
  assert(candidate.flows.every(flow => flow.relationships.length));
 }
 assert.equal(result.model.entities.find(entity => entity.id === relation.source)?.body, original.entities.find(entity => entity.id === relation.source)?.body);
});
