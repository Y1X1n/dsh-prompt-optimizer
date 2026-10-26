# DSH 0.2.1-rc.2 → 0.2.1-rc.3 差异调研(dsh-prompt-optimizer 面向面)

调研日期:2026-10-26
调研对象:上游 `github.com/deepseek-ai/deepseek-harness` tag `dsh-v0.2.1-rc.2`(`687f282e`)→ `dsh-v0.2.1-rc.3`(`1f81c047`);本机桌面端 `E:\DSH\resources\app.asar`(顶层 `@deepseek-ai/dsh-desktop@0.2.1-rc.3`,`dsh/package.json` = `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.3`)+ npm 上 `@deepseek-ai/*@0.2.1-rc.2` 与 `@0.2.1-rc.3` 的 tarball。
结论先行:**本插件在 0.2.1-rc.3 上可无损升级,源码零改动**(槽位契约、`ui-slots` 核心类型与实现、`connection`、`llm`、settings/`configForms`、包清单校验、客户端 `staticModules` 基线逐字节相同;`tsc --noEmit` 在 rc.3 客户端类型下 0 错误)。需要跟进的只有**声明层**:类型钉版、`package-lock.json`、`package.json` 的 `description`/`version` 与 README 兼容性声明;外加两处 rc.3 上游行为变化值得在 release notes 提示用户(见 §5.3)。

---

## 0. 调研方法与基线(可复现)

