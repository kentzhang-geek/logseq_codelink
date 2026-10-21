export interface CodeLink { path: string; line: number }

export function normalizePath(input: string): string {
  let path = input.replace(/\\/g, '/');
  if (/^file:\/\//i.test(path)) {
    path = decodeURIComponent(path.replace(/^file:\/\//i, ''));
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    else if (!path.startsWith('/')) path = `//${path}`;
  }
  const match = /^(\/\/[^/]+\/[^/]+|[a-z]:|\/)(?:\/|$)?/i.exec(path);
  if (!match || (/^[a-z]:/i.test(path) && !/^[a-z]:\//i.test(path))) {
    throw new Error('链接必须使用文件的绝对路径。');
  }
  const root = match[1];
  const parts: string[] = [];
  for (const part of path.slice(match[0].length).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('文件路径超出根目录。');
      parts.pop();
    } else {
      if (/[\x00-\x1f\x7f]/.test(part)) throw new Error('文件路径包含无效字符。');
      parts.push(part);
    }
  }
  return `${root === '/' ? '' : root}/${parts.join('/')}`;
}

export function pathKey(path: string): string {
  const normalized = normalizePath(path).replace(/\/$/, '');
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function resolveGraphPath(root: string, file: string): string {
  if (/^(?:[a-z]:|\/|file:\/\/)/i.test(file.replace(/\\/g, '/'))) return normalizePath(file);
  return normalizePath(`${normalizePath(root)}/${file}`);
}

export function isInGraph(path: string, root: string): boolean {
  return pathKey(path).startsWith(`${pathKey(root)}/`);
}

export function parseCodeLink(input: string): CodeLink {
  const text = input.trim();
  if (/[\r\n]/.test(text)) throw new Error('请输入单行 codelink。');
  const match = /^codelink:\/\/(.+):(\d+)\/?$/i.exec(text);
  if (!match) throw new Error('格式错误，应为 codelink://绝对路径:行号。');
  const line = Number(match[2]);
  if (!Number.isSafeInteger(line) || line < 1) throw new Error('行号必须是大于 0 的整数。');
  let path: string;
  try { path = decodeURIComponent(match[1]); }
  catch { throw new Error('链接包含无效的百分号转义，请将 % 写成 %25。'); }
  // The reference handler repairs this Windows URL normalization too.
  path = path.replace(/^([a-z])\//i, '$1:/');
  return { path: normalizePath(path), line };
}

export function createCodeLink(path: string, line = 1): string {
  if (!Number.isSafeInteger(line) || line < 1) throw new Error('行号必须是大于 0 的整数。');
  // Keep the reference's readable drive/path format, escaping URL delimiters.
  const encoded = normalizePath(path).split('/').map(part =>
    /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part),
  ).join('/');
  return `codelink://${encoded}:${line}`;
}

export function documentKind(path: string, type?: unknown): 'markdown' | 'board' {
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  if (/\.board$/i.test(path) || (/\.edn$/i.test(path) && type === 'whiteboard')) return 'board';
  throw new Error('仅支持 Logseq 的 Markdown 页面及文本白板文件（.board / 白板 .edn）。');
}

export function assertText(content: unknown): asserts content is string {
  if (typeof content !== 'string' || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(content)) {
    throw new Error('目标文件不是可读取的 UTF-8 文本文档。');
  }
}
