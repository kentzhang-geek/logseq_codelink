import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorLine, mapBlocks, targetForLine, type OutlineBlock } from '../src/lines';

const block = (uuid: string, content: string, children?: OutlineBlock[]): OutlineBlock => ({ uuid, content, children });
test('nested blocks, duplicate text, Unicode and CRLF use physical lines', () => {
  const tree = [block('a', '\u7236\u5757\n\u7b2c\u4e8c\u884c', [block('b', '\u91cd\u590d'), block('c', '\u91cd\u590d')]), block('d', '\u6700\u540e')];
  const text = '- \u7236\u5757\r\n  \u7b2c\u4e8c\u884c\r\n\t- \u91cd\u590d\r\n\t- \u91cd\u590d\r\n- \u6700\u540e\r\n';
  const mapped = mapBlocks(text, tree);
  assert.deepEqual(mapped.map(item => [item.block.uuid, item.start]), [['a', 1], ['b', 3], ['c', 4], ['d', 5]]);
  assert.deepEqual(targetForLine(mapped, 4)?.location.ancestors, ['a']);
  assert.equal(cursorLine(1, '\u7236\u5757\n\u7b2c\u4e8c\u884c', 4), 2);
  assert.equal(targetForLine(mapped, 2)?.pos, 3);
});
test('page properties and headings are counted', () => {
  const pre = { ...block('p', 'title:: \u7b14\u8bb0\ntags:: test'), preBlock: true };
  const mapped = mapBlocks('\ufefftitle:: \u7b14\u8bb0\ntags:: test\n\n- # \u6807\u9898\n- \u6b63\u6587', [pre, block('h', '# \u6807\u9898'), block('b', '\u6b63\u6587')]);
  assert.deepEqual(mapped.map(item => item.start), [1, 4, 5]);
});
test('code fences and embedded list text do not steal another block', () => {
  const mapped = mapBlocks('- ```md\n  - \u91cd\u590d\n  ```\n- \u91cd\u590d', [block('code', '```md\n- \u91cd\u590d\n```'), block('real', '\u91cd\u590d')]);
  assert.equal(mapped[1].start, 4);
});
test('empty blocks, blank lines and trailing source newline', () => {
  const mapped = mapBlocks('- \n- \u7b2c\u4e00\u884c\n  \n  \u7b2c\u4e09\u884c\n\n- \u7ed3\u5c3e\n', [block('e', ''), block('a', '\u7b2c\u4e00\u884c\n\n\u7b2c\u4e09\u884c'), block('z', '\u7ed3\u5c3e\n')]);
  assert.deepEqual(mapped.map(item => item.start), [1, 2, 6]);
  assert.equal(targetForLine(mapped, 4)?.pos, 5);
  assert.equal(cursorLine(2, '\u7b2c\u4e00\u884c\r\n\u7b2c\u4e09\u884c', 5), 3);
});
test('stale source or incomplete trees fail instead of guessing', () => {
  assert.throws(() => mapBlocks('- old', [block('a', 'new')]));
  assert.throws(() => mapBlocks('- parent\n  - child', [{ ...block('a', 'parent'), children: [['uuid', 'b']] }]));
  assert.equal(targetForLine([], 1), null);
});
test('cursor reflects unsaved newlines within current block', () => {
  assert.equal(cursorLine(7, 'one\ntwo\nthree', 8), 9);
  assert.equal(cursorLine(7, '\u4e2d\u6587😀\n\u4e0b\u4e00\u884c', 5), 8);
});
test('empty blocks do not match preceding blank source lines', () => {
  const mapped = mapBlocks('- text\n\n- \n', [block('a', 'text'), block('b', '')]);
  assert.equal(mapped[1].start, 3);
});
