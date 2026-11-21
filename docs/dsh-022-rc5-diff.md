# DSH 0.2.2-rc.3 → 0.2.2-rc.5 差异调研(dsh-prompt-optimizer 面向面)

调研日期:2026-11-21
调研对象:上游 `github.com/deepseek-ai/deepseek-harness` tag `dsh-v0.2.2-rc.3` → `dsh-v0.2.2-rc.5`(中间含 `dsh-v0.2.2-rc.4`,2026-11-17 发布;rc.5 于 2026-11-18 发布);npm 上 `@deepseek-ai/*@0.2.2-rc.3` / `@0.2.2-rc.5` 的 tarball;`@deepseek-ai/dsh@0.2.2-rc.5` 的真实 Web 运行时。

**结论先行:本插件在 0.2.2-rc.5 上可无损升级,平台契约面全部保持,`src/` 零改动。** 插件依赖的三个槽位(`conversation.input.right`、`conversation.input.dock`、`settings.plugins.tab`)声明块、`SessionStandardProps` 块、`setDraft` / `draft` / `phase:'sending'` 与 rc.3 **逐字节相同**(四个块哈希与 rc.5 时代历史记录一致);20 个钉版包中 19 个的 `lib/` 产物逐文件字节相同,`dsh-api-remotes` 仅生成代码里一处 source line 注解位移(归一化后相同);devDep `dsh-llm` 的唯一类型变化是新增失败码 `CONTENT_REFUSED`(加法);桌面端 `staticModules` 基线与 ModuleLoader 包装形态不变;vendor 版本线(cordis 4.1.0 / schemastery 3.19.0 / zod 4.6.6)不变。本版为纯声明层适配:类型基线 20 包钉到 rc.5、devDeps 同版本、lock 重生成、版本/文档更新,并在真实 rc.5 Web 上完成一次成功产出优化稿的端到端验证(含替换/撤回、设置卡读写与持久化、连接测试)。

---

## 0. 调研方法与基线(可复现)

1. **上游语义**:`gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.3...dsh-v0.2.2-rc.5`——`ahead_by = 13`,共 **13 个 commit**(3 个 LLM 安全审查提交、2 个 LiveShare 提交、1 个 Web Search 默认提供方 PR、2 个 release 提交,其余为 merge)。compare 的 `files` 返回上限 300 个,其中绝大多数是 monorepo 全量 `package.json` 的版本号 bump。
2. **npm 类型实测**:对插件类型基线的 20 个包 + `dsh-llm` / `dsh-api-session-controller` / `dsh-settings` / `dsh-package-manifest` / `dsh-web-frontend` / `dsh-client-ui-context-menu` / `dsh-client-ui-settings-web-search` 共 **27 个包**,用 `npm pack` 下载 `0.2.2-rc.3` 与 `0.2.2-rc.5` 两组 tarball,解包后对全部文件做**逐文件字节比对**,`package.json` 做字段级 diff。
3. **真实运行时实测**:`npm install @deepseek-ai/dsh@0.2.2-rc.5` 到独立前缀,`--version` = `0.2.2-rc.5`;引导全新 profile `po-022-rc5-test`,安装本版 tgz 后启动 Web(`--no-open --port 8125`),无头 Edge/Playwright 真实驱动。
4. **关键契约块哈希**:对槽位声明块、`SessionStandardProps` 块逐块取 SHA-256 前 16 位,确认「块级相同」而不是整文件相同。
5. **静态基线**:从 `dsh-web-frontend` 的 dist bundle 提取 `staticModules` 映射(rc.3 / rc.5 的 `dist/` 逐字节相同);从 `dsh-client-connection` 的 `lib/client.browser.js` 确认 ModuleLoader 包装形态(该包除 `package.json` 外无字节变化)。

### 0.1 与插件相关的上游主线变化(节选)

