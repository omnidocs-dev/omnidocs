/** Short display lines; the full label remains in the model, tooltip and inspector. */
export function edgeLabelLines(label: string, width = 36, maxLines = 4, protocol?: string): string[] {
 if (protocol && label.endsWith(`\n${protocol}`) && maxLines > 1) {
  const description = label.slice(0, -(protocol.length + 1));
  return [...edgeLabelLines(description, width, maxLines - 1), ...edgeLabelLines(protocol, width, 1)];
 }
 const lines: string[] = [];
 for (const paragraph of label.split('\n')) {
  let line = '';
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
   if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; }
   else line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
 }
 if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`];
 return lines;
}
