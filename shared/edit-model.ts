import {canIncludeEntity} from './view-membership.ts';
import {readLayoutState,writeLayoutState} from './layout-state.ts';
import { planEntityDeletion, deleteNativeEntity } from './entity-deletion.ts';
import { markdownSource } from './markdown-source.ts';
import { organizeViewDocuments } from './organize-views.ts';
import { viewDocumentPath } from './view-paths.ts';
import { elementKind, typesForView } from './element-types.ts';
import { parseDocument } from 'yaml';
import { compileModel, relationsForView, type SourceFile, type Model } from './model.ts';
import { editCommandSchema, type EditCommand, fileChanges } from './edit-contract.ts';
import { fencedBlocks } from './markdown-source.ts';
import { refreshPreviews } from './derived-previews.ts';
import { viewDocument } from './space-scaffold.ts';
import { stringify } from 'yaml';
import { sha256 } from './sha256.ts';
import { indexDsl, appendDsl, replaceDslHeader, removeDslRelationship, removeDslItems, dslQuote } from './dsl-patch.ts';

function updateMetadata(file: SourceFile, edit: (document: ReturnType<typeof parseDocument>) => void) {
 const match = file.content.match(/^(\uFEFF?---\r?\n|---\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/);
 if (!match) throw new Error(`${file.path}: YAML frontmatter is required for editing.`);
 const document = parseDocument(match[2]); if (document.errors.length) throw new Error(`${file.path}: Invalid YAML.`);
 edit(document);
 return { ...file, content: `---\n${document.toString()}---\n${file.content.slice(match[0].length)}` };
}
function replaceBlock(file: SourceFile, language: string, content: string) {
 const blocks = fencedBlocks(file, language);
 if (blocks.length !== 1 || file.content.indexOf(blocks[0]) !== file.content.lastIndexOf(blocks[0])) throw new Error(`${file.path}: Expected one unambiguous ${language} block.`);
 return { ...file, content: file.content.replace(blocks[0], content.endsWith('\n') ? content : `${content}\n`) };
}
function validateCommand(model: Model, command: Exclude<EditCommand, {op:'workspace.organize'|'layout.save'|'flow.create'}>) {
 const view = model.views.find(view => view.id === command.viewId); if (!view) throw new Error('The target view no longer exists.');
 if (view.type === 'bpmn') throw new Error('BPMN XML editing is not supported by the architecture editor.');
 if(command.op==='view.include'){
  for(const id of command.ids){const entity=model.entities.find(entity=>entity.id===id);if(!entity||!canIncludeEntity(view,entity,model))throw new Error(`Cannot include ${id} in this ${view.type} view.`);}
  return view;
 }
 if (command.op === 'entity.delete') {
  const plan=planEntityDeletion(model,command.id);
  if(plan.blocked)throw new Error(plan.blocked);
  if(!view.nodes.includes(command.id)&&view.scope!==command.id)throw new Error('This item does not belong to the selected view.');
  if(plan.requiresCascade&&!command.cascade)throw new Error('This item owns child items or views. Confirm cascade deletion first.');
  return view;
 }
 if (command.op === 'view.create') {
  if (model.views.some(view => view.id === command.id) || model.entities.some(entity => entity.id === command.id) || model.relations.some(relation => relation.id === command.id)) throw new Error('This view ID already exists.');
  const scope = model.entities.find(entity => entity.id === command.scope);
  if (!scope || !['system','external','container','database','queue'].includes(scope.kind)) throw new Error('Choose a software system or container as the next-level scope.');
  if (!view.nodes.includes(scope.id)) throw new Error('The selected scope must belong to the current view.');
  if (model.views.some(candidate => candidate.scope === scope.id && candidate.type === (['container','database','queue'].includes(scope.kind) ? 'component' : 'container'))) throw new Error('A next-level view already exists for this item.');
  return view;
 }
 const creating = command.op.endsWith('.create');
 const existing = command.op.startsWith('entity') ? model.entities.find(entity => entity.id === command.id) : model.relations.find(relation => relation.id === command.id);
 if (creating && (model.entities.some(entity => entity.id === command.id) || model.relations.some(relation => relation.id === command.id) || model.views.some(view => view.id === command.id))) throw new Error(`ID ${command.id} already exists.`);
 if (!creating && !existing) throw new Error(`Item ${command.id} no longer exists.`);
 if (command.op === 'relation.delete') {
  if (!relationsForView(model, view).some(relation => relation.id === command.id)) throw new Error('The selected connection does not belong to this view.');
  return view;
 }
 if (command.op.startsWith('entity')) {
  const c = command as Extract<EditCommand, { kind: string }>;
  const old = model.entities.find(entity => entity.id === c.id);
  if (c.elementType) {
   if (elementKind(c.elementType, !!model.importInfo) !== c.kind) throw new Error('The selected type does not match the structural C4 kind.');
   if (creating && !typesForView(view, !!model.importInfo).some(type => type.id === c.elementType)) throw new Error('This item type belongs to a different C4 level.');
  }
  if (!creating && old?.kind !== c.kind) throw new Error('Changing an existing element type requires editing the source model.');
  if (creating) {
   const allowed: Record<string, string[]> = { context: ['person','external'], container: ['container','database','queue','person','external'], component: ['component','person','external'], code: ['code'], deployment: ['deployment'], dataflow: ['person','system','external','container','database','queue','component'] };
   if (!allowed[view.type]?.includes(c.kind)) throw new Error(`Cannot add ${c.kind} to a ${view.type} view.`);
   if (['container','database','queue','component','code'].includes(c.kind) && !view.scope) throw new Error('A scoped view is required for this element.');
  }
  if (['container','database','queue','component'].includes(c.kind) && !c.technology) throw new Error('Containers and components need an explicit technology.');
 } else {
  const c = command as Extract<EditCommand, { source: string }>;
  if (!view.nodes.includes(c.source) || !view.nodes.includes(c.target)) throw new Error('Both connection endpoints must belong to the chosen view.');
  if (c.source === c.target) throw new Error('A connection needs two different endpoints.');
 }
 return view;
}
function nativeEdit(files: SourceFile[], model: Model, command: Exclude<EditCommand, {op:'workspace.organize'|'layout.save'|'flow.create'}>) {
 const view = model.views.find(view => view.id === command.viewId)!;
 if(command.op==='entity.delete')return deleteNativeEntity(files,model,planEntityDeletion(model,command.id));
 const put = (file: SourceFile) => { const index = files.findIndex(item => item.path === file.path); if (index < 0) files.push(file); else files[index] = file; };
 const read = (path: string) => { const file = files.find(file => file.path === path); if (!file) throw new Error(`Missing source ${path}`); return file; };
 if(command.op==='view.include'){
  const nodes=[...new Set([...view.nodes,...command.ids])],added=new Set(command.ids.filter(id=>!view.nodes.includes(id)));
  put(updateMetadata(read(view.source),doc=>{
   doc.set('nodes',nodes);
   if(view.relationships&&view.layout!=='levels')doc.set('relationships',[...new Set([...view.relationships,...model.relations.filter(link=>nodes.includes(link.source)&&nodes.includes(link.target)&&(added.has(link.source)||added.has(link.target))).map(link=>link.id)])]);
  }));return files;
 }
 if (command.op === 'view.create') {
  const scope = model.entities.find(entity => entity.id === command.scope)!;
  const type = ['container','database','queue'].includes(scope.kind) ? 'component' : 'container';
  const nodes = model.entities.filter(entity => entity.parent === scope.id).map(entity => entity.id);
  const file = { path: viewDocumentPath(type,scope.id,command.id), content: `---\n${stringify({ id: command.id, kind: 'view', type, name: command.name, description: command.description, scope: scope.id, parentView: view.id, nodes, direction: 'RIGHT' })}---\n` };
  if (files.some(item => item.path === file.path)) throw new Error('The view document already exists.');
  files.push(file); return files;
 }
 if (command.op === 'relation.delete') {
  const relation = model.relations.find(relation => relation.id === command.id)!;
  const owner = model.entities.find(entity => entity.id === relation.source)!;
  put(updateMetadata(read(owner.source), doc => doc.set('relationships', (doc.get('relationships')?.toJSON() ?? []).filter((item: any) => item.id !== command.id))));
  for (const candidate of model.views) {
   if (!candidate.relationships?.includes(command.id) && !candidate.flows.some(flow => flow.relationships.includes(command.id))) continue;
   put(updateMetadata(read(candidate.source), doc => {
    if (candidate.relationships) doc.set('relationships', candidate.relationships.filter(id => id !== command.id));
    if (candidate.flows.some(flow => flow.relationships.includes(command.id))) doc.set('flows', candidate.flows.map(flow => ({ ...flow, relationships: flow.relationships.filter(id => id !== command.id) })).filter(flow => flow.relationships.length));
   }));
  }
  return files;
 }
 if ('name' in command) {
  let file: SourceFile;
  if (command.op === 'entity.create') {
   const path = `studio/entities/${command.id}.md`;
   if (files.some(file => file.path === path)) throw new Error('The destination Markdown file already exists.');
   file = { path, content: '---\n{}\n---\n' };
  } else file = read(model.entities.find(entity => entity.id === command.id)!.source);
  put(updateMetadata(file, doc => {
   doc.set('id', command.id); doc.set('kind', command.kind); doc.set('name', command.name); doc.set('description', command.description);
   if (command.elementType) doc.setIn(['properties', 'omnidocs.type'], command.elementType);
   if (command.technology) doc.set('technology', command.technology); else doc.delete('technology');
   if (command.op === 'entity.create' && !['person','external','system'].includes(command.kind) && view.scope) doc.set('parent', view.scope);
  }));
  if (command.op === 'entity.create') put(updateMetadata(read(view.source), doc => doc.set('nodes', [...view.nodes, command.id])));
 } else {
  const old = model.relations.find(relation => relation.id === command.id);
  let previous: Record<string, any> = {};
  if (old) {
   const owner = model.entities.find(entity => entity.id === old.source)!;
   put(updateMetadata(read(owner.source), doc => {
    const relationships = doc.get('relationships')?.toJSON() ?? [];
    previous = relationships.find((relation: any) => relation.id === command.id) ?? {};
    doc.set('relationships', relationships.filter((relation: any) => relation.id !== command.id));
   }));
  }
  const owner = model.entities.find(entity => entity.id === command.source)!;
  put(updateMetadata(read(owner.source), doc => {
   const relationships = doc.get('relationships')?.toJSON() ?? [];
   // Free-text protocol changes must not retain an obsolete structured classification.
   const relation: Record<string, any> = { ...previous, id: command.id, target: command.target, label: command.label, protocol: command.protocol || undefined };
   if (old?.protocol !== command.protocol) delete relation.communication;
   doc.set('relationships', [...relationships, relation]);
  }));
  for (const candidate of model.views) {
   if (!candidate.relationships) continue;
   const included = candidate.relationships.includes(command.id);
   const eligible = candidate.nodes.includes(command.source) && candidate.nodes.includes(command.target);
   const next = candidate.relationships.filter(id => id !== command.id);
   if (eligible && (included || candidate.id === command.viewId)) next.push(command.id);
   if (included || candidate.id === command.viewId) put(updateMetadata(read(candidate.source), doc => doc.set('relationships', next)));
  }
 }
 return files;
}

function structurizrEdit(files: SourceFile[], model: Model, command: Exclude<EditCommand, {op:'workspace.organize'|'layout.save'|'flow.create'}>) {
 const info = model.importInfo!;
 if (!info.authoritativeSource || info.integrity !== 'verified') throw new Error('Structurizr editing requires a verified Markdown DSL source and snapshot.');
 const source = files.find(file => file.path === info.authoritativeSource)!, snapshot = files.find(file => file.path === info.source)!;
 let dsl = fencedBlocks(source, 'structurizr')[0];
 const raw = JSON.parse(fencedBlocks(snapshot, 'json')[0]);
 const elements: any[] = [];
 const walk = (items: any[]) => { for (const item of items ?? []) { elements.push(item); walk(item.containers); walk(item.components); } }; walk(raw.model.people); walk(raw.model.softwareSystems);
 const stable = (item: any) => item.properties?.['doc.id'] ?? item.properties?.['structurizr.dsl.identifier'];
 const find = (id: string) => { const entity = elements.find(item => stable(item) === id); if (!entity) throw new Error(`Cannot resolve source element ${id}.`); return entity; };
 const alias = (item: any) => { const value = item.properties?.['structurizr.dsl.identifier']; if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value ?? '')) throw new Error('Editing requires explicit flat DSL identifiers.'); return value as string; };
 const findBlock = (item: any) => { const identifier = alias(item), blocks = indexDsl(dsl).all.filter(block => block.tokens[0]?.value === identifier && block.tokens[1]?.value === '='); if (blocks.length !== 1) throw new Error(`Cannot patch DSL declaration ${identifier} unambiguously.`); return blocks[0]; };
 const allRelations = () => elements.flatMap(item => item.relationships ?? []);
 const allViews = () => [...(raw.views.systemContextViews ?? []), ...(raw.views.containerViews ?? []), ...(raw.views.componentViews ?? [])];
 const manual=model.views.find(view=>view.id===command.viewId&&view.type==='dataflow');
 const targetView = allViews().find(view => view.key === command.viewId)??(manual?{key:manual.id,elements:[],relationships:[]}:undefined);
 if (!targetView) throw new Error('No writable Structurizr view found.');
 const viewBlock = () => { const blocks = indexDsl(dsl).all.filter(block => ['systemContext','container','component'].includes(block.tokens[0]?.value) && block.tokens.some(token => token.value === command.viewId)); if (blocks.length !== 1) throw new Error('Cannot patch the target DSL view unambiguously.'); return blocks[0]; };
 const used = new Set([...elements, ...allRelations()].map(item => item.id));
 const nextId = () => { let id = 1; while (used.has(String(id))) id++; used.add(String(id)); return String(id); };
 const newAlias = () => { const name = `od_${('id' in command?command.id:'').replace(/[^a-zA-Z0-9_]/g, '_')}`; if (indexDsl(dsl).all.some(block => block.tokens[0]?.value === name)) throw new Error('The generated DSL identifier already exists; choose another ID.'); return name; };
 if(command.op==='view.include'){
  if(indexDsl(dsl).statements.some(statement=>statement.owner.start===viewBlock().start&&statement.tokens[0]?.value==='exclude'))throw new Error('This view has exclude rules. Update them in the source before including existing items.');
  const added=command.ids.map(find).filter(item=>!targetView.elements.some((node:any)=>node.id===item.id));
  for(const item of added)targetView.elements.push({id:item.id});
  const addedIds=new Set(added.map(item=>item.id));
  const links=allRelations().filter(item=>(addedIds.has(item.sourceId)||addedIds.has(item.destinationId))&&targetView.elements.some((node:any)=>node.id===item.sourceId)&&targetView.elements.some((node:any)=>node.id===item.destinationId)&&!targetView.relationships?.some((link:any)=>link.id===item.id));
  (targetView.relationships??=[]).push(...links.map(item=>({id:item.id})));
  if(added.length||links.length)dsl=appendDsl(dsl,viewBlock(),[...added,...links].map(item=>`include ${alias(item)}`).join('\n'));
 } else if(command.op==='entity.delete') {
  const plan=planEntityDeletion(model,command.id), deletedIds=new Set(plan.entities.map(item=>find(item.id).id)), deletedViews=new Set(plan.views.map(view=>view.id));
  const removedRelations=allRelations().filter(item=>deletedIds.has(item.sourceId)||deletedIds.has(item.destinationId));
  const relationIds=new Set(removedRelations.map(item=>item.id));
  if(allRelations().some(item=>item.linkedRelationshipId&&relationIds.has(item.linkedRelationshipId)&&!relationIds.has(item.id)))throw new Error('Dependent implied relationships require the official Structurizr tools.');
  const aliases=new Set([...plan.entities.map(item=>alias(find(item.id))),...removedRelations.map(alias)]);
  dsl=removeDslItems(dsl,aliases,deletedViews);
  const clean=(items:any[]):any[]=>(items??[]).filter(item=>!deletedIds.has(item.id)).map(item=>({...item,...(item.containers?{containers:clean(item.containers)}:{}),...(item.components?{components:clean(item.components)}:{}),relationships:(item.relationships??[]).filter((relation:any)=>!relationIds.has(relation.id))}));
  raw.model.people=clean(raw.model.people);raw.model.softwareSystems=clean(raw.model.softwareSystems);
  for(const key of ['systemContextViews','containerViews','componentViews']) raw.views[key]=(raw.views[key]??[]).filter((view:any)=>!deletedViews.has(view.key)).map((view:any)=>({...view,elements:view.elements.filter((item:any)=>!deletedIds.has(item.id)),relationships:(view.relationships??[]).filter((item:any)=>!relationIds.has(item.id)),...(view.animations?{animations:view.animations.map((step:any)=>({...step,elements:(step.elements??[]).filter((id:string)=>!deletedIds.has(id)),relationships:(step.relationships??[]).filter((id:string)=>!relationIds.has(id))})).filter((step:any)=>step.elements.length||step.relationships.length)}:{})}));
  files=files.filter(file=>file.path===source.path||file.path===snapshot.path||!deletedViews.has(markdownSource(file).metadata.view_key));
 } else if (command.op === 'view.create') {
  const scope = find(command.scope), entity = model.entities.find(entity => entity.id === command.scope)!;
  const component = entity.kind === 'container', type = component ? 'component' : 'container';
  const nodes = elements.filter(item => (component ? scope.components : scope.containers)?.includes(item));
  const links = allRelations().filter(item => nodes.some(node => node.id === item.sourceId) && nodes.some(node => node.id === item.destinationId));
  const views = indexDsl(dsl).all.filter(block => block.tokens[0]?.value === 'views');
  if (views.length !== 1) throw new Error('Cannot patch the DSL views block unambiguously.');
  dsl = appendDsl(dsl, views[0], `${type} ${alias(scope)} ${command.id} ${dslQuote(command.description)} {\n    title ${dslQuote(command.name)}\n${nodes.map(node => `    include ${alias(node)}\n`).join('')}    autoLayout lr\n}`);
  (raw.views[component ? 'componentViews' : 'containerViews'] ??= []).push({ key: command.id, title: command.name, description: command.description, [component ? 'containerId' : 'softwareSystemId']: scope.id, elements: nodes.map(node => ({ id: node.id })), relationships: links.map(link => ({ id: link.id })), automaticLayout: { rankDirection: 'LeftRight' } });
  const note = viewDocument(command.id, command.name, component ? 3 : 2, command.scope);
  if (files.some(file => file.path === note.path)) throw new Error('The view document already exists.');
  files.push(note);
 } else if (command.op === 'relation.delete') {
  const item = allRelations().find(item => stable(item) === command.id);
  if (!item) throw new Error('Cannot resolve the source relationship.');
  if (allRelations().some(other => other.linkedRelationshipId === item.id)) throw new Error('This connection has dependent implied relationships. Remove it with the official Structurizr tools.');
  dsl = removeDslRelationship(dsl, findBlock(item), alias(item));
  for (const element of elements) element.relationships = (element.relationships ?? []).filter((relation: any) => relation.id !== item.id);
  for (const view of allViews()) {
   view.relationships = (view.relationships ?? []).filter((relation: any) => relation.id !== item.id);
   if (view.animations) view.animations = view.animations.map((step: any) => ({ ...step, relationships: (step.relationships ?? []).filter((id: string) => id !== item.id) })).filter((step: any) => step.relationships.length || step.elements?.length);
  }
 } else if ('name' in command) {
  if (['database','queue','code','deployment'].includes(command.kind)) throw new Error('Use the declared Structurizr container/component type; technology supplies database/broker visual cues.');
  if (command.op === 'entity.update') {
   const item = find(command.id), block = findBlock(item), type = block.tokens[2]?.value;
   if (!['person','softwareSystem','container','component'].includes(type)) throw new Error('Unsupported DSL element declaration.');
   const header = `${alias(item)} = ${type} ${dslQuote(command.name)} ${dslQuote(command.description)}${['container','component'].includes(type) ? ` ${dslQuote(command.technology)}` : ''}`;
   dsl = replaceDslHeader(dsl, block, header); item.name = command.name; item.description = command.description;
   if (['container','component'].includes(type)) item.technology = command.technology;
   if (command.elementType) {
    const current = findBlock(item), properties = current.children.filter(block => block.tokens[0]?.value === 'properties');
    if (properties.length > 1) throw new Error('Cannot patch duplicate DSL property blocks.');
    if (properties.length) {
     const statements = indexDsl(dsl).statements.filter(statement => statement.owner.start === properties[0].start && statement.tokens[0]?.value === 'omnidocs.type');
     if (statements.length > 1) throw new Error('Cannot patch duplicate element type properties.');
     if (statements.length) {
      const statement = statements[0];
      if (statement.tokens.length !== 2) throw new Error('Unsupported element type property syntax.');
      const token = statement.tokens[1]; dsl = dsl.slice(0, token.start) + dslQuote(command.elementType) + dsl.slice(token.end);
     } else dsl = appendDsl(dsl, properties[0], `"omnidocs.type" ${dslQuote(command.elementType)}`);
    } else dsl = appendDsl(dsl, current, `properties {\n    "omnidocs.type" ${dslQuote(command.elementType)}\n}`);
    item.properties['omnidocs.type'] = command.elementType;
   }
  } else {
   const name = newAlias(), type = command.kind === 'external' ? 'softwareSystem' : command.kind;
   const parent = ['container','component'].includes(type) ? find(model.views.find(view => view.id === command.viewId)!.scope!) : undefined;
   const parentBlock = parent ? findBlock(parent) : indexDsl(dsl).model;
   const declaration = `${name} = ${type} ${dslQuote(command.name)} ${dslQuote(command.description)}${parent ? ` ${dslQuote(command.technology)}` : ''} {\n    properties {\n        "doc.id" ${dslQuote(command.id)}${command.elementType ? `\n        "omnidocs.type" ${dslQuote(command.elementType)}` : ''}\n    }\n}`;
   dsl = appendDsl(dsl, parentBlock, declaration);
   const item = { id: nextId(), name: command.name, description: command.description, ...(parent ? { technology: command.technology } : {}), tags: type === 'person' ? 'Element,Person' : type === 'softwareSystem' ? 'Element,Software System' : type === 'container' ? 'Element,Container' : 'Element,Component', properties: { 'doc.id': command.id, 'structurizr.dsl.identifier': name, ...(command.elementType ? { 'omnidocs.type': command.elementType } : {}) }, relationships: [] };
   if (parent) { const key = type === 'container' ? 'containers' : 'components'; (parent[key] ??= []).push(item); }
   else (type === 'person' ? raw.model.people : raw.model.softwareSystems).push(item);
   elements.push(item); targetView.elements.push({ id: item.id });
   dsl = appendDsl(dsl, viewBlock(), `include ${name}`);
  }
 } else {
  const sourceElement = find(command.source), targetElement = find(command.target);
  let item = allRelations().find(item => stable(item) === command.id);
  const name = item ? alias(item) : newAlias();
  const header = `${name} = ${alias(sourceElement)} -> ${alias(targetElement)} ${dslQuote(command.label)}${command.protocol ? ` ${dslQuote(command.protocol)}` : ''}`;
  if (item) {
   const block = findBlock(item);
   if (block.tokens[3]?.value !== '->') throw new Error('Unsupported DSL relationship declaration.');
   dsl = replaceDslHeader(dsl, block, header);
   for (const entity of elements) entity.relationships = (entity.relationships ?? []).filter((relation: any) => relation !== item);
   (sourceElement.relationships ??= []).push(item);
  } else {
   item = { id: nextId(), properties: { 'doc.id': command.id, 'structurizr.dsl.identifier': name }, tags: 'Relationship' };
   (sourceElement.relationships ??= []).push(item);
   dsl = appendDsl(dsl, indexDsl(dsl).model, `${header} {\n    properties {\n        "doc.id" ${dslQuote(command.id)}\n    }\n}`);
  }
  item.sourceId = sourceElement.id; item.destinationId = targetElement.id; item.description = command.label; item.technology = command.protocol || undefined;
  for (const view of allViews()) {
   const included = (view.relationships ?? []).some((link: any) => link.id === item.id);
   const eligible = view.elements.some((node: any) => node.id === item.sourceId) && view.elements.some((node: any) => node.id === item.destinationId);
   view.relationships = (view.relationships ?? []).filter((link: any) => link.id !== item.id);
   if (eligible && (included || view.key === command.viewId)) view.relationships.push({ id: item.id });
  }
  if(!manual)dsl = appendDsl(dsl, viewBlock(), `include ${name}`);
 }
 indexDsl(dsl);
 // This is an incremental source patch, never presented as a fresh official export/inspection.
 raw.properties ??= {};
 raw.properties['structurizr.dsl'] = btoa(Array.from(new TextEncoder().encode(dsl.trimEnd()), byte => String.fromCharCode(byte)).join(''));
 raw.properties['omnidocs.editorValidation'] = 'incremental-source-patch;official-reexport-pending';
 const sourceFile = replaceBlock(source, 'structurizr', dsl);
 const jsonFile = updateMetadata(replaceBlock(snapshot, 'json', JSON.stringify(raw, null, 2)), doc => { doc.set('source_dsl_sha256', sha256(dsl)); doc.set('generator', 'OmniDocs incremental editor'); });
 return files.map(file => file.path === source.path ? sourceFile : file.path === snapshot.path ? jsonFile : file);
}

