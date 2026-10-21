import type { DesktopBridge } from './service';

type HostWindow = Pick<Window, 'document' | 'navigator'> & {
  apis?: { doAction(args: unknown[]): Promise<unknown> };
};

/** Logseq desktop's readFile IPC bridge; the official SDK has no graph-file reader. */
export function desktopBridge(host: HostWindow): DesktopBridge & { readClipboard(): Promise<unknown> } {
  return {
    async readClipboard() {
      return host.navigator.clipboard.readText();
    },
    async readText(path) {
      if (!host.apis?.doAction) throw new Error('此插件需要 Logseq 桌面文件版。');
      return host.apis.doAction(['readFile', path]);
    },
    async copyText(text) {
      try {
        await host.navigator.clipboard.writeText(text);
        return;
      } catch {
        // Electron versions with restrictive clipboard permissions still support copying a selection.
        const active = host.document.activeElement as HTMLElement | null;
        const textarea = host.document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-10000px;top:0';
        host.document.body.append(textarea);
        textarea.select();
        try {
          if (!host.document.execCommand('copy')) throw new Error('无法写入剪贴板，请检查 Logseq 的剪贴板权限。');
        } finally { textarea.remove(); active?.focus(); }
      }
    },
  };
}
