# DSH 0.2.2-rc.1 → 0.2.2-rc.3 差异调研(dsh-prompt-optimizer 面向面)

调研日期:2026-11-16
调研对象:上游 `github.com/deepseek-ai/deepseek-harness` tag `dsh-v0.2.2-rc.1` → `dsh-v0.2.2-rc.3`(中间含 `dsh-v0.2.2-rc.2`,2026-11-11 发布;rc.3 于 2026-11-13 发布);本机桌面端 `E:\DSH\resources\app.asar`(顶层 `@deepseek-ai/dsh-desktop@0.2.2-rc.3`,runtime 树 `dsh/node_modules` 338 个 `@deepseek-ai/*` 包中 328 个为 0.2.2-rc.3,其余为 vendor)+ npm 上 `@deepseek-ai/*@0.2.2-rc.1` / `@0.2.2-rc.3` 的 tarball。

**结论先行:本插件在 0.2.2-rc.3 上可无损升级,平台契约面全部保持,`src/` 零改动。** 插件依赖的三个槽位(`conversation.input.right`、`conversation.input.dock`、`settings.plugins.tab`)声明块与 rc.1 **逐字节相同**(块哈希也与 rc.5 时代一致);composer 标准 props(`SessionStandardProps` 块)、`InputActions.setDraft`、`InputState.draft`、`InputState.phase`(含 `'sending'`)全部保持;`session/modelCatalog` RPC 与 `ctx.sessions.binding().eventSource.entries` 事件窗口仍在;桌面端 `staticModules` 基线与 ModuleLoader 包装形态不变;vendor 版本线(cordis 4.1.0 / schemastery 3.19.0)不变。rc.2 是大功能版(Git Worktree 审阅、具名多层 SubAgent/AgentTeam、文档级粘贴路由、失败重试「继续生成」、菜单定位重构等),rc.3 是小修版(实验性 DeepSeek 会话导入插件 + Windows 桌面更新修复);对插件而言全部是加法或内部重构。本版为纯声明层适配:类型基线 20 包(新增 `dsh-error`)钉到 rc.3、devDeps 同版本、lock 重生成、版本/文档更新,并在真实 rc.3 Web 上完成两次成功产出优化稿的端到端验证。

---

## 0. 调研方法与基线(可复现)

1. **上游语义**:`gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.1...dsh-v0.2.2-rc.3`。compare 显示 **1574 个 commit ahead**(API 的 commits 列表返回前 250 个),`files` 返回上限 300 个;rc.2 / rc.3 的 release notes 分别汇总了用户与开发者变更。
2. **npm 类型实测**:对插件类型基线的 19 个包 + `dsh-llm` / `dsh-api-session-controller` / `dsh-settings` / `dsh-package-manifest` 共 **23 个包**,用 `npm pack` 下载 `0.2.2-rc.1` 与 `0.2.2-rc.3` 两组 tarball,解包后对全部文件做**逐文件字节比对**,`package.json` 做字段级 diff。
3. **桌面端实测**:用自写 ASAR header reader 读取 `E:\DSH\resources\app.asar`,取 `dsh/node_modules` 全部 `@deepseek-ai/*` 包版本、`dsh-web-frontend` 的 `staticModules` 映射;runtime CLI `E:\DSH\resources\runtime\cli\bin\dsh.cmd --version` = `0.2.2-rc.3`。
4. **关键契约块哈希**:对槽位声明块、`SessionStandardProps` 块逐块取 SHA-256 前 16 位,确认「块级相同」而不是整文件相同(注释改动不影响契约)。
5. **插件侧实测**:工作区钉基线与 `node_modules` 均为 0.2.2-rc.3,跑 `tsc --noEmit`、`npm test`(5 套 / 100 项);并用官方桌面端自带的 rc.3 runtime CLI 引导独立 profile `po-rc3-test`,安装本版 tgz 后做真实 Web 端到端(无头 Chrome/CDP)。