export function prepareEdits(source: SourceFile[], inputs: unknown[]) {
 let files = source.map(file => ({ ...file }));
 let semanticChanges=false;
 if (!inputs.length || inputs.length > 100) throw new Error('Save between 1 and 100 changes at a time.');
 for (const input of inputs) {
  const command = editCommandSchema.parse(input), model = compileModel(files);
  if (model.errors.length) throw new Error(model.errors.join('\n'));
  if(command.op==='flow.create'){
   if([...model.views,...model.entities,...model.relations].some(item=>item.id===command.id))throw new Error('This ID already exists.');
   const path=viewDocumentPath('dataflow',undefined,command.id);if(files.some(file=>file.path===path))throw new Error('The flow document already exists.');
   files.push({path,content:`---\n${stringify({id:command.id,kind:'view',type:'dataflow',layout:'levels',name:command.name,description:command.description,nodes:[],relationships:[],direction:'RIGHT'})}---\n# ${command.name.replace(/[\r\n]/g,' ')}\n\nBuild this flow manually from shared model elements. The three bands show abstraction levels, not ownership boundaries.\n`});continue;
  }
  if (command.op === 'workspace.organize') { files = organizeViewDocuments(files); continue; }
  if(command.op==='layout.save'){
   if(!model.views.some(view=>view.id===command.viewId)||!(command.key===command.viewId||command.key.startsWith(`${command.viewId}:`)))throw new Error('Layout must belong to an existing view.');
   const state=readLayoutState(files);state.layouts[command.key]=command.layout;files=writeLayoutState(files,state);continue;
  }
  validateCommand(model, command);
  if(command.op==='view.include'&&command.ids.every(id=>model.views.find(view=>view.id===command.viewId)!.nodes.includes(id)))continue;
  semanticChanges=true;
  const target=model.views.find(view=>view.id===command.viewId);
  files = model.importInfo&&!(command.op==='view.include'&&target?.type==='dataflow') ? structurizrEdit(files, model, command) : nativeEdit(files, model, command);
  if(model.importInfo){
   const next=compileModel(files),ids=new Set(next.entities.map(entity=>entity.id));
   for(const flow of model.views.filter(view=>view.type==='dataflow')){
    const file=files.find(file=>file.path===flow.source);if(!file)continue;
    const nodes=flow.nodes.filter(id=>ids.has(id));
    const links=(flow.relationships??[]).filter(id=>next.relations.some(link=>link.id===id&&nodes.includes(link.source)&&nodes.includes(link.target)));
    if((command.op==='relation.create'||command.op==='relation.update')&&flow.id===command.viewId&&!links.includes(command.id))links.push(command.id);
    // Inclusion has already written the new node list; other edits only clean invalid references.
    if(command.op!=='view.include')files=files.map(item=>item.path===flow.source?updateMetadata(file,doc=>{doc.set('nodes',nodes);doc.set('relationships',links);if(flow.flows.length)doc.set('flows',flow.flows.map(step=>({...step,relationships:step.relationships.filter(id=>links.includes(id))})).filter(step=>step.relationships.length));}):item);
   }
  }
  if((command.op==='relation.create'||command.op==='relation.update')&&(command.sourceHandle||command.targetHandle)){
   if(!command.sourceHandle||!command.targetHandle)throw new Error('Both connection points are required.');
   const state=readLayoutState(files);state.connections[command.id]={sourceHandle:command.sourceHandle,targetHandle:command.targetHandle};files=writeLayoutState(files,state);
  }
  if(command.op==='relation.delete'&&files.some(file=>file.path==='studio/layout.md')){const state=readLayoutState(files);delete state.connections[command.id];files=writeLayoutState(files,state);}
  const next = compileModel(files); if (next.errors.length) throw new Error(next.errors.join('\n'));
 }
 const model = compileModel(files);
 if(semanticChanges)files = refreshPreviews(files, model);
 const final = compileModel(files); if (final.errors.length) throw new Error(final.errors.join('\n'));
 return { files, model: final, changes: fileChanges(source, files) };
}