| 主题 | 版本 | 内容 | 与本插件的关系 |
|---|---|---|---|
| DeepSeek 内容安全审查 | rc.4 | `llm-deepseek` 调整安全审查:先加 `safetyCheck` 开关、再改为始终请求、最终改为**不在请求体发送 `safety_check`**;模型返回 `stop_reason:'refusal'` 时抛出 `LlmError(..., 'CONTENT_REFUSED')`,并在 `LLM_FAILURE_CODES` 新增 `CONTENT_REFUSED` | 插件从不构造 `LlmError`,只消费流式结果;被拒绝时上游改抛异常,插件 `collectText` 会让异常冒泡,优化路由按既有错误路径返回 SSE `error`(消息含失败码),行为符合预期 |
| LiveShare 桌面分享 | rc.4 | Host 的 Electron Node 模式下启动 tunnel worker,修复桌面端无法创建分享;测试改用真实时钟推导凭据有效期 | 插件不依赖 LiveShare |
| Web Search 默认提供方 | rc.5 | DeepSeek 模型改用 DeepSeek 服务端搜索(不按次收费),其他模型默认 DeepSeek Search API;`web` / `tool-web` / `web-search-deepseek` / `ui-settings-web-search` / base patch 同步调整 | 插件不调用 Web Search,不消费 `ui-settings-web-search` |
| 发布工程 | rc.4 / rc.5 | monorepo 全量包版本号 bump 到 0.2.2-rc.5 | 类型基线随之升级 |
| 版本线 | rc.3 → rc.5 | vendor `cordis ~4.1.0` / `schemastery ~3.19.0` / `zod 4.6.6` **不变** | 插件 devDep/运行时依赖无需再升 |

---

## 1. 汇总表

| 面向面 | 0.2.2-rc.5 状态 | 对本插件的影响 | 处置 |
|---|---|---|---|
| `conversation.input.right` | **声明块逐字节相同**(哈希 `42609d09c15c01e2`) | 无 | 无需改 |
| `conversation.input.dock` | **声明块逐字节相同**(哈希 `3877c57ff1a60932`) | 无 | 无需改 |
| composer 标准 props(`useInput`/`inputActions`/`sessionId`) | **`SessionStandardProps` 块逐字节相同**(哈希 `a88c9594ca61cd76`,块内含 `useConversation`/`useInput`/`inputActions`);`sessionId` 另由 ui-slots 按 `scope:'session'` 经 `InjectParams` 注入,该注入面亦不变 | 按钮/面板读写草稿路径不变 | 无需改 |
| `InputActions.setDraft` / `InputState.draft` | **签名与字段逐字节相同** | 「替换输入框/撤回」不变 | 无需改 |
| `InputState.phase` | **五值联合不变**(含 `'sending'`) | 「发送即关闭」判定不变 | 无需改 |
| `settings.plugins.tab` | **声明块逐字节相同**(哈希 `2e49302e62eee7c7`);运行时 bundle 仍在 | 设置标签页路径不变 | 无需改 |
| `settings.plugin.item`(0.1.x legacy) | **仍不存在**(类型与运行时 0 命中) | 独立 `inject` 守卫前提仍成立 | 无需改 |
| `ui-slots` / `ui-conversation` / `ui-settings` / `ui-settings-plugins` / `ui-renderer` / `ui-session` | 除 `package.json` 版本号外**零字节变化** | 无 | 无需改 |
| `dsh-llm` | `lib/types/error.d.ts` 新增 `CONTENT_REFUSED`(加法);`lib/index.js` 仅多该一行;公开方法面不变 | 插件只读 `finish.reason.failure.code/message`,异常路径按既有 catch 处理 | 无需改 |
| `dsh-api-remotes` | `lib/client.js` 归一化 source line 注解后**完全相同**(仅一处 `line: 152 → 174`),来自 `web` 包源码行移动 | 插件实际使用面不变 | 无需改 |
| `dsh-client-ui-settings-web-search` | Web Search 设置卡文案/默认值调整(13 文件) | 插件不消费该包 | 无需改 |
| `dsh-client-connection` | 除 `package.json` 外**零字节变化**;`window.__ModuleLoader__.load({ id, factory })` 包装形态不变 | client bundle banner/footer 无需调整 | 无需改 |
| `dsh-web-frontend` dist | **逐字节相同**(`index-Ciz7DZxv.js`);`staticModules` 仍是同样 11 个模块 | 插件 client bundle 只 `require` react、react/jsx-runtime | 无需改 |
| `dsh-session` / `dsh-session-projection` / `dsh-api-session-controller` / `dsh-settings` / `dsh-package-manifest` | 除 `package.json` 外零字节变化;`modelCatalog` RPC、`binding().eventSource.entries` 仍在 | 上下文读取路径不变 | 无需改 |
| `dsh-attachment` / `dsh-brand` / `dsh-client-locale` / `dsh-commands` / `dsh-error` / `dsh-llm-retry` / `dsh-token-meter` / `dsh-tool-todo` / `dsh-tools` / `dsh-client-ui-primitives` | 除 `package.json` 外零字节变化 | 插件不直接消费或使用面不变 | 无需改 |
| `cordis` / `schemastery` / `zod` | **4.1.0 / 3.19.0 / 4.6.6 不变** | 插件依赖无需再升 | 无需改 |
| 类型基线 / lock / 版本号 | 本轮已升 0.2.2-rc.5(20 包) | 决定 typecheck 与 CI | **已改** |

