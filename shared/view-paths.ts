import type { View } from './model.ts';
import { sha256 } from './sha256.ts';
const levels = { context:'c1-context', container:'c2-containers', component:'c3-components', code:'c4-code', deployment:'deployment', dataflow:'data-flows', bpmn:'processes' } as const;
function segment(value: string) { return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(value) ? value : `id-${sha256(value).slice(0,16)}`; }
export function viewDocumentPath(type: View['type'], scope: string | undefined, id: string) {
 return `views/${levels[type]}/${segment(scope || 'workspace')}/${segment(id)}.md`;
}
