import { z } from 'zod';
import type { Entity, Model, Relation, SourceFile, View } from './model.ts';
import { fencedBlocks, markdownSource, relativeDocument } from './markdown-source.ts';
import { sha256 } from './sha256.ts';

const properties = z.record(z.string(), z.string()).default({});
const relationship = z.object({ id: z.string().min(1), sourceId: z.string(), destinationId: z.string(), description: z.string().default(''), technology: z.string().optional(), tags: z.string().default(''), properties }).passthrough();
type RawRelation = z.infer<typeof relationship>;
type RawElement = { id: string; name: string; description: string; technology?: string; tags: string; properties: Record<string, string>; relationships: RawRelation[]; containers: RawElement[]; components: RawElement[] };
const element: z.ZodType<RawElement> = z.lazy(() => z.object({
 id: z.string().min(1), name: z.string().min(1), description: z.string().default(''), technology: z.string().optional(),
 tags: z.string().default(''), properties, relationships: z.array(relationship).default([]),
 containers: z.array(element).default([]), components: z.array(element).default([]),
}));
const view = z.object({
 key: z.string().min(1), title: z.string().optional(), name: z.string().optional(), description: z.string().default(''),
 softwareSystemId: z.string().optional(), containerId: z.string().optional(), properties,
 elements: z.array(z.object({ id: z.string() })), relationships: z.array(z.object({ id: z.string() })).default([]),
 automaticLayout: z.object({ rankDirection: z.string().optional() }).optional(),
});
const workspace = z.object({
 name: z.string().default('Architecture workspace'), description: z.string().default(''), properties,
 model: z.object({ people: z.array(element).default([]), softwareSystems: z.array(element).default([]) }),
 views: z.object({ systemContextViews: z.array(view).default([]), containerViews: z.array(view).default([]), componentViews: z.array(view).default([]) }).passthrough(),
});

function stableId(raw: { id: string; properties: Record<string, string> }, type: string) {
 const id = raw.properties['doc.id'] ?? raw.properties['structurizr.dsl.identifier'] ?? `structurizr.${type}.${raw.id}`;
 if (!id.trim()) throw new Error(`Empty stable ${type} ID.`);
 return id;
}