---

## 2. 逐项证据

### 2.1 槽位与 composer 标准 props(块级哈希)

对槽位声明块做 SHA-256 前 16 位(声明块本身,不含周围注释):

| 块 | rc.3 | rc.5 | 结果 |
|---|---|---|---|
| `conversation.input.right` | `42609d09c15c01e2` | `42609d09c15c01e2` | 相同 |
| `conversation.input.dock` | `3877c57ff1a60932` | `3877c57ff1a60932` | 相同 |
| `settings.plugins.tab` | `2e49302e62eee7c7` | `2e49302e62eee7c7` | 相同 |
| `SessionStandardProps`(ui-conversation) | `a88c9594ca61cd76` | `a88c9594ca61cd76` | 相同 |

`InputActions.setDraft(text: string): void`、`InputState.draft: string`、`InputState.phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting' | 'sending'` 两版逐字相同。运行时侧:rc.5 的 `ui-conversation/lib/client.js`、`ui-settings-plugins/lib/client.js` 与 rc.3 逐字节相同(逐文件比对中仅 `package.json` 变化),两个 composer 槽位与 `settings.plugins.tab` 的运行时声明原样保留,legacy `settings.plugin.item` 仍 0 命中。

### 2.2 LLM 安全审查与拒绝码(插件不构造,异常路径按既有设计处理)

rc.4 的三个提交最终收敛为以下行为:

- 请求体**不再携带** `safety_check`(`wire-types.ts` 删除该字段,`serialize.ts` 不再写入);
- `stop_reason: 'refusal'` 在 `translate.ts` 中被映射为 `throw new LlmError('DeepSeek refused to answer under its content safety review...', 'CONTENT_REFUSED')`;若上游附带 `stop_details.explanation`,会拼进错误消息;
- `LLM_FAILURE_CODES` 新增 `CONTENT_REFUSED`(类型与运行时 bundle 各多一行),其余失败码不变。

对插件的影响:

- 插件 Host 侧 `collectText` 只消费 `StreamChunk`。上游 `adapterStream` 会捕获适配器抛出的 `LlmError`,把它转成 `finish` 失败块(`failure.code = 'CONTENT_REFUSED'`);插件 `collectText` 见到 `finish.kind === 'error'` 后抛出 `模型调用失败(CONTENT_REFUSED): ...`,进入优化路由既有的 catch:若尚未发送任何 delta,按既有回退链尝试下一路由;否则以 SSE `error` 事件送达面板。该路径与既有的 `AUTH` / `DOWN` / 中途断流错误完全一致,无需新增分支。
- 插件从不 `new LlmError` / `new HarnessError`,也不白名单校验失败码,因此新增码不影响任何判定。
- `dsh-llm` 公开方法面(`stream` / `listModels` / `listProviders` / `resolveModelInfo`)两版相同。

### 2.3 Web Search 默认提供方(插件不消费)

