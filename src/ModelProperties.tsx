export function ModelProperties({ properties }: { properties?: Record<string, string> }) {
 const entries = Object.entries(properties ?? {});
 if (!entries.length) return null;
 return <details className="model-properties"><summary>Source model properties <span>{entries.length}</span></summary><dl>{entries.map(([key, value]) => <div key={key}><dt dir="auto">{key}</dt><dd dir="auto">{value}</dd></div>)}</dl></details>;
}
