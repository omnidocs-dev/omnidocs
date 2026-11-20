import { compileModel, type Model, type SourceFile } from './model.ts';
import { relativeDocument } from './markdown-source.ts';
import { viewDocumentPath } from './view-paths.ts';

export function viewDocumentMoves(model: Model) {
 const moves = new Map<string,string>();
 for (const view of model.views) {
  if (!/^(?:studio\/)?views\/[^/]+\.md$/i.test(view.source) || view.source === model.importInfo?.source) continue;
  const target = viewDocumentPath(view.type,view.scope,view.id);
  if (moves.has(view.source) && moves.get(view.source) !== target) throw new Error('One document is shared by multiple views; organize it manually.');
  moves.set(view.source,target);
 }
 return moves;
}
function relativePath(source: string, target: string) {
 const from = source.split('/').slice(0,-1), to = target.split('/');
 while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
 return [...from.map(()=>'..'),...to].join('/');
}
/** Rewrite local Markdown destinations outside fenced/inline code, preserving anchors and titles. */
function rewriteLinks(content: string, source: string, destination: string, moves: Map<string,string>) {
 const link = (target: string) => {
  const resolved = relativeDocument(source,target); if (!resolved) return target;
  if (source === destination && !moves.has(resolved)) return target;
  const suffix = target.match(/[?#].*$/)?.[0] ?? '';
  // relativeDocument strips anchors; query destinations are left intact rather than guessed.
  if (target.includes('?')) return target;
  return relativePath(destination,moves.get(resolved) ?? resolved).split('/').map(part=>encodeURI(part)).join('/') + suffix;
 };
 let fence: {char:string;size:number} | undefined;
 return content.split(/(?<=\n)/).map(line=>{
  const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (marker) { if (!fence) fence={char:marker[1][0],size:marker[1].length}; else if (marker[1][0]===fence.char && marker[1].length>=fence.size) fence=undefined; return line; }
  if (fence) return line;
  return line.split(/(`+[^`]*`+)/g).map((part,index)=> index%2 ? part : part
   .replace(/(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)([^\n]*?\))/g,(_all,start,target,end)=>`${start}${target.startsWith('<') ? `<${link(target.slice(1,-1))}>` : link(target)}${end}`)
   .replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)/,(_all,start,target)=>`${start}${target.startsWith('<') ? `<${link(target.slice(1,-1))}>` : link(target)}`)
  ).join('');
 }).join('');
}
export function organizeViewDocuments(files: SourceFile[]) {
 const model=compileModel(files); if (model.errors.length) throw new Error(model.errors.join('\n'));
 const moves=viewDocumentMoves(model), targets=new Set<string>();
 for (const [source,target] of moves) {
  if (targets.has(target) || files.some(file=>file.path===target && file.path!==source)) throw new Error(`Cannot move ${source}: ${target} already exists.`);
  targets.add(target);
 }
 const result=files.map(file=>{
  const path=moves.get(file.path)??file.path;
  return {...file,path,content:rewriteLinks(file.content,file.path,path,moves)};
 });
 const next=compileModel(result); if (next.errors.length) throw new Error(next.errors.join('\n'));
 return result;
}
