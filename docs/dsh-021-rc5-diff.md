# DSH 0.2.1-rc.3 → 0.2.1-rc.5 差异调研(dsh-prompt-optimizer 面向面)

调研日期:2026-10-31
调研对象:上游 `github.com/deepseek-ai/deepseek-harness` tag `dsh-v0.2.1-rc.3` → `dsh-v0.2.1-rc.5`(中间含 `dsh-v0.2.1-rc.4`);本机桌面端 `E:\DSH\resources\app.asar`(顶层 `@deepseek-ai/dsh-desktop@0.2.1-rc.5`,`dshBuildCommit = d4db512a969fccf0c5cc7ec8fe38e9c1d27af916`)+ npm 上 `@deepseek-ai/*@0.2.1-rc.3` / `@0.2.1-rc.4` / `@0.2.1-rc.5` 的 tarball。

**结论先行:本插件在 0.2.1-rc.5 上可无损升级,`src/` 零改动。**
插件依赖的 4 个宿主面(`conversation.input.right`、`conversation.input.dock`、`settings.plugins.tab`、composer 标准 props)在 rc.5 与 rc.3 **逐字节相同**;`settings.plugin.item` 仍 0 命中;`ui-slots` / `connection` / `dsh-llm` / `ui-settings` / `ui-session` / `ui-renderer` / `ui-settings-plugins` / `package-manifest` / `app-boot` 全部逐字节相同;客户端 `staticModules` 基线与 rc.3 **同一个 bundle 哈希**。需要跟进的只有**声明层**(类型钉版、lock、描述/版本号、README/release notes)。rc.5 唯一的对外契约破坏性变更是 `conversation.chat.reasoning.body` 新增必填 `rawText`,**该槽位插件不占用**,故无影响(见 §2.3)。

---

## 0. 调研方法与基线(可复现)

