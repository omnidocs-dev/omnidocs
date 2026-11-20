import type { Entity, Model, View } from './model';

export const c4Layers = [
 { level: 1, type: 'context', label: 'System context', description: 'People and external systems' },
 { level: 2, type: 'container', label: 'Containers', description: 'Applications and data stores' },
 { level: 3, type: 'component', label: 'Components', description: 'Inside an application' },
 { level: 4, type: 'code', label: 'Code', description: 'Implementation details' },
] as const;
export type LayerOption = { level: number; label: string; description: string; views: View[]; preferred?: View };

/** Resolve the hierarchy, rather than jumping to another application's similarly named view. */
export function architectureLayers(model: Model, current: View, selection?: string | null): LayerOption[] {
 const entities = new Map(model.entities.map(entity => [entity.id, entity]));
 function ancestors(id?: string): Entity[] {
  const result: Entity[] = [], seen = new Set<string>();
  while (id && !seen.has(id)) {
   seen.add(id);
   const entity = entities.get(id);
   if (!entity) break;
   result.push(entity); id = entity.parent;
  }
  return result;
 }
 const home = model.views.find(view => view.id === model.project.home);
 const rootOf = (id?: string) => ancestors(id).find(entity => entity.kind === 'system')?.id;
 const root = rootOf(current.scope) ?? rootOf(home?.scope);
 const selectedId = entities.has(selection ?? '') ? selection! : model.relations.find(relation => relation.id === selection)?.source;
 const selectedChain = rootOf(selectedId) === root ? ancestors(selectedId) : [];
 const branch = [...selectedChain, ...ancestors(current.scope)].find(entity => entity.kind === 'container');
 const preferredScopes = [...new Set([...selectedChain, ...ancestors(current.scope)].map(entity => entity.id))];
 const layers = [...c4Layers, { level: 5, type: undefined, label: 'Custom level', description: 'Additional documented perspective' }];
 return layers.map(layer => {
  const views = model.views.filter(view => (layer.level === 5 ? view.navigationLevel === 5 : view.type === layer.type) && (!root || rootOf(view.scope) === root)
   && (layer.level !== 4 || !branch || ancestors(view.scope).some(entity => entity.id === branch.id)));
  views.sort((a, b) => a.name.localeCompare(b.name));
  const preferred = views.find(view => view.id === current.id)
   ?? preferredScopes.map(id => views.find(view => view.scope === id)).find((view): view is View => !!view)
   ?? views[0];
  return { ...layer, views, preferred };
 });
}
