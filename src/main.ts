import '@logseq/libs';
import { desktopBridge } from './desktop';
import { CodeLinkService, type SourcePreview } from './service';
import { splitLines } from './lines';
import { parseCodeLink } from './codelink';
import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;
let busy = false;
let copyBusy = false;
let dialogGeneration = 0;
let previewed = false;

function close(restoreEditingCursor = true) {
  dialogGeneration++;
  logseq.hideMainUI({ restoreEditingCursor });
}

function shell(title: string, description: string): HTMLElement {
  app.replaceChildren();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.addEventListener('click', event => { if (event.target === overlay && !busy) close(); });
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'dialog-title');
  const heading = document.createElement('h1');
  heading.id = 'dialog-title';
  heading.textContent = title;
  const help = document.createElement('p');
  help.textContent = description;
  panel.append(heading, help);
  overlay.append(panel);
  app.append(overlay);
  return panel;
}

function showSource(source: SourcePreview) {
  previewed = true;
  const panel = shell(`源码 · 第 ${source.line} 行`, source.reason);
  const path = document.createElement('p');
  path.className = 'path';
  path.textContent = source.path;
  const pre = document.createElement('pre');
  pre.className = 'source';
  pre.tabIndex = 0;
  const lines = splitLines(source.text);
  // Only render a bounded window even if the whiteboard EDN file is huge.
  const first = Math.max(0, source.line - 21);
  const last = Math.min(lines.length, source.line + 20);
  for (let row = first; row < last; row++) {
    const line = document.createElement('div');
    line.className = row + 1 === source.line ? 'source-line target' : 'source-line';
    const number = document.createElement('span');
    number.className = 'line-number';
    number.textContent = String(row + 1);
    const content = document.createElement('span');
    content.textContent = lines[row] || ' ';
    line.append(number, content);
    pre.append(line);
  }
  const button = document.createElement('button');
  button.textContent = '返回文档';
  button.addEventListener('click', () => close(false));
  panel.append(path, pre, button);
  logseq.showMainUI({ autoFocus: true });
  requestAnimationFrame(() => {
    pre.querySelector('.target')?.scrollIntoView({ block: 'center' });
    button.focus();
  });
}

const desktop = desktopBridge(window.parent);
const service = new CodeLinkService(logseq, desktop, showSource);

async function copyCurrent() {
  if (copyBusy || logseq.isMainUIVisible) return;
  copyBusy = true;
  try {
    await service.copyCurrent();
    await logseq.UI.showMsg('CodeLink 已复制到剪贴板。', 'success');
  } catch (error) {
    await logseq.UI.showMsg(error instanceof Error ? error.message : '生成 CodeLink 失败。', 'error');
  } finally { copyBusy = false; }
}

function openJump() {
  if (busy) return;
  const generation = ++dialogGeneration;
  previewed = false;
  const panel = shell('跳转 CodeLink', '粘贴一行 codelink，按 Enter 跳转；Esc 取消。');
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.htmlFor = 'codelink-input';
  label.textContent = 'CodeLink';
  const input = document.createElement('input');
  input.id = 'codelink-input';
  input.type = 'text';
  input.placeholder = 'codelink://D:/Notes/pages/我的笔记.md:12';
  input.autocomplete = 'off';
  input.spellcheck = false;
  let edited = false;
  input.addEventListener('input', () => { edited = true; });
  const error = document.createElement('p');
  error.id = 'codelink-error';
  error.className = 'error';
  error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', error.id);
  const actions = document.createElement('div');
  actions.className = 'actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => { if (!busy) close(); });
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '跳转 ↵';
  actions.append(cancel, submit);
  form.append(label, input, error, actions);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!input.value.trim()) { error.textContent = '请输入 codelink。'; input.focus(); return; }
    busy = true;
    submit.disabled = true;
    input.disabled = true;
    submit.textContent = '正在定位…';
    error.textContent = '';
    try {
      await service.jump(input.value);
      if (!previewed) close(false);
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : '跳转失败，请重试。';
    } finally {
      busy = false;
      submit.disabled = false;
      input.disabled = false;
      submit.textContent = '跳转 ↵';
      if (generation === dialogGeneration && !previewed) input.focus();
    }
  });
  panel.append(form);
  logseq.showMainUI({ autoFocus: true });
  requestAnimationFrame(() => input.focus());
  void (async () => {
    try {
      const text = await desktop.readClipboard();
      if (typeof text !== 'string') return;
      parseCodeLink(text);
      // A delayed clipboard read must not replace typing or a newer dialog.
      if (generation !== dialogGeneration || edited || busy || previewed || !input.isConnected) return;
      input.value = text.trim();
      if (document.activeElement === input) input.select();
    } catch {
      // Empty/invalid clipboard contents and denied permissions leave manual input available.
    }
  })();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
  if (event.key === 'Tab') {
    const focusable = [...app.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

logseq.ready(() => {
  logseq.setMainUIInlineStyle({ zIndex: 1000 });
  logseq.App.registerCommandPalette({
    key: 'copy-codelink', label: 'CodeLink：复制当前位置链接',
    keybinding: { binding: 'alt+c', mode: 'global' },
  }, copyCurrent);
  logseq.App.registerCommandPalette({
    key: 'goto-codelink', label: 'CodeLink：输入链接并跳转',
    keybinding: { binding: 'alt+g', mode: 'global' },
  }, openJump);
}).catch(console.error);