1. **上游语义**:`gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.3...dsh-v0.2.1-rc.5`(13 commits)+ 逐 commit `gh api .../commits/<sha>` 取文件清单与 patch。compare API 与 commit API 的 files 各自上限 300,故两者合并去重后得到 **339 个唯一变更文件**(300 个 `package.json` + 39 个非 package.json:11 源码 / 10 测试 / 3 升级指南 / 15 README 与 i18n)。
2. **上游源码**:对关键文件用 `gh api .../contents/<path>?ref=<tag>`(base64)取 rc.3 与 rc.5 两个版本的原文,逐文件 **blob SHA-1** 与本地 `git diff --no-index` 比对,行号可直接溯源。
3. **npm 类型实测**:把 `scripts/sync-types.mjs::PACKAGES` 的 19 个包 + `dsh-llm` + 上一轮 rc.3 调研涉及的 26 个相关包共 46 个(其中 `dsh-ui-cordis` 上游未发布、npm 404),用 `npm pack` 下载 `0.2.1-rc.3` / `0.2.1-rc.4` / `0.2.1-rc.5` 解包,对 `lib/**` 全部文件(含 `*.d.ts`、`*.js`)做**逐文件 SHA-256** 比对,并对 `package.json` 做**字段级** diff。
4. **桌面端实测**:用自写 ASAR header reader(`asar-mini.mjs`)读 `app.asar`,取 313 条 `@deepseek-ai/*` `package.json` 的实际版本、`dsh-web-frontend` 的 `staticModules` 基线、59 个 `dsh-client-ui-*/lib/client*.js` 的槽位声明字符串;再与 npm rc.5 tarball 做逐文件 SHA-256 对照。
5. **插件侧实测**:在**工作区当前状态**(`package.json` 已钉 rc.5、`node_modules` 24 个 `@deepseek-ai/*` 均为 rc.5)跑 `tsc --noEmit` 与 `npm test`;另在独立临时目录用纯 rc.5 tarball 重建 `node_modules` 再跑一次 `tsc --noEmit`,两次均 exit 0(见 §2.5)。
6. 证据落盘:`C:\Users\yixin\AppData\Local\Temp\rc5-invest\`(见 §8)。

### 0.1 上游 13 个 commit

| commit | 标题 | 实质文件 | 与本插件的关系 |
|---|---|---|---|
| `cc4446ee` | fix(mcp): keep resource-listing diagnostics off ACP stdout | `packages/mcp/mcp-client/src/connection.ts` +13/-6 | 无关(ACP/MCP 诊断输出) |
| `c38265a0` / `72624bae`(#7183) | fix(ui): show view tab tooltip only for overflowing labels | `ui-conversation/src/client/skeleton/ConversationSession.tsx` +24/-1 | **需核对**:见 §2.2 |
| `cb7f0878` | Merge PR #7168(acp stdout logging audit) | 合并提交 | 无关 |
| `41736cde` | fix(acp): keep account catalog diagnostics off stdout | `llm/llm-deepseek-account/src/index.ts` `console.info`→`console.error` | 无关(插件不读该包) |
| `940aafca` | test(acp): use shared cleanup for the stdout regression | 测试 | 无关 |
| `f425304f` | Merge PR #7179 | 合并提交 | 无关 |
| `199ffe37`(#7342) | fix(ui): keep the more views tooltip fixed | `ui-conversation/src/client/locales.ts` -2、`ConversationSession.tsx` +1/-1 | **需核对**:见 §2.2 |
| `504a01a9` | release(dsh): 0.2.1-rc.4 | 300 个 `package.json` | 版本号批量 bump |
| `083bdcf6` | Merge PR #7255 | 合并提交 | 无关 |
| `534dac8c`(#7484) | fix(web): customize thinking block rendering | `ui-chat` 5 个源码文件 + `client-ui-cot-translation` + `cordis-client-runner/slot-catalog.ts` + 升级指南 | **需核对**:见 §2.3 |
| `31cfe2aa` | release(dsh): 0.2.1-rc.5 | 300 个 `package.json` | 版本号批量 bump |
| `b830ec95` | Merge PR #7572 | 合并提交 | 无关 |

官方 release notes 原文要点(`gh release view dsh-v0.2.1-rc.4` / `dsh-v0.2.1-rc.5`):

- **rc.4**(2026-10-28):「修复 ACP 模式下诊断输出混入 stdout 的问题」——即 `console.info`/`console.debug` 一律改走 stderr(涉及 `llm-deepseek-account` 与 `mcp-client`);
- **rc.5**(2026-10-30):「优化对话中思考内容的展示效果」——即 §2.3 的 `reasoningText()` 与 `rawText`。

**版本归属**(用 npm rc.4 tarball 实测区分,避免把两个 release 的改动混在一起):

| 变更 | 落在 rc.4 | 落在 rc.5 |
|---|---|---|
| view tab tooltip 按溢出宽度才显示(`labelNeedsTooltip` / `ViewTabLabel`) | ✅(`rc4 client.js` 已含 `labelNeedsTooltip=true`) | 同 |
| 删除 `session.moreViewsCurrent` locale key | ✅(`rc4` 已 `moreViewsCurrent=0`) | 同 |
| 推理正文 `reasoningText()` / `rawText` | ❌(`rc4` `rawText` 计数 0) | ✅(`rc5` `reasoningText=true`, `rawText=6`) |

---

## 1. 汇总表

| 面向面 | rc.5 状态 | 对本插件的影响 | 处置 |
|---|---|---|---|
| `conversation.input.right` | **不变**:`kind:'list'`、`scope:'session'`;d.ts 行号 322 与 rc.3 完全相同,文件逐字节相同 | 无 | 无需改 |
| `conversation.input.dock` | **不变**:`kind:'list'`、`scope:'session'`、`owner: InputZone`;d.ts 行号 301/385 相同 | 无 | 无需改 |
| composer 标准 props(`useInput`/`inputActions`/`sessionId`) | **不变**:`ui-conversation/contract/slots.d.ts` 整文件逐字节相同(`SessionStandardProps` @423、`SessionMaybeStandardProps` @431);`ui-session` 的 `SessionStandardProps`(@80-88)也逐字节相同 | 无 | 无需改 |
| `InputZone`(`{session, input}` dock owner) | **不变**:d.ts @470,与 rc.3 相同;运行时 `zone = {session, inputState}` 构造点未动 | 面板读 `session.running`/`queue` 路径不变 | 无需改 |
| `InputActions.setDraft` / `InputState.draft` | **不变**:`contract/input.d.ts` 整文件 blob SHA-1 `c01ed5f99f` 两版相同(`setDraft` @248、`readonly draft` @271) | 「替换草稿/撤回」路径不变 | 无需改 |
| `settings.plugins.tab` | **不变**:类型 d.ts @86(`ui-settings` 9 个 d.ts 逐字节相同);运行时 `children:{"settings.plugins.tab":{kind:"list",scope:"root"}}`(`ui-settings-plugins` 4 d.ts + 2 js 全等) | 设置页标签页路径不变 | 无需改 |
| `settings.plugin.item`(0.1.x legacy) | **仍不存在**:npm 45 包全量检索 0 命中;桌面端 asar 3870 个可检索文件 0 命中 | 独立 `inject` 守卫前提仍成立 | 无需改 |
| `SessionSnapshot`(`api-session-controller/contract/snapshot.d.ts`) | **逐字节相同**(81 行,`running` @62);`queue` 本来就不在该类型里,插件按结构面可选读取 | 面板「发送即关闭」判据不变 | 无需改 |
| `ui-slots`(`SlotMap`/`PropsRuntime`/`SlotCore`) | **逐字节相同**(3 个 `.d.ts` + `lib/index.js` 全等) | 无 | 无需改 |
| `ui-renderer` | **逐字节相同**(8 个 `.d.ts` + `lib/client.js` 全等) | 插件只做类型级 import | 无需改 |
| `dsh-llm`(`LlmRuntime`/`GenerateOptions`/`ModelInfo`/`stream`) | **逐字节相同**(15 个 `.d.ts`、31 个 lib 文件全等) | `resolveRoute`/`resolveLowestEffort`/`stream` 全不变 | 无需改 |
| `dsh-session` / `dsh-session-projection` / `dsh-tools` / `dsh-api-session-controller` / `dsh-client-connection` | **逐字节相同**(10/2/10/36/18 个 d.ts 全等) | `sessions.binding().eventSource`、`session/modelCatalog` RPC 形状不变 | 无需改 |
| `ui-conversation` 改动(view tab tooltip / more views tooltip) | 仅 `skeleton/ConversationSession.tsx` 与 `locales.ts`;**契约/标准 props/facade/dock 渲染全未动** | 插件「发送栏按钮 + dock 面板 + 读/写草稿」路径零影响 | 无需改 |
| `ui-chat` 改动(thinking block,`534dac8c`) | `conversation.chat.reasoning.body` 的 owner props **新增必填 `rawText`**,`text` 语义改为「显示文本」;新增 `reasoning-text.ts` | 插件**不占用** `conversation.chat.*` 槽位、不 import `ui-chat`;结果面板自绘 → 无影响 | 无需改(见 §2.3 提示) |
| `ui-primitives` | **逐字节相同**(90 个 d.ts) | 插件不 import | 无需改 |
| `dsh-package-manifest` / `dsh-app-boot` | **逐字节相同**(2 / 23 个 d.ts 全等) | `manifestVersion:1`、`engines.dsh`、`dsh.client.inject` 语义不变 | 无需改 |
| 桌面端 `staticModules` 基线 | **不变**:react / react/jsx-runtime / react-dom / react-dom/client / cordis / zod / @tanstack/react-virtual / client-store / ui-slots / ui-primitives / ui-dockkit,`dsh-web-frontend` 入口 bundle 与 rc.3 **SHA-256 相同** | 插件 client bundle 只 `require` react、react/jsx-runtime,仍在基线内 | 无需改 |
| 桌面端 asar 与 npm rc.5 | **一致**:302/313 条 `@deepseek-ai/*` 为 `0.2.1-rc.5`,其余仅工具链;27 个重点包逐文件哈希一致或仅构建元数据差异 | 无 | 无需改 |
| `cordis` 4.0.4→4.0.5 | 内容逐字节相同,**仅 `package.json` 的 peerDeps/deps 下限 bump** | 插件 devDep 仍 `^4.0.4`,解析到 4.0.5 无行为差异 | 可选(见 §5.4) |
| 类型基线(`sync-types` PACKAGES)/ lock / `package.json` | 工作区**已升 rc.5**(`version 0.6.3`、description rc.5、devDeps rc.5、lock rc.5、19 包钉 rc.5) | 决定 typecheck 基线与 CI `npm ci` | **必须改**(本轮已在工作区完成,见 §5.1) |

---

## 2. 逐项证据

### 2.1 Q1:插件依赖的客户端契约在 rc.5 是否仍成立

**`conversation.input.dock` / `conversation.input.right`** —— `@deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.5` `lib/types/client/contract/slots.d.ts`(676 行,与 rc.3 **行号与内容完全一致**):

```ts
// :301
/** Full-width entries above the composer card. */
'conversation.input.dock': {
    kind: 'list';
    scope: 'session';
    owner: InputZone;              // { session: SessionSnapshot; input: InputState }
};
// :322
/** Compact controls before the composer submit action. */
'conversation.input.right': {
    kind: 'list';
    scope: 'session';
};
```

- 上游源码层证据:`packages/client/ui-conversation/src/client/contract/slots.ts` 在 rc.3 与 rc.5 的 **blob SHA-1 完全相同(`4a0bd3a739`**),即该契约文件本轮**一个字节都没动**;
- npm 层证据:`dsh-client-ui-conversation` 本轮唯一的 d.ts 变更是 `locales.d.ts`(见 §2.2),`contract/slots.d.ts` 的 SHA-256 两版相同;
- 运行时声明(npm rc.5 `lib/client.js`):`@773305` `"conversation.input.right": { kind: "list", scope: "session" }`、`@768342` `"conversation.input.dock": { kind: "list", scope: "session" }`;桌面端 asar 同位声明在 `@773359` / `@768396`,文本相同;
- 槽位目录(`dsh-cordis-client-runner/lib/client.js` 的 `CLIENT_SLOT_API`)对这两个槽位的 `kind`/`scope`/summary 与 rc.3 一致(仅 `source` 行号与 `reasoning.body` 的文档字符串变化,见 §2.3)。

**composer 标准 props(`useInput` / `inputActions` / `sessionId`)** —— 同一文件:

```ts
// :423  SessionStandardProps
interface SessionStandardProps {
    useConversation: UseConversation;
    useInput: SnapshotSelectorHook<InputState>;   // :427
    inputActions: InputActions;                   // :429
}
// :431 SessionMaybeStandardProps(useInput @435、inputActions @437)
```

`sessionId` 由 `@deepseek-ai/dsh-client-ui-session@0.2.1-rc.5` `lib/types/client/index.d.ts` 提供(`interface SessionStandardProps` @80、`useSession` @82、`sessionId` @84、`useProjection` @86、`useAccess` @88);该包 3 个 d.ts **逐字节相同**。

`conversation.input.dock` 的 `owner: InputZone` 在 `:470`:

```ts
/** Point-in-time owner values for composer extension entries. */
export interface InputZone {
    readonly session: SessionSnapshot;
    readonly input: InputState;
}
```

运行时构造点未动(asar `@672104`):`const zone = session === void 0 || inputState === void 0 ? void 0 : { session, input: inputState }`,渲染点未动(asar `@674594`):`zone !== void 0 && renderSlot("conversation.input.dock", zone)`。

**`settings.plugins.tab`** —— `@deepseek-ai/dsh-client-ui-settings@0.2.1-rc.5` `lib/types/client/contract/slots.d.ts:86`:

```ts
/** ... Declared at runtime by the feature that owns the Plugins section; the type lives here ... */
'settings.plugins.tab': {
    kind: 'list';
    scope: 'root';
    owner: SettingsPluginsTabOwnerProps;
};
```

运行时声明由 `dsh-client-ui-settings-plugins@0.2.1-rc.5` `lib/client.js` 给出(npm `@9424` / asar `@9432`):

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
  name: "settings.section", id: "plugins", order: 15, label: () => t("nav"), locale: NS,
  inject: sectionInjected,
  children: { "settings.plugins.tab": { kind: "list", scope: "root" } }
}, PluginsSettingsSection));
```

