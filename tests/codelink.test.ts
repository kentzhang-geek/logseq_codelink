import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertText, createCodeLink, documentKind, isInGraph, normalizePath, parseCodeLink, pathKey, resolveGraphPath } from '../src/codelink';

test('reference-compatible Windows file and line', () => {
  assert.equal(createCodeLink('D:\\Notes\\pages\\hello.md', 12), 'codelink://D:/Notes/pages/hello.md:12');
  assert.deepEqual(parseCodeLink('codelink://D:/Notes/pages/hello.md:12'), { path: 'D:/Notes/pages/hello.md', line: 12 });
});
test('Unicode, whitespace and literal URI delimiters round trip', () => {
  const path = 'D:/\u77e5\u8bc6\u5e93/pages/\u7b14\u8bb0 #1 100% ? %20.md';
  assert.deepEqual(parseCodeLink(createCodeLink(path, 8)), { path, line: 8 });
  assert.deepEqual(parseCodeLink('codelink://D:/\u7b14\u8bb0/test.md:9'), { path: 'D:/\u7b14\u8bb0/test.md', line: 9 });
});
test('normalized missing drive colon, backslash path and trailing URL slash', () => {
  assert.equal(parseCodeLink('codelink://D/Notes/a.md:2/').path, 'D:/Notes/a.md');
  assert.equal(parseCodeLink('codelink://D:\\Notes\\a.md:2').path, 'D:/Notes/a.md');
  assert.equal(parseCodeLink('codelink://D%3A%2FNotes%2Fa.md:2').path, 'D:/Notes/a.md');
});
test('parse only the final line delimiter', () => {
  assert.equal(parseCodeLink('codelink:///notes/a:12.md:3').path, '/notes/a:12.md');
});
test('reject malformed links and unsupported coordinates', () => {
  for (const value of ['', 'https://a.md:1', 'codelink://relative.md:1', 'codelink://D:foo.md:1',
    'codelink://D:/a.md:0', 'codelink://D:/a.md:-1', 'codelink://D:/a.md:1.2',
    'codelink://D:/a.md:9999999999999999999', 'codelink://D:/a.md:1\nother',
    'codelink://D:/a%xx.md:1', 'codelink://D:/a%00.md:1']) {
    assert.throws(() => parseCodeLink(value), value);
  }
});
test('graph boundaries are segment-aware and normalize traversal', () => {
  assert.ok(isInGraph('d:/notes/pages/a.md', 'D:/Notes'));
  assert.ok(!isInGraph('D:/Notes-Other/pages/a.md', 'D:/Notes'));
  assert.ok(!isInGraph('D:/Notes/../Other/a.md', 'D:/Notes'));
  assert.ok(!isInGraph('/Notes/pages/a.md', '/notes'));
  assert.ok(isInGraph('/notes/a.md', '/'));
  assert.equal(resolveGraphPath('D:/Notes', 'pages/../journals/a.md'), 'D:/Notes/journals/a.md');
  assert.throws(() => normalizePath('D:/../../a.md'));
});
test('file URLs and UNC paths', () => {
  assert.equal(normalizePath('file:///D:/My%20Notes'), 'D:/My Notes');
  assert.equal(normalizePath('file:///home/notes'), '/home/notes');
  assert.equal(normalizePath('file://server/share/notes'), '//server/share/notes');
  assert.equal(pathKey('\\\\SERVER\\Share\\Notes\\a.md'), '//server/share/notes/a.md');
  assert.deepEqual(parseCodeLink(createCodeLink('//server/share/notes/a.md', 2)), { path: '//server/share/notes/a.md', line: 2 });
});
test('only Markdown and registered board documents', () => {
  assert.equal(documentKind('a.MD'), 'markdown');
  assert.equal(documentKind('a.markdown'), 'markdown');
  assert.equal(documentKind('a.board'), 'board');
  assert.equal(documentKind('a.edn', 'whiteboard'), 'board');
  for (const file of ['a.ts', 'a.png', 'a.org', 'config.edn', 'a.pdf']) assert.throws(() => documentKind(file));
});
test('binary and invalid UTF-8 content is rejected', () => {
  assertText('\u4e2d\u6587\r\n\u6587\u672c\t\u5185\u5bb9');
  assertText('');
  for (const data of [null, new Uint8Array([1]), '\0data', '\ufffd', '\u0001']) assert.throws(() => assertText(data));
});
