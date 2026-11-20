import test from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldSpace } from '../shared/space-scaffold.ts';
import { compileModel } from '../shared/model.ts';
import { prepareEdits } from '../shared/edit-model.ts';
import { elementKind,typesForView,typeForEntity } from '../shared/element-types.ts';
import { fencedBlocks } from '../shared/markdown-source.ts';
import { readWorkspace } from '../server/workspace-store.ts';
import { entityAppearance } from '../src/entity-appearance.tsx';

const initial = scaffoldSpace({name:'Type test',description:'A typed model'});
test('C2 application, data and messaging categories persist explicit subtypes in canonical DSL and JSON', () => {
 const model = compileModel(initial), view = model.views.find(view => view.id === 'Containers')!;
 const types = typesForView(view,true).filter(type => ['container','database','queue'].includes(type.kind));
 const result = prepareEdits(initial,types.map(type => ({op:'entity.create',id:`typed.${type.id}`,viewId:view.id,kind:elementKind(type.id,true),elementType:type.id,name:type.label,description:type.hint,technology:'Custom implementation'})));
 for (const type of types) {
  const entity = result.model.entities.find(entity => entity.id === `typed.${type.id}`)!;
  assert.equal(entity.kind,'container'); assert.equal(entity.parent,'system.main'); assert.equal(entity.properties['omnidocs.type'],type.id); assert.equal(typeForEntity(entity),type.id);
 }
 const dsl = fencedBlocks(result.files.find(file => file.path === 'architecture-model.md')!,'structurizr')[0];
 assert(dsl.includes('"omnidocs.type" "database"')); assert(!dsl.includes('= database ')); assert(!dsl.includes('= queue '));
 assert.equal(entityAppearance(result.model.entities.find(entity => entity.id === 'typed.database')!),'database');
 assert.equal(entityAppearance(result.model.entities.find(entity => entity.id === 'typed.broker')!),'queue');
 assert.equal(entityAppearance(result.model.entities.find(entity => entity.id === 'typed.webapp')!),'browser');
});
test('old containers can be classified and reclassified without changing identity, nesting or duplicating DSL properties', () => {
 let result = prepareEdits(initial,[{op:'entity.create',id:'legacy',viewId:'Containers',kind:'container',name:'Old app',description:'Existing app',technology:'Go'}]);
 for (const elementType of ['database','cache'] as const) result = prepareEdits(result.files,[{op:'entity.update',id:'legacy',viewId:'Containers',kind:'container',elementType,name:'Old app',description:'Updated description',technology:'Custom implementation'}]);
 const entity = result.model.entities.find(entity => entity.id === 'legacy')!; assert.equal(entity.kind,'container'); assert.equal(entity.parent,'system.main'); assert.equal(typeForEntity(entity),'cache');
 const dsl = fencedBlocks(result.files.find(file => file.path === 'architecture-model.md')!,'structurizr')[0]; assert.equal((dsl.match(/"omnidocs.type"/g)??[]).length,1);
 result = prepareEdits(result.files,[{op:'entity.update',id:'legacy',viewId:'Containers',kind:'container',name:'Renamed',description:'Legacy command without subtype',technology:'Custom implementation'}]);
 assert.equal(result.model.entities.find(entity => entity.id === 'legacy')?.properties['omnidocs.type'],'cache');
});
test('type choices follow C4 levels and invalid type/kind pairs cannot be saved', () => {
 const model = compileModel(initial), context=model.views.find(view => view.type==='context')!, containers=model.views.find(view => view.type==='container')!;
 assert.deepEqual(typesForView(context,true).map(type => type.id),['person','external']); assert(typesForView(containers,true).some(type=>type.id==='database'));
 assert.throws(()=>prepareEdits(initial,[{op:'entity.create',id:'bad',viewId:context.id,kind:'container',elementType:'database',name:'Bad',description:'Wrong level',technology:'PostgreSQL'}]),/different C4 level/);
 assert.throws(()=>prepareEdits(initial,[{op:'entity.create',id:'bad',viewId:containers.id,kind:'person',elementType:'database',name:'Bad',description:'Wrong kind',technology:'PostgreSQL'}]),/structural C4 kind/);
});
test('native Markdown preserves a declared cache subtype and supports components within a data container', async () => {
 const files = await readWorkspace('docs/demo'), model = compileModel(files), view = model.views.find(view=>view.type==='container')!;
 const result=prepareEdits(files,[{op:'entity.create',id:'qa.cache',viewId:view.id,kind:'database',elementType:'cache',name:'Cache',description:'Stores cached values',technology:'Custom KV'}, {op:'view.create',id:'QaCacheComponents',viewId:view.id,scope:'qa.cache',name:'Cache internals',description:'Internal cache components'}]);
 assert.equal(result.model.entities.find(entity=>entity.id==='qa.cache')?.properties['omnidocs.type'],'cache'); assert.equal(result.model.views.find(view=>view.id==='QaCacheComponents')?.type,'component');
});