### 0.1 与插件相关的上游主线变化(节选)

| 主题 | 版本 | 内容 | 与本插件的关系 |
|---|---|---|---|
| hoc 槽位 | rc.2 起 | `SlotKind` 新增 `'hoc'`(嵌套包装层),`renderSlot` 增加 hoc 重载、`HocRenderOpts` / `HocShare`;新槽位 `conversation.hero.frame` | 加法;插件注册的仍是 `list` 槽位,不受影响 |
| 文档级粘贴路由 | rc.2 | 未聚焦输入框时粘贴可进最近可用 composer;`ComposerBarInjected.registerFileIntake`、`ComposerBarOwnerProps.occurrence` | 加法;插件不注册 composer,不占 `conversation.input.attachments` |
| 引用摘要 | rc.2 | `insertQuote(text, summary?)` 新增可选 `QuoteSummary`(来自 ui-primitives) | 加法;插件只读写纯文本草稿,不调 `insertQuote` |
| 失败重试 | rc.2 | 「继续生成」:`submit(mode, source, allowEmpty?)`、`ComposerBarInjected.retry(failureSeq)`、`enter` 提交新增 `allowEmpty` | 加法;插件不经过提交链 |
| 菜单定位 | rc.2 | 缩放/平移/长列表下菜单对齐新定位接口(ui-primitives 移除 `useAnchoredPosition`,新增 `useMenuSubmenu` / `MenuRow` / `SubmenuPanel`) | 插件结果面板是 dock 内联卡片,仅剪贴板兜底 textarea 挂 body;E2E 确认不受影响 |
| LLM 错误分类 | rc.2 | `HarnessError` 基类拆进新包 `@deepseek-ai/dsh-error`(dsh-llm / dsh-attachment 改为导入并再导出);`LlmError` 构造收紧为 `BuiltinLlmFailureCode`,新增 `LlmError.fromFailure`;`LLM_FAILURE_CODES` 全量分类 | 插件只读 `finish.reason.failure.code/message`,不构造 `LlmError`,不受影响;类型基线新增钉 `dsh-error` |
| UA 署名 | rc.2 | `AppIdentity.suffix`(读 `DSH_USER_AGENT_SUFFIX`)追加到 User-Agent | 加法;插件不传 identity |
| 会话批量追加 | rc.2 | `SessionSurface.prepareBatch`、`Session.appendBatch`、`currentBatchPublication`;新事件类型 `team/mode` | 内部重构;插件只读事件窗口 `entries`,形状不变 |
| 历史加载 | rc.2 | 向上回看自动加载更早消息:`loadOlder(options?)` + `consumeOlder()`;`SessionOptions.parentAvailable` 移除,子代理中断改 `interruptByUser` | 内部重构;插件不 retain / 不翻页,只读已灌好的窗口 |
| 会话导入 | rc.3 | 实验性 DeepSeek 会话导入插件 | 新插件生态加法,与本插件无关 |
| 桌面更新 | rc.3 | 修复 Windows 应用内更新失败/无法自动重开 | 桌面壳修复,与插件无关 |
| 打包面 | rc.2 起 | 全部 npm tarball 新增 `src/` 与 `.map`(`files` 字段变化) | 仅包体变大;`sync:types` 只取 `package.json` + `lib`,行为不变 |
| 版本线 | rc.1 → rc.3 | vendor `cordis 4.1.0` / `schemastery 3.19.0` / `cosmokit 1.9.0` **不变**;dsh-llm 的 `zod` 4.4.3 → 4.6.6 | 插件 devDep/运行时依赖无需再升 |

---

## 1. 汇总表

