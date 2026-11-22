import {fencedBlocks,markdownSource} from './markdown-source.ts';
import {layoutDocumentSchema,readLayoutState} from './layout-state.ts';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { importStructurizr } from './structurizr.ts';

export type SourceFile = { path: string; content: string };
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Use a stable ID with letters, numbers, dots, underscores, or hyphens');
const repositoryPath = z.string().min(1).refine(value => !/[\\\u0000-\u001f\u007f]/.test(value) && !/^(?:\/|[a-zA-Z]:)/.test(value) && (value === '.' || value.split('/').every(part => part && part !== '.' && part !== '..')), 'Use a normalized repository-relative path without traversal');
const repositoryRef = z.string().trim().min(1).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Invalid repository ref');
const repositorySchema = z.object({
  id: identifier, name: z.string().min(1), area: z.enum(['backend', 'frontend', 'shared']),
  provider: z.enum(['github', 'gitlab']), ref: repositoryRef,
  url: z.string().url().refine(value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } }, 'Use an HTTP(S) repository URL without credentials, query or fragment'),
});
const codeLinkSchema = z.object({
  repository: identifier, path: repositoryPath, kind: z.enum(['file', 'directory']).default('file'),
  symbol: z.string().trim().min(1).optional(), ref: repositoryRef.optional(),
  lines: z.object({ start: z.number().int().positive(), end: z.number().int().positive().optional() }).optional(),
}).superRefine((value, context) => {
  if (value.kind === 'file' && value.path === '.') context.addIssue({ code: 'custom', path: ['path'], message: 'A file mapping requires a file path' });
  if (value.kind === 'directory' && value.lines) context.addIssue({ code: 'custom', path: ['lines'], message: 'Directory mappings cannot have line numbers' });
  if (value.lines?.end !== undefined && value.lines.end < value.lines.start) context.addIssue({ code: 'custom', path: ['lines'], message: 'End line must be at or after the start line' });
});
const relationshipSchema = z.object({
  id: identifier, target: identifier, label: z.string().min(1), protocol: z.string().optional(),
  description: z.string().optional(), payload: z.array(z.string()).default([]),
  communication: z.object({
    protocol: z.enum(['rest', 'grpc', 'tcp', 'websocket', 'http', 'amqp', 'kafka', 'mqtt', 'sql', 'configuration', 'messaging', 'other']).optional(),
    mode: z.enum(['direct', 'brokered', 'logical']).optional(),
  }).optional(),
  properties: z.record(z.string(), z.string()).default({}),
});
const entitySchema = z.object({
  id: identifier, kind: z.enum(['person', 'system', 'external', 'container', 'database', 'queue', 'component', 'code', 'deployment']),
  name: z.string().min(1), description: z.string().min(1), parent: identifier.optional(), technology: z.string().optional(),
  owner: z.string().optional(), tags: z.array(z.string()).default([]),
  relationships: z.array(relationshipSchema).default([]),
  code: z.array(codeLinkSchema).default([]),
  properties: z.record(z.string(), z.string()).default({}),
});
const boundarySchema = z.object({
  id: identifier, name: z.string().min(1), description: z.string().default(''),
  category: z.string().default('Boundary'), parent: identifier.optional(), nodes: z.array(identifier).default([]),
  tone: z.enum(['amber', 'sage', 'blue', 'neutral']).default('neutral'),
});
const viewSchema = z.object({
  id: identifier, kind: z.literal('view'), name: z.string().min(1),
  type: z.enum(['context', 'container', 'component', 'code', 'dataflow', 'deployment', 'bpmn']),
  description: z.string().min(1), scope: identifier.optional(), parentView: identifier.optional(),
  nodes: z.array(identifier).default([]), relationships: z.array(identifier).optional(),
  direction: z.enum(['RIGHT', 'DOWN']).default('RIGHT'),
  navigationLevel: z.literal(5).optional(),
  layout: z.literal('levels').optional(),
  bindings: z.record(z.string(), identifier).default({}),
  boundaries: z.array(boundarySchema).default([]),
  entryPoints: z.array(z.object({ node: identifier, label: z.string().min(1) })).default([]),
  flows: z.array(z.object({ id: identifier, name: z.string().min(1), description: z.string().default(''), relationships: z.array(identifier).min(1) })).default([]),
});
const projectSchema = z.object({ id: identifier, kind: z.literal('project'), name: z.string().min(1), description: z.string(), home: identifier, repositories: z.array(repositorySchema).default([]) });
export type CodeLink = z.infer<typeof codeLinkSchema>;
export type CodeRepository = z.infer<typeof repositorySchema>;
export type Entity = z.infer<typeof entitySchema> & { body: string; source: string; raw: string };
export type Relation = z.infer<typeof relationshipSchema> & { source: string; file: string };
export type View = z.infer<typeof viewSchema> & { body: string; source: string; raw: string; bpmn?: string };
export type Project = z.infer<typeof projectSchema>;
export type Model = { project: Project; entities: Entity[]; relations: Relation[]; views: View[]; errors: string[]; fileCount: number;
 importInfo?: { format: 'structurizr-json'; source: string; authoritativeSource?: string; integrity: 'verified' | 'not-available'; notes: string[] } };

