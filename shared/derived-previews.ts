import { relationsForView, type SourceFile, type Model } from './model.ts';
import { fencedBlocks, markdownSource } from './markdown-source.ts';
function replaceBlock(file: SourceFile, language: string, content: string) {
 const blocks = fencedBlocks(file, language);
 if (blocks.length !== 1 || file.content.indexOf(blocks[0]) !== file.content.lastIndexOf(blocks[0])) throw new Error(`${file.path}: Expected one unambiguous ${language} block.`);
 return { ...file, content: file.content.replace(blocks[0], content.endsWith('\n') ? content : `${content}\n`) };
}
export function refreshPreviews(files: SourceFile[], model: Model) {
 const escape = (text: string) => text.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\r\n]+/g,' ');
 return files.map(file => {
  const { metadata } = markdownSource(file), view = model.views.find(view => view.id === metadata.view_key);
  if (metadata.preview_role !== 'derived' || !view || fencedBlocks(file, 'mermaid').length !== 1) return file;
  const ids = new Map(view.nodes.map((id, index) => [id, `n${index}`]));
  const lines = ['---', `title: ${JSON.stringify(view.name)}`, '---', `flowchart ${view.direction === 'RIGHT' ? 'LR' : 'TB'}`];
  for (const id of view.nodes) { const entity = model.entities.find(entity => entity.id === id)!; const kind = entity.kind === 'person' ? 'Person' : ['system','external'].includes(entity.kind) ? 'Software System' : entity.kind; lines.push(`    ${ids.get(id)}["${escape(entity.name)}<br/>[${kind}]<br/>${escape(entity.description)}${entity.technology ? `<br/>${escape(entity.technology)}` : ''}"]`); }
  for (const relation of relationsForView(model, view)) lines.push(`    ${ids.get(relation.source)} ${relation.communication?.mode === 'logical' ? '-.->' : '-->'}|"${escape(relation.label)}"| ${ids.get(relation.target)}`);
  lines.push('    classDef person fill:#08427b,color:#fff,stroke:#052c52','    classDef system fill:#eee,color:#111,stroke:#666','    classDef scope fill:#1168bd,color:#fff,stroke:#08427b,stroke-width:3px');
  for (const id of view.nodes) lines.push(`    class ${ids.get(id)} ${id === view.scope ? 'scope' : model.entities.find(entity => entity.id === id)!.kind === 'person' ? 'person' : 'system'}`);
  return replaceBlock(file, 'mermaid', lines.join('\n'));
 });
}