| 面向面 | 0.2.2-rc.3 状态 | 对本插件的影响 | 处置 |
|---|---|---|---|
| `conversation.input.right` | **声明块逐字节相同**(`kind:'list'`、`scope:'session'`,哈希 `42609d09c15c01e2`) | 无 | 无需改 |
| `conversation.input.dock` | **声明块逐字节相同**(哈希 `3877c57ff1a60932`) | 无 | 无需改 |
| composer 标准 props(`useInput`/`inputActions`/`sessionId`) | **`SessionStandardProps` 块逐字节相同**(哈希 `a88c9594ca61cd76`) | 按钮/面板读写草稿路径不变 | 无需改 |
| `InputActions.setDraft` / `InputState.draft` | **签名与字段逐字节相同** | 「替换输入框/撤回」不变 | 无需改 |
| `InputState.phase` | **五值联合不变**(含 `'sending'`) | 「发送即关闭」判定不变 | 无需改 |
| `settings.plugins.tab` | **声明块逐字节相同**(哈希 `2e49302e62eee7c7`);运行时 bundle 仍在 | 设置标签页路径不变 | 无需改 |
| `settings.plugin.item`(0.1.x legacy) | **仍不存在**(类型与运行时 0 命中) | 独立 `inject` 守卫前提仍成立 | 无需改 |
| `ui-slots` | 新增 `'hoc'` kind 与配套类型/运行时(约 34 行);`register`/`inject` 既有语义不变 | 加法 | 无需改 |
| `ui-conversation` | `insertQuote` +`summary`、`enter` +`allowEmpty`、composer bar +`occurrence`/`registerFileIntake`/`retry`、新槽位 `conversation.hero.frame`、`ConversationUpdateError` 重建语义、context-menu `sessionHeader` 目标 | 全部加法/内部;`setDraft`/`draft`/`phase` 不变 | 无需改 |
| `ui-settings` | `openSettings(sectionId?)` 可选参数 | 加法;插件不调用 | 无需改 |
| `ui-renderer` | 运行时重建 + locale/README 更新 | `ctx.slots` 合并来源不变 | 无需改 |
| `dsh-llm` | 公开方法面(`stream`/`listModels`/`listProviders`/`resolveModelInfo`)不变;错误分类重构(见 §2.3)、attribution suffix、zod 4.6.6 | 插件不构造 `LlmError`、不传 identity | 无需改 |
| `dsh-session` / `dsh-session-projection` | 批量追加/投影缓存版本语义(内部);事件窗口 `entries` 保持 | 插件只读 `binding(id).eventSource.getSnapshot().entries` | 无需改 |
| `dsh-api-session-controller` | 历史加载机制与子代理中断重构(内部);**`modelCatalog` RPC 仍在**,`binding()` / `eventSource` / `entries` 仍在 | 插件实际使用面保持 | 无需改 |
| `dsh-api-remotes` | 新增 `web/providers-changed` 事件 | 加法 | 无需改 |
| `dsh-attachment` | `AttachmentError` 改继承 `dsh-error` 的 `HarnessError` | 插件不消费 | 无需改 |
| `dsh-client-ui-primitives` | 菜单子菜单定位重构、Markdown copy-tex/diff-fence/FenceBlocks、CSS 更新 | 插件不直接消费 primitives | 无需改 |
| `dsh-tools` / `dsh-commands` 等 | 管线 error-codes 拆分、typert 重建 | 插件不消费 | 无需改 |
| `dsh-client-connection` | `client.browser.js` 压缩重建,**ModuleLoader 包装形态不变** | 插件 client bundle 的 banner/footer 形态仍对齐 | 无需改 |
| 桌面端 `staticModules` 基线 | **完全相同**:react / react/jsx-runtime / react-dom / react-dom/client / cordis / zod / @tanstack/react-virtual / client-store / ui-slots / ui-primitives / ui-dockkit | 插件 client bundle 只 `require` react、react/jsx-runtime | 无需改 |
| 桌面端运行时布局 | app.asar 顶层 `node_modules` 收窄为 8 包,完整 runtime 树移入 `dsh/node_modules`(338 包);CLI 经 `dsh-desktop-host/lib/cli.js` 以 Electron RUN_AS_NODE 启动 | 安装/引导路径不变(`runtime/cli/bin/dsh.cmd` 仍在) | 无需改 |
| `cordis` / `schemastery` | **4.1.0 / 3.19.0 不变** | 插件依赖无需再升 | 无需改 |
| 类型基线 / lock / 版本号 | 本轮已升 0.2.2-rc.3(20 包,新增 `dsh-error`) | 决定 typecheck 与 CI | **已改** |

