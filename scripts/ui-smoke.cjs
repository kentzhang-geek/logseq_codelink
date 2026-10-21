// Run with: playwright-cli -s=codelink run-code --filename scripts/ui-smoke.cjs
// Requires a built plugin served at http://127.0.0.1:4174.
async (page) => {
  await page.addInitScript(() => {
    window.__LSP__HOST__ = true;
    const commands = {};
    const state = {
      commands, copied: '', visible: false, edits: [], messages: [],
      text: '- parent\n\t- child\n\t  second line\n',
    };
    window.__codelinkTest = state;
    const pageEntity = { id: 1, uuid: 'p', name: 'test', file: { id: 2 } };
    window.apis = { doAction: async () => state.text };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { state.copied = text; } } });
    window.logseq = {
      ready: async callback => callback(),
      setMainUIInlineStyle: () => {},
      showMainUI: () => { state.visible = true; },
      hideMainUI: () => { state.visible = false; document.querySelector('#app').replaceChildren(); },
      get isMainUIVisible() { return state.visible; },
      App: {
        registerCommandPalette: (options, callback) => { commands[options.key] = callback; },
        getCurrentGraph: async () => ({ path: 'D:/Notes', name: 'Notes' }),
        pushState: async () => {},
      },
      Editor: {
        checkEditing: async () => false,
        getCurrentPage: async () => pageEntity,
        getPage: async () => pageEntity,
        getPageBlocksTree: async () => [{ uuid: 'parent', content: 'parent', children: [{ uuid: 'child', content: 'child\nsecond line' }] }],
        setBlockCollapsed: async () => {},
        scrollToBlockInPage: async () => {},
        editBlock: async (id, opts) => { state.edits.push([id, opts]); },
      },
      DB: { datascriptQuery: async query => query.includes(':find ?path .') ? 'pages/test.md' : [['pages/test.md', 'test', 'page'], ['whiteboards/test.edn', 'test', 'whiteboard']] },
      UI: { showMsg: async (text, type) => { state.messages.push({ text, type }); } },
    };
    document.addEventListener('keydown', event => {
      if (event.altKey && event.code === 'KeyG') { event.preventDefault(); commands['goto-codelink']?.(); }
      if (event.altKey && event.code === 'KeyC') { event.preventDefault(); commands['copy-codelink']?.(); }
    });
  });
  await page.goto('http://127.0.0.1:4174/');
  await page.waitForFunction(() => window.__codelinkTest?.commands['goto-codelink']);
  await page.keyboard.press('Alt+c');
  await page.waitForFunction(() => window.__codelinkTest.copied === 'codelink://D:/Notes/pages/test.md:1');
  await page.keyboard.press('Alt+g');
  await page.getByRole('textbox', { name: 'CodeLink' }).fill('codelink://D:/Other/pages/test.md:1');
  await page.keyboard.press('Enter');
  await page.getByRole('alert').filter({ hasText: '不属于' }).waitFor();
  await page.screenshot({ path: 'output/playwright/invalid-graph.png' });
  await page.getByRole('textbox', { name: 'CodeLink' }).fill('codelink://D:/Notes/pages/test.md:3');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__codelinkTest.visible);
  const edits = await page.evaluate(() => window.__codelinkTest.edits);
  if (JSON.stringify(edits) !== JSON.stringify([['child', { pos: 6 }]])) throw new Error(`Unexpected edits: ${JSON.stringify(edits)}`);
  await page.keyboard.press('Alt+g');
  await page.getByRole('textbox', { name: 'CodeLink' }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__codelinkTest.visible);
  await page.keyboard.press('Alt+g');
  await page.getByRole('textbox', { name: 'CodeLink' }).fill('codelink://D:/Notes/whiteboards/test.edn:2');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '源码 · 第 2 行' }).waitFor();
  await page.screenshot({ path: 'output/playwright/board-source.png' });
  const target = await page.locator('.source .target').textContent();
  if (!target?.includes('child')) throw new Error('Missing target line highlight');
  await page.getByRole('button', { name: '返回文档' }).click();
  await page.waitForFunction(() => !window.__codelinkTest.visible);
  console.log('PASS: copy, input autofocus, Enter, validation error, Markdown cursor, Esc, board source highlight');
}
