import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SourceFile } from '../shared/model';
import { markdownSource, relativeDocument } from '../shared/markdown-source';

export function DocumentReader({ file, files, onOpen, onMissing }: { file: SourceFile; files: SourceFile[]; onOpen: (file: SourceFile) => void; onMissing: (path: string) => void }) {
 const article = useRef<HTMLElement>(null);
 useEffect(() => { article.current?.closest('dialog')?.scrollTo({ top: 0 }); }, [file.path]);
 let body = file.content;
 try { body = markdownSource(file).body; } catch { /* Keep malformed document metadata readable as source. */ }
 return <article ref={article} className="markdown document-reader" dir="auto"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => {
  const external = /^(?:https?:|mailto:)/i.test(href ?? '');
  return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={event => {
   if (!href || external || href.startsWith('#')) return;
   event.preventDefault(); const target = relativeDocument(file.path, href), next = files.find(file => file.path === target);
   if (next) onOpen(next); else onMissing(target ?? href);
  }}>{children}</a>;
 } }}>{body}</ReactMarkdown></article>;
}
import { useEffect, useRef } from 'react';