---

## 2. 逐项证据

### 2.1 槽位与 composer 标准 props(块级哈希)

对槽位声明块做 SHA-256 前 16 位(声明块本身,不含周围注释):

| 块 | rc.1 | rc.3 | 结果 |
|---|---|---|---|
| `conversation.input.right` | `42609d09c15c01e2` | `42609d09c15c01e2` | 相同 |
| `conversation.input.dock` | `3877c57ff1a60932` | `3877c57ff1a60932` | 相同 |
| `settings.plugins.tab` | `2e49302e62eee7c7` | `2e49302e62eee7c7` | 相同 |
| `SessionStandardProps`(ui-conversation) | `a88c9594ca61cd76` | `a88c9594ca61cd76` | 相同 |

`InputActions.setDraft(text: string): void`、`InputState.draft: string`、`InputState.phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting' | 'sending'` 两版逐字相同。运行时侧:rc.3 的 `ui-conversation/lib/client.js` 仍声明两个 composer 槽位,`ui-settings-plugins/lib/client.js` 仍含 `settings.plugins.tab`、仍不含 `settings.plugin.item`。

### 2.2 hoc 槽位与 composer 加法

- `SlotKind` 从四值扩为五值(新增 `'hoc'`),`ComposedProps` 增加 `HocShare`(非 hoc 槽位为 `object`,不影响既有组件 props);`KindOptions` 为 hoc 增加 `id/key/order` 分支。插件注册 `list` 槽位的选项形状(`name/id/order/inject`)不变。
- `ComposerBarOwnerProps` 新增必填 `occurrence`、`ComposerBarInjected` 新增 `registerFileIntake` / `retry`:这些是**宿主 resident composer bar 的私有注入面**,只影响 `conversation.input.bar` 的宿主渲染者;插件占的是 `conversation.input.right` / `conversation.input.dock`,不经过该面。
- `conversation.hero.frame`(hoc/root)是新槽位,插件不注册。

### 2.3 LLM 错误分类重构(插件不构造,不受影响)

- `HarnessError` 基类从 `dsh-llm/error` 拆进新包 `@deepseek-ai/dsh-error`(npm 已发布,rc.2 起),`dsh-llm/error` 改为导入并再导出——两个导入路径指向同一个类。
- `LlmError` 构造函数第二参从 `string` 收紧为 `BuiltinLlmFailureCode`;任意提供方码经新增的 `LlmError.fromFailure(failure)` 再抛。
- 插件 Host 侧只消费流式 `finish` 块的 `reason.failure.code` / `reason.failure.message`(字符串读取),从不构造 `LlmError` / `HarnessError`,因此收紧不影响任何路径。类型基线据此新增钉 `dsh-error`(真实类型,而非占位)。
- `AppIdentity` 新增可选 `suffix`(环境变量 `DSH_USER_AGENT_SUFFIX`),`attributionHeaders` 渲染时追加;插件不传 identity,走宿主默认。

### 2.4 会话 / 控制器 / 投影(内部重构,读取面保持)

