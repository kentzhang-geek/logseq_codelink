import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorLine, mapBlocks, targetForLine, type OutlineBlock } from '../src/lines';

const block = (uuid: string, content: string, children?: OutlineBlock[]): OutlineBlock => ({ uuid, content, children });
test('nested blocks, duplicate text, Unicode and CRLF use physical lines', () => {
  const tree = [block('a', '父块\n第二行', [block('b', '重复'), block('c', '重复')]), block('d', '最后')];
  const text = '- 父块\r\n  第二行\r\n\t- 重复\r\n\t- 重复\r\n- 最后\r\n';
  const mapped = mapBlocks(text, tree);
  assert.deepEqual(mapped.map(item => [item.block.uuid, item.start]), [['a', 1], ['b', 3], ['c', 4], ['d', 5]]);
  assert.deepEqual(targetForLine(mapped, 4)?.location.ancestors, ['a']);
  assert.equal(cursorLine(1, '父块\n第二行', 4), 2);
  assert.equal(targetForLine(mapped, 2)?.pos, 3);
});
test('page properties and headings are counted', () => {
  const pre = { ...block('p', 'title:: 笔记\ntags:: test'), preBlock: true };
  const mapped = mapBlocks('\ufefftitle:: 笔记\ntags:: test\n\n- # 标题\n- 正文', [pre, block('h', '# 标题'), block('b', '正文')]);
  assert.deepEqual(mapped.map(item => item.start), [1, 4, 5]);
});
test('code fences and embedded list text do not steal another block', () => {
  const mapped = mapBlocks('- ```md\n  - 重复\n  ```\n- 重复', [block('code', '```md\n- 重复\n```'), block('real', '重复')]);
  assert.equal(mapped[1].start, 4);
});
test('empty blocks, blank lines and trailing source newline', () => {
  const mapped = mapBlocks('- \n- 第一行\n  \n  第三行\n\n- 结尾\n', [block('e', ''), block('a', '第一行\n\n第三行'), block('z', '结尾\n')]);
  assert.deepEqual(mapped.map(item => item.start), [1, 2, 6]);
  assert.equal(targetForLine(mapped, 4)?.pos, 5);
  assert.equal(cursorLine(2, '第一行\r\n第三行', 5), 3);
});
test('stale source or incomplete trees fail instead of guessing', () => {
  assert.throws(() => mapBlocks('- old', [block('a', 'new')]));
  assert.throws(() => mapBlocks('- parent\n  - child', [{ ...block('a', 'parent'), children: [['uuid', 'b']] }]));
  assert.equal(targetForLine([], 1), null);
});
test('cursor reflects unsaved newlines within current block', () => {
  assert.equal(cursorLine(7, 'one\ntwo\nthree', 8), 9);
  assert.equal(cursorLine(7, '中文😀\n下一行', 5), 8);
});
test('empty blocks do not match preceding blank source lines', () => {
  const mapped = mapBlocks('- text\n\n- \n', [block('a', 'text'), block('b', '')]);
  assert.equal(mapped[1].start, 3);
});
