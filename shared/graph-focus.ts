export type FocusTarget = { kind: 'node' | 'edge'; id: string };
type FocusNode = { id: string; parentId?: string };
type FocusEdge = { id: string; source: string; target: string };

/** Focus uses visible occurrences, so shared entities and cross-scope arrows stay precise. */
export function graphFocus(nodes: FocusNode[], edges: FocusEdge[], target: FocusTarget | null) {
 const selected = new Set<string>(), related = new Set<string>(), connections = new Set<string>(), context = new Set<string>();
 const byId = new Map(nodes.map(node => [node.id, node]));
 if (target?.kind === 'node' && byId.has(target.id)) {
  selected.add(target.id);
  for (const edge of edges) if (edge.source === target.id || edge.target === target.id) {
   connections.add(edge.id); related.add(edge.source); related.add(edge.target);
  }
 } else if (target?.kind === 'edge') {
  const edge = edges.find(edge => edge.id === target.id);
  if (edge) { connections.add(edge.id); selected.add(edge.source); selected.add(edge.target); }
 }
 for (const id of selected) related.delete(id);
 for (const id of [...selected, ...related]) {
  let parent = byId.get(id)?.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) { seen.add(parent); context.add(parent); parent = byId.get(parent)?.parentId; }
 }
 return { active: selected.size > 0, selected, related, connections, context };
}