1. **上游语义**:`gh api` 逐 commit 取文件清单与 patch(compare API 的 files 只回 300 个,故按 6 个 commit 分别取);对关键源文件按 tag 下载 TS 源码做 `git diff --no-index`,行号可直接溯源。
2. **npm 类型实测**:把 `scripts/sync-types.mjs::PACKAGES` 里 19 个包 + `dsh-llm` + rc.3 新包/相关包共 45 个,用 `npm pack` 同时下载 `0.2.1-rc.2` 与 `0.2.1-rc.3` tarball 解包,对 `lib/**/*.d.ts` 与 `lib/**/*.js` 做**逐文件 SHA-256** 比对(只信字节,不信“看起来没变”)。
3. **桌面端实测**:用 `@electron/asar` 读 `app.asar`,取 307 个 `@deepseek-ai/*` 包的实际安装版本、`dsh-web-frontend` 的 `staticModules` 基线、各 client bundle 内的槽位声明字符串;再与 npm rc.3 tarball 做版本/导出面/内容对读。
4. **基线说明**:调研期间工作区里并行的适配工作已把 `scripts/sync-types.mjs` 与 `package.json` 的 devDeps 钉版改成 rc.3、`node_modules` 处于半同步状态,因此**本调研的 rc.2 基线一律使用另行下载的 rc.2 npm tarball**,不依赖工作区 `node_modules`;`package-lock.json` 仍是 rc.2(见 §5.1)。
5. 证据落盘:`C:\Users\yixin\AppData\Local\Temp\rc3-invest\`(rc2/、rc3/ npm 解包,asar/、asar-pkg/ 桌面端提取,out/ 报告与 patch,src/rc2|rc3 上游源码)。

上游 6 个 commit:

| commit | 标题 | 与本插件的关系 |
|---|---|---|
| `5ff29190` | feat(ui): add navigation entry customization (#6247) | 新增 3 个「更多菜单」槽位;ui-conversation 头部 More 菜单 + 草稿初始化 `whenDraftExists`;ui-primitives Menu/Tooltip |
| `67516495` | feat(analytics): track navigation entries and preset selections (#6600) | product-analytics 事件、ui-agent-preset、ui-sidebar 埋点;无插件面向契约变化 |
| `39d29038` | fix(ui): separate navigation pins from selection and show menu icons (#6883) | 上述能力的修复版:pin 与选中分离、菜单图标;仍全为加法 |
| `c48f8523` | feat(llm): follow the official /models listing on the DeepSeek API-key route (#6944) | llm-deepseek 协议/API-key/账号三条路由的模型目录;**插件消费的 `ctx.llm` 契约零变化** |
| `d02ea370` | release(dsh): 0.2.1-rc.3(版本号批量 bump) | 全部 package.json 版本 0.2.1-rc.2 → rc.3,无代码变化 |
| `1f81c047` | merge(release PR #6999) | 同上(合并提交) |

官方 release notes(`gh release view dsh-v0.2.1-rc.3`)原文要点:

- 新增左侧栏、会话视图和右侧栏的「更多」菜单,方便浏览和创建插件;
- 修复切换会话后,点击「新会话」找不回未发送草稿的问题;
- DeepSeek API Key 适配器的模型列表更新方式与账号登录模式保持一致。

---

## 1. 汇总表

| 面向面 | rc.3 状态 | 对本插件的影响 | 处置 |
|---|---|---|---|
| `conversation.input.right` / `conversation.input.dock` | **不变**:仍 `kind:'list'`, `scope:'session'`(d.ts 行号 +6,内容同 rc.2) | 无 | 无需改 |
| `settings.plugins.tab` | **不变**:`dsh-client-ui-settings` 契约与 `dsh-client-ui-settings-plugins` 实现逐字节相同;运行时仍声明 `{kind:'list', scope:'root'}` | 无 | 无需改 |
| `settings.plugin.item`(0.1.x legacy) | **仍不存在**:rc.3 npm 包 316 个文件 + 桌面端 58 个 client bundle 检索均 0 命中 | rc.2 轮已改成独立 `inject` 守卫,本轮无回归 | 无需改 |
| `ui-slots`(`SlotMap`/`SlotEntryDef`/`PropsRuntime`/`SlotCore`) | **逐字节不变**:3 个 `.d.ts` 与 `lib/index.js` SHA-256 全等 | 无 | 无需改 |
| `ConnectionHandle` / `rpc.call` | **逐字节不变**(18 个 `.d.ts` 全等,3 个 js 全等) | 无 | 无需改 |
| `dsh-llm`(`LlmRuntime`/`GenerateOptions`/`ModelInfo`/`stream`) | **逐字节不变**(15 个 `.d.ts`、16 个 js 全等) | 无 | 无需改 |
| `configForms` / `ConfigFormSnapshot` | **逐字节不变**(`ui-settings` 9 个 `.d.ts` 全等) | 无 | 无需改 |
| `SessionSnapshot`(ui-conversation `contract/snapshot.d.ts`) | **逐字节不变** | `useSession(s=>s).running/.queue`、`InputZone.session` 仍成立 | 无需改 |
| `ctx.sessions.binding(id).eventSource`(上下文来源) | `api-session-controller` 38 个 js 全等;仅 1 个 `.d.ts` 注释变化 | 无 | 无需改 |
| `ctx.modelDirectories.directoryFor(id).load()` | `ui-model-selection` 9 个 `.d.ts` 全等、src 无 diff | 无 | 无需改 |
| `InputActions.setDraft` / `InputState.draft` / `useInput` / `sessionId` | **不变**;`ui-session` 的 `SessionStandardProps`(useSession/sessionId/useProjection/useAccess)3 个 `.d.ts` 全等 | 面板「替换/撤回」路径不变 | 无需改 |
| 草稿初始化 `requestDraftInitialization` | **语义扩展**:新增 `whenDraftExists: 'replace'|'append'|'keep'`,缺省由 `clearPreviousDraft` 决定(默认 `keep`) | 插件直接用 `inputActions.setDraft`(等价 replace),**不经过该 API** | 无需改 |
| `DraftEditorRuntime.appendDraft` | **新增方法**(加法) | 未使用 | 可选 |
| `MessageSubmissionState` | **新增必填 `newSession` + 可选 `agentPreset`** | 这是宿主产出的事件负载,插件不构造/不读取 | 无需改 |
| 新包 `ui-entry-customization` + 3 个新槽位 | **加法**:`sidebar.panellist.actions`、`conversation.session.header.views.actions`、`sidebar.right.tab.guide.actions` | 与本插件无交集(README 明示不加设置页入口) | 无需改,可选采纳 |
| `ui-sidebar` / `ui-sidebar-right` 契约 | **加法**(3 个新槽位 + `setPinned`/`trackEntryClick`/`entryPins` 等,只给这些槽位的占用者) | 无 | 无需改 |
| `ui-primitives` Menu/Tooltip/icons | **加法 + 内部重构**(`current`、`minWidthFromAnchor`、tooltip 定位模块);插件不依赖 primitives | 无 | 无需改 |
| LLM 三条 DeepSeek 路由 | 官方 API-key 路由改为**跟随 `/models` 目录**;模型 id 不变,**内置上下文窗口 64K→1M** | 类型零变化;模型集合可能随账号/时间变化,插件已有降级/错误态 | 无需改(建议 release notes 提示) |
| `dsh-package-manifest` / `dsh-app-boot` 校验 | **逐字节不变**(manifest 2 个 `.d.ts`、app-boot 23 个 `.d.ts` + `lib/index.js` 全等) | `manifestVersion:1`、`engines.dsh`、`dsh.client.inject` 语义全部不变 | 无需改 |
| 桌面端 `staticModules` 基线 | **不变**:react / react/jsx-runtime / react-dom / react-dom/client / cordis / zod / @tanstack/react-virtual / client-store / ui-slots / ui-primitives / ui-dockkit | 插件 client bundle 只 require `react`、`react/jsx-runtime`,仍在基线内 | 无需改 |
| 桌面端 asar 与 npm rc.3 | **一致**:41 个可对读包版本全等;client bundle 仅 CSS-module 哈希盐/构建路径不同 | 无 | 无需改 |
| 类型基线(`sync-types` PACKAGES)/ lock | 钉版仍为 rc.2(工作区已把 PACKAGES/devDeps 改 rc.3,但 lock 未刷新) | 影响 CI `npm ci` 与 typecheck 基线 | **必须改**(见 §5.1) |

---

## 2. 逐项证据

### 2.1 槽位:仍然声明、签名未变(Q1)

**`conversation.input.dock` / `conversation.input.right`** —— `@deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.3` `lib/types/client/contract/slots.d.ts`:

```ts
// :300
/** Full-width entries above the composer card. */
'conversation.input.dock': {
    kind: 'list';
    scope: 'session';
    owner: InputZone;          // { session: SessionSnapshot; input: InputState }
};
// :321
/** Compact controls before the composer submit action. */
'conversation.input.right': {
    kind: 'list';
    scope: 'session';
};
```

对照 rc.2 同文件(`:295` / `:316`):**内容逐字相同**,rc.3 只是被新增的 `conversation.session.header.views.actions` 声明整体下移 6 行。
运行时侧同款声明在 `dsh-client-ui-conversation/lib/client.js`(npm rc.3 `:19938`/`:20101`;桌面端 asar `client.js` 偏移 `767727`/`772690`):

```js
"conversation.input.dock": { kind: "list", scope: "session" },
...
"conversation.input.right": { kind: "list", scope: "session" },
```

**`settings.plugins.tab`** —— `@deepseek-ai/dsh-client-ui-settings@0.2.1-rc.3` `lib/types/client/contract/slots.d.ts:85-89`(与 rc.2 完全同一位置同一内容):

```ts
/** ... Options: `id` (tab key), `order` (tab order), and `label` (registrant-localized tab text). */
'settings.plugins.tab': {
    kind: 'list';
    scope: 'root';
    owner: SettingsPluginsTabOwnerProps;
};
```

运行时声明由 `dsh-client-ui-settings-plugins/lib/client.js:208-211` 给出(rc.3 npm 与 asar 相同):

```js
children: { "settings.plugins.tab": {
    kind: "list",
    scope: "root"
} }
```

`dsh-client-ui-settings-plugins` 的 4 个 `.d.ts`、2 个 js **逐字节不变**(见 §2.6),即注册选项 `{name,id,order,label,inject}` 与 rc.2 完全一致。

**`settings.plugin.item`(0.1.x legacy)** —— rc.3 **仍然彻底不存在**:

- npm rc.3 全量 tarball 的 316 个 `*.js/*.d.ts/*.json` 检索 `settings\.plugin\.item` → **0 命中**;
- 桌面端 `app.asar` 的 58 个 `dsh-client-ui-*/lib/client.*.js` + `dsh-client-ui-settings-plugin-inventory` 检索 → **0 命中**(`dsh-client-ui-settings-plugin-inventory`、`dsh-client-ui-settings-plugins` 只有 `settings.plugins.tab`)。

因此 `src/client/index.tsx:174-175` 的「两个槽位各自独立 `inject`」写法在 rc.3 上依旧正确,不会触发 `SlotCore.register` 的 `slot "settings.plugin.item" is not declared` 同步抛错。

**`ui-sidebar` / `ui-sidebar-right` 现有槽位**:`sidebar.*` / `sidebar.right.*` 旧条目仅源码行号引用漂移 + 新增 3 个槽位(见 §2.3),无删除、无 kind/scope 变化。

### 2.2 ui-conversation 内部改动,与插件四条路径(Q2)

rc.3 对 `packages/client/ui-conversation` 的源码改动(commit `5ff29190` + `39d29038` + 一处 analytics):

| 文件 | 改动 | 与本插件(按钮/面板/读草稿/写草稿/提交) |
|---|---|---|
| `contract/slots.ts` | +`conversation.session.header.views.actions` 槽位、+`ConversationViewActionEntry`/`ConversationViewActionsOwnerProps`、`ConversationSessionHeaderInjected` 增 `setPinned` + `hooks.entryPins/entryActions`、`ConversationSessionHeaderSlotProps` 的 `PropsRenderSlots` 增该槽位 | **无关**(仅 header 槽位占用者) |
| `apply.ts` | `:229` 新增 `viewPins`;`:231` `viewActions` 由 `slots.entriesOfSlot(...)` 驱动;`:437-446` header children 增槽位、inject 增 `hooks/setPinned` | **无关** |
| `input/facade.ts` | `:293` 起 `requestDraftInitialization` 改为 `whenDraftExists` 三态:`replace` 直接 `setDraft`;`keep` 返回 preserved;`append` 调 `draftEditor.appendDraft` | **无关**:插件不走该 API,走 `inputActions.setDraft` |
| `input/editor/runtime.ts` | `setDraft` 抽出 `$appendParagraphs`(行为等价);`:203` 新增 `appendDraft` | **无关**(`setDraft` 语义不变) |
| `skeleton/ConversationSession.tsx` | `:28` 新增 `ViewsMoreMenu`;header tab 行按宽度预算折叠进 More 菜单 | **无关**(按钮在 composer 工具行,不在 header) |
| `contract/composer-submission.ts` | `MessageSubmissionState` +必填 `newSession`、+可选 `agentPreset` | **无关**:宿主产出的事件负载,插件不构造不消费 |
| `input/hub.ts`、`input/submission-analytics.ts` | 提交埋点 | 无关 |
| `contract/input.ts` | 仅 `DraftInitializationOptions` 文档 + `whenDraftExists` 字段(见上);`InputActions`/`InputState` 未动 | 插件用的 `inputActions.setDraft`(`input.d.ts:237-250`,`setDraft` 在 `:248`)、`InputState.draft`(`:269-271`)不变 |

**插件实际依赖的面全部经受住逐字节核对**:

- `PropsRuntime<'conversation.input.right'>` 与 `PropsRuntime<'conversation.input.dock'>` 的组成:
  - `ui-slots` 的 `PropsRuntime`(`lib/types/index.d.ts:226`)所在文件 SHA-256 与 rc.2 **相同**;
  - session scope 标准件由两个包合并声明:`ui-conversation/contract/slots.d.ts:423-437`(`useConversation`/`useInput`/`inputActions`,与 rc.2 相同段落)与 `ui-session` 的 `SessionStandardProps`(`useSession`/`sessionId`/`useProjection`/`useAccess`,`ui-session` 3 个 `.d.ts` 全等);
  - `conversation.input.dock` 的 `owner: InputZone`(`slots.d.ts:386-390`)提供 `session`/`input` 快照,与 rc.2 相同。
- 插件代码路径:`OptimizeButton.tsx:48` `p.useInput(...).draft`、`:60` `controller.optimize(draft, p.sessionId)`;`ResultDock.tsx:176-181` `useInput/useSession/inputActions`、`:290`/`:294` `inputActions.setDraft(...)`。rc.3 下这些 prop 的名字、形状、来源均不变。
- 结果面板「发送即关闭」判据(`controller.ts:68-79`:`input.draft` 清空 / `session.running` 翻真 / `queue` 变长)依赖 `SessionSnapshot` 的 `running`/`queue`;**`contract/snapshot.d.ts` 与 rc.2 SHA-256 相同**。

结论:插件「发送栏按钮 + dock 面板 + 读/写草稿 + 提交」路径在 rc.3 上无变化,无需适配。

### 2.3 新包 `ui-entry-customization` 与「更多菜单」(Q3)

rc.3 新增客户端包 `@deepseek-ai/dsh-client-ui-entry-customization@0.2.1-rc.3`,由 web-app bundle 默认加载(commit patch,`packages/bundle/web-app/cordis.patch.yml`):

```yaml
+    # Region-local More menus: pin or unpin plugin launchers and start a
+    # plugin draft.
+    - id: entry-customization
+      name: '@deepseek-ai/dsh-client-ui-entry-customization'
```

它注册 3 个**新的「更多菜单」槽位**(`packages/client/ui-entry-customization/src/client/index.ts:44/48/52`):

```ts
ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
  name: 'sidebar.panellist.actions', id: 'entry-customization', locale: 'entryCustomization',
  inject: () => injected('sidebar'),
}, EntryMenuContent))
ctx.slots.inject('conversation.session.header.views.actions', () => ctx.slots.register({ ... }, EntryMenuContent))
ctx.slots.inject('sidebar.right.tab.guide.actions', () => ctx.slots.register({ ... }, EntryMenuContent))
```

槽位声明(三处契约,**全为加法**):

- `ui-conversation/contract/slots.d.ts:256-262`:`'conversation.session.header.views.actions': { kind:'list'; scope:'root'; owner: ConversationViewActionsOwnerProps }`
- `ui-sidebar/contract/slots.d.ts`:`'sidebar.panellist.actions': { kind:'list'; scope:'root'; owner: SidebarPanelActionsOwnerProps }`
- `ui-sidebar-right/contract/slots.d.ts`:`'sidebar.right.tab.guide.actions': { kind:'list'; scope:'root'; owner: SidebarRightGuideActionsOwnerProps }`

插件可注册性:`slot-catalog.ts` 已收录这 3 个槽位(rc.3 新增条目 `:1836` / `:3748` / `:4293`),注册选项只有 `id/order/label`,与普通 list 槽位一致——**理论上任何插件都能注册进去**,这是 rc.3 新开放的插件入口。但:

1. 它们是「导航区 More 菜单的行」,与设置页无关;
2. **设置页语义未被改动**:`settings.plugins.tab` 契约、`dsh-client-ui-settings-plugins` 实现均逐字节不变(§2.1、§2.6);`ui-entry-customization` 不注册任何 settings 槽位;
3. 官方消费方自己的用法是 `ctx.uiWorkspace.startSession(undefined, { agentPreset:'cordis', prompt, whenDraftExists:'append' })`(`ui-entry-customization/src/client/index.ts:40`),即 rc.3 的「创建插件」只是**准备草稿**、不发送;
4. 新增的服务成员只给这些槽位的占用者:`ConversationSessionHeaderInjected.setPinned` + `hooks.entryPins/entryActions`、`SidebarRootInjected.setPinned/trackEntryClick`、`GuideMoreIcon` 等——插件不占用这些槽位,拿不到也不需要。

结论:对本插件**无影响**;若将来想在「更多菜单」里挂入口,rc.3 提供了现成槽位(属新功能,不是适配必需)。

### 2.4 ui-primitives(Q4)

rc.2→rc.3 的公开差异(`ui-primitives` 4 个 d.ts 变化):

- `Menu.d.ts`:`MenuItemButtonProps` 新增 `current?: boolean`(渲染 `aria-current="page"`);`Menu` 新增 `minWidthFromAnchor?: boolean`(portal 模式下菜单不窄于锚点,受视口边距约束)。
- `Tooltip.d.ts`:定位实现抽到新模块 `tooltip-placement.d.ts`(`TooltipSide` 改为 re-export);`side` 语义从「固定边」变为「首选边 + 翻转/垂直候选」;`align`/`gap` 文档随实现调整。公开 props 无删除。
- `icons/index.d.ts`:新增 `IconAppsAddOutlineRegular` / `IconAppsAddOutlineMedium`。

插件侧:插件**不 import `ui-primitives`**(`src/` 内所有 `@deepseek-ai/*` import 见附录),`SettingsCard` 为自绘;client bundle 的 externals 为 `react/react-dom/react/*/@deepseek-ai/*`,实际 `require` 只有 `react`、`react/jsx-runtime`(`lib/client.js` 实测)。且桌面端并不把 primitives 作为独立包发布(它被 web-frontend 打进 `staticModules`,见 §2.8),插件本就不该在运行时 require 它。

结论:**无影响**。唯一需要留意的间接面是「官方输入栏/面板外观」——本插件按钮/面板全部用 inline style + 自有注入 CSS( `.dsh-po-*`),不依赖 primitives 的 DOM 结构;rc.3 的 Tooltip/Menu 改动不会改变插件元素。

### 2.5 LLM 线(c48f8523)(Q5)

**插件消费的契约零变化**:`@deepseek-ai/dsh-llm@0.2.1-rc.3` 的 15 个 `.d.ts` 与 16 个 js **逐字节不变**(`lib/types/types.d.ts` 即 `GenerateOptions` 所在文件 SHA-256 相同),`ctx.llm.listProviders()/listModels()/resolveModelInfo()/stream()` 的签名、返回结构(`ModelInfo`、`LlmReasoningEffortInfo.efforts`)与实现完全不变。

变化全部在**适配器/目录层**(`packages/llm/*`,不被插件直接 import):

1. `llm-deepseek/src/models.ts:5`:内置目录上下文窗口从 `DEFAULT_CONTEXT_WINDOW` 改为 `OFFICIAL_CONTEXT_WINDOW = 1_048_576`(1M);**模型 id/名称不变**:`deepseek-flash`(DeepSeek-V4.1-Flash)、`deepseek-v4-pro`(DeepSeek-V4-Pro)。
2. `llm-deepseek/src/listing-config.ts`(新增):`modelsTimeoutMs`/`modelsMaxAgeMs` 从账号路由下沉为共享字段(`DEFAULT_MODELS_TIMEOUT_MS=5000`、`DEFAULT_MODELS_MAX_AGE_MS=600000`)。
3. `llm-deepseek-api-key/src/config.ts:15/59`:仅当 baseURL 是官方源(`OFFICIAL_ORIGIN`)且 `models` 等于内置目录时,才启用「跟随 `/models` 列表」(`listing: { url, timeoutMs, maxAgeMs }`)。
4. `llm-deepseek-api-key/src/index.ts:85-114`:注册 provider 时改走 `connect`/`admit`/`discoverModels` 的 listing 流程:
   - `connect` 失败(网络/超时)时**不阻断**:`:96-101` catch 后回落到配置目录;注释明确「cache 保留上一份 listing,不在 connect 阶段 gate,`resolveAuth` 会在模型请求上报错(此时 turn 已记录 prompt)」;
   - `admit` 用 `refuseListedModel` 对「目录声明了客户端版本要求/不支持」的模型抛 `CLIENT_UPGRADE_REQUIRED` / `MODEL_UNSUPPORTED`;
   - `discoverModels`:`:106-114` 无 listing(非官方源/自定义 models)时沿用「有凭据 → 内置目录,无凭据 → []」;有 listing 时返回 `offered`(列表 ∩ 内置目录)。
5. `llm-deepseek-account`:配置/缓存重构为复用 `ModelListingCache`、`resolveListedCatalog`(删除自己的 `catalog.ts`/`listing.ts`/`resolve-catalog.ts`,行为等价);provider id 仍为 `deepseek-account`,API-key 路由仍为 `deepseek-official`。
6. 列表缓存语义(`llm-deepseek/src/listing-cache.ts`,`view()` 位于 rc.3 源 `:147-173`):按「endpoint+凭据哈希」分域、single-flight、过期后台刷新、**保留 last-known-good**;`view()` 不因单次加载失败而抛错,`current()` 只返回已发布视图。

对插件的实际影响:

- `resolveRoute`(`src/index.ts:361-391`)的 `pinned 'provider/model' → body → listProviders()[0]/listModels(provider)[0]` 逻辑仍成立;provider id、模型 id 均不变,不存在「旧 id 失效」的破坏。
- `resolveLowestEffort`(`src/index.ts:333-352`)读 `resolveModelInfo(provider, model).reasoning?.efforts`,类型与语义不变。
- **行为变化(非破坏)**:官方 API-key 路由的**可选模型集合**改由 `/models` 实时决定(∩ 内置目录)。若用户把「固定模型」设为一个当前账号/时刻不再被列出的模型,优化请求会在宿主侧被 `admit` 拒绝,插件面板落入 error 态并显示宿主错误(可见、可重试),不是崩溃。
- `session/modelCatalog` RPC(`src/client/host-faces.ts:62-75`)与 `ctx.modelDirectories.directoryFor(id).load()`(host-faces.ts:78-94)返回结构不变(`ui-model-selection` 9 个 `.d.ts` 全等,src 无 diff),设置卡下拉无需改。
- 上下文窗口 1M 只体现在 `resolveModelInfo(...).contextWindow`;插件未读取该字段,无影响。

### 2.6 npm 类型包 rc.2→rc.3 实测 diff(Q6)

方法:两侧都用**新下载的 npm tarball**(`0.2.1-rc.2` vs `0.2.1-rc.3`),按 `lib/**/*.d.ts` 逐文件 SHA-256 比对。完整报告落盘 `out/dts-diff-rc2-rc3.txt`。

**逐字节相同(SAME)的包**(32 个,含插件全部直接类型依赖):

| 包 | .d.ts 数 | 包 | .d.ts 数 |
|---|---|---|---|
| **dsh-client-ui-slots** | 3 | **dsh-client-connection** | 18 |
| **dsh-llm** | 15 | **dsh-client-ui-settings** | 9 |
| **dsh-client-ui-renderer** | 8 | **dsh-client-ui-settings-plugins** | 4 |
| **dsh-client-ui-session** | 3 | **dsh-package-manifest** | 2 |
| **dsh-app-boot** | 23 | **dsh-session** | 10 |
| dsh-client-ui-model-selection | 9 | dsh-api-remotes | 4 |
| dsh-client-locale | 10 | dsh-client-modules | 8 |
| dsh-client-store | 2 | dsh-client-ui-dockkit | 21 |
| dsh-client-ui-chat | 97 | dsh-client-ui-settings-general | 16 |
| dsh-api-gateway | 12 | dsh-cordis-client-runner | 11 |
| dsh-commands | 5 | dsh-llm-retry | 3 |
| dsh-session-projection | 2 | dsh-token-meter | 11 |
| dsh-tool-todo | 3 | dsh-tools | 10 |
| dsh-client-web | 11 | dsh-deepseek-llm-api-extensions | 2 |
| dsh-api-settings-controller | 5 | dsh-attachment | 6 |
| dsh-brand | 1 | dsh-client-shortcuts | 13 |

**有变化的包**(按与插件相关性排序):

| 包 | 变化文件 | 影响 |
|---|---|---|
| `dsh-client-ui-conversation` | CHANGED `contract/composer-submission.d.ts`、`contract/input.d.ts`、`contract/slots.d.ts`、`client/index.d.ts`、`input/editor/runtime.d.ts`、`input/facade.d.ts`、`locales.d.ts`、`skeleton/ConversationSession.d.ts`;ADDED `view-pins.d.ts` | 见下逐条,全部加法/文档;**唯一必填新增字段 `MessageSubmissionState.newSession` 属宿主产出负载** |
| `dsh-llm-deepseek` | CHANGED `config/models/index`;ADDED `listed-catalog/listing-cache/listing-config/listing` | 插件不直接 import |
| `dsh-llm-deepseek-api-key` / `dsh-llm-deepseek-account` | 前者 config/index;后者 config + 删 `catalog/listing/resolve-catalog` | 插件不直接 import |
| `dsh-client-ui-primitives` | `Menu/Tooltip/icons` + ADDED `tooltip-placement` | 插件不 import |
| `dsh-client-ui-sidebar` | `contract/slots` + `SidebarRoot/HeaderLeadingControls/index/locales`;ADDED `panel-pins` | 插件未用该槽位族 |
| `dsh-client-ui-sidebar-right` | `contract/slots` + `index/locales/GuideBody`;ADDED `guide-pins/GuideMoreIcon` | 同上 |
| `dsh-client-ui-workspace` | `client/navigation.d.ts`(`StartSessionOptions`/`whenDraftExists` 文档 + 行为) | 插件未用 `uiWorkspace` |
| `dsh-client-product-analytics` | `client/index.d.ts`、`events.d.ts`(新增 `more_menu_item_click`/`sidebar_menu_click`) | 插件不上报埋点 |
| `dsh-client-ui-agent-preset` | `seat-store.d.ts`;ADDED `analytics.d.ts` | 插件未用 |
| `dsh-client-ui-plugin-manager` | `client/index.d.ts` | 插件未用 |
| `dsh-api-session-controller` | `contract/sessions/service.d.ts` 仅 `SessionSummary.blank` 注释 | 无(插件走结构面) |
| `dsh-client-ui-entry-customization` | rc.2 不存在该包(ADDED 整包) | 无 |

关键类型逐项确认(全部“无变化”):

- `SlotMap` / `SlotEntryDef` / `PropsRuntime`:`ui-slots/lib/types/index.d.ts` 与 `lib/index.js` SHA-256 与 rc.2 相同(定义处 `:17` / `:96` / `:226`)。
- `ConnectionHandle`:`ui-client-connection` 18 个 d.ts 全等(`types/client/connection.d.ts` 逐字节相同),3 个 js 全等。
- `ConfigFormSnapshot`:`ui-settings/lib/types/client/config-form-types.d.ts` 与 rc.2 相同(rc.2 轮删掉的 `mode` 字段没有回归)。
- `GenerateOptions`:位于 `dsh-llm/lib/types/types.d.ts`,与 rc.2 相同。
- `LlmRuntime`:`dsh-llm/lib/types/index.d.ts` 相同。
- `SessionSnapshot`:`ui-conversation/lib/types/client/contract/snapshot.d.ts` 与 rc.2 相同。

`ui-conversation` 变化的精确内容(rc.2→rc.3):

```diff
// contract/slots.d.ts —— 只加不改
+/** Rows of the View tab row's More menu; ... */
+'conversation.session.header.views.actions': { kind:'list'; scope:'root'; owner: ConversationViewActionsOwnerProps }
+export interface ConversationViewActionEntry { id; label; pinned; active? }
+export interface ConversationViewActionsOwnerProps { entries; onOpen; onPinnedChange; onDismiss }
 // ConversationSessionHeaderInjected.hooks 增 entryPins/entryActions、增 setPinned
 // ConversationSessionHeaderSlotProps 的 PropsRenderSlots 增该槽位

