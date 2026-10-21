# Logseq CodeLink

在 Logseq 桌面文件版中，生成和跳转与 [kentzhang-geek/codelink](https://github.com/kentzhang-geek/codelink) 兼容的文件行号链接。

```text
codelink://D:/Notes/pages/hello.md:12
```

## 使用

| 快捷键 | 功能 |
| --- | --- |
| **Alt+C** | 将光标对应的文件实际行号链接复制到剪贴板；没有编辑光标时，复制当前文档的第 1 行链接。 |
| **Alt+G** | 打开单行输入框；剪贴板是有效的 codelink 字符串时自动预填，按 **Enter** 跳转；按 **Esc** 取消。其他内容或读取失败时保持为空，可手动粘贴。 |
| **Block 右键菜单 → Copy CodeLink (Block First Line)** | 复制右键所选块在文档中的起始行链接；多行块使用第一行，不依赖编辑光标。 |

也可以从 Logseq 命令面板运行「CodeLink：复制当前位置链接」和「CodeLink：输入链接并跳转」。快捷键冲突时，可在 Logseq 的快捷键设置中搜索 CodeLink 并重新绑定。

中文、空格、`#`、`%` 等路径字符会进行 URL 转义。解析时兼容未转义的中文和空格、Windows 反斜杠、`codelink://D/Notes/...:12` 这种丢失盘符冒号的链接，以及 URL 末尾多出的 `/`。行号从 **1** 开始，按文件实际换行计算，编辑器自动折行不增加行号。

## 安装

已构建的插件位于 `release/logseq-codelink/`，压缩包位于 `release/logseq-codelink-v0.1.3.zip`。无需安装 Node.js 或运行 npm。

1. 如果使用压缩包，先解压，保留整个 `logseq-codelink` 文件夹。
2. 在 Logseq 中启用「设置 → 高级 → 开发者模式」。
3. 打开「插件 → 加载未解压的插件（Load unpacked plugin）」。
4. 选择包含 `package.json` 的 `logseq-codelink` 文件夹。也可以直接选择已构建的本项目根目录。
5. 打开一个已经保存的页面，按 Alt+C，然后按 Alt+G 粘贴验证。

## 支持范围

- 支持本地文件知识库中，已经被 Logseq 索引为页面的 `.md` / `.markdown` 文件。
- 支持已索引的 UTF-8 文本 `.board`，以及 Logseq 原生白板 `.edn`。只有页面类型为 `whiteboard` 的 `.edn` 才会被接受，`logseq/config.edn` 不会被当作白板。
- Markdown 跳转会展开父块，滚动并进入对应块，将光标放到目标行开头。页首、块外空行或无法准确映射的源码，会打开页面并显示高亮源码行。
- 右键块左侧圆点，选择「Copy CodeLink (Block First Line)」。链接使用该块所属页面的文件路径，因此侧栏和引用中显示的块也按其原文档定位。白板画布块暂不支持源码首行映射，仍可用 Alt+C 生成白板文档链接。
- 白板使用画布，Logseq 没有白板文件行号编辑接口。因此白板链接会打开对应画布，并显示高亮的源码行；Alt+C 在白板画布上生成第 1 行链接。
- 非当前知识库、未索引文件、附件、其他扩展名、二进制或无效 UTF-8 文本、无效链接和越界行号都会报错。跨知识库链接需要先手动切换到目标知识库。
- 新建但尚未写入文件的页面需要先保存。Logseq 延迟写盘期间会短暂重试；仍未同步时提示稍后重试。生成链接不会退出编辑或修改笔记。
- 不支持无文件路径的数据库图谱、网页端和移动端。文件读取使用 Logseq 桌面端的 `apis.doAction(['readFile', path])` 桥接；如果未来版本变更该接口，需要相应适配。
- 本插件提供 Logseq 内的 Alt+G 跳转入口；系统级 `codelink://` 协议处理仍由原 codelink 工具负责。

## 开发与验证

```sh
npm ci
npm run check
npm run package
```

`npm run check` 运行链接解析、实际行号映射及模拟 Logseq API 的服务测试，并进行 TypeScript 检查和生产构建。`npm run dev` 持续构建，修改后在 Logseq 插件面板中重新加载。`npm run package` 生成可加载的发行文件夹和 zip 压缩包。

浏览器交互检查使用模拟 Logseq 宿主，覆盖复制、输入焦点、Enter、错误提示、Esc 和白板源码高亮；它不代替真实 Logseq 的加载验证：

```sh
npx vite preview --host 127.0.0.1 --port 4174
npx --package @playwright/cli playwright-cli -s=codelink open about:blank --browser msedge
npx --package @playwright/cli playwright-cli -s=codelink run-code --filename scripts/ui-smoke.cjs
```

手动验收：在保存后的 Markdown 页面中测试嵌套块、多行块和中文，复制后确认链接行号与文件一致；跳到折叠的子块并确认光标位置；退出编辑后复制应为第 1 行；测试其他知识库的链接、附件和越界行号；对白板确认画布及源码高亮。

依赖说明：为兼容桌面文件版，本项目使用官方稳定 SDK `@logseq/libs@0.0.17`。当前 `npm audit` 对该 SDK 及其 DOMPurify、lodash-es 依赖报告 2 项 high、1 项 critical 告警；官方更新版本位于 `next` 通道。此版本未完成 SDK 升级兼容验证，不能视为已通过依赖安全审计。

## 参考接口

- [codelink 文件行号生成实现](https://github.com/kentzhang-geek/codelink/blob/master/src/gen_by_file_line.rs)
- [Logseq Editor API](https://logseq.github.io/plugins/interfaces/IEditorProxy.html)
- [Logseq App API](https://logseq.github.io/plugins/interfaces/IAppProxy.html)
- [Logseq 桌面端 readFile 实现](https://github.com/logseq/logseq/blob/0.10.15/src/electron/electron/handler.cljs)

MIT License。
