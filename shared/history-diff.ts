import {fileChanges} from './edit-contract.ts';
import {layoutPath, readLayoutState} from './layout-state.ts';
import {compileModel, relationsForView, type SourceFile} from './model.ts';

export type Difference = 'added' | 'removed' | 'updated';
export type FieldChange = {field: string; before: unknown; after: unknown};
export type ModelChange = {
 kind: 'item' | 'relationship' | 'view' | 'layout' | 'connection points' | 'project';
 id: string; name: string; change: Difference; fields: FieldChange[];
 beforeViews: string[]; afterViews: string[];
};
export type CanvasChanges = {items: Record<string, Difference>; relations: Record<string, Difference>; layouts: Record<string, Record<string, Difference>>; viewItems: Record<string, Record<string, Difference>>};

function stable(value: unknown): string | undefined {
 if (Array.isArray(value)) return JSON.stringify(value.map(stable));
 if (value && typeof value === 'object') return JSON.stringify(Object.entries(value)
  .filter(([, value]) => value !== undefined).sort(([a],[b]) => a.localeCompare(b))
  .map(([key, value]) => [key, stable(value)]));
 return JSON.stringify(value);
}

export function compareSnapshots(before: SourceFile[], after: SourceFile[]) {
 const oldModel = compileModel(before), newModel = compileModel(after);
 const oldLayout = readLayoutState(before), newLayout = readLayoutState(after);
 const changes: ModelChange[] = [];

 function compare<T extends object>(kind: ModelChange['kind'], old: Map<string,T>, next: Map<string,T>,
  title: (value: T, id: string) => string, views = (_id: string, _previous: boolean): string[] => []) {
  for (const id of new Set([...old.keys(), ...next.keys()])) {
   const a = old.get(id), b = next.get(id);
   const left = (a ?? {}) as Record<string, unknown>, right = (b ?? {}) as Record<string, unknown>;
   const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(field => !['id','sourceFile','raw','file'].includes(field))
    .filter(field => stable(left[field]) !== stable(right[field]))
    .map(field => ({field, before:left[field] ?? null, after:right[field] ?? null}));
   if (a && b && !fields.length) continue;
   changes.push({kind,id,name:title(b ?? a!,id),change:a && b ? 'updated' : a ? 'removed' : 'added',
    fields,beforeViews:views(id,true),afterViews:views(id,false)});
  }
 }
 const byId = <T extends {id:string}>(items: T[]) => new Map(items.map(item => [item.id,item]));
 const modelAt = (previous:boolean) => previous ? oldModel : newModel;
 const canvasViews = (previous:boolean, includes:(view:ReturnType<typeof compileModel>['views'][number])=>boolean) => {
  const model=modelAt(previous);
  return model.views.filter(view=>view.type!=='bpmn' && includes(view))
   .sort((a,b)=>Number(b.id===model.project.home)-Number(a.id===model.project.home)).map(view=>view.id);
 };
 const relationViews = (id:string,previous:boolean) =>
  canvasViews(previous,view=>relationsForView(modelAt(previous),view).some(relation=>relation.id===id));
 const names = new Map([...oldModel.entities, ...newModel.entities].map(entity => [entity.id,entity.name]));
 compare('project',byId([oldModel.project]),byId([newModel.project]),project=>project.name);
 compare('item',byId(oldModel.entities.map(({source,relationships,...item})=>item)),byId(newModel.entities.map(({source,relationships,...item})=>item)),
  item=>item.name,(id,previous)=>canvasViews(previous,view=>view.nodes.includes(id)));
 compare('relationship',byId(oldModel.relations),byId(newModel.relations),
  relation=>`${names.get(relation.source) ?? relation.source} → ${names.get(relation.target) ?? relation.target}`,
  relationViews);
 compare('view',byId(oldModel.views.map(({source,...view})=>view)),byId(newModel.views.map(({source,...view})=>view)),
  view=>view.name,id=>[id]);
 const viewForLayout = (key:string) => key.split(':')[0];
 compare('layout',new Map(Object.entries(oldLayout.layouts)),new Map(Object.entries(newLayout.layouts)),
  (_layout,key)=>[...newModel.views,...oldModel.views].find(view=>view.id===viewForLayout(key))?.name ?? key,
  key=>[viewForLayout(key)]);
 compare('connection points',new Map(Object.entries(oldLayout.connections)),new Map(Object.entries(newLayout.connections)),
  (_ports,id)=>newModel.relations.find(relation=>relation.id===id)?.label ?? id,
  relationViews);

 return {changes, files: fileChanges(before,after)};
}

export function conflictFields(base: SourceFile[], draft: SourceFile[], published: SourceFile[]) {
 const proposed = compareSnapshots(base,draft);
 const current = compareSnapshots(base,published);
 const conflicts: string[] = [];
 for (const change of proposed.changes) {
  const other = current.changes.find(item=>item.kind===change.kind && item.id===change.id);
  if (!other) continue;
  if (change.change !== 'updated' || other.change !== 'updated') {
   conflicts.push(change.name);
   continue;
  }
  for (const field of change.fields) {
   const overlap = other.fields.find(item=>item.field===field.field);
   if (overlap && stable(overlap.after) !== stable(field.after)) conflicts.push(`${change.name} / ${field.field}`);
  }
 }
 // A raw document edit can affect prose or formatting that is outside the parsed model.
 if (!proposed.changes.length && !current.changes.length) {
  for (const file of proposed.files) {
   if (file.path !== layoutPath && current.files.some(other=>other.path===file.path && other.after!==file.after)) conflicts.push(file.path);
  }
 }
 return [...new Set(conflicts)];
}
