import { build } from 'vite';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileModel } from '../shared/model.ts';
import { workspaceConfiguration } from '../server/workspace-config.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { documents,output } = await workspaceConfiguration(root);
const demoRoot=path.join(root,'docs/demo');
const docs=process.argv.includes('--include-configured-workspace')?documents:demoRoot;
const demo=docs===demoRoot;
async function collect(directory) {
 const entries = await readdir(directory, { withFileTypes: true });
 const files = await Promise.all(entries.filter(e => !e.name.startsWith('.') && e.name !== 'node_modules').map(async e => {
  const absolute = path.join(directory,e.name);
  if(e.isDirectory()) return collect(absolute);
  return e.isFile() && /\.md$/i.test(e.name) ? [{ path: path.relative(docs,absolute).split(path.sep).join('/'), content: await readFile(absolute,'utf8') }] : [];
 })); return files.flat();
}
const sources = await collect(docs);
const model = compileModel(sources);
if (model.errors.length) throw new Error(`Cannot package an invalid workspace:\n${model.errors.join('\n')}`);
await build({ root, configFile:path.join(root,'vite.config.ts'), build:{ outDir:path.join(root,'output/portable-build'), assetsInlineLimit:1000000, rollupOptions:{ output:{ inlineDynamicImports:true } } } });
const assets = path.join(root,'output/portable-build/assets');
const names = await readdir(assets);
let js = await readFile(path.join(assets,names.find(n=>n.endsWith('.js'))),'utf8');
let css = await readFile(path.join(assets,names.find(n=>n.endsWith('.css'))),'utf8');
for (const name of names.filter(n => !/\.(js|css)$/.test(n))) {
 const bytes = await readFile(path.join(assets,name));
 const mime = name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.woff') ? 'font/woff' : 'application/octet-stream';
 const embeddedAsset = `data:${mime};base64,${bytes.toString('base64')}`;
 css = css.replaceAll(`/assets/${name}`, embeddedAsset);
 js = js.replaceAll(`/assets/${name}`, embeddedAsset);
}
const brandIcon = `data:image/svg+xml;base64,${(await readFile(path.join(root,'src/assets/brand/omnidocs-mark.svg'))).toString('base64')}`;
const snapshot = JSON.stringify({ name:path.basename(docs), demo, files:sources }).replaceAll('<','\\u003c');
const title = `${model.project.name} — OmniDocs Studio`.replace(/[&<>\"]/g, value => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[value]));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1d1c1a"><link rel="icon" type="image/svg+xml" href="${brandIcon}"><title>${title}</title><style>${css}</style></head><body><div id="root"></div><script>window.__OMNIDOCS_SNAPSHOT__=${snapshot}</script><script type="module" src="data:text/javascript;base64,${Buffer.from(js).toString('base64')}"></script></body></html>`;
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,html);
console.log(`Portable preview: ${path.relative(root, output)}\nWorkspace: ${model.project.name}\nViews: ${model.views.length} · Elements: ${model.entities.length}`);