`ui-settings`(9 d.ts)与 `ui-settings-plugins`(4 d.ts + 2 js)**全部逐字节相同**,注册选项 `{name,id,order,label,inject}` 与 rc.3 一致。

**`settings.plugin.item`(0.1.x legacy)** —— rc.5 仍然彻底不存在:

- npm 侧:46 个候选包(45 个可下载)中全部 `lib/**` 检索 `settings.plugin.item` → **0 命中**;
- 桌面端侧:`app.asar` 的 3870 个 `@deepseek-ai/**` 与 `dist/assets` 可检索文件检索 → **0 命中**;
- 因此 `src/client/index.tsx:174-175` 的「两个槽位各自独立 `inject`」写法依旧正确,不会触发 `SlotCore.register` 的 `slot "settings.plugin.item" is not declared` 同步抛错。

**契约守卫实测**:把 `test/upstream-contract.test.mjs` 的 u2/u3/u4/u5 四条断言原样跑在 **rc.5 npm 包**上(`contract-check.mjs`),全部通过:

```
u2 OK conversation.input.right -> { kind: 'list'; scope: 'session'; }
u2 OK conversation.input.dock -> { kind: 'list'; scope: 'session'; owner: InputZone; }
u3 OK useInput/inputActions/sessionId
u4/u5 OK settings.plugins.tab present, settings.plugin.item absent
```

### 2.2 Q2:ui-conversation 的 view tab / more views tooltip 改动是否触及插件路径

rc.3→rc.5 对 `packages/client/ui-conversation` 的源码改动**只有 2 个文件**(`c38265a0`+`72624bae`+`199ffe37`):

| 文件 | 改动 | 与本插件(按钮/面板/读草稿/写草稿/提交) |
|---|---|---|
| `skeleton/ConversationSession.tsx` | +24/-1:新增 `WIDE_GLYPH` 正则与 `labelNeedsTooltip()`(按 13px/7px 字宽估算,`TAB_LABEL_MAX_WIDTH=88`)、新增 `ViewTabLabel` 组件(`<Tooltip disabled={!labelNeedsTooltip(label)}>`);More 菜单 label 从 `t('session.moreViewsCurrent',{name})` 简化为 `t('session.moreViews')` | **无关**:改动只在 Session header 的 View tab 行(按钮在 composer 工具行,面板在 composer 上方) |
| `locales.ts` | -2:删除 zh/en 的 `session.moreViewsCurrent` 键 | **无关**:插件自带 i18n 字典,只从 locale 服务读 `active`(`src/client/i18n.ts:11-19`) |

**未动的关键文件**(上游 blob SHA-1 两版相同,逐文件核对):

```
SAME  packages/client/ui-conversation/src/client/contract/slots.ts          4a0bd3a739
SAME  packages/client/ui-conversation/src/client/contract/input.ts          c01ed5f99f
SAME  packages/client/ui-conversation/src/client/contract/snapshot.ts       9982999e30
SAME  packages/client/ui-conversation/src/client/contract/draft-editor.ts   7d523c97d8
SAME  packages/client/ui-conversation/src/client/input/facade.ts            1965b30d12
SAME  packages/client/ui-conversation/src/client/apply.ts                   6594c95812
CHANGED .../skeleton/ConversationSession.tsx                                 3089b083df -> deaddcf769
CHANGED .../locales.ts                                                       938326df75 -> 5a221bc9a1
```

即:槽位声明、标准 props、input facade(`requestDraftInitialization`/`setDraft` 通路)、`apply.ts`(dock/header 装配)**全部未动**。npm 包侧同样只有 `client.js` 与 `locales.d.ts` 变化:

```diff
// dsh-client-ui-conversation/lib/types/client/locales.d.ts(rc.3 -> rc.5)
@@ zh @@
     'session.moreViews': string;
-    'session.moreViewsCurrent': string;
@@ en @@
     'session.moreViews': string;
-    'session.moreViewsCurrent': string;
```

**对插件四条路径的结论**:

- 发送栏按钮:渲染点 rc.5 `client.js@742060` `renderSlot("conversation.input.right", {})`,与 rc.3 `@741391` 同一行上下文、同条件(`input === void 0 || sessionId === void 0 ? null : ...`);插件 `src/client/OptimizeButton.tsx:9/48/60` 用的 `PropsRuntime<'conversation.input.right'>`、`useInput(...).draft`、`p.sessionId` 全部不变;
- dock 面板:渲染点 rc.5 `@674594`,与 rc.3 `@674695` 相同语义(`zone` 在 composer 卡片上方);`ResultDock.tsx:9/176-181/290/294` 用的 `useInput`/`useSession`/`inputActions.setDraft` 不变;
- 读草稿:同上 `InputState.draft`(`contract/input.d.ts:271`);
- 写草稿/提交:`inputActions.setDraft`(`contract/input.d.ts:248`);「发送即关闭」判据 `controller.ts:68-79` 读 `SessionSnapshot.running`(`api-session-controller/contract/snapshot.d.ts:62`,逐字节相同)与可选 `queue`(结构面读取,类型里本就没有,行为不变)。

结论:rc.5 的 ui-conversation 改动**完全不触及**插件的按钮/面板/草稿/提交路径,无需适配。

### 2.3 Q3:`534dac8c` fix(web): customize thinking block rendering 到底改了什么

**改动包**:`packages/client/ui-chat`(不是 ui-conversation、不是 ui-renderer、不是 ui-primitives),外加 `packages/experimental/client-ui-cot-translation`(仅注释)与 `packages/extensions/cordis-client-runner`(槽位目录元数据)。共 11 个源码文件:

