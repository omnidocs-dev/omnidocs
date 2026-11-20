import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileModel,childView,relationsForView,type SourceFile } from '../shared/model.ts';
import { fencedBlocks,relativeDocument } from '../shared/markdown-source.ts';
import { sha256 } from '../shared/sha256.ts';
import { resolveCommunication,communicationDash } from '../shared/communication.ts';
import { edgeLabelLines } from '../shared/edge-labels.ts';

const dsl = 'workspace "Different model" {\n    model {\n        reader = person "Reader"\n        app = softwareSystem "Archive"\n        reader -> app "Reads records"\n    }\n}\n';
const raw = () => ({ name: 'Independent archive', properties: { 'structurizr.dsl': Buffer.from(dsl.trimEnd()).toString('base64') }, model: {
 people: [{ id:'1', name:'Reader', description:'Reads records', properties:{'doc.id':'archive.reader'}, relationships:[{id:'100',sourceId:'1',destinationId:'2',description:'Reads records'}] }],
 softwareSystems: [{ id:'2', name:'Archive', description:'Owns records', properties:{'doc.id':'archive.system'}, relationships:[{id:'103',sourceId:'2',destinationId:'1',description:'Notifies the reader',tags:'Relationship,Logical Notification',properties:{'doc.id':'archive.notice','doc.relationshipKind':'Logical Notification','doc.deliveryVia':'archive.email'}}], containers:[
  {id:'3',name:'Catalog',description:'Maintains records',technology:'JVM',properties:{'doc.id':'archive.catalog'},components:[{id:'5',name:'Policy',description:'Checks access',technology:'Java',properties:{'doc.id':'archive.policy'}}],relationships:[{id:'102',sourceId:'3',destinationId:'4',description:'Persists records',technology:'SQL / TLS'}]},
  {id:'4',name:'Records',description:'Stores records',technology:'SQL',tags:'Element,Container,Data Store',properties:{'doc.id':'archive.store'}}
 ]}]
 }, views:{
 systemContextViews:[{key:'ArchiveContext',softwareSystemId:'2',title:'Archive context',elements:[{id:'1'},{id:'2'}],relationships:[{id:'100'},{id:'103'}]}],
 containerViews:[{key:'ArchiveContainers',softwareSystemId:'2',elements:[{id:'3'},{id:'4'}],relationships:[{id:'102'}]}],
 componentViews:[{key:'ArchiveComponents',containerId:'3',elements:[{id:'5'}],relationships:[]}],
 } });
function fixture(value = raw()): SourceFile[] {
 return [
  {path:'architecture.md',content:`---\nmodel_format: structurizr-dsl\nview_key: ArchiveContext\n---\n\`\`\`structurizr\n${dsl}\`\`\`\n`},
  {path:'exports/model.md',content:`---\nformat: structurizr-json\nmodel_source: ../architecture.md\nsource_dsl_sha256: ${sha256(dsl)}\n---\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`},
  {path:'views/context.md',content:'---\nview_key: ArchiveContext\nc4_level: 1\n---\n# Authored context notes\n\nPreserve these notes.'},
  {path:'README.md',content:'# Documentation\n\nOrdinary Markdown is not a graph entity.'},
 ];
}

test('source digests match Node SHA-256 for UTF-8 and block boundaries', () => {
 for (const value of ['', 'abc', 'نمونهٔ آزمایشی\n', 'a'.repeat(55), 'x'.repeat(64), '📦'.repeat(1000)]) assert.equal(sha256(value), createHash('sha256').update(value).digest('hex'));
 assert.equal(fencedBlocks(fixture()[0], 'structurizr')[0], dsl);
 assert.equal(relativeDocument('exports/model.md','../architecture.md'),'architecture.md');
 assert.equal(relativeDocument('exports/model.md','../../outside.md'),undefined);
 assert.equal(relativeDocument('README.md','views/a%20b.md'),'views/a b.md');
});

