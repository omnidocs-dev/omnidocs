import { UserCircle, Stack, GlobeHemisphereWest, Cube, Database, Queue, Code, HardDrives, Browser } from '@phosphor-icons/react';
import { typeForEntity } from '../shared/element-types';
import type { Entity } from '../shared/model';

export const appearanceIcons = { person: UserCircle, system: Stack, external: GlobeHemisphereWest, container: Cube, database: Database, queue: Queue, component: Code, code: Code, deployment: HardDrives, browser: Browser };
export const appearanceLabels = { person: 'Person', system: 'Software system', external: 'External system', container: 'Container', database: 'Database', queue: 'Message broker', component: 'Component', code: 'Code', deployment: 'Infrastructure', browser: 'Web application' };
/** Prefer the declared editor subtype; use technology cues only for legacy elements. Structural C4 kinds remain unchanged. */
export function entityAppearance(entity: Entity): keyof typeof appearanceIcons {
 if (entity.kind !== 'container') return entity.kind;
 const type = typeForEntity(entity);
 if (['database','cache','storage'].includes(type)) return 'database';
 if (type === 'broker') return 'queue';
 if (type === 'webapp') return 'browser';
 return 'container';
}
export function EntityTypeLegend({ entities }: { entities: Entity[] }) {
 const types = [...new Set(entities.map(entityAppearance))];
 return <><span>Element types</span>{types.map(type => { const Icon = appearanceIcons[type]; return <span className={`entity-type-key theme-${type}`} key={type}><Icon size={14} weight="duotone"/>{appearanceLabels[type]}</span>; })}</>;
}
