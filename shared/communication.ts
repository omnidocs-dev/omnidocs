import type { Entity, Relation } from './model.ts';

/** One palette drives line strokes, arrowheads, animated markers and the visible key. */
export const communicationProtocols = [
 { id: 'rest', label: 'REST', color: '#2563b8' },
 { id: 'grpc', label: 'gRPC', color: '#7950b8' },
 { id: 'tcp', label: 'TCP', color: '#475569' },
 { id: 'websocket', label: 'WebSocket', color: '#087f78' },
 { id: 'http', label: 'HTTP / HTTPS', color: '#167fa5' },
 { id: 'amqp', label: 'AMQP', color: '#b34f82' },
 { id: 'kafka', label: 'Kafka', color: '#b76022' },
 { id: 'mqtt', label: 'MQTT', color: '#84516f' },
 { id: 'sql', label: 'SQL / database', color: '#507538' },
 { id: 'configuration', label: 'Config / projection', color: '#8f7428' },
 { id: 'messaging', label: 'Broker / unspecified', color: '#99629b' },
 { id: 'other', label: 'Other / unspecified', color: '#82766a' },
] as const;
export type CommunicationProtocol = typeof communicationProtocols[number]['id'];
export type Communication = { protocol: CommunicationProtocol; mode: 'direct' | 'brokered' | 'logical' };
export function protocolStyle(protocol: CommunicationProtocol) {
 return communicationProtocols.find(item => item.id === protocol)!;
}
export function communicationDash(communication: Communication): string | undefined {
 return communication.mode === 'logical' ? '3 5' : communication.mode === 'brokered' ? '9 6' : communication.protocol === 'configuration' ? '2 5' : undefined;
}
export function communicationText(relation: Pick<Relation, 'protocol' | 'communication'>): string {
 const explicit = relation.communication?.protocol;
 const label = explicit ? protocolStyle(explicit).label : '';
 if (!relation.protocol) return label;
 return explicit && !relation.protocol.toLowerCase().includes(explicit) ? `${label} · ${relation.protocol}` : relation.protocol;
}

/** HTTP/JSON does not imply REST, and a queue does not imply a particular wire protocol. */
export function resolveCommunication(relation: Pick<Relation, 'protocol' | 'communication'> & Partial<Pick<Relation, 'source' | 'target'>>, entities: readonly Entity[] = []): Communication {
 const raw = relation.protocol ?? '';
 let inferred: CommunicationProtocol = 'other';
 if (/\bgrpc\b/i.test(raw)) inferred = 'grpc';
 else if (/\b(?:websockets?|wss?)\b/i.test(raw)) inferred = 'websocket';
 else if (/\brest(?:ful)?\b/i.test(raw)) inferred = 'rest';
 else if (/\bamqps?\b/i.test(raw)) inferred = 'amqp';
 else if (/\bkafka\b/i.test(raw)) inferred = 'kafka';
 else if (/\bmqtts?\b/i.test(raw)) inferred = 'mqtt';
 else if (/\b(?:postgres(?:ql)?|mysql|mariadb|sql)\b/i.test(raw)) inferred = 'sql';
 else if (/\btcp\b/i.test(raw)) inferred = 'tcp';
 else if (/\bhttps?\b/i.test(raw)) inferred = 'http';
 else if (/\b(?:configmap|secret|projection|projected)\b/i.test(raw)) inferred = 'configuration';
 const protocol = relation.communication?.protocol ?? inferred;
 const queueEndpoint = entities.some(entity => entity.kind === 'queue' && (entity.id === relation.source || entity.id === relation.target));
 const mode = relation.communication?.mode ?? (['amqp', 'kafka', 'mqtt', 'messaging'].includes(protocol) || queueEndpoint ? 'brokered' : 'direct');
 return { protocol: protocol === 'other' && mode === 'brokered' && !relation.communication?.protocol ? 'messaging' : protocol, mode };
}
