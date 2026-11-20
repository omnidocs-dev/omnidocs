import { parse } from 'yaml';
import type { SourceFile } from './model.ts';

export function markdownSource(file: SourceFile) {
 const match = file.content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
 return { metadata: match ? parse(match[1]) ?? {} : {}, body: match ? match[2].trim() : file.content };
}

/** Preserve code bytes, including the final newline, for source-digest comparisons. */
export function fencedBlocks(file: SourceFile, language: string): string[] {
 const blocks: string[] = []; let offset = 0;
 let fence: { character: string; size: number; language: string; start: number } | undefined;
 for (const line of file.content.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
  const text = line.replace(/\r?\n$/, '');
  if (!fence) {
   const opening = text.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
   if (opening) fence = { character: opening[1][0], size: opening[1].length, language: opening[2].trim().split(/\s+/)[0], start: offset + line.length };
  } else {
   const closing = text.match(/^ {0,3}(`+|~+)[ \t]*$/);
   if (closing && closing[1][0] === fence.character && closing[1].length >= fence.size) {
    if (fence.language === language) blocks.push(file.content.slice(fence.start, offset));
    fence = undefined;
   }
  }
  offset += line.length;
 }
 if (fence?.language === language) throw new Error(`${file.path}: Unclosed ${language} code block.`);
 return blocks;
}

export function relativeDocument(source: string, target: string): string | undefined {
 if (!target || /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(target)) return undefined;
 let decoded: string;
 try { decoded = decodeURIComponent(target.split('#')[0]); } catch { return undefined; }
 if (!decoded) return source;
 if (decoded.includes('\\') || decoded.startsWith('/')) return undefined;
 const result = source.split('/').slice(0, -1);
 for (const part of decoded.split('/')) {
  if (!part || part === '.') continue;
  if (part === '..') { if (!result.length) return undefined; result.pop(); }
  else result.push(part);
 }
 return result.join('/');
}