| 文件 | 改动 | 性质 |
|---|---|---|
| `ui-chat/src/client/reasoning-text.ts` | **新增 25 行**:`reasoningText(text)` 剥离 `<signature>…</signature>` 前缀与其后换行;流式未闭合时返回 `''` | 新内部工具(未导出到包入口) |
| `ui-chat/src/client/chat/ReasoningRow.tsx` | +11/-4:入参改名 `text: rawText`,内部 `const {text, hidden} = reasoningText(rawText)`,正文槽传 `{ rawText, text, running }`,无可显示内容时 `return null` | **行为变化** |
| `ui-chat/src/client/contract/slots.ts` | +11/-5:`ReasoningBodyOwnerProps` **新增必填 `readonly rawText: string`**,`text` 注释改为「display-ready」;`ReasoningContentInput` 不再 `extends ReasoningBodyOwnerProps`,改为自行声明 `text`/`running`/`labels` | **对外契约破坏性变更**(仅该槽位) |
| `ui-chat/src/client/conversation-nodes/process-activity.ts` | +2/-1:`liveReasoningDetail` 用 `reasoningText(block.text)` | 内部 |
| `ui-chat/src/client/chat/ReasoningContent.tsx` | +1/-1:JSDoc | 文档 |
| `experimental/client-ui-cot-translation/src/client/TranslationBody.tsx` | +1/-1:JSDoc | 文档 |
| `extensions/cordis-client-runner/src/client/slot-catalog.ts` | +12/-12:`reasoning.body` 的 `summary`/`doc`/`ownerProps` 文本更新 + 各处 `source` 行号漂移 | 元数据 |

npm d.ts 实测(rc.3 → rc.5,`dsh-client-ui-chat` 共 97 个 d.ts):

```
CHANGED [d.ts] types/client/chat/ReasoningContent.d.ts   (仅 @param 文档)
CHANGED [d.ts] types/client/chat/ReasoningRow.d.ts       (解构改名 + 返回 JSX.Element|null)
CHANGED [d.ts] types/client/contract/slots.d.ts          (见下)
ADDED   [d.ts] types/client/reasoning-text.d.ts
CHANGED [js]   client.js
```

关键类型 diff(`lib/types/client/contract/slots.d.ts:57-66`,行号 rc.3 57/64 → rc.5 57/66):

```diff
-/** Original model-provided reasoning offered to the expanded Body Slot. */
+/** Original and display-ready reasoning offered to the expanded Body Slot. */
 export interface ReasoningBodyOwnerProps {
-    /** Complete or streaming reasoning text. */
+    /** Complete or streaming model output. */
+    readonly rawText: string;
+    /** Reasoning text prepared for display. */
     readonly text: string;
     readonly running: boolean;
 }
-export interface ReasoningContentInput extends ReasoningBodyOwnerProps {
+export interface ReasoningContentInput {
+    readonly text: string;
+    readonly running: boolean;
     readonly labels?: MarkdownLabels;
 }
```

上游官方升级指南(`docs/upgrade-guide/v0.2.1-rc.4/reasoning-body-props/guide.zh.md`)明确写着:

> `conversation.chat.reasoning.body` 扩展通过新增的 `rawText` 字段接收模型输出。现有的 `text` 字段提供 Chat 处理后的显示文本,替代原始输出。`running` 保持不变。**这会影响自定义推理渲染器和翻译包装组件。**
> 迁移:1. 在普通渲染、翻译请求和未翻译视图中继续读取 `text`。需要完整模型输出的扩展改为读取 `rawText`。2. 向 Content Factory 传入选定的 `text` 或其译文,不要重复执行 Chat 的显示处理。

**对 ui-renderer / ui-conversation / ui-primitives 的对外契约**:无影响。三包本轮**逐字节相同**(`ui-renderer` 8 个 d.ts、`ui-primitives` 90 个 d.ts、`ui-conversation` 除 locales 外全等)。另经检索:工作区 `node_modules/@deepseek-ai/**` 的 d.ts 中引用 `@deepseek-ai/dsh-client-ui-chat` 的文件数为 **0** —— 插件的类型图**根本不触及** ui-chat。

**对插件结果面板**:无影响。插件结果面板是**自绘**(`src/client/ResultDock.tsx`,inline style + 自有 `.dsh-po-*` CSS),只消费 `conversation.input.dock` 的 owner props 与标准 hooks,不注册也不读取 `conversation.chat.*` 任何槽位(`src/` 全量 grep `conversation.chat` → 0 命中)。

**需要提示的风险(非本插件)**:任何第三方插件若占用 `conversation.chat.reasoning.body`,升级 rc.5 后 TypeScript 会因缺 `rawText` 报错(必填字段),运行期则会拿到「已剥离 `<signature>`」的 `text`。本插件不占用该槽位,故不受影响;若未来要在思考块里挂自绘推理面板,必须同时读 `rawText`(原始)与 `text`(显示文本)。

### 2.4 Q4:npm 类型包 rc.3→rc.5 逐文件 diff

方法:两侧都用**新下载的 npm tarball**,对 `lib/**` 全部文件(含 `.d.ts`、`.js`、`.css`)逐文件 SHA-256 比对;`package.json` 另做字段级 diff。完整报告落盘 `out-dts-diff.txt` / `out-summary.tsv` / `out-dts-patches.txt`。

**参与比对的 46 个包**(19 个 `sync-types` 钉版包 + `dsh-llm` + 26 个相关包;`dsh-ui-cordis` 上游未发布,npm 404):

**逐字节相同(SAME)的 38 个包**(含插件全部直接类型依赖):

| 包 | d.ts 数 | 包 | d.ts 数 |
|---|---|---|---|
| **dsh-client-ui-slots** | 3 | **dsh-client-connection** | 18 |
| **dsh-client-ui-settings** | 9 | **dsh-client-ui-settings-plugins** | 4 |
| **dsh-client-ui-session** | 3 | **dsh-client-ui-renderer** | 8 |
| **dsh-llm** | 15 | **dsh-package-manifest** | 2 |
| **dsh-app-boot** | 23 | **dsh-session** | 10 |
| **dsh-session-projection** | 2 | **dsh-tools** | 10 |
| **dsh-api-remotes** | 4 | **dsh-attachment** | 6 |
| **dsh-brand** | 1 | **dsh-client-locale** | 10 |
| **dsh-client-ui-primitives** | 90 | **dsh-commands** | 5 |
| **dsh-llm-retry** | 3 | **dsh-token-meter** | 11 |
| **dsh-tool-todo** | 3 | dsh-api-session-controller | 36 |
| dsh-api-gateway | 12 | dsh-api-settings-controller | 5 |
| dsh-client-store | 2 | dsh-client-product-analytics | 7 |
| dsh-client-shortcuts | 13 | dsh-client-ui-agent-preset | 13 |
| dsh-client-ui-dockkit | 21 | dsh-client-ui-entry-customization | 4 |
| dsh-client-ui-model-selection | 9 | dsh-client-ui-plugin-manager | 15 |
| dsh-client-ui-sidebar-right | 27 | dsh-client-ui-workspace | 23 |
| dsh-client-web | 11 | dsh-deepseek-llm-api-extensions | 2 |
| dsh-llm-deepseek | 28 | dsh-llm-deepseek-api-key | 2 |

其中 **20 个钉版包(19 + `dsh-llm`)里 19 个 SAME,唯一 DIFF 是 `dsh-client-ui-conversation`**。

**有变化的 7 个包**(按与插件相关性排序):