/** Read an exported workspace; never parse/execute DSL, includes, scripts, or Markdown previews. */
export function importStructurizr(files: SourceFile[]): Model | undefined {
 const candidates: Array<{ file: SourceFile; value: unknown; metadata: Record<string, any> }> = [];
 const count = files.filter(file => /\.md$/i.test(file.path)).length;
 function failure(message: string): Model { return { project: { id: 'import', kind: 'project', name: 'Structurizr import', description: '', home: '', repositories: [] }, entities: [], relations: [], views: [], errors: [message], fileCount: count }; }
 try {
  for (const file of files) {
   let metadata: Record<string, any>;
   try { metadata = markdownSource(file).metadata; } catch { continue; }
   const declared = metadata.format === 'structurizr-json';
   if (!declared && !/^[ \t]{0,3}(?:`{3,}|~{3,})json[ \t]*\r?$/m.test(file.content)) continue;
   const blocks = fencedBlocks(file, 'json');
   if (declared && blocks.length !== 1) return failure(`${file.path}: Expected exactly one JSON code block, found ${blocks.length}.`);
   for (const block of blocks) {
    try {
     const value = JSON.parse(block);
     if (declared || (value && typeof value === 'object' && value.model && value.views)) candidates.push({ file, value, metadata });
    } catch (error) { if (declared) return failure(`${file.path}: Invalid Structurizr JSON: ${error instanceof Error ? error.message : 'Parse error'}`); }
   }
  }
  if (!candidates.length) {
   if (files.some(file => /```structurizr(?:\s|$)/m.test(file.content))) return failure('Structurizr DSL was found without an exported workspace JSON block. Export JSON with the official Structurizr tooling; DSL is not executed by this viewer.');
   return undefined;
  }
  if (candidates.length !== 1) return failure(`Expected one Structurizr workspace snapshot; found ${candidates.length}. Choose one workspace folder.`);
  const { file, value, metadata } = candidates[0];
  const parsed = workspace.safeParse(value);
  if (!parsed.success) return failure(`${file.path}: Invalid workspace: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const raw = parsed.data, notes: string[] = [];
  if (raw.properties['omnidocs.editorValidation']) notes.push('Edited with OmniDocs incremental source patches. Source/hash and graph references were checked; a fresh official Structurizr export/inspection is pending. Existing inspection counts predate these edits.');
  let authoritativeSource: string | undefined, integrity: 'verified' | 'not-available' = 'not-available';
  if (metadata.source_dsl_sha256 || metadata.model_source) {
   if (typeof metadata.model_source !== 'string' || !/^[a-f\d]{64}$/i.test(metadata.source_dsl_sha256 ?? '')) return failure(`${file.path}: model_source and a valid source_dsl_sha256 must be provided together.`);
   authoritativeSource = relativeDocument(file.path, metadata.model_source);
   const source = files.find(source => source.path === authoritativeSource);
   if (!source) return failure(`${file.path}: Referenced DSL source document is missing: ${metadata.model_source}`);
   const blocks = fencedBlocks(source, 'structurizr');
   if (blocks.length !== 1) return failure(`${source.path}: Expected exactly one structurizr code block, found ${blocks.length}.`);
   if (sha256(blocks[0]) !== metadata.source_dsl_sha256.toLowerCase()) return failure(`${file.path}: The JSON snapshot is stale: its SHA-256 does not match ${source.path}. Regenerate the JSON with the official Structurizr exporter.`);
   const embedded = raw.properties['structurizr.dsl'];
   if (embedded) {
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(embedded), value => value.charCodeAt(0))); }
    catch { return failure(`${file.path}: Invalid embedded Structurizr DSL.`); }
    if (decoded.trimEnd() !== blocks[0].trimEnd()) return failure(`${file.path}: The workspace's embedded DSL differs from the referenced source.`);
   }
   integrity = 'verified';
  } else notes.push('No source DSL digest was supplied; snapshot freshness could not be checked.');
  for (const severity of ['error', 'warning']) {
   const value = raw.properties[`structurizr.inspection.${severity}`];
   if (value && value !== '0') notes.push(`The exported workspace reports ${value} Structurizr inspection ${severity}s. Source inspections are separate from this viewer's reference/freshness checks.`);
  }
  for (const [key, value] of Object.entries(raw.views)) if (!['systemContextViews','containerViews','componentViews'].includes(key) && Array.isArray(value) && value.length) return failure(`${file.path}: Structurizr ${key} are not supported by this importer yet; no views were silently omitted.`);
  const definitions = [
   ...raw.views.systemContextViews.map(item => ({ item, type: 'context' as const, scope: item.softwareSystemId })),
   ...raw.views.containerViews.map(item => ({ item, type: 'container' as const, scope: item.softwareSystemId })),
   ...raw.views.componentViews.map(item => ({ item, type: 'component' as const, scope: item.containerId })),
  ];
  if (!definitions.length) return failure(`${file.path}: The workspace has no supported C4 views.`);
  const scopedSystems = new Set([...raw.views.systemContextViews, ...raw.views.containerViews].map(item => item.softwareSystemId));
  const entities: Entity[] = [], relations: Relation[] = [], ids = new Map<string, string>(), stable = new Set<string>();
  const originals: RawElement[] = [];
  function add(item: RawElement, kind: Entity['kind'], parent?: string) {
   const id = stableId(item, 'element');
   if (ids.has(item.id) || stable.has(id)) throw new Error(`${file.path}: Duplicate element ID: ${id}`);
   ids.set(item.id, id); stable.add(id); originals.push(item);
   entities.push({ id, kind, name: item.name, description: item.description, technology: item.technology, parent,
    tags: item.tags.split(',').map(tag => tag.trim()).filter(Boolean), properties: item.properties,
    relationships: [], code: [], body: item.description, source: file.path, raw: file.content });
   for (const container of item.containers) add(container, 'container', id);
   for (const component of item.components) add(component, 'component', id);
  }
  for (const person of raw.model.people) add(person, 'person');
  for (const system of raw.model.softwareSystems) add(system, scopedSystems.has(system.id) || system.containers.length ? 'system' : 'external');
  const relationIds = new Map<string, string>();
  for (const owner of originals) for (const item of owner.relationships) {
   const id = stableId(item, 'relationship'), source = ids.get(item.sourceId), target = ids.get(item.destinationId);
   if (!source || !target) throw new Error(`${file.path}: Relationship ${id} has an unknown endpoint.`);
   if (item.sourceId !== owner.id) throw new Error(`${file.path}: Relationship ${id} is attached to a different source.`);
   if (relationIds.has(item.id) || stable.has(id)) throw new Error(`${file.path}: Duplicate relationship ID: ${id}`);
   relationIds.set(item.id, id); stable.add(id);
   const logical = item.properties['doc.relationshipKind'] === 'Logical Notification' || item.tags.split(',').includes('Logical Notification');
   const relation: Relation = { id, source, target, label: item.description, description: item.description, protocol: item.technology,
    properties: item.properties, payload: [], file: file.path, ...(logical ? { communication: { mode: 'logical' as const } } : {}) };
   relations.push(relation); entities.find(entity => entity.id === source)!.relationships.push(relation);
  }
  const documents = files.flatMap(source => { try { return [{ source, ...markdownSource(source) }]; } catch { return []; } });
  const views: View[] = definitions.map(({ item, type, scope }) => {
   if (!scope || !ids.has(scope)) throw new Error(`${file.path}: View ${item.key} has an unknown scope.`);
   const scopeKind = entities.find(entity => entity.id === ids.get(scope))?.kind;
   if ((type === 'component' && scopeKind !== 'container') || (type !== 'component' && scopeKind !== 'system')) throw new Error(`${file.path}: View ${item.key} has an invalid ${type} scope type.`);
   if (stable.has(item.key)) throw new Error(`${file.path}: Duplicate view key: ${item.key}`);
   stable.add(item.key);
   const nodes = item.elements.map(element => { const id = ids.get(element.id); if (!id) throw new Error(`${file.path}: View ${item.key} references unknown element ${element.id}.`); return id; });
   if (new Set(nodes).size !== nodes.length) throw new Error(`${file.path}: View ${item.key} repeats an element.`);
   if (type === 'context' && (!nodes.includes(ids.get(scope)!) || nodes.some(id => !['person','system','external'].includes(entities.find(entity => entity.id === id)!.kind)))) throw new Error(`${file.path}: Context ${item.key} must include its system and only people/software systems.`);
   const links = item.relationships.map(link => {
    const id = relationIds.get(link.id), relation = relations.find(relation => relation.id === id);
    if (!relation || !nodes.includes(relation.source) || !nodes.includes(relation.target)) throw new Error(`${file.path}: View ${item.key} has an unknown/out-of-view relationship ${link.id}.`);
    return relation.id;
   });
   if (new Set(links).size !== links.length) throw new Error(`${file.path}: View ${item.key} repeats a relationship.`);
   const doc = documents.filter(doc => doc.metadata.view_key === item.key && !doc.metadata.model_format && !doc.metadata.format).sort((a,b) => Number(!!b.metadata.c4_level) - Number(!!a.metadata.c4_level))[0];
   const parent = type === 'container' ? definitions.find(definition => definition.type === 'context' && definition.scope === scope)
    : type === 'component' ? definitions.find(definition => definition.type === 'container' && ids.get(definition.scope ?? '') === entities.find(entity => entity.id === ids.get(scope))?.parent) : undefined;
   const scopeEntity = entities.find(entity => entity.id === ids.get(scope))!;
   const owned = nodes.filter(id => entities.find(entity => entity.id === id)?.parent === scopeEntity.id);
   return { id: item.key, kind: 'view', type, scope: ids.get(scope), name: item.title ?? item.name ?? item.key, description: item.description,
    nodes, relationships: links, direction: ['TopBottom','BottomTop'].includes(item.automaticLayout?.rankDirection ?? '') ? 'DOWN' : 'RIGHT',
    parentView: parent?.item.key,
    boundaries: type !== 'context' && owned.length ? [{ id: 'structurizr-scope', name: scopeEntity.name, category: type === 'container' ? 'Software system' : 'Container', description: scopeEntity.description, nodes: owned, tone: 'blue' }] : [],
    entryPoints: [], flows: [], bindings: {},
    body: doc?.body ?? item.description, source: doc?.source.path ?? file.path, raw: doc?.source.content ?? file.content };
  });
  if (!entities.length) return failure(`${file.path}: No model elements were found.`);
  const sourceMetadata = authoritativeSource ? documents.find(doc => doc.source.path === authoritativeSource)?.metadata : undefined;
  const home = views.find(view => view.id === sourceMetadata?.view_key) ?? views.find(view => view.type === 'context') ?? views[0];
  return { project: { id: 'structurizr.workspace', kind: 'project', name: raw.name, description: raw.description, home: home.id, repositories: [] },
   entities, relations, views, errors: [], fileCount: count,
   importInfo: { format: 'structurizr-json', source: file.path, authoritativeSource, integrity, notes } };
 } catch (error) { return failure(error instanceof Error ? error.message : 'Cannot import Structurizr JSON.'); }
}
