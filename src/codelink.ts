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
    throw new Error('The link must use an absolute file path.');
  }
  const root = match[1];
  const parts: string[] = [];
  for (const part of path.slice(match[0].length).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('The file path goes above the filesystem root.');
      parts.pop();
    } else {
      if (/[\x00-\x1f\x7f]/.test(part)) throw new Error('The file path contains invalid characters.');
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
  if (/[\r\n]/.test(text)) throw new Error('Enter a single-line codelink.');
  const match = /^codelink:\/\/(.+):(\d+)\/?$/i.exec(text);
  if (!match) throw new Error('Invalid format. Expected codelink://absolute-path:line-number.');
  const line = Number(match[2]);
  if (!Number.isSafeInteger(line) || line < 1) throw new Error('The line number must be a positive integer.');
  let path: string;
  try { path = decodeURIComponent(match[1]); }
  catch { throw new Error('The link contains an invalid percent escape. Write a literal % as %25.'); }
  // The reference handler repairs this Windows URL normalization too.
  path = path.replace(/^([a-z])\//i, '$1:/');
  return { path: normalizePath(path), line };
}

export function createCodeLink(path: string, line = 1): string {
  if (!Number.isSafeInteger(line) || line < 1) throw new Error('The line number must be a positive integer.');
  // Keep the reference's readable drive/path format, escaping URL delimiters.
  const encoded = normalizePath(path).split('/').map(part =>
    /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part),
  ).join('/');
  return `codelink://${encoded}:${line}`;
}

export function documentKind(path: string, type?: unknown): 'markdown' | 'board' {
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  if (/\.board$/i.test(path) || (/\.edn$/i.test(path) && type === 'whiteboard')) return 'board';
  throw new Error('Only Logseq Markdown pages and text whiteboards (.board / whiteboard .edn) are supported.');
}

export function assertText(content: unknown): asserts content is string {
  if (typeof content !== 'string' || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(content)) {
    throw new Error('The target file is not a readable UTF-8 text document.');
  }
}