| 包 | 变化文件 | 变化性质 | 影响 |
|---|---|---|---|
| `dsh-client-ui-conversation` | CHANGED `lib/client.js`、`types/client/locales.d.ts` | 真实代码变化:view tab tooltip 估算 + More 菜单 label 简化 + 删 `session.moreViewsCurrent` | 见 §2.2;**插件路径无关** |
| `dsh-client-ui-chat` | CHANGED `lib/client.js`、`chat/ReasoningContent.d.ts`、`chat/ReasoningRow.d.ts`、`contract/slots.d.ts`;ADDED `reasoning-text.d.ts` | 真实类型变化:必填 `rawText` | 见 §2.3;**插件不占用** |
| `dsh-llm-deepseek-account` | CHANGED `lib/index.js` | 真实代码变化:`console.info` → `console.error`(ACP stdout) | 插件不 import;仅影响宿主日志通道 |
| `dsh-cordis-client-runner` | CHANGED `lib/client.js` | 仅槽位目录元数据(行号 + `reasoning.body` 文档字符串) | 插件不 import |
| `dsh-client-modules` | CHANGED `lib/index.js` | **仅构建 commit 常量** `const commit = "be72761"` → `"d4db512"` | 无 |
| `dsh-client-ui-settings-general` | CHANGED `lib/client.js` | **仅版本号字符串** `general.currentVersion` 里 `0.2.1-rc.3` → `0.2.1-rc.5` | 无 |
| `dsh-client-ui-sidebar` | CHANGED `lib/client.js` | **仅本地构建标识** `` `0.2.1-rc.3-be72761` `` → `` `0.2.1-rc.5-d4db512` `` | 无 |

**`package.json` 层面**:46 个包全部有 `version` 与内部依赖钉版 bump;其中 **4 个包只有版本号变化**(`dsh-brand`、`dsh-client-store`、`dsh-deepseek-llm-api-extensions`、`dsh-package-manifest`)——这几个是「纯类型/无运行时」包,是「仅版本号变化」的典型样本。

`dsh-client-ui-conversation` 的两个变化文件的实际 patch 已在 §2.2 引用;`dsh-client-ui-chat` 的四个 d.ts patch 见 §2.3。

### 2.5 Q5:插件消费面(`dsh-llm` / `dsh-session` / `dsh-session-projection` / `dsh-tools` 等)

全部**逐字节相同**(见 §2.4 的 SAME 表),逐项确认:

- **`dsh-llm`**:15 个 `.d.ts` + 31 个 lib 文件全等 → `GenerateOptions`(`lib/types/types.d.ts`)、`StreamChunk`、`LlmRuntime` 的 `listProviders()`/`listModels()`/`resolveModelInfo()`/`stream()` 签名与实现完全不变。插件 Host 半的 `resolveRoute`(`src/index.ts:361-391`)、`resolveLowestEffort`(`:333-352`)、`options: GenerateOptions`(`:635-655`)、`ctx.llm.stream`(`:660`/`:752`)不受影响。
- **`dsh-session`** / **`dsh-session-projection`** / **`dsh-tools`**:10 / 2 / 10 个 d.ts 全等;插件的 `sessions.binding(id).eventSource`(`src/client/host-faces.ts:139-174`)结构面不变。
- **`dsh-api-session-controller`**:36 个 d.ts 全等 → `SessionSnapshot` 81 行不变(`running` @62);`session/modelCatalog` RPC 与 `modelDirectories.directoryFor(id).load()` 的返回结构不变(插件 `host-faces.ts:55-94` 的结构面仍匹配)。
- **`dsh-client-connection`**:18 个 d.ts + 3 js 全等 → `ConnectionHandle`/`rpc.call` 不变。
- **`ui-slots`**:3 个 d.ts + `lib/index.js` 全等 → `PropsRuntime`/`SlotMap`/`SlotEntryDef` 不变(插件 `OptimizeButton.tsx:2`、`ResultDock.tsx:2` 的类型来源)。
- **`dsh-package-manifest` / `dsh-app-boot`**:2 / 23 个 d.ts 全等 + `lib/index.js` 全等 → `manifestVersion:1`、`engines.dsh`、`dsh.client.inject` 的校验语义不变。

**`engines.dsh` 区间实测**(npm 自带 semver,`includePrerelease: true`,工作区 `package.json` 的 `>=0.1.0-rc.7 <0.3.0-0`):

```
0.1.0-rc.7 -> true     0.2.1-rc.3 -> true     0.2.1-rc.4 -> true
0.2.1-rc.5 -> true     0.2.2      -> true     0.3.0-rc.0 -> false
0.3.0      -> false
```

**typecheck 实测(两套独立基线,均 exit 0)**:

1. 工作区当前状态(`node_modules/@deepseek-ai` 下 24 个包为 rc.5,其余为 rc.3 占位/固定包):`npx tsc --noEmit` → **exit 0**;
2. 临时目录 `typecheck/`:把 `src/` + `tsconfig.json` 复制出来,`node_modules` 用 **纯 rc.5 tarball**(45 个包逐一覆盖)重建,`tsc --noEmit` → **exit 0**。

**测试实测(工作区,rc.5 基线)**:`npm test` → **exit 0**,五套 99 项全绿:

```
smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 5
✓ u1 钉版包已安装且版本一致(19 个 + dsh-llm 0.2.1-rc.5)
✓ u2 conversation.input.right / conversation.input.dock 契约不变
✓ u3 composer 标准 props(useInput/inputActions/sessionId)仍在
✓ u4 settings.plugins.tab 类型与运行时声明均在
✓ u5 settings.plugin.item 仍不存在(legacy 守卫前提成立)
```

### 2.6 Q6:桌面端 asar(rc.5)与 npm rc.5 的一致性

**身份**:

| 项 | 值 | 证据 |
|---|---|---|
| asar 顶层包 | `@deepseek-ai/dsh-desktop@0.2.1-rc.5` | `app.asar` 根 `package.json` |
| build commit | `d4db512a969fccf0c5cc7ec8fe38e9c1d27af916` | 同上 `dshBuildCommit` 字段;**并与 `dsh-client-modules/lib/index.js` 的 `const commit = "d4db512"` 交叉一致**(npm rc.3 为 `be72761`) |
| 运行时包 | `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.5` | `/dsh/package.json` |
| release 元数据 | `version=0.2.1-rc.5`, `hostProtocolVersion=4`, `nodeVersion=24.21.0`, `pnpmVersion=11.28.5`, `platform=win32`, `arch=x64` | `/dsh/desktop-runtime.json` |

**asar 内 `@deepseek-ai/*` 版本**:共 313 条 `package.json`(305 个唯一包名),其中 **302 条为 `0.2.1-rc.5`**;非 rc.5 的只有工具链/第三方:

```
cordis 4.0.5, cordis-plugin-group 1.0.5, cordis-plugin-include 1.0.10,
cordis-plugin-loader 1.0.6, cordis-plugin-timer 1.1.7, cosmokit 1.8.6,
node-addon-system 0.1.2, schemastery 3.18.5
```

(另有 `libreoffice-kit` / `libreoffice-kit-win32-x64` 两条因本读取器不解析嵌套 `package.json` 的 name 而列为 ERR,版本未纳入统计,与本插件无关。)**8 个包名**在 asar 内出现两次(`cordis`、`cosmokit`、`dsh-api-gateway`、`dsh-brand`、`dsh-deque`、`dsh-timeout`、`dsh-typert-protocol`、`schemastery`,asar 根 `node_modules` 与 `dsh/node_modules` 各一份),两处版本一致,无「双版本」问题。

**asar 与 npm rc.5 逐文件对照**(27 个重点包,`lib/**` + `package.json`):

| 包 | asar 文件数 | 与 npm 逐文件 SHA-256 相同 | 差异 |
|---|---|---|---|
| dsh-client-connection | 4 | 4 | — |
| dsh-llm | 17 | 17 | — |
| dsh-session | 12 | 12 | — |
| dsh-tools | 12 | 12 | — |
| dsh-session-projection | 4 | 4 | — |
| dsh-app-boot | 3 | 3 | — |
| dsh-package-manifest | 2 | 2 | — |
| dsh-brand / dsh-attachment / dsh-commands / dsh-llm-retry / dsh-token-meter / dsh-tool-todo | 2/8/7/5/13/5 | 全部相同 | — |
| dsh-api-session-controller | 39 | 38 | 仅 `package.json`(npm 多 `scripts`) |
| dsh-api-remotes / dsh-client-modules | 7 / 3 | 6 / 2 | 仅 `package.json` |
| dsh-client-ui-settings / -renderer / -session | 3 | 2 | 仅 `package.json` |
| dsh-client-ui-conversation / -settings-plugins / -chat / dsh-client-locale | 3 | 1 | `client.js` + `package.json` |