rc.5 的合并 PR 让 DeepSeek 模型默认走服务端搜索、其他模型默认 DeepSeek Search API,涉及 `packages/web/web`、`tool-web`、`web-search-deepseek`、`client/ui-settings-web-search` 与 `bundle/base/cordis.patch.yml`。`ui-settings-web-search` 的 tarball 有 13 个文件变化(设置卡文案与默认值),但该包不在插件依赖图内;插件也不调用 `ctx.web` / 搜索工具,因此无需跟进。

### 2.4 LiveShare 桌面修复(插件不依赖)

rc.4 的 LiveShare 修复集中在 `packages/experimental/liveshare/src/host/tunnel-worker.ts` 与测试:Host 在 Electron Node 模式下显式启动 tunnel worker,另有一个测试时钟修正。属于桌面端分享功能,插件不注册 LiveShare、不消费其 API。

### 2.5 桌面端与打包面

- `dsh-web-frontend@0.2.2-rc.5` 的 161 个文件中,**除 `package.json` 外全部逐字节相同**;`staticModules` 映射仍为 11 项:`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。
- `dsh-client-connection` 除 `package.json` 外无字节变化,`window.__ModuleLoader__.load({ id, factory })` 包装形态保持。
- npm tarball 仍附带 `src/` 与 `.map`;`sync:types` 只取 `package.json` + `lib`,行为不变。
- 本机未安装 rc.5 官方桌面端,桌面端 asar 未重新解析;但本插件与桌面端的耦合面(前端静态模块、ModuleLoader 包装、runtime CLI 用法)均由已发布的 `dsh-web-frontend` / `dsh-client-connection` / rc.5 CLI 逐字节覆盖。

### 2.6 类型基线

`scripts/sync-types.mjs` 的 20 包全部钉到 `0.2.2-rc.5`;devDeps 的 `dsh-client-ui-slots` / `dsh-llm` 同版本。`npm run sync:types` 成功(50 个上游未发布/未收录依赖按需生成占位,与 rc.3 基线数量一致)。`tsc --noEmit` 零错误。

---

## 3. 插件侧改动

### 3.1 代码

**`src/` 零改动。** 契约面全部保持(§1);rc.4/rc.5 的新行为(拒绝码、LiveShare、Web Search 默认值)均不要求插件改代码。

### 3.2 版本与依赖

| 项 | 旧 | 新 |
|---|---|---|
| package version | 0.6.5 | 0.6.6 |
| description | 适配 dsh 0.2.2-rc.3 | 适配 dsh 0.2.2-rc.5 |
| `dsh-client-ui-slots` / `dsh-llm` (dev) | 0.2.2-rc.3 | 0.2.2-rc.5 |
| `sync:types` 包表 | 20 包 @ 0.2.2-rc.3 | 20 包 @ 0.2.2-rc.5 |
| `@deepseek-ai/cordis` (dev) | `^4.1.0` | 不变(vendor 未升) |
| `@deepseek-ai/schemastery` (deps) | `^3.19.0` | 不变(vendor 未升) |
| `package-lock.json` | rc.3 基线 | rc.5 基线,重新生成 |

`engines.dsh` 保持 `>=0.1.0-rc.7 <0.3.0-0`,覆盖 0.1.x / 0.2.x 全线,0.2.2-rc.5 在范围内。

---

## 4. 验证

### 4.1 真实 0.2.2-rc.5 Web 端到端(2026-11-21,Windows)

使用 npm 发布的 rc.5 CLI(`@deepseek-ai/dsh@0.2.2-rc.5`,`--version` = `0.2.2-rc.5`)引导全新 profile `po-022-rc5-test`,安装 `y1x1n-dsh-prompt-optimizer-0.6.6.tgz` 后启动 Web(`--no-open --port 8125`),无头 Edge(Playwright/CDP)真实驱动:

- Host 日志:`[dsh-prompt-optimizer] loaded, POST /dsh-prompt-optimizer/optimize`;Playwright 网络观测到优化路由 `HTTP 200`;
- 发送栏:「优化」按钮空草稿 disabled,键入草稿后自动 enabled;
- 优化面板:点击后打开并流式输出,**2.6s 成功产出优化稿**(面板在 3.1s 内出现成功态);徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 2.6s`;面板出现「替换输入框 / 复制 / 重新优化 / 关闭」;
- 替换输入框:点击后草稿被替换为优化稿(面板显示「已替换 ✓」),按钮变为「撤回」;撤回后草稿恢复原文(29 字符),按钮恢复「替换输入框」;
- 设置页:设置 → 内置插件 → 「提示词优化」标签页正常出现,设置卡完整渲染,模型下拉列出宿主全部目录(5 组 82 个模型);「测试连接」返回 `连接正常:deepseek-official / deepseek-flash(609ms)`;输出语言 zh → en → zh 切换均写入 profile `cordis.patch.yml`(`language: en` → `language: zh`);
- 浏览器控制台:**零 error / 零 uncaught exception**;仅有两条插件预期的上下文降级 warn(新会话无历史)。

