import devicon from './assets/devicon/catalog.json';

const assets = import.meta.glob<string>('./assets/technology/*.svg', {
 eager: true,
 query: '?inline',
 import: 'default',
});

const labels: Record<string, string> = {
 amazonwebservices: 'Amazon Web Services', apacheairflow: 'Apache Airflow', apachecouchdb: 'Apache CouchDB',
 apacheflink: 'Apache Flink', apachekafka: 'Apache Kafka', apachepulsar: 'Apache Pulsar', apachespark: 'Apache Spark',
 auth0: 'Auth0', clickhouse: 'ClickHouse', cplusplus: 'C++', csharp: 'C#', 'dot-net': '.NET',
 dotnetcore: '.NET Core', eclipsemosquitto: 'Eclipse Mosquitto', githubactions: 'GitHub Actions',
 gitlab: 'GitLab', googlecloud: 'Google Cloud', graphql: 'GraphQL', grpc: 'gRPC', javascript: 'JavaScript',
 keycloak: 'Keycloak', mariadb: 'MariaDB', microsoftsqlserver: 'Microsoft SQL Server', minio: 'MinIO',
 mongodb: 'MongoDB', mysql: 'MySQL', nats: 'NATS', nestjs: 'NestJS', nextjs: 'Next.js',
 nodejs: 'Node.js', oauth: 'OAuth', openjdk: 'OpenJDK', opensearch: 'OpenSearch',
 opentelemetry: 'OpenTelemetry', postgresql: 'PostgreSQL', rabbitmq: 'RabbitMQ',
 rails: 'Ruby on Rails', springboot: 'Spring Boot', sqlite: 'SQLite',
 traefikproxy: 'Traefik Proxy', typescript: 'TypeScript', vuejs: 'Vue.js',
};

const names: Record<string, string[]> = {
 angular: ['AngularJS'], apacheairflow: ['Airflow'], apachecouchdb: ['CouchDB'], apacheflink: ['Flink'],
 apachekafka: ['Kafka'], apachepulsar: ['Pulsar'], apachespark: ['Spark'], 'dot-net': ['ASP.NET'],
 eclipsemosquitto: ['Mosquitto'], go: ['Golang'], googlecloud: ['GCP'], grafana: ['Loki', 'Tempo'],
 javascript: ['ECMAScript'], kong: ['Kong Gateway'], kubernetes: ['K8s'],
 nestjs: ['Nest.js', 'Nest JS'], nuxtjs: ['Nuxt.js', 'Nuxt'], opentelemetry: ['Open Telemetry', 'OTel', 'OTLP'],
 postgresql: ['Postgres', 'PGSQL'], react: ['React.js', 'ReactJS'], traefikproxy: ['Traefik'], vuejs: ['Vue'],
};

const equivalent: Record<string, string> = {
 dotnet: 'dot-net', nextdotjs: 'nextjs', nodedotjs: 'nodejs',
 nuxt: 'nuxtjs', rubyonrails: 'rails', vuedotjs: 'vuejs',
};

const extraTags: Record<string, string[]> = {
 auth0: ['authentication', 'identity', 'OIDC'], authelia: ['authentication', 'identity'],
 authentik: ['authentication', 'identity'], keycloak: ['authentication', 'identity', 'OIDC', 'SSO'],
 okta: ['authentication', 'identity', 'SSO'], ory: ['authentication', 'identity'],
 kong: ['API Gateway', 'gateway', 'proxy'], traefikproxy: ['gateway', 'proxy'], envoy: ['gateway', 'proxy'],
 nginx: ['gateway', 'proxy', 'web server'], caddy: ['gateway', 'proxy', 'web server'],
 redis: ['cache', 'database'], valkey: ['cache', 'database'],
 apachekafka: ['broker', 'event streaming'], apachepulsar: ['broker'], rabbitmq: ['broker', 'queue'],
 nats: ['broker', 'messaging'], eclipsemosquitto: ['broker', 'MQTT'],
};

export type Technology = {
 id: string;
 label: string;
 aliases: string[];
 tags: string[];
 code?: number;
 url?: string;
};

const deviconIds = new Set(devicon.map(item => item.name));
export const technologyCatalog: Technology[] = [
 ...devicon.map(({name, aliases, tags, code}) => ({
  id: name, label: labels[name] ?? name[0].toUpperCase() + name.slice(1),
  aliases: [...aliases, ...(names[name] ?? [])],
  tags: [...tags, ...(extraTags[name] ?? [])], code,
 })),
 ...Object.entries(assets).flatMap(([path, url]) => {
  const id = path.slice(path.lastIndexOf('/') + 1, -4);
  if (deviconIds.has(equivalent[id] ?? id)) return [];
  return [{
   id, label: labels[id] ?? id[0].toUpperCase() + id.slice(1),
   aliases: names[id] ?? [], tags: extraTags[id] ?? [], url,
  }];
 }),
];

const matchers = technologyCatalog.map(technology => {
 const terms = [technology.id, technology.label, ...technology.aliases]
  .sort((a, b) => b.length - a.length)
  .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
 return {
  technology,
  pattern: new RegExp(`(?:^|[^a-z0-9])(${terms.join('|')})(?![a-z0-9])`, 'i'),
 };
});

export function findTechnologyLogos(text: string) {
 const matches = matchers.flatMap(({pattern, technology}) => {
  const match = pattern.exec(text);
  return match ? [{
   technology, index: match.index + match[0].length - match[1].length, length: match[1].length,
  }] : [];
 }).sort((a, b) => a.index - b.index || b.length - a.length);

 let end = 0;
 return matches.filter(match => {
  if (match.index < end) return false;
  end = match.index + match.length;
  return true;
 }).map(match => match.technology);
}

export function TechnologyIcon({technology}: {technology: Technology}) {
 return technology.code
  ? <span className="technology-devicon" aria-hidden="true">{String.fromCodePoint(technology.code)}</span>
  : <img src={technology.url} alt="" width="13" height="13"/>;
}

export function TechnologyLogos({technology}: {technology?: string}) {
 if (!technology) return null;
 const matches = findTechnologyLogos(technology);
 if (!matches.length) return null;
 return <span className="technology-logos" role="img" aria-label={matches.map(item => item.label).join(', ')} title={technology}>
  {matches.slice(0, 3).map(item => <TechnologyIcon key={item.id} technology={item}/>)}
  {matches.length > 3 && <span className="technology-logo-count">+{matches.length - 3}</span>}
 </span>;
}
