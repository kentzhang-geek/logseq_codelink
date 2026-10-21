import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ILSPluginUser } from '@logseq/libs/dist/LSPlugin';
import { CodeLinkService, type SourcePreview } from '../src/service';

function fixture() {
  const page = { id: 1, uuid: 'page', name: '测试', file: { id: 2 }, type: 'page' };
  const child = { uuid: 'child', content: '子块\n第二行', page: { id: 1 } };
  const tree = [{ uuid: 'parent', content: '父块', children: [child] }];
  const state = {
    editing: 'child' as string | boolean,
    cursor: { pos: 4 } as { pos: number } | null,
    content: '子块\n第二行',
    text: '- 父块\n\t- 子块\n\t  第二行\n',
    file: 'pages/测试.md',
    rows: [['pages/测试.md', '测试', 'page']],
    copied: '', reads: [] as string[], navigated: [] as unknown[][],
    edits: [] as unknown[][], expanded: [] as unknown[][], scrolled: [] as unknown[][],
    previews: [] as SourcePreview[], graph: { path: 'D:/Notes', name: 'Notes' } as { path: string; name: string } | null,
    page, child, tree,
  };
  const sdk = {
    App: { getCurrentGraph: async () => state.graph, pushState: async (...args: unknown[]) => { state.navigated.push(args); } },
    Editor: {
      checkEditing: async () => state.editing,
      getBlock: async () => state.child,
      getEditingCursorPosition: async () => state.cursor,
      getEditingBlockContent: async () => state.content,
      getCurrentPage: async () => state.page,
      getPage: async () => state.page,
      getPageBlocksTree: async () => state.tree,
      setBlockCollapsed: async (...args: unknown[]) => { state.expanded.push(args); },
      scrollToBlockInPage: async (...args: unknown[]) => { state.scrolled.push(args); },
      editBlock: async (...args: unknown[]) => { state.edits.push(args); },
    },
    DB: { datascriptQuery: async (query: string) => query.includes(':find ?path .') ? state.file : state.rows },
  } as unknown as ILSPluginUser;
  const service = new CodeLinkService(sdk, {
    readText: async path => { state.reads.push(path); return state.text; },
    copyText: async text => { state.copied = text; },
  }, preview => { state.previews.push(preview); });
  return { service, state, sdk };
}
test('Alt+C resolves actual page file and current cursor row', async () => {
  const { service, state } = fixture();
  assert.equal(await service.copyCurrent(), 'codelink://D:/Notes/pages/%E6%B5%8B%E8%AF%95.md:3');
  assert.ok(state.copied.endsWith(':3'));
  assert.equal(state.edits.length, 0);
});
test('no editing cursor means line 1 even with an old selected block', async () => {
  const { service, state } = fixture();
  state.editing = false;
  assert.ok((await service.copyCurrent()).endsWith(':1'));
});
test('missing cursor falls back to document line 1', async () => {
  const { service, state } = fixture();
  state.cursor = null;
  assert.ok((await service.copyCurrent()).endsWith(':1'));
});
test('jump expands ancestors and edits the specific block line', async () => {
  const { service, state } = fixture();
  const result = await service.jump('codelink://d:/notes/pages/测试.md:3');
  assert.equal(result.previewed, false);
  assert.deepEqual(state.expanded, [['parent', false]]);
  assert.deepEqual(state.scrolled, [['测试', 'child']]);
  assert.deepEqual(state.edits, [['child', { pos: 3 }]]);
});
test('foreign graphs and unindexed Markdown are rejected before disk reads', async () => {
  const { service, state } = fixture();
  await assert.rejects(service.jump('codelink://D:/Other/pages/a.md:1'), /不属于/);
  await assert.rejects(service.jump('codelink://D:/Notes/assets/a.md:1'), /未索引|已索引/);
  assert.equal(state.reads.length, 0);
  assert.equal(state.navigated.length, 0);
});
test('unsupported indexed files and binary boards produce errors', async () => {
  const { service, state } = fixture();
  state.rows = [['pages/a.pdf', '测试', 'page']];
  await assert.rejects(service.jump('codelink://D:/Notes/pages/a.pdf:1'), /仅支持/);
  state.rows = [['whiteboards/a.edn', '测试', 'whiteboard']];
  state.text = '\0binary';
  await assert.rejects(service.jump('codelink://D:/Notes/whiteboards/a.edn:1'), /文本/);
  assert.equal(state.navigated.length, 0);
});
test('text whiteboard opens canvas with exact source-line preview', async () => {
  const { service, state } = fixture();
  state.rows = [['whiteboards/a.edn', '测试', 'whiteboard']];
  state.text = '{:blocks [\n {:content "text"}]}';
  const result = await service.jump('codelink://D:/Notes/whiteboards/a.edn:2');
  assert.equal(result.previewed, true);
  assert.deepEqual(state.navigated, [['whiteboard', { name: '测试' }]]);
  assert.equal(state.previews[0].line, 2);
  assert.equal(state.edits.length, 0);
});
test('board copying uses page line 1', async () => {
  const { service, state } = fixture();
  state.file = 'whiteboards/a.edn';
  state.page.type = 'whiteboard';
  assert.ok((await service.copyCurrent()).endsWith('/whiteboards/a.edn:1'));
});
test('out-of-range lines never navigate', async () => {
  const { service, state } = fixture();
  await assert.rejects(service.jump('codelink://D:/Notes/pages/测试.md:99'), /超出/);
  assert.equal(state.scrolled.length + state.navigated.length, 0);
});
test('empty page opens source instead of editing a nonexistent block', async () => {
  const { service, state } = fixture();
  state.tree = [];
  state.text = '';
  assert.equal((await service.jump('codelink://D:/Notes/pages/测试.md:1')).previewed, true);
  assert.equal(state.edits.length, 0);
});
test('missing local graph gives a clear error', async () => {
  const { service, state } = fixture();
  state.graph = null;
  await assert.rejects(service.copyCurrent(), /本地文件知识库/);
});

test('block context copy uses the clicked block first line rather than editing cursor', async () => {
  const { service, state, sdk } = fixture();
  sdk.Editor.getBlock = async uuid => {
    assert.equal(uuid, 'child');
    return state.child as never;
  };
  sdk.Editor.checkEditing = async () => { throw new Error('Must not read editing state'); };
  const link = await service.copyBlockStart('child');
  assert.equal(link, 'codelink://D:/Notes/pages/%E6%B5%8B%E8%AF%95.md:2');
  assert.equal(state.copied, link);
  assert.equal(state.edits.length, 0);
});

test('block context copy works with no cursor and resolves the block owning page', async () => {
  const { service, state, sdk } = fixture();
  state.editing = false;
  state.cursor = null;
  state.file = 'pages/侧栏页面.md';
  sdk.Editor.getCurrentPage = async () => { throw new Error('Must not use active page'); };
  sdk.Editor.getPage = async id => {
    assert.equal(id, state.child.page.id);
    return state.page as never;
  };
  assert.equal(await service.copyBlockStart('child'), 'codelink://D:/Notes/pages/%E4%BE%A7%E6%A0%8F%E9%A1%B5%E9%9D%A2.md:2');
});

test('deleted block context target reports error without replacing the clipboard', async () => {
  const { service, state, sdk } = fixture();
  state.copied = 'previous clipboard';
  sdk.Editor.getBlock = async () => null;
  await assert.rejects(service.copyBlockStart('missing'), /不存在/);
  assert.equal(state.copied, 'previous clipboard');
  assert.deepEqual(state.reads, []);
});
