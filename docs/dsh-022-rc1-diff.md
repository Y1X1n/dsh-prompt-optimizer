# DSH 0.2.1-rc.5 → 0.2.2-rc.1 差异调研(dsh-prompt-optimizer 面向面)

调研日期:2026-11-11
调研对象:上游 `github.com/deepseek-ai/deepseek-harness` tag `dsh-v0.2.1-rc.5` → `dsh-v0.2.2-rc.1`(中间含 `dsh-v0.2.2-alpha.2` / `dsh-v0.2.2-alpha.3`);本机桌面端 `E:\DSH\resources\app.asar`(顶层 `@deepseek-ai/dsh-desktop@0.2.2-rc.1`,329 个 `@deepseek-ai/*` 包中 321 个为 0.2.2-rc.1,其余为 vendor)+ npm 上 `@deepseek-ai/*@0.2.1-rc.5` / `@0.2.2-rc.1` 的 tarball。

**结论先行:本插件在 0.2.2-rc.1 上可无损升级,平台契约面全部保持,`src/` 只需一处小适配(发送阶段 `phase:'sending'`)。** 插件依赖的三个槽位(`conversation.input.right`、`conversation.input.dock`、`settings.plugins.tab`)声明块与 rc.5 **逐字节相同**;composer 标准 props、`InputActions.setDraft`、`InputState.draft`、`ui-slots` / `ui-renderer` / `dsh-llm` 的公开方法面全部保持。0.2.2 的真实变化集中在**发送语义**(宿主确认接收前保留草稿,新增 `sending` 阶段)、引用/附件交互、设置页导航图标(新可选槽位)、`cordis 4.1.0` / `schemastery 3.19.0` 版本线,以及大量与新插件生态相关的加法。本版据此把「发送即关闭」判定接入 `phase:'sending'`,其余为声明层适配(类型基线、lock、版本/文档)。

---

## 0. 调研方法与基线(可复现)

1. **上游语义**:`gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.5...dsh-v0.2.2-rc.1`。compare 显示 **2623 个 commit ahead**(API 的 commits 列表返回前 250 个),`files` 返回上限 300 个;`0.2.2-rc.1` 是该分支线经历 alpha.2 / alpha.3 后的首个候选版本,release notes 已汇总用户与开发者变更。
2. **npm 类型实测**:对插件类型基线的 19 个包 + `dsh-llm`/`dsh-api-session-controller`/`dsh-settings`/`dsh-package-manifest`/`dsh-app-boot`/`dsh-web-frontend` 等共 24 个包,用 `npm pack` 下载 `0.2.1-rc.5` 与 `0.2.2-rc.1` 两组 tarball,解包后对 `lib/**` 做**逐文件字节比对**,`package.json` 做字段级 diff。
3. **桌面端实测**:用自写 ASAR header reader 读取 `E:\DSH\resources\app.asar`,取全部 `@deepseek-ai/*` 包版本、`dsh-web-frontend` 的 `staticModules` 映射、槽位声明与运行时 bundle。
4. **关键契约块/行哈希**:对槽位声明块、`InputActions.setDraft`、`InputState.draft` 等逐块取 SHA-256 前 16 位,确认「块级相同」而不是整文件相同(注释改动不影响契约)。
5. **插件侧实测**:工作区钉基线与 `node_modules` 均为 0.2.2-rc.1,跑 `tsc --noEmit`、`npm test`(5 套 / 100 项);并用官方桌面端自带的 `0.2.2-rc.1` runtime CLI 引导独立 profile,做真实 Web 端到端。

### 0.1 与插件相关的上游主线变化(节选)