/** OmniDocs frontmatter is a product-specific input format shared by all projects, not a C4 interchange standard. */
export function compileModel(files: SourceFile[]): Model {
  const structurizr = importStructurizr(files);
  if (structurizr) {
   try{readLayoutState(files);}catch(error){structurizr.errors.push(`studio/layout.md: ${error instanceof Error?error.message:'Invalid layout'}`);}
   const supplemental:Entity[]=[];
   const ids=new Set([...structurizr.entities,...structurizr.relations,...structurizr.views].map(item=>item.id));
   for(const file of files){
    try{
     const {metadata,body}=markdownSource(file);
     const isDeployment=metadata.kind==='deployment';
     if(!isDeployment&&(metadata.kind!=='view'||!['dataflow','deployment','bpmn'].includes(metadata.type)))continue;
     const data=isDeployment?entitySchema.parse(metadata):viewSchema.parse(metadata);
     if(ids.has(data.id))throw new Error(`Duplicate ID ${data.id}`);
     ids.add(data.id);
     if(data.kind==='view')structurizr.views.push({...data,body,source:file.path,raw:file.content,bpmn:data.type==='bpmn'?fencedBlocks(file,'bpmn')[0]:undefined});
     else{
      const entity={...data,body,source:file.path,raw:file.content};
      supplemental.push(entity);
      structurizr.entities.push(entity);
     }
    }catch(error){structurizr.errors.push(`${file.path}: ${error instanceof Error?error.message:'Invalid supplemental diagram document'}`);}
   }
   const deploymentIds=new Map(supplemental.map(entity=>[entity.id,entity]));
   for(const entity of supplemental){
    const seen=new Set([entity.id]);
    let parent=entity.parent;
    while(parent){
     if(seen.has(parent)){structurizr.errors.push(`${entity.source}: Deployment parent hierarchy contains a cycle.`);break;}
     seen.add(parent);
     const owner=deploymentIds.get(parent);
     if(!owner){structurizr.errors.push(`${entity.source}: Unknown deployment parent "${parent}".`);break;}
     parent=owner.parent;
    }
    for(const relation of entity.relationships){
     if(ids.has(relation.id))structurizr.errors.push(`${entity.source}: Duplicate relationship ID "${relation.id}".`);
     ids.add(relation.id);
     if(!deploymentIds.has(relation.target))structurizr.errors.push(`${entity.source}: Unknown deployment target "${relation.target}".`);
     structurizr.relations.push({...relation,source:entity.id,file:entity.source});
    }
   }
   for(const view of structurizr.views.filter(view=>view.type==='deployment')){
    if(view.nodes.some(id=>!deploymentIds.has(id))||view.scope&&!deploymentIds.has(view.scope))
     structurizr.errors.push(`${view.source}: Deployment views require deployment items and scope.`);
   }
   validateViewReferences(structurizr.views,structurizr.entities,structurizr.relations,structurizr.errors);return structurizr;
  }
  const entities: Entity[] = [], views: View[] = [], relations: Relation[] = [], errors: string[] = [];
  let project: Project = { id: 'workspace', kind: 'project', name: 'Untitled workspace', description: '', home: '', repositories: [] };
  const ids = new Set<string>();
  let projectCount = 0;
  let projectSource = 'workspace';
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!/\.md$/i.test(file.path)) continue;
    try {
      const match = file.content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
      if (!match) { errors.push(`${file.path}: Missing YAML frontmatter. See docs/FORMAT.md.`); continue; }
      const metadata = parseYaml(match[1]);
      if(metadata?.kind==='studio-layout'){layoutDocumentSchema.parse(metadata);continue;}
      const schema = metadata?.kind === 'project' ? projectSchema : metadata?.kind === 'view' ? viewSchema : entitySchema;
      const result = schema.safeParse(metadata);
      if (!result.success) { errors.push(`${file.path}: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`); continue; }
      if (ids.has(result.data.id)) { errors.push(`${file.path}: Duplicate ID "${result.data.id}".`); continue; }
      ids.add(result.data.id);
      if (result.data.kind === 'project') { project = result.data; projectSource = file.path; projectCount++; continue; }
      const document = { ...result.data, body: match[2].trim(), source: file.path, raw: file.content };
      if (result.data.kind === 'view') {
        const bpmn = result.data.type==='bpmn'?fencedBlocks(file,'bpmn')[0]:undefined;
        views.push({ ...document, bpmn } as View);
      } else {
        const entity = document as Entity;
        entities.push(entity);
        for (const relation of entity.relationships) relations.push({ ...relation, source: entity.id, file: file.path });
      }
    } catch (error) { errors.push(`${file.path}: ${error instanceof Error ? error.message : 'Cannot parse file'}`); }
  }
  if (projectCount !== 1) errors.push(`Workspace must contain exactly one project document; found ${projectCount}.`);
  const repositories = new Set<string>();
  for (const repository of project.repositories) {
    if (repositories.has(repository.id)) errors.push(`${projectSource}: Duplicate repository ID "${repository.id}".`);
    repositories.add(repository.id);
  }
  const entityById = new Map(entities.map(e => [e.id, e]));
  const viewIds = new Set(views.map(v => v.id));
  const relationIds = new Set<string>();
  for (const entity of entities) {
    for (const link of entity.code) if (!repositories.has(link.repository)) errors.push(`${entity.source}: Unknown code repository "${link.repository}".`);
    if (entity.parent && !entityById.has(entity.parent)) errors.push(`${entity.source}: Unknown parent "${entity.parent}".`);
    const seen = new Set([entity.id]);
    let parent = entity.parent;
    while (parent && entityById.has(parent)) {
      if (seen.has(parent)) { errors.push(`${entity.source}: Parent hierarchy contains a cycle.`); break; }
      seen.add(parent); parent = entityById.get(parent)?.parent;
    }
    if (['container', 'component', 'database', 'queue'].includes(entity.kind) && !entity.technology) errors.push(`${entity.source}: ${entity.kind} requires technology.`);
  }
  for (const relation of relations) {
    if (relationIds.has(relation.id) || ids.has(relation.id)) errors.push(`${relation.file}: Duplicate relationship ID "${relation.id}".`);
    relationIds.add(relation.id);
    if (!entityById.has(relation.target)) errors.push(`${relation.file}: Unknown relationship target "${relation.target}".`);
  }
  validateViewReferences(views,entities,relations,errors);
  if (!viewIds.has(project.home)) errors.push(`Project home "${project.home}" does not reference a view.`);
  return { project, entities, relations, views, errors, fileCount: files.filter(f => /\.md$/i.test(f.path)).length };
}