`package.json` 的差异是**单一字段**:asar 版剥掉了 `scripts: { bundle: "tsdown", watch: "tsdown --watch" }`(打包时清理),其余字段全等。

`client.js` 的差异经**逐段核对为纯构建元数据**:

1. CSS-module 区头 `//#region \0dsh-css:D:\ci\runners\...`(Windows CI)vs `/home/runner/work/...`(Linux CI);
2. 每个构建的 CSS-module 类名前缀盐不同(如 asar `_2STzOG_` vs npm `BNl2La_`);
3. **把每个构建各自的盐与路径归一后,6 个客户端 bundle(ui-conversation / ui-settings-plugins / ui-chat / ui-locale / ui-settings-general / ui-sidebar)全部 byte-identical**。

**槽位声明检索(asar,59 个 `dsh-client-ui-*/lib/client*.js` + `settings-plugin-inventory`)**:

| 槽位 | 命中文件数 | 命中位置 |
|---|---|---|
| `settings.plugin.item` | **0** | — |
| `conversation.input.right` | 2 | `dsh-client-ui-conversation`(@773359 声明)、`dsh-cordis-client-runner`(槽位目录) |
| `conversation.input.dock` | 3 | `dsh-client-ui-conversation`(@768396 声明)、`dsh-client-ui-goal`、`dsh-cordis-client-runner` |
| `settings.plugins.tab` | 3 | `dsh-client-ui-settings-plugins`(@9432 声明)、`dsh-client-ui-settings-plugin-inventory`、`dsh-cordis-client-runner` |
| `conversation.chat.reasoning.body` | 3 | `dsh-client-ui-chat`(@302932 `renderSlot(..., { rawText, text, running })`)、`dsh-experimental-client-ui-cot-translation`、`dsh-cordis-client-runner` |
| `conversation.session.header.views.actions` | 3 | `dsh-client-ui-conversation`、`dsh-client-ui-entry-customization`、`dsh-cordis-client-runner` |

**`staticModules` 基线(不变)** —— `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js`(941,436 字节,`OZ()` 函数):

```js
function OZ(){return{react:aC,"react/jsx-runtime":dC,"react-dom":gC,"react-dom/client":_C,
"@deepseek-ai/cordis":Ub,zod:Vj,"@tanstack/react-virtual":Xj,
"@deepseek-ai/dsh-client-store":xI,"@deepseek-ai/dsh-client-ui-slots":jI,
"@deepseek-ai/dsh-client-ui-primitives":TU,"@deepseek-ai/dsh-client-ui-dockkit":SZ}}
```

该 bundle 与 npm `dsh-web-frontend@0.2.1-rc.3`、`@0.2.1-rc.5` 的 `index-BXV-oxvX.js` **SHA-256 完全相同**(`0f3fc6b857e4f8bd…`);`vendor-DcuzkuQH.js`(741,114 字节)亦相同。说明 rc.3→rc.5 对 Web 壳层/静态模块表**零改动**,插件 `lib/client.js` 只 `require("react")`、`require("react/jsx-runtime")`,二者都在基线内,继续无需 `dsh.client.external`。

**asar 中不存在独立包目录的 4 个「客户端基线模块」**:`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-store`、`dsh-client-ui-dockkit`(检索 0 条目)——它们被打进 `dsh-web-frontend` 的 `staticModules`。插件对 `ui-slots` 只有**类型级** import,运行时不 require,与之一致。

结论:桌面端 0.2.1-rc.5 与 npm 0.2.1-rc.5 **语义一致**(版本、运行时 JS、槽位声明、staticModules 基线全部对齐),可放心以 npm 类型包 + 桌面端 asar 双向作为适配依据。

---

## 3. 插件现状逐项核对(代码级)

| 插件文件 | 用到的宿主面 | rc.5 状态 | 结论 |
|---|---|---|---|
| `src/client/index.tsx` | `slots.inject/register` × 4(`conversation.input.right:115`、`conversation.input.dock:126`、`settings.plugins.tab:174`、`settings.plugin.item:175`)、`locale`、`modelDirectories`、`sessions`、`configForms`、`settingsScope` | 前 3 个仍声明且逐字节相同;`settings.plugin.item` 仍不存在(独立守卫);其余服务均存在 | 无需改 |
| `src/client/OptimizeButton.tsx` | `PropsRuntime<'conversation.input.right'>`(:9)+ `useInput(...).draft`(:48)+ `sessionId`(:60) | 类型来源逐字节不变 | 无需改 |
| `src/client/ResultDock.tsx` | `PropsRuntime<'conversation.input.dock'>`(:9)+ `useInput`/`useSession`(:169-178)+ `inputActions.setDraft`(:290/294)+ `InputZone.session/input` | 同上;`setDraft`、`SessionSnapshot.running` 不变 | 无需改 |
| `src/client/controller.ts` | `sessions.binding(id).eventSource`、`modelDirectories.directoryFor().load()`(:270)、`connection.rpc.call('/api','session/modelCatalog')` | 契约逐字节不变 | 无需改 |
| `src/client/host-faces.ts` | 上述服务的自持结构面(:55-94、:139-174) | 与上游形状仍匹配 | 无需改 |
| `src/client/settings-face.ts`、`SettingsCard.tsx` | `configForms.get(entryId)` 快照 `{status,value,writable}` | `ui-settings` 9 d.ts 全等 | 无需改 |
| `src/client/i18n.ts` | 自持 zh/en 字典 + 只读 locale 服务 `{active}`(:11-19) | 无上游 key 依赖;rc.5 删的 `session.moreViewsCurrent` 与插件无关 | 无需改 |
| `src/index.ts`(Host 半) | `ctx.llm.listProviders/listModels/resolveModelInfo/stream`(:340/380/384/552/660/752)、`GenerateOptions`(:635)、schemastery、HTTP 路由 | `dsh-llm` 逐字节不变;provider/模型 id 不变 | 无需改 |
| `cordis.patch.yml` | 组合行 `insert id: prompt-optimizer` | 无变化需求 | 无需改 |
| `scripts/sync-types.mjs` | 类型钉版 | 工作区已把 PACKAGES 19 项与注释升到 rc.5(本轮核对通过) | 已改(保持) |
| `package.json` | 版本/描述/devDeps | 工作区已是 `0.6.3` / `适配 dsh 0.2.1-rc.5` / devDeps rc.5 | 已改(保持) |
| `package-lock.json` | 锁文件 | 工作区已重新生成,`@deepseek-ai/*` 全部 rc.5 | 已改(保持) |
| `README*.md` / `docs/release-*.md` | 兼容性声明 | 仍宣称 rc.3;`docs/release-v0.6.3.md` 尚不存在 | **建议改** |

> **执行结果(2026-10-31)**:上表 4–5 项已全部落地——README 兼容声明已升到 v0.6.3 / rc.5(新增 rc.5 实测行、开发基线与适配要点),`docs/release-v0.6.3.md` 已创建。以下 §5.1/§5.2 中标注「⏳ 未做」的条目均为**调研期快照**,发布前已全部完成。 |

