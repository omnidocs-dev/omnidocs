import type { Entity, View } from './model.ts';
import {deploymentTypes,inferDeploymentType} from './deployment-types.ts';

/** Editor subtypes are local metadata; structural C4 kinds remain canonical. */
export const elementTypes = [
 { id:'person', label:'Person / Role', group:'People & systems', kind:'person', levels:['context','container','component','dataflow'], hint:'A person or role interacting with the system.' },
 { id:'system', label:'Software system', group:'People & systems', kind:'system', levels:['context','dataflow'], hint:'The software system in scope.' },
 { id:'external', label:'External software system', group:'People & systems', kind:'external', levels:['context','container','component','dataflow'], hint:'A separate software system outside this scope.' },
 { id:'app', label:'Application / Service', group:'Applications · C2', kind:'container', levels:['container','dataflow'], hint:'An independently running application or service.' },
 { id:'webapp', label:'Web application', group:'Applications · C2', kind:'container', levels:['container','dataflow'], hint:'A web application or browser frontend.' },
 { id:'mobileapp', label:'Mobile application', group:'Applications · C2', kind:'container', levels:['container','dataflow'], hint:'A mobile application.' },
 { id:'api', label:'API application', group:'Applications · C2', kind:'container', levels:['container','dataflow'], hint:'An application exposing an API.' },
 { id:'worker', label:'Background worker', group:'Applications · C2', kind:'container', levels:['container','dataflow'], hint:'An application processing background jobs.' },
 { id:'database', label:'Database', group:'Data & messaging · C2', kind:'database', levels:['container','dataflow'], hint:'A database or database schema; modeled as a C4 container.' },
 { id:'cache', label:'Cache', group:'Data & messaging · C2', kind:'database', levels:['container','dataflow'], hint:'A cache or key-value data store.' },
 { id:'broker', label:'Message broker / Queue', group:'Data & messaging · C2', kind:'queue', levels:['container','dataflow'], hint:'Messaging infrastructure for asynchronous communication.' },
 { id:'storage', label:'Object / File storage', group:'Data & messaging · C2', kind:'database', levels:['container','dataflow'], hint:'A bucket, filesystem or document store.' },
 { id:'component', label:'Component', group:'Components · C3', kind:'component', levels:['component','dataflow'], hint:'A component inside one application/container.' },
 { id:'controller', label:'Controller / Handler', group:'Components · C3', kind:'component', levels:['component','dataflow'], hint:'An internal component handling incoming requests.' },
 { id:'service', label:'Application / Domain service', group:'Components · C3', kind:'component', levels:['component','dataflow'], hint:'An internal component implementing application or domain behavior.' },
 { id:'repository', label:'Repository / Data access', group:'Components · C3', kind:'component', levels:['component','dataflow'], hint:'An internal component for persistence access.' },
 { id:'adapter', label:'Adapter / Integration', group:'Components · C3', kind:'component', levels:['component','dataflow'], hint:'An internal component integrating with other systems.' },
 { id:'code', label:'Code element', group:'Implementation · C4', kind:'code', levels:['code'], hint:'An implementation detail with code mappings.' },
 ...deploymentTypes,
] as const;
export type ElementType = typeof elementTypes[number]['id'];
export const elementTypeIds = elementTypes.map(type => type.id) as [ElementType, ...ElementType[]];
export function elementKind(type: ElementType, structurizr: boolean): Entity['kind'] {
 const kind = elementTypes.find(item => item.id === type)!.kind;
 return structurizr && ['database','queue'].includes(kind) ? 'container' : kind;
}
export function typesForView(view: View, structurizr: boolean) {
 return elementTypes.filter(type => (type.levels as readonly string[]).includes(view.type) && (!structurizr || type.kind !== 'code') && type.id !== 'system');
}
export function typeForEntity(entity: Entity): ElementType {
 const declared = elementTypes.find(type => type.id === entity.properties['omnidocs.type'] && (type.kind === entity.kind || entity.kind === 'container' && ['database','queue'].includes(type.kind)));
 if (declared) return declared.id;
 if (entity.kind === 'database') return 'database';
 if (entity.kind === 'queue') return 'broker';
 if (entity.kind === 'deployment') return inferDeploymentType(entity.name,entity.technology??'');
 if (entity.kind !== 'container') return entity.kind;
 const tech = entity.technology ?? '';
 if (!/\b(connect|connector|debezium)\b/i.test(tech)) {
  if (/\b(redis|valkey)\b/i.test(tech)) return 'cache';
  if (/\b(postgresql|postgres|mysql|mariadb|clickhouse|mongodb|cassandra|sqlite|sql server|influxdb|prometheus|loki|tempo|elasticsearch|opensearch)\b/i.test(tech)) return 'database';
  if (/\b(kafka|rabbitmq|nats|activemq|pulsar)\b/i.test(tech)) return 'broker';
 }
 if (/\b(nuxt|next|react|angular|vue|browser)\b/i.test(tech)) return 'webapp';
 return 'app';
}
export function elementTypeLabel(entity: Entity) {
 const type = elementTypes.find(type => type.id === typeForEntity(entity))!;
 return ['container','database','queue'].includes(entity.kind) ? `Container · ${type.label}` : entity.kind === 'component' && type.id !== 'component' ? `Component · ${type.label}` : type.label;
}
/** A C3 view needs an explicit owning C2 container, even when invoked from C1. */
export function componentScopes(model: {entities: Entity[]; views: View[]}) {
 return model.entities.filter(entity => ['container','database','queue'].includes(entity.kind)).flatMap(entity => {
  const parent = model.views.find(view => view.type === 'container' && view.nodes.includes(entity.id) && view.scope === entity.parent);
  return parent ? [{ entity, parent, existing: model.views.find(view => view.type === 'component' && view.scope === entity.id) }] : [];
 });
}
