# Logseq CodeLink

Copy and open file-and-line links in the file-based Logseq desktop app, using the format from [kentzhang-geek/codelink](https://github.com/kentzhang-geek/codelink).

```text
codelink://D:/Notes/pages/hello.md:12
```

## Usage

| Shortcut or menu item | Action |
| --- | --- |
| **Alt+C** | Copy a link to the physical file line at the editing cursor. Without an editing cursor, use line 1 of the current document. |
| **Alt+G** | Open the link input. Automatically prefill a valid codelink string from the clipboard. Press **Enter** to open it or **Esc** to cancel. Invalid contents or denied clipboard access leave the input empty for manual entry. |
| **Block context menu > Copy CodeLink (Block First Line)** | Copy a link to the first physical file line of the clicked block, regardless of the editing cursor. |

The command palette also provides **CodeLink: Copy Current Location** and **CodeLink: Open Link**. If a shortcut conflicts with another command, search for CodeLink in Logseq's keyboard shortcut settings and change its binding.

Unicode characters, spaces, `#`, `%`, and other path characters are URL-encoded when generating links. Parsing also accepts unescaped Unicode and spaces, Windows backslashes, a missing drive-letter colon such as `codelink://D/Notes/...:12`, and an extra trailing `/`. Line numbers start at **1** and count actual file line breaks. Visual wrapping does not add lines.

## Installation

The built plugin is in `release/logseq-codelink/`. The archive is `release/logseq-codelink-v0.1.4.zip`. Node.js and npm are not needed to use the built plugin.

1. If using the archive, extract it and keep the entire `logseq-codelink` folder.
2. Enable **Settings > Advanced > Developer mode** in Logseq.
3. Open **Plugins > Load unpacked plugin**.
4. Select the `logseq-codelink` folder containing `package.json`. You can also select this project's root directory after building it.
5. Open a saved page, press Alt+C, then press Alt+G and Enter to check the link.

## Supported documents and behavior

- Markdown files (`.md` / `.markdown`) must belong to the current local graph and be indexed by Logseq as pages.
- Text `.board` files and native Logseq whiteboard `.edn` files must be indexed and contain valid UTF-8 text. An `.edn` file is accepted only when its page type is `whiteboard`; `logseq/config.edn` is not a whiteboard.
- Markdown navigation expands ancestors, scrolls to the target block, and places the cursor at the start of the linked line. Page prefixes, blank lines outside blocks, and source that cannot be reliably mapped to an editing block open in a source preview with the target line highlighted.
- Right-click the dot beside a block and choose **Copy CodeLink (Block First Line)**. The link uses the block's own page, including blocks displayed in the sidebar or in references. Whiteboard canvas blocks cannot currently be mapped to their first source line; use Alt+C for the whiteboard document link.
- Whiteboards use a canvas without a file-line editing API. A whiteboard link opens the canvas and shows a source preview with the target line highlighted. Alt+C on the canvas uses line 1.
- Links to other graphs, unindexed files, attachments, unsupported file types, binary or invalid UTF-8 content, malformed links, and out-of-range lines produce errors. Switch graphs manually before opening a link to another graph.
- New pages must be saved to files first. The plugin briefly retries while Logseq's delayed file writer catches up. If the content remains out of sync, it asks you to try again. Copying a link does not leave editing mode or modify notes.
- Database graphs without file paths, the web app, and mobile apps are not supported. File reads use the desktop bridge `apis.doAction(['readFile', path])`; changes to that bridge in future Logseq versions may require updates.
- Alt+G handles links inside Logseq. The original codelink tool remains responsible for the operating system's `codelink://` protocol handler.

## Development and verification

```sh
npm ci
npm run check
npm run package
```

`npm run check` runs link parsing, physical line mapping, and service tests with a mocked Logseq API, followed by TypeScript checking and a production build. `npm run dev` continuously rebuilds the plugin; reload it in Logseq after making changes. `npm run package` creates the unpacked plugin and a ZIP archive.

The browser smoke check uses a mocked Logseq host. It covers block context menu registration and copying, clipboard prefill, input focus, Enter, validation errors, Esc, Markdown navigation, and whiteboard source highlighting. It does not replace loading the plugin in the real Logseq desktop app.

```sh
npx vite preview --host 127.0.0.1 --port 4174
npx --package @playwright/cli playwright-cli -s=codelink open about:blank --browser msedge
npx --package @playwright/cli playwright-cli -s=codelink run-code --filename scripts/ui-smoke.cjs
```

For manual acceptance, check nested and multiline blocks and Unicode paths in a saved Markdown page. Compare copied line numbers with the file, navigate to a collapsed child, and confirm the editing cursor position. Without a cursor, copying should use line 1. Check links to another graph, attachments, and out-of-range lines. For whiteboards, confirm both the canvas and the highlighted source line.

All project source, comments, UI text, test descriptions, and documentation use English. Unicode fixtures use escape sequences to preserve encoding coverage without adding non-English text to source files.

Dependency note: this project uses the official stable SDK `@logseq/libs@0.0.17` for desktop file-graph compatibility. The dependency audit performed during initial development reported two high-severity issues and one critical issue in the SDK and its DOMPurify and lodash-es dependencies. Newer SDK versions were available through the `next` channel. SDK upgrade compatibility has not been verified, and this release has not passed a dependency security audit.

## API references

- [codelink file-and-line generation](https://github.com/kentzhang-geek/codelink/blob/master/src/gen_by_file_line.rs)
- [Logseq Editor API](https://logseq.github.io/plugins/interfaces/IEditorProxy.html)
- [Logseq App API](https://logseq.github.io/plugins/interfaces/IAppProxy.html)
- [Logseq desktop readFile implementation](https://github.com/logseq/logseq/blob/0.10.15/src/electron/electron/handler.cljs)

MIT License.
