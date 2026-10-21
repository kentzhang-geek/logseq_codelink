// Run with: playwright-cli -s=codelink run-code --filename scripts/ui-smoke.cjs
// Requires a built plugin served at http://127.0.0.1:4174.
async (page) => {
  await page.addInitScript(() => {
    window.__LSP__HOST__ = true;
    const commands = {};
    const state = {
      commands, copied: '', visible: false, edits: [], messages: [], clipboard: null, clipboardDelay: 0, clipboardError: false,
      text: '- parent\n\t- child\n\t  second line\n',
    };
    window.__codelinkTest = state;
    const pageEntity = { id: 1, uuid: 'p', name: 'test', file: { id: 2 } };
    window.apis = { doAction: async () => state.text };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { state.copied = text; state.clipboard = text; },
      readText: async () => {
        const value = state.clipboard;
        const failure = state.clipboardError;
        if (state.clipboardDelay) await new Promise(resolve => setTimeout(resolve, state.clipboardDelay));
        if (failure) throw new Error('Clipboard read denied');
        return value;
      },
    } });
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
        registerBlockContextMenuItem: (label, callback) => { commands['block-context-copy'] = callback; state.contextMenuLabel = label; },
        getBlock: async uuid => ({ uuid, content: 'child\nsecond line', page: { id: 1 } }),
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
  await page.evaluate(async () => {
    const state = window.__codelinkTest;
    if (state.contextMenuLabel !== '复制 CodeLink（块首行）') throw new Error('Missing block context menu');
    await state.commands['block-context-copy']({ uuid: 'child' });
    if (state.copied !== 'codelink://D:/Notes/pages/test.md:2') throw new Error('Wrong block first-line link');
  });
  await page.keyboard.press('Alt+c');
  await page.waitForFunction(() => window.__codelinkTest.copied === 'codelink://D:/Notes/pages/test.md:1');
  await page.keyboard.press('Alt+g');
  await page.waitForFunction(() => document.querySelector('#codelink-input')?.value === 'codelink://D:/Notes/pages/test.md:1');
  await page.keyboard.press('Escape');
  for (const value of [null, 123, { type: 'image' }, '', 'ordinary text', 'codelink://invalid', 'codelink://D:/a.md:0']) {
    await page.evaluate(value => { window.__codelinkTest.clipboard = value; }, value);
    await page.keyboard.press('Alt+g');
    const input = page.getByRole('textbox', { name: 'CodeLink' });
    await input.waitFor();
    if (await input.inputValue() !== '') throw new Error('Invalid clipboard content was prefilled');
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => { window.__codelinkTest.clipboardError = true; });
  await page.keyboard.press('Alt+g');
  await page.getByRole('textbox', { name: 'CodeLink' }).fill('manual input');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const state = window.__codelinkTest;
    state.clipboardError = false;
    state.clipboard = 'codelink://D:/Notes/pages/test.md:3';
    state.clipboardDelay = 500;
  });
  await page.keyboard.press('Alt+g');
  await page.getByRole('textbox', { name: 'CodeLink' }).fill('user typed this');
  await page.waitForTimeout(600);
  if (await page.getByRole('textbox', { name: 'CodeLink' }).inputValue() !== 'user typed this') throw new Error('Delayed clipboard overwrote typing');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+g');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__codelinkTest.clipboard = 'not a codelink'; window.__codelinkTest.clipboardDelay = 0; });
  await page.keyboard.press('Alt+g');
  await page.waitForTimeout(600);
  if (await page.getByRole('textbox', { name: 'CodeLink' }).inputValue() !== '') throw new Error('Old clipboard read affected a new dialog');
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
  console.log('PASS: clipboard prefill, invalid/non-string clipboard, denied permission, delayed reads, copy, Enter, validation, Markdown cursor, Esc, board source highlight');
}