> 说明:本轮调研期间,工作区里并行的适配工作已经把 `package.json`、`package-lock.json`、`scripts/sync-types.mjs` 改成 rc.5(我在 `git diff` 与 `node_modules` 实测中确认)。本调研**未修改**这三个文件(超出本任务写权限),仅作核对与记录。

---

## 4. 会崩 / 静默降级 / 可无损升级

### 4.1 会崩(必须改代码才能运行):**无**

- 4 个槽位:3 个仍声明且逐字节不变、1 个(legacy)仍不存在且已有独立 `inject` 守卫;
- 插件 import 的全部上游包(`@deepseek-ai/cordis`、`dsh-client-ui-slots`、`dsh-client-ui-conversation`、`dsh-client-ui-renderer`、`dsh-client-ui-settings-plugins`、`dsh-client-connection`、`dsh-llm`、`@deepseek-ai/schemastery`)中,**只有 ui-conversation 有变化,且变化不在插件用到的面上**(§2.2);`cordis` 4.0.5 与 `schemastery` 3.18.5 在桌面端与 npm 侧均为同一份内容;
- 包清单/启动校验:`app-boot`(23 d.ts + `lib/index.js`)与 `package-manifest`(2 d.ts)逐字节不变,`engines.dsh` 覆盖 rc.5 且仍挡住 0.3.0;
- 客户端模块装载:`staticModules` 基线与 rc.3 同一 bundle 哈希,插件 external 只有基线内的 react;
- `tsc --noEmit` 在 rc.5 类型下 **exit 0**;`npm test` 99 项全绿。

### 4.2 静默降级(不崩但行为可能不如预期):**0 处新增**

rc.3 轮记录的两处提示在 rc.5 上**保持不变**(不是本轮回归):

1. 官方 API-key 路由的模型列表跟随 `/models`(rc.3 起);固定了已下线模型时,优化以宿主错误结束(面板 error 态可见、可重试)。
2. 官方模型上下文窗口标注 1M(插件不读该字段)。

本轮新增的可提示项(非降级):

3. **思考内容展示方式变化**(rc.5):模型输出里的 `<signature>…</signature>` 元数据块会被 Chat 剥离后再显示。本插件结果面板显示的是**优化后的提示词正文**(自绘纯文本),不经过 ui-chat 的 reasoning 渲染,因此**不出现**该剥离行为;若用户把含 signature 的原始 reasoning 复制到别处,属于宿主侧行为。
4. **`conversation.chat.reasoning.body` 变为「必填 `rawText`」**:仅影响占用该槽位的第三方插件,本插件不占用。

### 4.3 可无损升级:是

- rc.3 轮修过的 5 个问题(`settings.plugin.item` 必抛、`configForms` 无 `mode` 的文案、上下文改走事件窗口、`engines`/`manifestVersion` 声明、类型钉版)在 rc.5 上**全部保持有效**,无回退(逐字节证据见 §2.4/§2.5);
- 插件 `lib/client.js` 的 external 面未受影响(仅 `react` / `react/jsx-runtime`);
- 真实端到端:本轮**未**重跑 rc.5 真实 Web 端到端(桌面端 0.2.1-rc.5 的 runtime 需 launch token;rc.3 轮的端到端结论 + 本轮 asar/npm 双向逐字节核对构成证据链)。若要发布,建议按 rc.3 轮同样的方法用 0.2.1-rc.5 的 runtime CLI 引导临时 profile 复验一次(按钮/面板/设置标签页/设置卡读写)。

---

## 5. 待办清单与执行结果(按文件)

### 5.1 必须改(prepare release 才算真正「适配 rc.5」)

1. **`scripts/sync-types.mjs`** —— `PACKAGES` 19 项 + 注释里的版本号 `0.2.1-rc.3` → **`0.2.1-rc.5`**。
   状态:✅ 工作区已改(逐项核对 19/19 为 rc.5,`upstream-contract` u1 通过)。
2. **`package.json`** ——
   - `devDependencies.@deepseek-ai/dsh-client-ui-slots`、`.dsh-llm` → **`0.2.1-rc.5`**;
   - `description` → **`适配 dsh 0.2.1-rc.5(含官方桌面端)`**;
   - `version` → **`0.6.3`**(依据见 §6);
   - `engines.dsh`、`dsh.manifestVersion`、`dsh.client.inject` —— **保持不变**(§2.5 实测区间仍覆盖 rc.5,校验规则字节级不变)。
   状态:✅ 工作区已改。
3. **`package-lock.json`** —— 重新生成,root 与 `@deepseek-ai/*` 全部 `0.2.1-rc.5`(`resolved`/`integrity` 同步)。
   状态:✅ 工作区已改(核对:`dsh-brand`/`dsh-client-ui-slots`/`dsh-llm`/`dsh-timeout`/`dsh-typert-protocol`/`dsh-util-crypto`/`dsh-util-values` 均 rc.5)。

### 5.2 建议改(声明/文档层,不影响运行)

4. **`README.md` / `README.en.md`** —— 兼容声明升到 v0.6.3 / rc.5:在兼容表加 `0.2.1-rc.4`、`0.2.1-rc.5` 行;「开发基线」段落改为 rc.5;新增「0.2.1-rc.5 适配要点」;更新验证状态(本轮 typecheck + 99 项测试 + asar/npm 逐字节核对)。
   状态:✅ 已完成(v0.6.3)。
5. **`docs/release-v0.6.3.md`** —— 新 release notes:结论(纯声明层适配、`src/` 零改动)、证据链接(本文档)、验证项(typecheck/test/asar 与 npm 一致性)、以及 §4.2 的提示。
   状态:✅ 已完成(v0.6.3)。
6. **`docs/dsh-021-rc3-diff.md` / `docs/dsh-021-diff.md`** —— 历史文档,**不修改**(保留存档);新文档即本文件。
7. **`test/upstream-contract.test.mjs`** —— **不需要改**(u1 断言「已安装版本 == `sync-types` 钉版」,天然跟随钉版升级;u2-u5 在 rc.5 上实测全过)。
   可选加强(非必需):加一条「`conversation.chat.reasoning.body` 自 rc.5 起 owner props 含必填 `rawText`」的注释或断言,作为**未来若新增该槽位占用时的提醒**;当前插件不占用该槽位,不加也不影响正确性。

### 5.3 无需改

8. **`src/**` 全部**(`client/index.tsx`、`OptimizeButton.tsx`、`ResultDock.tsx`、`controller.ts`、`host-faces.ts`、`settings-face.ts`、`SettingsCard.tsx`、`i18n.ts`、`GitHubIcon.tsx`、`SparkleIcon.tsx`、`src/index.ts`、`src/prompt.ts`)—— 依据 §2 全部证据,零改动;`tsc --noEmit` exit 0、99 项测试全绿。
9. **`cordis.patch.yml`**、**`scripts/build.mjs`**、`test/**` 现有用例 —— 无需改(`slot-guard` 的「两槽位独立 inject」断言在 rc.5 下依然成立)。
10. **`dsh.client.external`** —— 无需新增(`staticModules` 基线含 `react` / `react/jsx-runtime`,且与 rc.3 同一 bundle 哈希)。
11. **`engines.dsh`** —— 无需收紧(收紧到 `>=0.2.1-rc.4` 会丢掉 0.1.x/0.2.1-rc.1~rc.3 用户,而插件的老路径仍是探测式工作,零成本)。

### 5.4 可选(非适配必需)