// contract/input.d.ts —— DraftInitializationOptions 加一个可选字段
+readonly whenDraftExists?: 'replace' | 'append' | 'keep'
 // InputActions / InputState / SessionInputResolver 未变

// contract/composer-submission.d.ts —— 事件负载加字段
+readonly newSession: boolean          // 必填!但只由宿主构造
+readonly agentPreset?: string

// input/editor/runtime.d.ts
+appendDraft(text: string): void
// input/facade.d.ts —— 仅 requestDraftInitialization 的 @param 文档

// skeleton/ConversationSession.d.ts —— ConversationSessionHeader 解构参数新增 setPinned/useEntryPins/useEntryActions
// locales.d.ts —— +'session.moreViews' / 'session.moreViewsCurrent'
// client/index.d.ts —— 导出列表 +ConversationViewActionEntry/ConversationViewActionsOwnerProps
```

`tsc --noEmit` 实测:在本机工作区(客户端相关包已是 rc.3)运行 **exit=0、零错误**。插件只 import 上面这些包的类型,且未构造 `MessageSubmissionState`,故升级后无需改任何 `src/`。

### 2.7 package manifest / engines / staticModules baseline(Q7)

**包清单规则零变化**:

- `@deepseek-ai/dsh-package-manifest@0.2.1-rc.3`:2 个 `.d.ts`(含 `DshManifest`/`DshClientManifest`/`DshEnginesManifest`)与 rc.2 **逐字节相同**;`lib/index.js` 仍是 `export {};`(纯类型包)。`manifestVersion?: 1`、`client.inject?: string[]`(“Informational package-name dependencies, not Cordis service injection”)、`external?: string[]` 文档不变。
- `@deepseek-ai/dsh-app-boot@0.2.1-rc.3`:23 个 `.d.ts` **逐字节相同**,`lib/index.js`(203,572 字节,包含 `engines.dsh` 启动期 `semver.satisfies(..., { includePrerelease:true })` 校验逻辑)与 rc.2 tarball **逐字节相同**。rc.3 对该包只改了 `package.json` 版本号与内部依赖钉版(d02ea370/1f81c047)。
- 现有声明仍有效:`dsh.manifestVersion: 1`、`engines.dsh: ">=0.1.0-rc.7 <0.3.0-0"`、`dsh.client.inject: [...]`。
- `engines.dsh` 区间实测(用 npm 自带 semver,`includePrerelease: true`):

```
>=0.1.0-rc.7 <0.3.0-0
  0.1.0-rc.7 -> true
  0.2.1-rc.2 -> true
  0.2.1-rc.3 -> true      ← 本轮目标
  0.2.2      -> true
  0.3.0-rc.0 -> false     ← 尾界 `<0.3.0-0` 正确挡住 prerelease
  0.3.0      -> false