test('Structurizr workspace JSON normalizes shared identities, scoped views and authored notes', () => {
 const model = compileModel(fixture()); assert.deepEqual(model.errors, []);
 assert.equal(model.project.name, 'Independent archive'); assert.equal(model.project.home, 'ArchiveContext');
 assert.equal(model.entities.length, 5); assert.equal(model.fileCount, 4);
 assert.equal(model.importInfo?.integrity,'verified');
 assert.equal(model.entities.find(entity=>entity.id==='archive.policy')?.parent,'archive.catalog');
 assert.equal(childView(model,'archive.system')?.id,'ArchiveContainers');
 assert.equal(childView(model,'archive.catalog')?.id,'ArchiveComponents');
 const context=model.views.find(view=>view.id==='ArchiveContext')!;
 assert.equal(context.source,'views/context.md'); assert(context.body.includes('Preserve these notes'));
 assert.equal(model.views.find(view=>view.id==='ArchiveComponents')?.parentView,'ArchiveContainers');
 assert.deepEqual(relationsForView(model,context).map(relation=>relation.label),['Reads records','Notifies the reader']);
 const logical=model.relations.find(relation=>relation.id==='archive.notice')!;
 assert.equal(logical.properties['doc.deliveryVia'],'archive.email');
 assert.equal(resolveCommunication(logical,model.entities).mode,'logical');
 assert.equal(communicationDash(resolveCommunication(logical,model.entities)),'3 5');
 assert.deepEqual(model.project.repositories,[]);
});

test('stale, missing, duplicate and malformed model blocks are rejected', () => {
 const stale=fixture(); stale[0].content=stale[0].content.replace('Different model','Changed model');
 assert(compileModel(stale).errors.some(error=>error.includes('stale')));
 const missing=fixture().slice(1); assert(compileModel(missing).errors.some(error=>error.includes('missing')));
 const duplicate=fixture(); duplicate[0].content+=`\n\`\`\`structurizr\n${dsl}\`\`\`\n`;
 assert(compileModel(duplicate).errors.some(error=>error.includes('exactly one')));
 const unclosed=fixture(); unclosed[0].content=unclosed[0].content.replace(/```\n$/,'');
 assert(compileModel(unclosed).errors.some(error=>error.includes('Unclosed')));
 const ambiguous=fixture(); ambiguous.push({...ambiguous[1],path:'another-model.md'});
 assert(compileModel(ambiguous).errors.some(error=>error.includes('one Structurizr')));
 const malformed=fixture(); malformed[1].content=malformed[1].content.replace('"model":','"model": invalid,');
 assert(compileModel(malformed).errors.some(error=>error.includes('Invalid Structurizr JSON')));
});

test('unknown references and unsupported Structurizr views fail explicitly', () => {
 const unknown=raw(); unknown.views.containerViews[0].elements.push({id:'missing'});
 assert(compileModel(fixture(unknown)).errors.some(error=>error.includes('unknown element')));
 const endpoint=raw(); endpoint.model.people[0].relationships[0].destinationId='missing';
 assert(compileModel(fixture(endpoint)).errors.some(error=>error.includes('unknown endpoint')));
 const duplicate=raw(); duplicate.model.softwareSystems[0].containers[0].properties['doc.id']='archive.reader';
 assert(compileModel(fixture(duplicate)).errors.some(error=>error.includes('Duplicate element')));
 const unsupported=raw() as any; unsupported.views.deploymentViews=[{key:'Production'}];
 assert(compileModel(fixture(unsupported)).errors.some(error=>error.includes('not supported')));
});

test('plain exported JSON Markdown works without claiming source freshness and readable labels preserve model text', () => {
 const model=compileModel([{path:'workspace.md',content:`# Workspace\n\n\`\`\`json\n${JSON.stringify(raw())}\n\`\`\`\n`}]);
 assert.deepEqual(model.errors,[]); assert.equal(model.importInfo?.integrity,'not-available');
 assert(model.importInfo?.notes.some(note=>note.includes('freshness')));
 const label='اعلام نتیجه و رویدادهای توافق‌شدهٔ سفارش و ارسال توضیحات کامل برای مخاطب سازمانی';
 const lines=edgeLabelLines(label,24,3); assert(lines.length<=3); assert(lines.at(-1)?.endsWith('…'));
 assert.equal(edgeLabelLines('REST / HTTPS').join(''),'REST / HTTPS');
});
