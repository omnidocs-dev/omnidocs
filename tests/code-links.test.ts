import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { codeLinkUrl, resolveCodeLinks } from '../shared/code-links.ts';
import { childView, compileModel } from '../shared/model.ts';
import { genericWorkspace } from './fixtures/projects.ts';

function fixture(change?: (documents: Record<string, any>[]) => void) {
 const files = genericWorkspace('map', 'Traceability', ['Reader', 'Archive', 'Catalog'], 'VM');
 const documents = files.map(file => parse(file.content.match(/^---\n([\s\S]*?)\n---/)![1]));
 documents[0].repositories = [
  { id: 'server', name: 'Service repository', area: 'backend', provider: 'github', url: 'https://github.example.org/team/server.git', ref: 'a'.repeat(40) },
  { id: 'web', name: 'UI repository', area: 'frontend', provider: 'gitlab', url: 'https://git.example.org/team/web', ref: 'release/2026' },
 ];
 documents.find(document => document.id === 'map-component').code = [
  { repository: 'server', path: 'internal/checkout.go', symbol: 'Checkout.Handle', lines: { start: 12, end: 28 } },
  { repository: 'web', path: 'src/Checkout Page.tsx', symbol: 'handleCheckout', ref: 'ui-v2', lines: { start: 20 } },
 ];
 documents.find(document => document.id === 'map-code').code = [{ repository: 'server', path: 'internal/model.go', symbol: 'Decision' }];
 change?.(documents);
 return files.map((file, index) => ({ ...file, content: `---\n${stringify(documents[index])}---\n# Details` }));
}

test('backend and frontend mappings resolve only within their own repository and version', () => {
 const model = compileModel(fixture()); assert.deepEqual(model.errors, []);
 const entity = model.entities.find(entity => entity.id === 'map-component')!;
 const links = resolveCodeLinks(model.project, entity);
 assert.deepEqual(links.map(link => link.repository.area), ['backend', 'frontend']);
 assert.equal(links[0].url, `https://github.example.org/team/server/blob/${'a'.repeat(40)}/internal/checkout.go#L12-L28`);
 assert.equal(links[1].url, 'https://git.example.org/team/web/-/blob/ui-v2/src/Checkout%20Page.tsx#L20');
 assert.equal(links[0].link.symbol, 'Checkout.Handle');
 assert.equal(links[1].link.symbol, 'handleCheckout');
 assert.equal(childView(model, 'map-component')?.type, 'code');
 assert.equal(model.entities.find(entity => entity.id === 'map-code')?.code[0].repository, 'server');
});

test('repository default refs, directory targets, GitLab line ranges and encoded paths stay explicit', () => {
 const model = compileModel(fixture()); const repository = model.project.repositories[1];
 assert.equal(codeLinkUrl(repository, { repository: 'web', path: 'src/a#b.ts', kind: 'file', lines: { start: 4, end: 9 } }), 'https://git.example.org/team/web/-/blob/release%2F2026/src/a%23b.ts#L4-9');
 assert.equal(codeLinkUrl(repository, { repository: 'web', path: 'src/features', kind: 'directory' }), 'https://git.example.org/team/web/-/tree/release%2F2026/src/features');
 assert.equal(codeLinkUrl(repository, { repository: 'web', path: '.', kind: 'directory' }), 'https://git.example.org/team/web/-/tree/release%2F2026');
});

test('invalid repository references and code paths produce file-specific diagnostics', () => {
 const cases: Array<(documents: Record<string, any>[]) => void> = [
  documents => documents[0].repositories.push(documents[0].repositories[0]),
  documents => documents[0].repositories[0].url = 'javascript:alert(1)',
  documents => documents[0].repositories[0].url = 'https://user:secret@example.org/repo',
  documents => documents[0].repositories[0].url = 'not-a-url',
  documents => documents[0].repositories[0].ref = '',
  documents => documents.find(document => document.id === 'map-component')!.code[0].repository = 'missing',
  ...['../secret', '/absolute/file.go', 'C:\\file.go', 'src/../secret', 'src//file.go', './file.go', 'src\\file.go'].map(path => (documents: Record<string, any>[]) => { documents.find(document => document.id === 'map-component')!.code[0].path = path; }),
  documents => documents.find(document => document.id === 'map-component')!.code[0].lines.end = 1,
  documents => documents.find(document => document.id === 'map-component')!.code[0].lines.start = 0,
  documents => documents.find(document => document.id === 'map-component')!.code[0].kind = 'directory',
 ];
 for (const change of cases) {
  const model = compileModel(fixture(change));
  assert(model.errors.some(error => error.includes('documents/')), JSON.stringify(model.errors));
 }
});

test('workspaces without code mappings retain backward-compatible empty metadata', () => {
 const model = compileModel(genericWorkspace('old', 'Existing workspace', ['Reader', 'Archive', 'Catalog'], 'VM'));
 assert.deepEqual(model.errors, []); assert.deepEqual(model.project.repositories, []);
 assert(model.entities.every(entity => entity.code.length === 0));
});