- `dsh-session`:`SessionSurface.prepareBatch` + `Session.appendBatch` + `currentBatchPublication`(批量追加一次提交、按序发布);`SessionEventInput` 新类型;已知事件表新增 `team/mode`。插件消费的 `user/message` / `assistant/message` 事件形状不变。
- `dsh-api-session-controller`:`loadOlder(options?: { deferConsumption? })` + `consumeOlder()`(向上回看自动加载);`SessionOptions.parentAvailable` 与 `handleSubagentParentAvailable` 移除,子代理中断改走 `subagents.interruptByUser`;fork 标题编号跳过已用号。**`modelCatalog` RPC 仍在**(typert remote-client 命中),`binding(id)` / `eventSource` / `entries` 仍在。插件不 retain、不翻页、不冷调分页,不受影响。
- `dsh-session-projection`:持久缓存版本号语义说明收紧(可选加法的豁免条件),插件不注册 projection。

### 2.5 桌面端与打包面

- app.asar 顶层 `@deepseek-ai/dsh-desktop@0.2.2-rc.3`;完整 runtime 树在 `dsh/node_modules/@deepseek-ai`(338 包,328 个 rc.3;vendor:cordis 4.1.0、cosmokit 1.9.0、schemastery 3.19.0、cordis-plugin-group/include/loader 1.1.0、cordis-plugin-timer 1.2.0、node-addon-system 0.1.2)。
- `dsh-web-frontend` dist 的 `staticModules` 映射与 rc.1 **完全一致**(11 个静态模块)。
- runtime CLI 入口改为经 Electron(`ELECTRON_RUN_AS_NODE=1`)执行 `app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js`;`dsh.cmd` 路径与用法不变,`--version` = 0.2.2-rc.3。
- 全部 npm tarball 自 rc.2 起附带 `src/` 与 `.map`(package.json `files` 字段变化);`sync:types` 只拷 `package.json` + `lib`,不受影响。
- `dsh-client-connection/lib/client.browser.js` 由多行格式改为压缩单行,**`window.__ModuleLoader__.load({ id, factory })` 包装形态不变**——插件 client bundle 的 banner/footer 无需调整。

### 2.6 类型基线

`scripts/sync-types.mjs` 的包表从 19 扩为 **20**(新增 `dsh-error`),全部钉到 `0.2.2-rc.3`;devDeps 的 `dsh-client-ui-slots` / `dsh-llm` 同版本。`npm run sync:types` 成功(50 个上游未发布/未收录依赖按需生成占位,较 rc.1 基线多 4 个,主要来自 rc.3 类型新引用的 `dsh-client-ui-context-menu` 等)。`tsc --noEmit` 零错误。

---

## 3. 插件侧改动

### 3.1 代码

**`src/` 零改动。** 契约面全部保持(§1),rc.2/rc.3 的新功能(hoc 槽位、粘贴路由、引用摘要、失败重试、会话导入)均不经过插件依赖的面。

### 3.2 版本与依赖

| 项 | 旧 | 新 |
|---|---|---|
| package version | 0.6.4 | 0.6.5 |
| description | 适配 dsh 0.2.2-rc.1 | 适配 dsh 0.2.2-rc.3 |
| `dsh-client-ui-slots` / `dsh-llm` (dev) | 0.2.2-rc.1 | 0.2.2-rc.3 |
| `sync:types` 包表 | 19 包 @ 0.2.2-rc.1 | 20 包 @ 0.2.2-rc.3(新增 `dsh-error`) |
| `@deepseek-ai/cordis` (dev) | `^4.1.0` | 不变(vendor 未升) |
| `@deepseek-ai/schemastery` (deps) | `^3.19.0` | 不变(vendor 未升) |
| `package-lock.json` | rc.1 基线 | rc.3 基线,重新生成 |

`engines.dsh` 保持 `>=0.1.0-rc.7 <0.3.0-0`,覆盖 0.1.x / 0.2.x 全线,0.2.2-rc.3 在范围内。

---

## 4. 验证

### 4.1 真实 0.2.2-rc.3 Web 端到端(2026-11-16,Windows)