```

**staticModules 基线不变**(桌面端 `app.asar` 内 `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js`,偏移 `~917675` 处的 `OZ()` 函数):

```js
function OZ(){return{react:aC,"react/jsx-runtime":dC,"react-dom":gC,"react-dom/client":_C,
"@deepseek-ai/cordis":Ub,zod:Vj,"@tanstack/react-virtual":Xj,
"@deepseek-ai/dsh-client-store":xI,"@deepseek-ai/dsh-client-ui-slots":jI,
"@deepseek-ai/dsh-client-ui-primitives":TU,"@deepseek-ai/dsh-client-ui-dockkit":SZ}}
```

与 rc.2 相同。插件 `lib/client.js` 只 `require("react")`、`require("react/jsx-runtime")`,二者都在基线内,继续无需 `dsh.client.external`。

### 2.8 桌面端 app.asar vs npm rc.3(Q8)

**身份**:

| 项 | 值 | 证据 |
|---|---|---|
| asar 顶层包 | `@deepseek-ai/dsh-desktop@0.2.1-rc.3` | `app.asar` 根 `package.json` |
| 运行时包 | `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.3` | `dsh/package.json` |
| release 元数据 | `version=0.2.1-rc.3`, `hostProtocolVersion=4`, `nodeVersion=24.21.0`, `pnpmVersion=11.28.5`, `platform=win32`, `arch=x64` | `dsh/desktop-runtime.json` |
| build commit | `be72761ee1a6736ebcdf4f3739363b083ae53c98`(任务上下文给定;asar 的 `desktop-runtime.json` 不携带 commit 字段,无法从 asar 独立复核,故仅记录) | — |

**asar 内 307 个 `@deepseek-ai/*` 包的实际版本**:所有 `dsh-*` 运行时包均为 **0.2.1-rc.3**(全量核对:58 个 `dsh-client-ui-*` 客户端 bundle、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-modules`、`dsh-client-product-analytics`、`dsh-client-shortcuts`、`dsh-cordis-client-runner`、`dsh-llm`、`dsh-llm-deepseek`、`dsh-llm-deepseek-account`、`dsh-llm-deepseek-api-key`、`dsh-session` 系列、`dsh-package-manifest`、`dsh-app-boot`、`dsh-api-*`、`dsh-web-frontend` 全部 rc.3)。例外只有工具链/第三方:

```
cordis@4.0.5, cordis-plugin-group@1.0.5, cordis-plugin-include@1.0.10,
cordis-plugin-loader@1.0.6, cordis-plugin-timer@1.1.7, cosmokit@1.8.6,
schemastery@3.18.5, libreoffice-kit@0.1.5, libreoffice-kit-win32-x64@0.1.5,
node-addon-system@0.1.2
```

其中 8 个与 asar 根 `node_modules` 下的副本同名同版本(`cordis`、`cosmokit`、`dsh-api-gateway`、`dsh-brand`、`dsh-deque`、`dsh-timeout`、`dsh-typert-protocol`、`schemastery`),版本一致,无“双版本”问题。

**注意**:`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-store`、`dsh-client-ui-dockkit` 这 4 个“客户端基线模块”在 asar 内**没有独立包目录**(检索 0 条目),它们被打进 `dsh-web-frontend@0.2.1-rc.3` 的 `staticModules` 表(§2.7)。因此插件运行时不应 require 它们(插件确实没有:仅类型引用 `ui-slots`)。

**asar 与 npm rc.3 一致性**:

- 对 45 个本地 npm rc.3 包逐一比对版本:除 `dsh-client-store`/`dsh-client-ui-dockkit`/`dsh-client-ui-primitives`/`dsh-client-ui-slots`/`dsh-client-web` 这 5 个“不作为独立包发布到 asar”的(见上)外,**其余 40 个包版本完全一致,全部 0.2.1-rc.3**,没有 asar 停在旧版本的情况。
- 运行时 JS 内容:对 11 个重点包逐文件 SHA-256 —— `dsh-client-connection`(3/3)、`dsh-client-ui-settings`(2/2)、`dsh-client-ui-renderer`(2/2)、`dsh-session`(11/11)、`dsh-api-session-controller`(38/38)、`dsh-llm`(16/16)**全部一致**,`dsh-client-ui-slots` 的 `lib/index.js` 也一致。仅 3 个客户端 bundle 存在差异,经逐段核对**仅构建差异**:

| 文件 | asar 字节 | npm 字节 | 差异性质 |
|---|---|---|---|
| `dsh-client-ui-conversation/lib/client.js` | 782,342 | 782,288 | 首处差异在 CSS-module 区:`//#region \0dsh-css:D:\ci\runners\...`(Windows CI)vs `/home/runner/work/...`(Linux CI);随后是 CSS module 类名哈希盐(`_2STzOG_` vs `BNl2La_`) |
| `dsh-client-ui-settings-plugins/lib/client.js` | 9,473 | 9,473 | 仅 CSS 哈希盐(`XAL7Ya_` vs `pbvGtq_`) |
| `dsh-client-locale/lib/client.js` | 62,521 | 62,521 | 仅 CSS 哈希盐(`CDP_Dq_` vs `hVGvvW_`) |

  证据:三者导出面(module `exports.*`)完全一致(分别 14 / 2 / 6 个,集合相同);asar 版 `dsh-client-ui-conversation/lib/client.js` 同样包含 `"conversation.input.right": {kind:"list",scope:"session"}`(偏移 772690)、`"conversation.input.dock"`(767727)与新增的 `"conversation.session.header.views.actions": {kind:"list",scope:"root"}`(771571)。

结论:桌面端 0.2.1-rc.3 与 npm 0.2.1-rc.3 **语义一致**,可放心以 npm 类型包 + 桌面端 asar 双向作为适配依据。

---

## 3. 插件现状逐项核对(代码级)

| 插件文件 | 用到的宿主面 | rc.3 状态 | 结论 |
|---|---|---|---|
| `src/client/index.tsx` | `slots.inject/register` × 4(`conversation.input.right`、`conversation.input.dock`、`settings.plugins.tab`、`settings.plugin.item`)、`configForms`、`settingsScope`、`locale`、`modelDirectories`、`sessions` | 前 3 个仍声明且签名不变;`settings.plugin.item` 仍不存在(已有独立守卫);其余服务均存在 | 无需改 |
| `src/client/OptimizeButton.tsx` | `PropsRuntime<'conversation.input.right'>` + `useInput()` 的 `draft` + `sessionId` | 类型来源逐字节不变 | 无需改 |
| `src/client/ResultDock.tsx` | `PropsRuntime<'conversation.input.dock'>` + `useInput`/`useSession`/`inputActions.setDraft` + `InputZone.session/input` | 同上;`setDraft`、`SessionSnapshot` 不变 | 无需改 |
| `src/client/controller.ts` | `sessions.binding(id).eventSource`、`modelDirectories.directoryFor().load()`、`connection.rpc.call('/api','session/modelCatalog')` | `api-session-controller`/`ui-model-selection` 契约不变 | 无需改 |
| `src/client/host-faces.ts` | 上述服务的自持结构面 | 结构面与上游形状仍匹配 | 无需改 |
| `src/client/settings-face.ts`、`SettingsCard.tsx` | `configForms.get(entryId)` 快照 `{status,value,writable}` | `ui-settings` d.ts/js 全等 | 无需改 |
| `src/client/i18n.ts` | 自持文案 | 无上游依赖;rc.2 轮“内存模式”文案已修,rc.3 未回退 | 无需改 |
| `src/index.ts`(Host 半) | `ctx.llm.listProviders/listModels/resolveModelInfo/stream`、`GenerateOptions`、schemastery、HTTP 路由注册 | `dsh-llm` 逐字节不变;provider id/模型 id 不变 | 无需改 |
| `cordis.patch.yml` | 组合行 `insert id: prompt-optimizer` | 无变化需求(entry id 与 settings 命名空间绑定,仍一致) | 无需改 |
| `scripts/sync-types.mjs` | 类型钉版 | 工作区已把 PACKAGES 19 项与注释升到 rc.3(核对通过) | 已改(保持) |
| `package.json` | 版本/描述/devDeps/`dsh` 字段 | devDeps 已升 rc.3;描述仍写 rc.2;version 未 bump | **必须补**(见 §5.1) |
| `package-lock.json` | 锁文件 | **仍锁 0.2.1-rc.2**(slots/llm/brand/timeout/typert/…,含 `resolved`/`integrity`) | **必须补** |
| `README*.md` / `docs/release-*.md` | 兼容性声明 | 仍宣称 rc.2 | **建议补** |

---

## 4. 会崩 / 静默降级 / 可无损升级(Q9 结论)

### 4.1 会崩(必须改代码才能运行):**无**

- 4 个槽位:3 个仍声明、1 个(legacy)仍不存在且已有独立 `inject` 守卫;
- 所有类型契约:插件 import 的 7 个上游包中,`ui-slots`/`connection`/`llm`/`ui-renderer`/`ui-settings-plugins` 逐字节不变,`ui-conversation` 仅加法,`cordis` 4.0.4→4.0.5 为 patch;
- 包清单/启动校验:app-boot 与 package-manifest 逐字节不变,`engines.dsh` 覆盖 rc.3;
- 客户端模块装载:`staticModules` 基线不变,插件 external 只有基线内的 react。

### 4.2 静默降级(不崩但行为可能不如预期):**3 处,均非回归,宜文案提示**

1. **模型目录变为“跟随官方 /models”**(rc.3 有意变更,见 §2.5):官方 API-key 路由下,设置页/会话模型目录里的模型集合可能随账号与时间变化;若用户固定了一个当前不被列出的模型,优化会以宿主错误结束(插件面板 error 态可见、可重试)。建议 release notes 提示「模型列表以 dsh 当前目录为准」。
2. **上下文窗口 1M**:若插件/文档曾按旧 64K 描述模型能力(插件当前不读该字段),文案层面留意即可。
3. **新「更多菜单」槽位未注册**:不影响本插件;只是说明 rc.3 的新入口我们暂未使用(产品选择,不是降级)。

### 4.3 可无损升级:是

- rc.2 轮修过的 5 个问题(设置页 `settings.plugin.item` 必抛、`configForms` 无 `mode` 的文案、上下文改走事件窗口、`engines`/`manifestVersion` 声明、类型钉版)在 rc.3 上**全部保持有效**,无回退;
- `tsc --noEmit` 在 rc.3 客户端类型下 **0 错误**;`lib/client.js` 的 external 面未受影响。

---

## 5. 待办清单与执行结果(按文件)

> 执行状态:以下「必须改 / 建议改」在 **v0.6.2** 已全部落地;§5.5 记录实际发布时新增的契约守卫测试与真实端到端验证。

### 5.1 必须改(prepare release 才算真正“适配 rc.3”)——已全部完成

1. **`package.json`**(✅ 已完成)
   - `description`:`适配 dsh 0.2.1-rc.2` → **`适配 dsh 0.2.1-rc.3`**;
   - `devDependencies`:`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-llm` → `0.2.1-rc.3`;
   - `version`:**`0.6.2`**(按 §6);
   - `engines.dsh`:**保持不变**(`>=0.1.0-rc.7 <0.3.0-0` 实测覆盖 0.2.1-rc.3 且挡住 0.3.0);
   - `dsh.manifestVersion` / `dsh.client.inject`:**保持不变**(校验规则字节级不变)。
2. **`package-lock.json`**(✅ 已完成)
   - 原锁 `0.2.1-rc.2`(`resolved`/`integrity`),与 `package.json` 的 rc.3 不一致 → 已用 `npm install` 重新生成;root / `@deepseek-ai/dsh-client-ui-slots` / `@deepseek-ai/dsh-llm` 均为 `0.2.1-rc.3`。旧注释所说的「锁定在 0.6.1」已不再成立。
3. **`scripts/sync-types.mjs`**(✅ 已完成)
   - `PACKAGES` 19 项 + 注释里的 `0.2.1-rc.3`;
   - 已重跑 `npm run sync:types`;`node_modules/@deepseek-ai` 下钉版包全部为 rc.3(`dsh-llm` 经 `npm install` 到 rc.3),typecheck 即跑在 rc.3 类型上。

### 5.2 建议改(声明/文档层)——已全部完成

4. **`README.md` / `README.en.md`**(✅ 已完成):兼容声明升到 v0.6.2 / rc.3,新增 0.2.1-rc.3 实测行、适配要点、验证状态与新的测试统计。
   - `README.simple.md` 无版本号,不需要改。
5. **`docs/release-v0.6.2.md`**(✅ 已完成):记录本轮结论(链接本文档)、验证项(typecheck/test/真实 rc.3 Web 端到端)、以及 §4.2 的提示。
6. **`docs/dsh-021-diff.md`**:rc.2 轮历史文档,**不修改**(保留存档);新文档即本文件。

### 5.3 无需改

7. **`src/**` 全部**:`client/index.tsx`、`OptimizeButton.tsx`、`ResultDock.tsx`、`controller.ts`、`host-faces.ts`、`settings-face.ts`、`SettingsCard.tsx`、`i18n.ts`、`GitHubIcon.tsx`、`SparkleIcon.tsx`、`src/index.ts`、`src/prompt.ts` —— 依据 §2 全部证据,零改动。
8. **`cordis.patch.yml`**、**`scripts/build.mjs`**、**`test/**`** 现有用例:无需改;`test/slot-guard.test.mjs` 的“两槽位独立 inject”断言在 rc.3 下依然成立(legacy 槽位仍不存在)。v0.6.2 另行**新增** `test/upstream-contract.test.mjs` 作为基线契约守卫(见 §5.5)。
9. **`dsh.client.external`**:无需新增(基线含 react/react/jsx-runtime)。

### 5.4 可选(非适配必需,属新功能)——本版未做

- 用 rc.3 新槽位(`sidebar.panellist.actions` / `conversation.session.header.views.actions` / `sidebar.right.tab.guide.actions`)在「更多菜单」挂插件入口;
- 结果面板「替换草稿」若想支持“追加到已有草稿”,可改用 `requestDraftInitialization({ prompt, whenDraftExists:'append' })`(或新 `appendDraft`),当前 `inputActions.setDraft` 等价于 `replace`,用户可见行为不变;
- 接入 product-analytics 的 `more_menu_item_click` 等事件(当前插件不上报埋点)。

### 5.5 v0.6.2 实际发布补充

- **新增 `test/upstream-contract.test.mjs`(5 项)**:把「已安装钉版版本 == sync-types 钉版」「两个 composer 槽位仍为 list/session」「composer 标准 props 仍在」「`settings.plugins.tab` 类型 + 运行时声明仍在」「legacy `settings.plugin.item` 仍不存在」锁进 CI。这样下一轮上游升级动了这些面时,CI 会直接失败,而不是等到线上静默降级。
- **真实 rc.3 Web 端到端**:用官方桌面端自带的 rc.3 runtime CLI 引导临时 profile。先用 0.6.1 构建跑通链路,再以最终 0.6.2 tgz 重装复验——Host 日志 `[dsh-prompt-optimizer] loaded`、路由注册;页面发送栏「优化」按钮、结果面板(上游 `QUOTA: Insufficient Balance`,request_id `df550b62-780e-44ac-953c-8f3cd22490ef`,截图见 `docs/screenshots/rc3-e2e-panel-error.png`)、设置标签页与设置卡渲染、输出语言双向写入落盘到 profile `cordis.patch.yml`(`language: en` @ 15:19:33 → `language: zh` @ 15:19:58)均已实测。
- **测试统计**:`npm test` 五套 / 99 项全绿(smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 5)。

---

## 6. 建议版本号

**建议:`0.6.2`(patch)**,并把“适配 dsh 0.2.1-rc.3”写进 release notes。

判断依据:

1. **插件对外行为零变化**:无新增/删除配置项,无设置命名空间变化(`prompt-optimizer` 不变),无 UI 行为变化,无破坏性改动;按 SemVer,这是 patch。
2. **上游是 patch 级 prerelease**(`0.2.1-rc.2 → 0.2.1-rc.3`,同一 minor 行),且本插件 `engines.dsh` 区间不变,不构成“支持新 minor”的语义。
3. **历史惯例可对照**:`v0.6.0`(适配 rc.2)之所以是 minor,是因为它同时包含“设置页必崩修复 + 真实会话上下文 + 文案修正”等**功能/修复**;而 rc.3 适配连一个源码字符都不用改,只有类型钉版/锁文件/描述/README,故按 patch 更准确。
4. 若你们希望“每个受支持的上游版本都对应一个 minor”作为发布策略,用 **`0.7.0`** 也可接受;或若把 §5.4 的可选新功能一起做进本版(例如接入 More 菜单/appendDraft),则应升级为 **`0.7.0`**(功能增加)。

不建议改动 `engines.dsh`:收紧到 `>=0.2.1-rc.2` 会丢掉 0.1.x 用户,而本插件的老路径(`settingsScope`、`settings.plugin.item` 守卫)在 rc.3 上依然是“探测式”工作,无成本。

---

## 7. 兼容性矩阵(实测/推演)

| 宿主版本 | Host 半 | Client 半 | 说明 |
|---|---|---|---|
| 0.1.0-rc.7 ~ 0.1.5 | ✅ | ✅ | 走 `settingsScope` + 0.1.x `settings.plugin.item`(存在则注册) |
| 0.2.0-rc.x | ✅ | ✅ | `configForms` + `settings.plugins.tab` |
| 0.2.1-rc.1 / rc.2 | ✅ | ✅ | rc.2 轮已修的独立 inject 形态 |
| **0.2.1-rc.3** | ✅ | ✅(真实 Web 端到端:按钮/面板/设置标签页/设置卡读写;错误态经 SSE 透传) | **本轮目标,可无损升级;v0.6.2 已发布** |
| 0.3.0-rc / 0.3.0 | ❌ | ❌ | `engines.dsh: <0.3.0-0` 会在装/启动期拒绝,属显式放弃 |

---

## 8. 附录:证据落盘与复现

证据目录(临时,不随仓库提交):`C:\Users\yixin\AppData\Local\Temp\rc3-invest\`

| 文件 | 内容 |
|---|---|
| `out/commit-{5ff29190,67516495,39d29038,c48f8523,d02ea370,1f81c047}.json` | 各 commit 的文件清单与 patch |
| `out/tree-rc3.txt` | rc.3 全仓库文件树(18,815 条) |
| `out/dts-diff-rc2-rc3.txt` | 45 个 npm 包的 `.d.ts` 逐文件 SHA-256 比对报告(§2.6) |
| `out/asar-pkg-roots.txt` | 桌面端 asar 内 307 个 `@deepseek-ai/*` 包名@版本(§2.8) |
| `asar/report.txt` | asar 槽位命中、staticModules、`ui-conversation` 槽位声明上下文 |
| `rc2/`、`rc3/` | npm `0.2.1-rc.2` / `rc.3` tarball 解包(两侧同源,保证基线不漂移) |
| `src/rc2/`、`src/rc3/` | 上游 TS 源码(tag 对应),用于带行号的 diff |

关键复现命令(示意):

```powershell
# 上游 6 个 commit(需代理:GitHub 域名在本机被 hosts 污染)
$env:HTTPS_PROXY='http://127.0.0.1:18081'; $env:HTTP_PROXY='http://127.0.0.1:18081'
gh api repos/deepseek-ai/deepseek-harness/commits/<sha>
# npm 类型包双侧解包 + 逐文件哈希(见 dts-diff2.mjs)
npm pack @deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.3
# 桌面端 asar 版本清单/槽位检索(见 asar/report.mjs)
```

---

**一句话给决策层**:rc.3 对插件是纯加法上游;代码不用改,把“类型钉版 + lock + 文案/版本号”补齐即可发布 `0.6.2`;rc.3 的“更多菜单”和 `/models` 目录是可选增强,不是适配前置条件。