| 主题 | 提交/版本 | 内容 | 与本插件的关系 |
|---|---|---|---|
| 发送语义 | 0.2.2-alpha.2 起 | 消息在宿主确认接收后才显示并清空草稿;发送期间输入框只读;失败时保留草稿/引用/附件 | **适配点**:`InputState.phase` 新增 `'sending'`,「发送即关闭」接入该信号(见 §3.1) |
| 引用插入 | 0.2.2-alpha.2 起 | 聊天文本可作为原子引用插入输入框,发送后显示紧凑预览 | 加法;插件只读写纯文本草稿,不经过引用节点 |
| 附件上传 | 0.2.2-alpha.2 起 | 普通会话的图片进入输入框即上传,发送时复用;文件仍即选即传;新增上传失败原因 | 加法;插件不占 `conversation.input.attachments` |
| 设置导航图标 | `516ca64a`(#7624) | 新增可选槽位 `settings.section.icon`,插件可为自己设置页提供导航图标 | 加法;插件注册的是 `settings.plugins.tab`(插件页内标签),不涉及 section 图标 |
| composer 席位稳定 | `af4bddbc` / `8c2f5d85`(#7591) | docked composer 固定层叠层级;文档明确「composer 内 fixed 浮层必须 portal 到 body」 | 插件结果面板是 dock 内联卡片,仅剪贴板兜底的 textarea 挂到 `document.body`,不受影响 |
| 设置页/本地化 | 0.2.2 | 新增 ja/es/fr/de/ru/pt 文案;设置页 hover 行为改为 `@media (hover:hover)` | 加法;插件自管 zh/en 文案,跟随 `locale.active` |
| LLM | `a05a0d02` 等 | `llm/models-updated` 事件、模型 `badge` 元数据、`GenerateOptions` 的 `purpose` 改为可扩展泛型;pi-ai 支持插件动态请求头 | `LlmRuntime.stream/listModels/listProviders/resolveModelInfo` 签名不变;插件不传 `purpose` |
| 会话投影 | `945006c9` 等 | 投影状态表重构、投影单元 `summary` 标记、每提交事件一帧 | 插件不注册 projection,只读事件窗口 |
| 工具链 | 0.2.2 | `dsh-tools` 管线化重构、`apply_patch` 实验性开关 | 与插件无关 |
| 客户端构建 | `135423b4` | 静态 client bundle 默认 production | 上游构建行为;插件 bundle 由本仓库 esbuild 生成,外部依赖未变 |
| 版本线 | vendor release | `cordis 4.0.5 → 4.1.0`、`schemastery 3.18.5 → 3.19.0` | 插件 devDep/运行时依赖同步升级(见 §4) |

---

## 1. 汇总表

| 面向面 | 0.2.2-rc.1 状态 | 对本插件的影响 | 处置 |
|---|---|---|---|
| `conversation.input.right` | **声明块逐字节相同**(`kind:'list'`、`scope:'session'`) | 无 | 无需改 |
| `conversation.input.dock` | **声明块逐字节相同**(`kind:'list'`、`scope:'session'`、owner `InputZone`) | 无 | 无需改 |
| composer 标准 props(`useInput`/`inputActions`/`sessionId`) | **`SessionStandardProps` 块逐字节相同** | 按钮/面板读写草稿路径不变 | 无需改 |
| `InputActions.setDraft` / `InputState.draft` | **签名与字段逐字节相同** | 「替换输入框/撤回」不变 | 无需改 |
| `InputState.phase` | **新增 `'sending'`**(`plain` / `adjudicating` / `claimed` / `submitting` / `sending`) | 发送期间草稿可能仍在,原「草稿清空/running」判定会晚一拍 | **已适配**:`shouldAutoClose` 识别 `sending`(§3.1) |
| `settings.plugins.tab` | **类型声明块逐字节相同**;运行时 `settings.plugins.tab` 仍在 | 设置标签页路径不变 | 无需改 |
| `settings.section.icon` | **新增可选槽位**(`inline:true`,`SettingsSectionIconOwnerProps`) | 插件不注册 settings section,不涉及 | 无需改 |
| `settings.plugin.item`(0.1.x legacy) | **仍不存在**(类型与运行时 0 命中) | 独立 `inject` 守卫前提仍成立 | 无需改 |
| `ui-slots` | `.d.ts` 与 `lib/index.js` **全部相同**,仅 `package.json` 版本/peer 变化 | `ctx.slots` 注册与 `PropsRuntime` 不变 | 无需改 |
| `ui-renderer` | `lib/types/client/index.d.ts` **逐字节相同**;包内仅新增 6 个 locale JSON | `ctx.slots` 合并来源不变 | 无需改 |
| `ui-conversation` 输入契约 | 新增 `insertQuote`、`DraftQuote`、`quotes`;发送尝试快照补充引用/附件;`phase` 增加 `sending` | `setDraft`/`draft` 不变;新增项均为加法 | 已适配 `sending` |
| `ui-conversation` slots | 两个 composer 槽位声明块不变;新增文档说明「fixed 浮层须 portal」 | 结果面板内联渲染,不受影响 | 无需改 |
| `ui-session` | 新增 `whenAccess`;`SessionStandardProps` 不变 | `useSession` 读取 `running`/`pendingSubmissions` 面不变 | 无需改 |
| `dsh-llm` | 公开方法面 `index.d.ts` **逐字节相同**;`types.d.ts` 新增 badge / `models-updated` / `purpose` 泛型 | 插件 `stream` / `listModels` / `resolveModelInfo` 路径不变;不传 `purpose` | 无需改 |
| `dsh-session` / `dsh-session-projection` | 事件发布时序与投影框架调整;事件窗口 `entries` 保持 | 插件只读 `binding(id).eventSource.getSnapshot().entries` | 无需改 |
| `dsh-api-session-controller` | `modelCatalog()` RPC 仍在;`binding()` / `eventSource` / `entries` 仍在;`session/page` 被 `session/events` 取代 | 插件实际使用 `modelCatalog` RPC 与事件窗口,不使用 `session/page` | 无需改 |
| `dsh-client-connection` | 新增可选 `resolveAsset` | 加法 | 无需改 |
| `dsh-client-locale` | `register` 类型收紧(`Record<LocaleId,...>`),新增 6 种语言 | 插件不调用 `locale.register`,只读 `active` | 无需改 |
| `dsh-package-manifest` | 新增 `optionalDependencies`、bundle `platforms` / `listedByDefault` | 加法;`manifestVersion:1` 与 `engines.dsh` 语义不变 | 无需改 |
| `dsh-app-boot` | 官方 bundle 目录拆包、启动诊断、profile 平台校验 | 插件 manifest 形态不变;真实 rc.1 profile 安装/加载已验证 | 无需改 |
| 桌面端 `staticModules` 基线 | **完全相同**:react / react/jsx-runtime / react-dom / react-dom/client / cordis / zod / @tanstack/react-virtual / client-store / ui-slots / ui-primitives / ui-dockkit | 插件 client bundle 只 `require` react、react/jsx-runtime | 无需改 |
| `cordis` 4.0.5→4.1.0 | 内部 fiber/config/event 重构;`Context` 公开面未删 | 插件 `ctx.inject`/`ctx.effect`/`ctx.slots` 经真实 rc.1 端到端验证 | **升级 devDep 到 `^4.1.0`** |
| `schemastery` 3.18.5→3.19.0 | Schema 类型/运行时增强,`Schema.object` 等 API 兼容 | 插件 Config schema 正常生成与持久化 | **升级 dependencies 到 `^3.19.0`** |
| 类型基线 / lock / 版本号 | 本轮已升 0.2.2-rc.1 | 决定 typecheck 与 CI | **已改** |

---

## 2. 逐项证据

### 2.1 槽位与 composer 标准 props(块级哈希)

对槽位声明块做 SHA-256 前 16 位(声明块本身,不含周围注释):

| 块 | rc.5 | rc.1 | 结果 |
|---|---|---|---|
| `conversation.input.right` | `42609d09c15c01e2` | `42609d09c15c01e2` | 相同 |
| `conversation.input.dock` | `3877c57ff1a60932` | `3877c57ff1a60932` | 相同 |
| `settings.plugins.tab` | `2e49302e62eee7c7` | `2e49302e62eee7c7` | 相同 |
| `SessionStandardProps`(ui-conversation) | — | — | 块级 diff 相同 |

`InputActions.setDraft` 与 `InputState.draft` 的行级哈希两版相同;`InputState.phase` 因新增 `'sending'` 而不同(预期)。

### 2.2 发送语义与 `sending` 阶段

0.2.2 的发送链路改为:

1. 用户提交 → 进入 `sending`(普通消息)或 `adjudicating → claimed → submitting`(斜杠命令);
2. 草稿、引用与附件在**宿主确认接收前保留**;
3. 确认接收后才清空草稿并显示消息;失败时草稿原样保留。

对插件的含义:原「发送即关闭」只靠「草稿清空 / `running` 翻转 / 队列增长」三条信号,在新语义下要等宿主确认,面板会在发送等待期间继续占着 dock。本轮在 `shouldAutoClose` 增加 `phase === 'sending'` 信号(旧宿主 phase 不含该值,自动忽略),并在结果面板读取 `InputState.phase`;`loading` 期间仍不关闭,避免打断正在跑的优化。

### 2.3 引用 / 附件 / 设置图标(均为加法)

- `insertQuote` / `DraftQuote` / `SnapshotDraft.quotes`:新增原子引用;插件只做纯文本读写,草稿中的引用会在 `setDraft` 时按上游语义清除,与 rc.5 行为一致。
- `ComposerAttachmentsOwnerProps.uploadFailureText`、`DraftFileUpload.reason`:新增必填 owner prop,但只影响 `conversation.input.attachments` 的宿主渲染者,插件不占该槽位。
- `settings.section.icon`:新可选槽位,注册 id 必须等于目标 section id;插件注册的是插件设置页内的 `settings.plugins.tab`,不适用。

### 2.4 会话 / 投影 / 工具 / 前端

- `dsh-api-session-controller`:`session/page` 被 `session/events` / `state` / `observe*` 取代;**`modelCatalog` 仍在**,`binding(id)` 与 `SessionEventSource.entries` 仍在。插件不冷调 `session/page`,不受影响。
- `dsh-session-projection`:移除 `SessionProjectionStateMap`,引入 `SessionProjectionSummaryExcluded` / `ProjectionHandle`;插件不注册 projection。
- `dsh-tools`:管线化重构、PTC 类型拆分;插件不消费。
- `dsh-web-frontend`:dist 重新构建,`staticModules` 映射与 rc.5 完全一致(见 §1 表)。
- 桌面端 asar:329 个 `@deepseek-ai/*` 包,321 个为 `0.2.2-rc.1`,其余为 vendor(`cordis@4.1.0`、`schemastery@3.19.0` 等)。

### 2.5 类型基线

`scripts/sync-types.mjs` 的 19 个包全部钉到 `0.2.2-rc.1`;devDeps 的 `dsh-client-ui-slots` / `dsh-llm` 同版本。`npm run sync:types` 成功(46 个上游未发布/未收录依赖按需生成占位)。`tsc --noEmit` 零错误。

---

## 3. 插件侧改动

### 3.1 发送阶段接入(`src/client/controller.ts` + `src/client/ResultDock.tsx`)

- `shouldAutoClose` 增加可选 `phase?: string`,命中 `'sending'` 即视为已发送;
- 结果面板从 `useInput` 快照读取 `phase` 并传入,依赖数组同步;
- 单测新增 3 条断言:`sending` 关闭、`plain` 不关闭、`sending + loading` 不打断优化;
- 上游契约守卫新增 `u3b`:锁定 `setDraft` / `draft` / `phase:'sending'` 仍在。

### 3.2 版本与依赖

| 项 | 旧 | 新 |
|---|---|---|
| package version | 0.6.3 | 0.6.4 |
| description | 适配 dsh 0.2.1-rc.5 | 适配 dsh 0.2.2-rc.1 |
| `@deepseek-ai/cordis` (dev) | `^4.0.4`(实际解析 4.0.4) | `^4.1.0`(解析 4.1.0) |
| `@deepseek-ai/schemastery` (deps) | `^3.18.2`(实际解析 3.18.5) | `^3.19.0`(解析 3.19.0) |
| `dsh-client-ui-slots` / `dsh-llm` (dev) | 0.2.1-rc.5 | 0.2.2-rc.1 |
| `sync:types` 19 包 | 0.2.1-rc.5 | 0.2.2-rc.1 |
| `package-lock.json` | rc.5 基线 | rc.1 基线,重新生成 |

`engines.dsh` 保持 `>=0.1.0-rc.7 <0.3.0-0`,覆盖 0.1.x / 0.2.x 全线,0.2.2-rc.1 在范围内。

---

## 4. 验证

### 4.1 真实 0.2.2-rc.1 Web 端到端(2026-11-11,Windows)

使用官方桌面端自带的 rc.1 runtime CLI(`E:\DSH\resources\runtime\cli\bin\dsh.cmd`,`--version` = `0.2.2-rc.1`)新建独立 profile `po-rc1-test`(`--from-default-profile web`),安装 `y1x1n-dsh-prompt-optimizer-0.6.4.tgz` 后启动 Web:

- Host 日志:`[dsh-prompt-optimizer] loaded, POST /dsh-prompt-optimizer/optimize`;无 manifest / engines 警告;
- 发送栏:出现带 `.dsh-po-btn.dsh-po-opt` 的「优化」按钮,空草稿 disabled;键入草稿后自动 enabled;
- 优化面板:点击后打开,流式输出,两次实测分别 **13.4s / 5.7s 成功产出优化稿**;徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 5.7s`;面板出现「替换输入框 / 复制 / 重新优化 / 关闭」;
- 替换输入框:点击后草稿被替换为优化稿,按钮变为「撤回」,撤回路径可用;
- 设置页:设置 → 内置插件 → 「提示词优化」标签页正常出现,设置卡完整渲染,模型下拉列出宿主全部目录;切换输出语言 → 写入 profile `cordis.patch.yml`(`language: en`),再切回 `zh` 成功;
- 浏览器控制台:零 error / zero uncaught exception;仅有两条插件预期的上下文降级 warn(新会话无历史)。

证据截图:[`docs/screenshots/rc1-e2e-optimize-success.png`](screenshots/rc1-e2e-optimize-success.png)、[`docs/screenshots/rc1-e2e-settings.png`](screenshots/rc1-e2e-settings.png)。

### 4.2 自动化

- `npm run typecheck`:零错误(0.2.2-rc.1 全量类型)
- `npm run build`:成功
- `npm test`:**5 套 / 100 项全绿**
- 上游契约守卫:19 个钉版包版本一致、三个槽位声明在、`setDraft` / `draft` / `phase:'sending'` 在、legacy `settings.plugin.item` 仍不存在

---

## 5. 兼容性

| dsh 版本 | 优化路由 / 模型调用 | 设置页 | 发送栏 / 面板 | 会话上下文 |
|---|---|---|---|---|
| **0.2.2-rc.1**(Web + 官方桌面端运行时) | ✅ 实测(成功产出优化稿) | ✅ 实测(标签页 + 设置卡读写) | ✅ 实测 | ✅ 契约核对 + 事件窗口实测降级 |
| **0.2.1-rc.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ 契约核对 |
| **0.2.1-rc.3 / rc.2** | ✅ | ✅ | ✅ | ✅ |
| **0.2.0-rc.2** | ✅ | ✅ | ✅ | ✅ |
| 0.1.5 / 0.1.2 / 0.1.1 / 0.1.0-rc.7+ | ✅ | ✅ | ✅ | 降级 |
| ≥ 0.3.0 | — | — | — | `engines.dsh` 拒绝安装(显式放弃) |

> 0.1.x 宿主没有 `phase` 字段,「发送即关闭」继续按草稿清空 / `running` / 队列判定,行为不变。

---

## 6. 结论

0.2.2-rc.1 对插件是**平台契约不变 + 交互语义增强**的一次升级。三个槽位、composer 标准 props、草稿读写、`ctx.llm` 与 `ctx.sessions` 读取路径全部保持;唯一需要跟进的运行时语义是发送期间的 `sending` 阶段,已在 v0.6.4 接入。其余为声明层适配与依赖版本线同步。真实 rc.1 Web 端到端已覆盖「成功产出优化稿、替换/撤回、设置卡渲染与持久化、零控制台错误」。