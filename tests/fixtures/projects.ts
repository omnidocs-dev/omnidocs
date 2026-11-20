import { stringify } from 'yaml';
import type { SourceFile } from '../../shared/model.ts';

/** Unrelated domains and arbitrary IDs exercise the same public Markdown input. */
export function genericWorkspace(prefix: string, name: string, nouns: [string, string, string], infrastructure: string): SourceFile[] {
 const id = (value: string) => `${prefix}-${value}`;
 const metadata: Record<string, unknown>[] = [
  { id: id('workspace'), kind: 'project', name, description: `Documentation for ${name}`, home: id('overview') },
  { id: id('human'), kind: 'person', name: nouns[0], description: 'Submits and reviews requests', relationships: [{ id: id('request'), target: id('system'), label: 'Submits requests' }] },
  { id: id('system'), kind: 'system', name: nouns[1], description: 'Coordinates the documented workflow' },
  { id: id('app'), kind: 'container', name: nouns[2], description: 'Runs the workflow', technology: 'JVM', parent: id('system'), relationships: [{ id: id('persist'), target: id('store'), label: 'Persists records', protocol: 'SQL / TLS' }] },
  { id: id('store'), kind: 'database', name: 'Records', description: 'Stores durable records', technology: 'SQL', parent: id('system') },
  { id: id('component'), kind: 'component', name: 'Policy evaluator', description: 'Evaluates request rules', technology: 'JVM', parent: id('app') },
  { id: id('code'), kind: 'code', name: 'Decision', description: 'Represents a rule outcome', technology: 'Java', parent: id('component') },
  { id: id('host'), kind: 'deployment', name: infrastructure, description: 'Hosts the application instances', technology: 'Virtual machine', parent: id('system'), relationships: [{ id: id('connect'), target: id('storage'), label: 'Connects to durable storage', protocol: 'SQL / TLS' }] },
  { id: id('storage'), kind: 'deployment', name: 'Storage host', description: 'Hosts the data store instance', technology: 'Virtual machine', parent: id('system') },
  { id: id('process'), kind: 'deployment', name: nouns[2], description: 'Runs one application instance', technology: 'JVM process', parent: id('host') },
  ...[
   ['overview', 'context', 'system', ['human', 'system'], undefined],
   ['applications', 'container', 'system', ['app', 'store'], 'overview'],
   ['modules', 'component', 'app', ['component'], 'applications'],
   ['implementation', 'code', 'component', ['code'], 'modules'],
   ['environment', 'deployment', 'system', ['host', 'storage'], undefined],
   ['execution', 'deployment', 'host', ['process'], 'environment'],
  ].map(([key, type, scope, nodes, parentView]) => ({
   id: id(key as string), kind: 'view', type, scope: id(scope as string), nodes: (nodes as string[]).map(id),
   name: `${name} — ${key}`, description: `Documented ${type} perspective`, parentView: parentView ? id(parentView as string) : undefined,
  })),
 ];
 return metadata.map((item, index) => ({ path: `documents/part-${index}.md`, content: `---\n${stringify(item)}---\n\n# ${item.name}\n\nDocumentation provided by this workspace.\n` }));
}
