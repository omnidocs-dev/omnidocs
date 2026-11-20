import { ArrowSquareOut, Code, GitBranch } from '@phosphor-icons/react';
import type { Entity, Project } from '../shared/model';
import { codeAreas, resolveCodeLinks } from '../shared/code-links';

export function CodeMappings({ project, entity }: { project: Project; entity?: Entity }) {
 if (!entity) return <p className="muted">Select an element to inspect its code mappings.</p>;
 const links = resolveCodeLinks(project, entity);
 if (!links.length) return <div className="code-mapping-empty"><Code size={26}/><h3>No code mapped yet</h3><p>Add a repository reference, path, and optional symbol to this element’s Markdown document.</p><code>{entity.source}</code></div>;
 return <div className="code-mappings"><p className="code-mapping-note">Declared in Markdown. Repository contents are not loaded or verified.</p>{codeAreas.map(area => {
  const matches = links.filter(item => item.repository.area === area.id);
  return matches.length ? <section className="code-area" key={area.id} data-area={area.id} aria-label={`${area.label} code mappings`}>
   <div className="code-area-heading"><span>{area.label}</span><small>{matches.length} {matches.length === 1 ? 'mapping' : 'mappings'}</small></div>
   {matches.map(({ link, repository, ref, url }, index) => <article className="code-mapping-card" key={`${repository.id}-${index}`}>
    <div className="code-repository"><GitBranch size={14}/><strong>{repository.name}</strong><span>{repository.provider === 'gitlab' ? 'GitLab' : 'GitHub'}</span></div>
    <a className="code-file-link" href={url} target="_blank" rel="noopener noreferrer"><Code size={16}/><span>{link.path}</span><ArrowSquareOut size={15}/></a>
    <dl><div><dt>Version / ref</dt><dd><code>{ref}</code></dd></div>{link.symbol && <div><dt>Symbol</dt><dd><code>{link.symbol}</code></dd></div>}<div><dt>Target</dt><dd>{link.kind === 'directory' ? 'Directory' : 'File'}{link.lines && ` · lines ${link.lines.start}${link.lines.end && link.lines.end !== link.lines.start ? `–${link.lines.end}` : ''}`}</dd></div></dl>
    <a className="code-open-link" href={url} target="_blank" rel="noopener noreferrer">Open {link.kind === 'directory' ? 'directory' : 'file'} in repository<ArrowSquareOut size={13}/></a>
   </article>)}
  </section> : null;
 })}</div>;
}
