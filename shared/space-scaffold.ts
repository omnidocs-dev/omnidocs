import { viewDocumentPath } from './view-paths.ts';
import { z } from 'zod';
import { stringify } from 'yaml';
import { dslQuote } from './dsl-patch.ts';
import { sha256 } from './sha256.ts';
import { compileModel, type SourceFile } from './model.ts';
import { refreshPreviews } from './derived-previews.ts';

export const spaceInput = z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(2000), systemName: z.string().trim().min(1).max(160).optional() }).strict();
export function viewDocument(id: string, name: string, level: 1 | 2 | 3 | 4, scope = 'system.main'): SourceFile {
 return { path: viewDocumentPath(({1:'context',2:'container',3:'component',4:'code'} as const)[level],scope,id), content: `---\n${stringify({ view_key: id, c4_level: level, preview_role: 'derived' })}---\n# ${name.replace(/[\r\n]/g, ' ')}\n\nThis preview is generated from the canonical architecture model.\n\n\`\`\`mermaid\nflowchart LR\n\`\`\`\n` };
}
/** A minimal model, without invented business components or technologies. */
export function scaffoldSpace(input: unknown): SourceFile[] {
 const { name, description, systemName = name } = spaceInput.parse(input);
 const dsl = `workspace ${dslQuote(name)} ${dslQuote(description)} {\n    !impliedRelationships false\n    model {\n        main = softwareSystem ${dslQuote(systemName)} ${dslQuote(description)} {\n            properties {\n                "doc.id" "system.main"\n            }\n        }\n    }\n    views {\n        systemContext main SystemContext {\n            include main\n            autoLayout lr\n        }\n        container main Containers {\n            autoLayout lr\n        }\n    }\n}\n`;
 const raw = { name, description, properties: { 'structurizr.dsl': btoa(Array.from(new TextEncoder().encode(dsl.trimEnd()), byte => String.fromCharCode(byte)).join('')), 'omnidocs.editorValidation': 'incremental-source-patch;official-reexport-pending' }, model: { people: [], softwareSystems: [{ id: '1', name: systemName, description, tags: 'Element,Software System', properties: { 'doc.id': 'system.main', 'structurizr.dsl.identifier': 'main' }, relationships: [], containers: [] }] }, views: { systemContextViews: [{ key: 'SystemContext', title: 'System context', softwareSystemId: '1', elements: [{ id: '1' }], relationships: [], automaticLayout: { rankDirection: 'LeftRight' } }], containerViews: [{ key: 'Containers', title: 'Containers', softwareSystemId: '1', elements: [], relationships: [], automaticLayout: { rankDirection: 'LeftRight' } }], componentViews: [] } };
 const files: SourceFile[] = [
  { path: 'README.md', content: `# ${name.replace(/[\r\n]/g, ' ')}\n\n${description}\n\n[Canonical C4 model](architecture-model.md) · [Context](views/c1-context/system.main/SystemContext.md) · [Containers](views/c2-containers/system.main/Containers.md)\n\nEdit the architecture in OmniDocs Studio. Changes update the canonical Structurizr DSL and its synchronized JSON snapshot. Markdown view previews are derived. The JSON snapshot is locally generated; official Structurizr export/inspection is pending.\n` },
  { path: 'architecture-model.md', content: `---\nview_key: SystemContext\n---\n# Canonical architecture model\n\n\`\`\`structurizr\n${dsl}\`\`\`\n` },
  { path: 'architecture-json.md', content: `---\nformat: structurizr-json\nmodel_source: architecture-model.md\nsource_dsl_sha256: ${sha256(dsl)}\ngenerator: OmniDocs incremental editor\n---\n# Synchronized architecture snapshot\n\n\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\`\n` },
  viewDocument('SystemContext', 'System context', 1), viewDocument('Containers', 'Containers', 2),
 ];
 return refreshPreviews(files, compileModel(files));
}
