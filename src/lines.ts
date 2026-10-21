export interface OutlineBlock {
  uuid: string;
  content: string;
  children?: (OutlineBlock | [string, string])[];
  [key: string]: unknown;
}
export interface BlockLocation {
  block: OutlineBlock;
  start: number; // one-based physical file line
  contentLines: string[];
  ancestors: string[];
}

export const splitLines = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n');

function normalizedContent(text: string): string[] {
  const lines = splitLines(text.replace(/^\ufeff/, ''));
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

function firstLine(text: string, preBlock: boolean): string {
  const trimmed = text.replace(/^\ufeff/, '').trimStart();
  return preBlock ? trimmed : trimmed.replace(/^[-+*](?:\s|$)/, '').trimStart();
}

/** Match real file contents in outline order; never use stale UTF-8 byte offsets. */
export function mapBlocks(text: string, tree: OutlineBlock[]): BlockLocation[] {
  const lines = splitLines(text);
  const result: BlockLocation[] = [];
  let next = 0;
  const visit = (blocks: OutlineBlock[], ancestors: string[]) => {
    for (const block of blocks) {
      const contentLines = normalizedContent(block.content);
      const pre = block.preBlock === true || block['preBlock?'] === true || block['pre-block?'] === true;
      let found = -1;
      for (let i = next; i < lines.length; i++) {
        if (!pre && !contentLines[0].trim() && !/^\s*[-+*](?:\s|$)/.test(lines[i])) continue;
        if (firstLine(lines[i], pre).trimEnd() !== contentLines[0].trim()) continue;
        if (contentLines.every((line, offset) => offset === 0 ||
          lines[i + offset]?.trim() === line.trim())) { found = i; break; }
      }
      if (found < 0) throw new Error('页面内容正在保存，或源码与块结构不匹配，请稍后重试。');
      result.push({ block, start: found + 1, contentLines, ancestors });
      next = found + contentLines.length;
      const children = (block.children ?? []).filter((child): child is OutlineBlock => !Array.isArray(child));
      if (children.length !== (block.children?.length ?? 0)) {
        throw new Error('Logseq 未返回完整块树，无法可靠定位行号。');
      }
      visit(children, [...ancestors, block.uuid]);
    }
  };
  visit(tree, []);
  return result;
}

export function cursorLine(start: number, content: string, pos: number): number {
  const before = content.slice(0, Math.max(0, Math.min(pos, content.length)));
  return start + splitLines(before).length - 1;
}

export function targetForLine(locations: BlockLocation[], line: number): { location: BlockLocation; pos: number } | null {
  const location = [...locations].reverse().find(item => item.start <= line);
  if (!location) return null;
  const row = Math.min(line - location.start, location.contentLines.length - 1);
  const original = splitLines(location.block.content);
  const pos = original.slice(0, row).reduce((sum, part) => sum + part.length + 1, 0);
  return { location, pos };
}
