/** A lossless patch index for declarative DSL. It is not an official DSL parser. */
type Token = { value: string; start: number; end: number; quoted?: boolean };
export type DslBlock = { tokens: Token[]; start: number; open: number; end: number; children: DslBlock[]; parent?: DslBlock };
export function indexDsl(source: string) {
 const root: DslBlock = { tokens: [], start: 0, open: 0, end: source.length, children: [] };
 const statements: { tokens: Token[]; owner: DslBlock }[] = [];
 let block = root, statement: Token[] = [], position = 0;
 while (position < source.length) {
  const start = position, char = source[position];
  if (source.startsWith('//', position)) { position = source.indexOf('\n', position); if (position < 0) break; continue; }
  if (source.startsWith('/*', position)) { const end = source.indexOf('*/', position + 2); if (end < 0) throw new Error('Unclosed DSL comment.'); position = end + 2; continue; }
  if (char === '\n' || char === ';') { if (statement.length) statements.push({ tokens: statement, owner: block }); statement = []; position++; continue; }
  if (/\s/.test(char)) { position++; continue; }
  if (char === '{') {
   const child: DslBlock = { tokens: statement, start: statement[0]?.start ?? start, open: start, end: 0, children: [], parent: block };
   block.children.push(child); block = child; statement = []; position++; continue;
  }
  if (char === '}') { if (!block.parent) throw new Error('Unbalanced DSL braces.'); if (statement.length) statements.push({ tokens: statement, owner: block }); block.end = ++position; block = block.parent; statement = []; continue; }
  let value: string;
  if (char === '"') {
   position++; let escaped = false;
   while (position < source.length) { const c = source[position++]; if (c === '"' && !escaped) break; escaped = c === '\\' && !escaped; }
   const raw = source.slice(start, position);
   try { value = JSON.parse(raw); } catch { throw new Error('This DSL string syntax cannot be edited losslessly.'); }
  } else {
   while (position < source.length && !/[\s{};]/.test(source[position])) position++;
   value = source.slice(start, position);
  }
  if (char !== '"' && value.startsWith('!') && !['!impliedRelationships'].includes(value)) throw new Error(`Visual editing does not support DSL directive ${value}. Use the source editor and official exporter.`);
  statement.push({ value, start, end: position, quoted: char === '"' });
 }
 if (block !== root) throw new Error('Unclosed DSL block.');
 const all: DslBlock[] = [];
 const visit = (node: DslBlock) => { for (const child of node.children) { all.push(child); visit(child); } }; visit(root);
 const model = all.find(node => node.tokens[0]?.value === 'model');
 if (all.some(node => node.tokens[0]?.value === 'workspace' && node.tokens[1]?.value === 'extends')) throw new Error('Extended workspaces require the official Structurizr exporter.');
 if (!model) throw new Error('No declarative DSL model block found.');
 if (statement.length) statements.push({ tokens: statement, owner: block });
 return { all, model, root, statements };
}
/** Remove a relationship declaration and exact alias references, preserving neighboring aliases. */
export function removeDslRelationship(source: string, block: DslBlock, identifier: string) {
 source = source.slice(0, block.start) + source.slice(block.end);
 const indexed = indexDsl(source), removals: { start: number; end: number }[] = [];
 const references = (token: Token) => !token.quoted && (token.value === identifier || token.value.startsWith(`${identifier}.`));
 for (const candidate of indexed.all) if (candidate.tokens.some(references)) throw new Error(`DSL alias ${identifier} has a dependent declaration; edit it with the official Structurizr tools.`);
 for (const statement of indexed.statements) {
  const inclusion = ['include','exclude'].includes(statement.tokens[0].value);
  const referenced = statement.tokens.filter(token => references(token) || inclusion && token.value === identifier);
  if (!referenced.length) continue;
  if (!inclusion) throw new Error(`DSL alias ${identifier} is referenced by an unsupported statement. No files were changed.`);
  if (referenced.some(token => token.value !== identifier)) throw new Error('Complex DSL relationship references require the official Structurizr tools.');
  if (statement.tokens.length === referenced.length + 1) removals.push({ start: statement.tokens[0].start, end: statement.tokens.at(-1)!.end });
  else removals.push(...referenced.map(({ start, end }) => ({ start, end })));
 }
 for (const removal of removals.sort((a,b) => b.start - a.start)) source = source.slice(0, removal.start) + source.slice(removal.end);
 return source;
}
export function dslQuote(value: string) {
 if (/[\r\n\u0000-\u001f]/.test(value)) throw new Error('DSL names and descriptions must use a single line.');
 return JSON.stringify(value);
}
export function replaceDslHeader(source: string, block: DslBlock, header: string) { return source.slice(0, block.start) + header + ' ' + source.slice(block.open); }
export function appendDsl(source: string, block: DslBlock, text: string) {
 const closing = block.end - 1, line = source.lastIndexOf('\n', closing) + 1;
 if (!/^\s*$/.test(source.slice(line, closing))) throw new Error('Visual additions require a block closing brace on its own line.');
 const indent = source.slice(line, closing) + '    ';
 return source.slice(0, line) + text.split('\n').map(line => indent + line).join('\n') + '\n' + source.slice(line);
}

/** Remove explicit element/relationship declarations and owned views, then clean exact include references. */
export function removeDslItems(source: string, aliases: Set<string>, viewKeys: Set<string>) {
 const indexed=indexDsl(source);
 const blocks=indexed.all.filter(block=>aliases.has(block.tokens[0]?.value)&&block.tokens[1]?.value==='=' || ['systemContext','container','component'].includes(block.tokens[0]?.value)&&viewKeys.has(block.tokens[2]?.value));
 for(const alias of aliases)if(blocks.filter(block=>block.tokens[0]?.value===alias&&block.tokens[1]?.value==='=').length!==1)throw new Error(`Cannot resolve DSL declaration ${alias} unambiguously.`);
 const top=blocks.filter(block=>!blocks.some(parent=>parent!==block&&parent.start<=block.start&&parent.end>=block.end));
 for(const block of top.sort((a,b)=>b.start-a.start))source=source.slice(0,block.start)+source.slice(block.end);
 const remaining=indexDsl(source), removals:{start:number;end:number}[]=[];
 const isAlias=(value:string)=>[...aliases].some(alias=>value===alias||value.startsWith(`${alias}.`));
 for(const block of remaining.all)if(block.tokens.some(token=>!token.quoted&&isAlias(token.value)))throw new Error('An item has a dependent DSL declaration. Use the source editor and official exporter.');
 for(const statement of remaining.statements){
  const include=['include','exclude'].includes(statement.tokens[0]?.value);
  const relevant=statement.tokens.filter(token=>!token.quoted||include);
  if(relevant.some(token=>!aliases.has(token.value)&&[...aliases].some(alias=>new RegExp(`(^|[^a-zA-Z0-9_])${alias}([^a-zA-Z0-9_]|$)`).test(token.value))))throw new Error('Complex DSL references prevent safe item deletion. No files were changed.');
  const refs=relevant.filter(token=>isAlias(token.value));
  if(!refs.length)continue;
  if(!include||refs.some(token=>!aliases.has(token.value)))throw new Error('Complex DSL references prevent safe item deletion. No files were changed.');
  if(statement.tokens.length===refs.length+1)removals.push({start:statement.tokens[0].start,end:statement.tokens.at(-1)!.end});
  else removals.push(...refs.map(({start,end})=>({start,end})));
 }
 for(const removal of removals.sort((a,b)=>b.start-a.start))source=source.slice(0,removal.start)+source.slice(removal.end);
 return source;
}