证据截图:[`docs/screenshots/dsh-022-rc5-e2e-optimize-success.png`](screenshots/dsh-022-rc5-e2e-optimize-success.png)、[`docs/screenshots/dsh-022-rc5-e2e-settings.png`](screenshots/dsh-022-rc5-e2e-settings.png)。

### 4.2 自动化

- `npm run typecheck`:零错误(0.2.2-rc.5 全量类型)
- `npm run build`:成功
- `npm test`:**5 套 / 100 项全绿**
- 上游契约守卫:20 个钉版包版本一致、三个槽位声明在、`setDraft` / `draft` / `phase:'sending'` 在、legacy `settings.plugin.item` 仍不存在

---

## 5. 兼容性

| dsh 版本 | 优化路由 / 模型调用 | 设置页 | 发送栏 / 面板 | 会话上下文 |
|---|---|---|---|---|
| **0.2.2-rc.5**(Web + rc.5 CLI) | ✅ 实测(成功产出优化稿) | ✅ 实测(标签页 + 设置卡读写 + 连接测试) | ✅ 实测 | ✅ 契约核对 + 事件窗口实测降级 |
| **0.2.2-rc.3** | ✅ 实测(v0.6.5) | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.2-rc.2** | ✅ 契约核对(rc.3 覆盖其全部变化) | ✅ 契约核对 | ✅ 契约核对 | ✅ 契约核对 |
| **0.2.2-rc.1** | ✅ 实测(v0.6.4) | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.3** | ✅ 实测(路由/SSE/错误态) | ✅ 实测(标签页 + 设置卡读写) | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.2** | ✅ 产物核对 | ✅ 产物核对 | ✅ 产物核对 | ✅ 契约核对 |
| **0.2.0-rc.2** | ✅ | ✅ | ✅ | ✅ |
| 0.1.5 / 0.1.2 / 0.1.1 / 0.1.0-rc.7+ | ✅ | ✅ | ✅ | 降级 |
| ≥ 0.3.0 | — | — | — | `engines.dsh` 拒绝安装(显式放弃) |

> 0.2.2-rc.4 未单独实测:rc.5 的 tarball 与真实 Web 验证完整覆盖 rc.4 引入的全部面向面变化(LLM 拒绝码、LiveShare 修复),且 rc.4 → rc.5 上游仅新增 Web Search 默认提供方调整。0.1.x 宿主的 `phase` 不含 `'sending'`(四值自 0.1.0-rc.7 起即存在),「发送即关闭」继续按草稿清空 / `running` / 队列判定,行为不变。

---

## 6. 结论

0.2.2-rc.5 对插件是**平台契约完全不变 + 上游功能修复**的一次升级。三个槽位、composer 标准 props、草稿读写、`phase:'sending'`、`ctx.llm` 与 `ctx.sessions` 读取路径、`staticModules` 基线全部保持;唯一需要跟进的声明层事项是 `dsh-llm` 新增失败码 `CONTENT_REFUSED`(加法,已随类型基线升级)。真实 rc.5 Web 端到端已覆盖「成功产出优化稿、替换/撤回、设置卡渲染与持久化、连接测试、零控制台错误」。