使用官方桌面端自带的 rc.3 runtime CLI(`E:\DSH\resources\runtime\cli\bin\dsh.cmd`,`--version` = `0.2.2-rc.3`)引导独立 profile `po-rc3-test`(既有测试 profile,插件自 0.6.2 升级),安装 `y1x1n-dsh-prompt-optimizer-0.6.5.tgz` 后启动 Web(`--no-open --port 8123`),无头 Chrome/CDP 真实驱动:

- Host 日志:`[dsh-prompt-optimizer] loaded, POST /dsh-prompt-optimizer/optimize`;无 manifest / engines 警告;
- 发送栏:「优化」按钮空草稿 disabled,键入草稿后自动 enabled;
- 优化面板:点击后打开,流式输出,**两次实测分别 4.2s / 5.3s 成功产出优化稿**;徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 5.3s`;面板出现「替换输入框 / 复制 / 重新优化 / 关闭」;
- 替换输入框:点击后草稿被替换为优化稿(面板显示「已替换 ✓」),按钮变为「撤回」;撤回后草稿恢复原文(46 字符),按钮恢复「替换输入框」;
- 设置页:设置 → 内置插件 → 「提示词优化」标签页正常出现,设置卡完整渲染,模型下拉列出宿主全部目录(85+ 项);切换输出语言 zh → en → 写入 profile `cordis.patch.yml`(`language: en`),再切回 `zh` 成功落盘;
- 浏览器控制台:**零 error / 零 uncaught exception**;仅有两条插件预期的上下文降级 warn(新会话无历史)。

证据截图:[`docs/screenshots/rc3-e2e-optimize-success.png`](screenshots/rc3-e2e-optimize-success.png)、[`docs/screenshots/rc3-e2e-settings.png`](screenshots/rc3-e2e-settings.png)。

### 4.2 自动化

- `npm run typecheck`:零错误(0.2.2-rc.3 全量类型)
- `npm run build`:成功
- `npm test`:**5 套 / 100 项全绿**
- 上游契约守卫:20 个钉版包版本一致、三个槽位声明在、`setDraft` / `draft` / `phase:'sending'` 在、legacy `settings.plugin.item` 仍不存在

---

## 5. 兼容性

| dsh 版本 | 优化路由 / 模型调用 | 设置页 | 发送栏 / 面板 | 会话上下文 |
|---|---|---|---|---|
| **0.2.2-rc.3**(Web + 官方桌面端运行时) | ✅ 实测(成功产出优化稿) | ✅ 实测(标签页 + 设置卡读写) | ✅ 实测 | ✅ 契约核对 + 事件窗口实测降级 |
| **0.2.2-rc.1** | ✅ 实测(v0.6.4) | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.3 / rc.2** | ✅ | ✅ | ✅ | ✅ |
| **0.2.0-rc.2** | ✅ | ✅ | ✅ | ✅ |
| 0.1.5 / 0.1.2 / 0.1.1 / 0.1.0-rc.7+ | ✅ | ✅ | ✅ | 降级 |
| ≥ 0.3.0 | — | — | — | `engines.dsh` 拒绝安装(显式放弃) |

> 0.1.x 宿主没有 `phase` 字段,「发送即关闭」继续按草稿清空 / `running` / 队列判定,行为不变。0.2.2-rc.2 未单独实测:rc.3 的契约核对完整覆盖 rc.2 引入的全部面向面变化(§0.1),且 rc.2 → rc.3 上游仅新增会话导入插件与桌面更新修复。

---

## 6. 结论

0.2.2-rc.3 对插件是**平台契约完全不变 + 上游功能加法**的一次升级。三个槽位、composer 标准 props、草稿读写、`phase:'sending'`、`ctx.llm` 与 `ctx.sessions` 读取路径、`staticModules` 基线全部保持;唯一需要跟进的声明层事项是 `HarnessError` 拆包带来的类型基线新增 `dsh-error`。真实 rc.3 Web 端到端已覆盖「两次成功产出优化稿、替换/撤回、设置卡渲染与持久化、零控制台错误」。
