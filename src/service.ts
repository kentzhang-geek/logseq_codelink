import type { AppGraphInfo, BlockEntity, ILSPluginUser, PageEntity } from '@logseq/libs/dist/LSPlugin';
import { assertText, createCodeLink, documentKind, isInGraph, normalizePath, parseCodeLink, pathKey, resolveGraphPath } from './codelink';
import { cursorLine, mapBlocks, splitLines, targetForLine, type OutlineBlock } from './lines';

export interface DesktopBridge {
  readText(path: string): Promise<unknown>;
  copyText(text: string): Promise<void>;
}
export interface SourcePreview { path: string; line: number; text: string; reason: string }
interface GraphDocument {
  page: PageEntity;
  path: string;
  kind: 'markdown' | 'board';
}
export const PAGE_FILES_QUERY = `[:find ?path ?name ?type
  :where [?page :block/file ?file] [?file :file/path ?path]
  [?page :block/name ?name] [(get-else $ ?page :block/type "page") ?type]]`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class CodeLinkService {
  constructor(
    private sdk: ILSPluginUser,
    private desktop: DesktopBridge,
    private preview: (value: SourcePreview) => void,
  ) {}

  private async graph(): Promise<AppGraphInfo> {
    const graph = await this.sdk.App.getCurrentGraph();
    if (!graph?.path) throw new Error('Open a local file-based graph first. Database graphs do not have file line numbers.');
    normalizePath(graph.path);
    return graph;
  }

  private async currentDocument(graph: AppGraphInfo, block: BlockEntity | null): Promise<GraphDocument> {
    let current = block ? await this.sdk.Editor.getPage(block.page.id) : await this.sdk.Editor.getCurrentPage();
    // A zoomed block can be returned instead of a page.
    if (current && !('name' in current) && 'page' in current) {
      current = await this.sdk.Editor.getPage((current as BlockEntity).page.id);
    }
    const page = current as PageEntity | null;
    if (!page?.name) throw new Error('Open a specific Logseq document before generating a link.');
    const file = page.file;
    if (!file) throw new Error('The current page has not been saved to a file. Save it first.');
    const filePath = typeof file.path === 'string' ? file.path : await this.sdk.DB.datascriptQuery<string | null>(
      '[:find ?path . :in $ ?id :where [?id :file/path ?path]]', file.id,
    );
    if (!filePath) throw new Error('Cannot find the file for the current page.');
    const path = resolveGraphPath(graph.path, filePath);
    if (!isInGraph(path, graph.path)) throw new Error('The current document does not belong to the current graph.');
    return { page, path, kind: documentKind(path, page.type) };
  }

  private async read(path: string): Promise<string> {
    let content: unknown;
    try { content = await this.desktop.readText(path); }
    catch { throw new Error('Cannot read the target file. Check that it exists and that you have read permission.'); }
    assertText(content);
    return content;
  }

  /** Short retries cover Logseq's delayed file writer, without changing the document. */
  private async mapped(document: GraphDocument): Promise<{ text: string; locations: ReturnType<typeof mapBlocks> }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      const text = await this.read(document.path);
      const tree = await this.sdk.Editor.getPageBlocksTree(document.page.name);
      try { return { text, locations: mapBlocks(text, (tree ?? []) as OutlineBlock[]) }; }
      catch (error) { lastError = error; }
      if (attempt < 4) await delay(300);
    }
    throw lastError;
  }

  async copyCurrent(): Promise<string> {
    // Capture editing state before any dialog can take focus. A selected block is not a cursor.
    const editing = await this.sdk.Editor.checkEditing();
    const block = typeof editing === 'string' ? await this.sdk.Editor.getBlock(editing) : null;
    const cursor = block ? await this.sdk.Editor.getEditingCursorPosition() : null;
    const editingContent = cursor ? await this.sdk.Editor.getEditingBlockContent() : null;
    const graph = await this.graph();
    const document = await this.currentDocument(graph, block);
    let line = 1;
    if (document.kind === 'markdown' && block && cursor && typeof editingContent === 'string') {
      const { locations } = await this.mapped(document);
      const location = locations.find(item => item.block.uuid === block.uuid);
      if (!location) throw new Error('Cannot find the file line for the cursor block. Wait for the page to save and try again.');
      line = cursorLine(location.start, editingContent, cursor.pos);
    } else {
      // Also reject binary boards when copying a page-level link.
      await this.read(document.path);
    }
    const link = createCodeLink(document.path, line);
    await this.desktop.copyText(link);
    return link;
  }

  async copyBlockStart(uuid: string): Promise<string> {
    const block = await this.sdk.Editor.getBlock(uuid);
    if (!block) throw new Error('The selected block no longer exists. Refresh the page and try again.');
    const graph = await this.graph();
    // Resolve the clicked block's own page, including blocks shown in the sidebar or references.
    const document = await this.currentDocument(graph, block);
    if (document.kind !== 'markdown') {
      throw new Error('Whiteboard canvas blocks cannot be reliably mapped to source lines. Use Alt+C to copy the whiteboard document link.');
    }
    const { locations } = await this.mapped(document);
    const location = locations.find(item => item.block.uuid === uuid);
    if (!location) throw new Error('Cannot find the file line for the selected block. Wait for the page to save and try again.');
    const link = createCodeLink(document.path, location.start);
    await this.desktop.copyText(link);
    return link;
  }

  async jump(input: string): Promise<{ path: string; line: number; previewed: boolean }> {
    const link = parseCodeLink(input);
    const graph = await this.graph();
    if (!isInGraph(link.path, graph.path)) throw new Error('The target does not belong to the current Logseq graph. Switch to its graph first.');
    // An extension or directory alone does not prove that this is a Logseq page.
    const rows = await this.sdk.DB.datascriptQuery<[string, string, string][]>(PAGE_FILES_QUERY);
    const matches = (rows ?? []).filter(([file]) => pathKey(resolveGraphPath(graph.path, file)) === pathKey(link.path));
    if (matches.length !== 1) throw new Error(matches.length ? 'This file belongs to multiple Logseq pages. Cannot determine the target.' : 'The target is not an indexed Logseq document in the current graph.');
    const [file, name, type] = matches[0];
    const path = resolveGraphPath(graph.path, file);
    const kind = documentKind(path, type);
    const page = await this.sdk.Editor.getPage(name);
    if (!page) throw new Error('The target Logseq page does not exist. Re-index the graph and try again.');
    const text = await this.read(path);
    if (link.line > splitLines(text).length) throw new Error(`The line number is out of range. The file has ${splitLines(text).length} lines.`);
    if (kind === 'board') {
      await this.sdk.App.pushState('whiteboard', { name: page.name });
      this.preview({ path, line: link.line, text, reason: 'The whiteboard uses a canvas view. The linked source line is highlighted below.' });
      return { path, line: link.line, previewed: true };
    }

    const document = { page, path, kind };
    let mapped: Awaited<ReturnType<CodeLinkService['mapped']>>;
    try { mapped = await this.mapped(document); }
    catch {
      await this.sdk.App.pushState('page', { name: page.name });
      this.preview({ path, line: link.line, text, reason: 'Cannot reliably map this line to an editor block. The document is open and its source line is highlighted below.' });
      return { path, line: link.line, previewed: true };
    }
    if (link.line > splitLines(mapped.text).length) throw new Error('The file has changed and the target line no longer exists.');
    const target = targetForLine(mapped.locations, link.line);
    if (!target || link.line >= target.location.start + target.location.contentLines.length) {
      await this.sdk.App.pushState('page', { name: page.name });
      this.preview({ path, line: link.line, text: mapped.text, reason: 'The target line is a page prefix, a blank line, or source outside a block. It is highlighted below.' });
      return { path, line: link.line, previewed: true };
    }
    for (const uuid of target.location.ancestors) await this.sdk.Editor.setBlockCollapsed(uuid, false);
    await this.sdk.Editor.scrollToBlockInPage(page.name, target.location.block.uuid);
    await this.sdk.Editor.editBlock(target.location.block.uuid, { pos: target.pos });
    return { path, line: link.line, previewed: false };
  }
}