export function relationsForView(model: Model, view: View): Relation[] {
  const visible = new Set(view.nodes);
  const relations = model.relations.filter(r => visible.has(r.source) && visible.has(r.target));
  return view.relationships ? view.relationships.map(id => relations.find(r => r.id === id)).filter((r): r is Relation => !!r) : relations;
}
export function childView(model: Model, entityId: string): View | undefined {
  const deployment = model.entities.find(entity => entity.id === entityId)?.kind === 'deployment';
  return model.views.find(v => v.scope === entityId && (deployment ? v.type === 'deployment' : ['container', 'component', 'code'].includes(v.type)));
}

function validateViewReferences(views:View[],entities:Entity[],relations:Relation[],errors:string[]){
 const entityById=new Map(entities.map(entity=>[entity.id,entity])),viewIds=new Set(views.map(view=>view.id));
  for (const view of views) {
    if(view.layout==='levels'&&(view.type!=='dataflow'||view.nodes.some(id=>['code','deployment'].includes(entityById.get(id)?.kind??''))))errors.push(`${view.source}: Layered data flows support L1, L2 and L3 model references only.`);
    const boundaries = new Map(view.boundaries.map(boundary => [boundary.id, boundary]));
    if (boundaries.size !== view.boundaries.length) errors.push(`${view.source}: Duplicate boundary IDs.`);
    const membership = new Set<string>();
    for (const boundary of view.boundaries) {
      for (const id of boundary.nodes) {
        if (!view.nodes.includes(id)) errors.push(`${view.source}: Boundary "${boundary.id}" references node "${id}" outside this view.`);
        if (membership.has(id)) errors.push(`${view.source}: Node "${id}" belongs to multiple boundaries.`);
        membership.add(id);
      }
      const seen = new Set([boundary.id]); let parent = boundary.parent;
      while (parent) {
        if (!boundaries.has(parent)) { errors.push(`${view.source}: Unknown parent boundary "${parent}".`); break; }
        if (seen.has(parent)) { errors.push(`${view.source}: Boundary hierarchy contains a cycle.`); break; }
        seen.add(parent); parent = boundaries.get(parent)?.parent;
      }
    }
    const entries = new Set<string>();
    for (const entry of view.entryPoints) {
      if (!view.nodes.includes(entry.node)) errors.push(`${view.source}: Entry point "${entry.node}" is outside this view.`);
      if (entries.has(entry.node)) errors.push(`${view.source}: Duplicate entry point "${entry.node}".`);
      entries.add(entry.node);
    }
    const flowIds = new Set<string>();
    for (const flow of view.flows) {
      if (flowIds.has(flow.id)) errors.push(`${view.source}: Duplicate flow ID "${flow.id}".`);
      flowIds.add(flow.id);
      if (new Set(flow.relationships).size !== flow.relationships.length) errors.push(`${view.source}: Flow "${flow.id}" repeats a relationship.`);
      for (const id of flow.relationships) {
        const relation = relations.find(relation => relation.id === id);
        if (!relation || !view.nodes.includes(relation.source) || !view.nodes.includes(relation.target) || (view.relationships && !view.relationships.includes(id))) errors.push(`${view.source}: Flow "${flow.id}" references relationship "${id}" outside this view.`);
      }
    }
    if (view.type === 'bpmn' && (view.boundaries.length || view.entryPoints.length || view.flows.length)) errors.push(`${view.source}: BPMN boundaries and flows must be defined in its BPMN XML.`);
    if (view.navigationLevel === 5 && ['context', 'container', 'component', 'code'].includes(view.type)) errors.push(`${view.source}: Custom navigation level 5 is for complementary views; C4 architecture views keep levels 1 to 4.`);
    for (const id of view.nodes) if (!entityById.has(id)) errors.push(`${view.source}: Unknown node "${id}".`);
    if (new Set(view.nodes).size !== view.nodes.length) errors.push(`${view.source}: Duplicate view nodes.`);
    if (view.scope && !entityById.has(view.scope)) errors.push(`${view.source}: Unknown scope "${view.scope}".`);
    if (view.parentView && !viewIds.has(view.parentView)) errors.push(`${view.source}: Unknown parent view "${view.parentView}".`);
    const seen = new Set([view.id]);
    let parent = view.parentView;
    while (parent) {
      if (seen.has(parent)) { errors.push(`${view.source}: View hierarchy contains a cycle.`); break; }
      seen.add(parent); parent = views.find(v => v.id === parent)?.parentView;
    }
    for (const id of view.relationships ?? []) {
      const relation = relations.find(r => r.id === id);
      if (!relation) errors.push(`${view.source}: Unknown relationship "${id}".`);
      else if (!view.nodes.includes(relation.source) || !view.nodes.includes(relation.target)) errors.push(`${view.source}: Relationship "${id}" has an endpoint outside this view.`);
    }
    for (const id of Object.values(view.bindings)) if (!entityById.has(id)) errors.push(`${view.source}: Unknown BPMN binding "${id}".`);
    if (view.type === 'bpmn' && !view.bpmn) errors.push(`${view.source}: BPMN view requires a fenced bpmn XML block.`);
    if (view.type === 'context') {
      const scope = entityById.get(view.scope ?? '');
      if (!scope || scope.kind !== 'system' || !view.nodes.includes(scope.id)) errors.push(`${view.source}: Context view requires a system scope included in its nodes.`);
      if (view.nodes.some(id => !['system', 'external', 'person'].includes(entityById.get(id)?.kind ?? ''))) errors.push(`${view.source}: Context views contain only people and software systems.`);
    }
  }
}
