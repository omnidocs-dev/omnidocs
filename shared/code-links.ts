import type { CodeLink, CodeRepository, Entity, Project } from './model.ts';

export const codeAreas = [
 { id: 'backend', label: 'Backend' },
 { id: 'frontend', label: 'Frontend' },
 { id: 'shared', label: 'Shared' },
] as const;

/** A mapping always resolves within its explicitly referenced repository. No filesystem/network access. */
export function codeLinkUrl(repository: CodeRepository, link: CodeLink): string {
 const base = repository.url.replace(/\/+$/, '').replace(/\.git$/i, '');
 const path = link.path === '.' ? '' : `/${link.path.split('/').map(encodeURIComponent).join('/')}`;
 const ref = encodeURIComponent(link.ref ?? repository.ref);
 const kind = link.kind === 'directory' ? 'tree' : 'blob';
 const prefix = repository.provider === 'gitlab' ? '/-/' : '/';
 const start = link.lines?.start, end = link.lines?.end;
 const anchor = start ? `#L${start}${end && end !== start ? repository.provider === 'gitlab' ? `-${end}` : `-L${end}` : ''}` : '';
 return `${base}${prefix}${kind}/${ref}${path}${anchor}`;
}

export function resolveCodeLinks(project: Project, entity: Entity) {
 return entity.code.flatMap(link => {
  const repository = project.repositories.find(repository => repository.id === link.repository);
  return repository ? [{ link, repository, ref: link.ref ?? repository.ref, url: codeLinkUrl(repository, link) }] : [];
 });
}