- **`cordis` devDep `^4.0.4`**:实测 4.0.4→4.0.5 包内容逐字节相同,只有 `package.json` 的 peerDeps(`cordis-plugin-include ~1.0.9→~1.0.10`、`cordis-plugin-loader ~1.0.5→~1.0.6`)与 `cosmokit ~1.8.5→~1.8.6` 下限 bump。`^4.0.4` 已能解析到 4.0.5,**无需改**;若想让 devDep 与桌面端完全对齐可写 `^4.0.5`(纯声明)。
- 若将来想在「更多菜单」挂插件入口:rc.3 新增的 `conversation.session.header.views.actions`(rc.5 仍存在,asar 中 ui-conversation @772186 声明 `kind:"list", scope:"root"`)是现成槽位;rc.5 只是改了它的菜单 label 渲染(§2.2),注册选项未变。
- 若将来要在思考块里挂自绘推理面板:必须同时读 `rawText`(原始)与 `text`(显示文本),`ReasoningContentInput` 不再继承 owner props(§2.3)。
- 结果面板「替换草稿」若想支持「追加到已有草稿」:仍可用 rc.3 起的 `requestDraftInitialization({ prompt, whenDraftExists:'append' })` 或 `appendDraft`(rc.5 该文件 blob 未变);当前 `inputActions.setDraft` 等价 `replace`,用户可见行为不变。

---

## 6. 建议版本号

**建议:`0.6.3`(patch)**——即工作区当前值。并把「适配 dsh 0.2.1-rc.5」写进 release notes。

判断依据:

1. **插件对外行为零变化**:无新增/删除配置项,无设置命名空间变化(`prompt-optimizer` 不变),无 UI 行为变化,无破坏性改动 → 按 SemVer 是 patch;
2. **上游是 patch 级 prerelease**(`0.2.1-rc.3 → rc.4 → rc.5`,同一 minor 行),`engines.dsh` 区间不变,不构成「支持新 minor」;
3. **可对照历史惯例**:`v0.6.2`(适配 rc.3)本身就是 patch;`v0.6.0`(适配 rc.2)之所以是 minor,是因为同时含「设置页必崩修复 + 真实会话上下文 + 文案修正」等功能/修复,而本轮连一个源码字符都不用改;
4. 若把 §5.4 的可选新功能(思考块面板、更多菜单入口、appendDraft)一起做进本版,则应升为 **`0.7.0`**(功能增加)。

不建议改动 `engines.dsh`(理由见 §5.3 第 11 条)。

---

## 7. 兼容性矩阵(实测/推演)

| 宿主版本 | Host 半 | Client 半 | 说明 |
|---|---|---|---|
| 0.1.0-rc.7 ~ 0.1.5 | ✅ | ✅ | 走 `settingsScope` + 0.1.x `settings.plugin.item`(存在则注册) |
| 0.2.0-rc.x | ✅ | ✅ | `configForms` + `settings.plugins.tab` |
| 0.2.1-rc.1 / rc.2 | ✅ | ✅ | 独立 inject 形态 |
| 0.2.1-rc.3 | ✅ | ✅(真实 Web 端到端,v0.6.2 已发布) | rc.3 轮结论 |
| **0.2.1-rc.4** | ✅ | ✅(推演:契约/标准 props/dock 全未动;typecheck 基线 = rc.4 与 rc.5 同一批 d.ts,仅 ui-chat 未变) | 与 rc.5 差异只有 view-tab tooltip 与 ACP 日志通道 |
| **0.2.1-rc.5** | ✅(`dsh-llm`/`session`/`tools`/manifest 逐字节相同;`tsc --noEmit` exit 0) | ✅(`staticModules` 基线同 rc.3 bundle 哈希;3 个槽位 + 标准 props 逐字节相同;99 项测试全绿) | **本轮目标,可无损升级;建议 v0.6.3** |
| 0.3.0-rc / 0.3.0 | ❌ | ❌ | `engines.dsh: <0.3.0-0` 会在装/启动期拒绝,属显式放弃 |

---

## 8. 附录:证据落盘与复现

证据目录(临时,不随仓库提交):`C:\Users\yixin\AppData\Local\Temp\rc5-invest\`

| 文件 | 内容 |
|---|---|
| `compare.clean.json` | rc.3...rc.5 compare API 原始响应(13 commits) |
| `commits/*.json` | 13 个 commit 的逐文件清单与 patch |
| `out-all-changed-files.txt` | 339 个唯一变更文件(去重合并 compare + commits) |
| `out-dts-diff.txt` / `out-summary.tsv` | 46 个 npm 包 `lib/**` 逐文件 SHA-256 比对(§2.4) |
| `out-dts-patches.txt` | 7 个 DIFF 包共 12 个变化文件中的 9 个关键文件的 `git diff --no-index` patch(其余 3 个为 ui-chat 的 `client.js` 与已由源码 diff 覆盖的文件) |
| `out-pkgjson-diff.txt` | 46 个包的 `package.json` 字段级 diff |
| `out-src-sha.txt` | 26 个上游源码路径的 rc.3 / rc.5 blob SHA 对照(§2.2/§2.3) |
| `out-src-diff.txt` | `ConversationSession.tsx`、`ui-chat/contract/slots.ts` 的带行号 diff |
| `out-asar-parity.txt` | 27 个包 asar vs npm 逐文件 SHA-256(§2.6) |
| `out-asar-fullscan.txt` | asar 3870 文件槽位检索 + `staticModules` 原文 |
| `out-asar-clientjs.txt` / `out-asar-feature-checks.txt` | asar 客户端 bundle 的构建差异分析、`reasoningText`/`ViewTabLabel` 命中 |
| `out-web-frontend.txt` | `dsh-web-frontend` 入口 bundle 的 `OZ()` staticModules 原文 |
| `asar-versions.tsv` / `asar-files.txt` | asar 内 313 条包版本、18,234 个文件条目 |
| `npm/rc3`、`npm/rc4`、`npm/rc5` | npm tarball 解包(两侧同源,保证基线不漂移) |
| `typecheck/` | 纯 rc.5 `node_modules` 的独立 typecheck 沙箱 |
| `contract-check.mjs` | 把 `test/upstream-contract.test.mjs` 的 u2-u5 断言跑在 rc.5 npm 包上 |

关键复现命令(示意):

```powershell
# 上游语义(gh 已登录;本机 github.com 被 hosts 污染,但 api.github.com 直连可用)
gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.3...dsh-v0.2.1-rc.5
gh api repos/deepseek-ai/deepseek-harness/commits/<sha>
gh api "repos/deepseek-ai/deepseek-harness/contents/<path>?ref=dsh-v0.2.1-rc.5"   # base64,decode 后做 diff
# npm 双侧解包 + 逐文件哈希
npm pack @deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.5 --pack-destination <tmp>; tar -xzf ... 
# 桌面端 asar(自写 header reader,避免 @electron/asar 的路径问题)
node asar-mini.mjs && node asar-parity.mjs
# 契约守卫(在 rc.5 npm 包上)
node contract-check.mjs
```

---

**一句话给决策层**:rc.3→rc.5 对本插件是「声明层升级」——插件用到的 3 个槽位与 composer 标准 props 逐字节未动,`settings.plugin.item` 仍不存在,`dsh-llm`/`session`/`tools`/manifest 与 `staticModules` 基线全部不变;rc.5 唯一的契约破坏性变更(`conversation.chat.reasoning.body` 新增必填 `rawText`)本插件不占用。补齐「类型钉版 + lock + 描述/版本号 + README/release notes」即可发布 **0.6.3**,`src/` 零改动。
