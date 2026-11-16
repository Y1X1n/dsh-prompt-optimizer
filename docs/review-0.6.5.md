# PR #19 独立审核报告（v0.6.5 / 适配 dsh 0.2.2-rc.3）

审核对象：`Y1X1n/dsh-prompt-optimizer` PR #19，分支 `feat/dsh-0.2.2-rc.3`（HEAD `c8b6355`），base `main`（`d15924d`，与 origin/main 一致，单提交）。PR 状态 OPEN / MERGEABLE。
审核方式：独立复跑 + 从 46 个原始 tarball **重新解包**逐文件字节比对 + 自写 ASAR header reader 解析桌面端 + 独立下载 0.1.x 四版本线类型包 + semver 实测。**未修改任何仓库文件**（取证脚本与解包均在 `Temp/review-065/`）。

---

## ① 审核范围（实际变更文件）

`git diff main...HEAD --stat`：**9 个文件，+345/−73**

| 文件 | 状态 |
|---|---|
| `package.json` / `package-lock.json` / `scripts/sync-types.mjs` | M（声明层） |
| `README.md` / `README.en.md` | M |
| `docs/dsh-022-rc3-diff.md` / `docs/release-v0.6.5.md` | A |
| `docs/screenshots/rc3-e2e-optimize-success.png` / `rc3-e2e-settings.png` | A |

**零改动核实**：`git diff main...HEAD -- src/ cordis.patch.yml scripts/build.mjs .github/` 输出 **0 行** ✓。工作区另有未跟踪旧截图/旧 review 文档，不属于本 PR。

## ② 实测结果（审核者复跑）

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | exit 0，零错误 |
| 测试 | `npm test` | exit 0，5 套全绿；程序化计数 **✓ 标记 = 100**：smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 6，与声明逐项一致 |
| 契约守卫 | 同上（u1–u5+u3b） | u1 输出「20 个 + dsh-llm 0.2.2-rc.3」；u3b 正则源码为 `/readonly phase:[^;]*'sending'/`（已锚定） |
| engines | `npx semver … -r ">=0.1.0-rc.7 <0.3.0-0" --include-prerelease` | 命中 0.2.2-rc.3 / 0.2.2 / 0.2.2-rc.1 / 0.1.5-rc.2 / 0.1.0-rc.7；排除 0.3.0 / 0.3.0-rc.1 / 0.1.0-rc.6 ✓ |
| runtime CLI | `E:/DSH/resources/runtime/cli/bin/dsh.cmd --version` | `0.2.2-rc.3` ✓ |
| CI | `gh pr checks 19` | ubuntu-latest / macos-latest **均 pass**（PR 正文 CI 复选框未勾，实际已绿） |
| build | 未复跑 | 见⑤验证局限 |

## ③ 逐项核对结论

**1. 钉版一致性 ✓**
- devDeps：`dsh-client-ui-slots` / `dsh-llm` = `0.2.2-rc.3`；`cordis ^4.1.0`、`schemastery ^3.19.0` 未动。
- `sync-types.mjs` PACKAGES = **20 项**（19→20，新增 `dsh-error`），全钉 rc.3；diff 仅版本替换 + 拆包注释。
- node_modules：25 个 rc.3 真实包（20 钉版 + dsh-llm + 4 个 npm 传递依赖 dsh-timeout/dsh-typert-protocol/dsh-util-crypto/dsh-util-values）+ cordis 4.1.0 / cosmokit 1.9.0 / schemastery 3.19.0 + **50 个 stub**（rc.1 文档记录 46，+4 属实，含 `dsh-client-ui-context-menu`）。
- lock：8 个 npm 管理的 dsh 包全 rc.3（含 dsh-error，resolved 指向 registry.npmjs.org），差异 14 行 rc.1 删 / 16 行 rc.3 增，**无 rc.1 残留**；lockfileVersion 3，root version 0.6.5。

**2. 上游契约（重新解包 23 包 × 2 组，独立比对）✓**
- 逐文件字节比对：rc.3 普遍新增 `src/` + `.map`（与「打包面」声明一致）；仅 rc.1 存在的文件仅 2 个：`ui-primitives/lib/types/useAnchoredPosition.d.ts`（与「移除 useAnchoredPosition」声明吻合）、`dsh-tools` 一个 shared chunk（内部重命名）。
- **四个块哈希全部独立复现**（花括号配平抽取，SHA-256 前 16 位）：

| 块 | rc.1 = rc.3 | 文档值 | 复现 |
|---|---|---|---|
| conversation.input.right | `42609d09c15c01e2` | 同 | ✓ |
| conversation.input.dock | `3877c57ff1a60932` | 同 | ✓ |
| settings.plugins.tab | `2e49302e62eee7c7` | 同 | ✓ |
| SessionStandardProps | `a88c9594ca61cd76` | 同 | ✓ |

  `SessionStandardProps` 在两版各**恰好出现 1 次**（`interface SessionStandardProps {`），标识符后第一个 `{` 即接口体，边界无歧义——上一轮「哈希不可复现」问题本轮**已解决**。三个槽位哈希亦与 rc.5 时代文档记录一致。
- `setDraft(text: string): void`、`readonly draft: string`、`readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting' | 'sending'` 两版逐字相同 ✓。
- **dsh-error**：npm 已发布（versions: 0.0.0-stage / 0.2.2-rc.2 / 0.2.2-rc.3，rc.2 起属实）；rc.1 `dsh-llm/error.d.ts` 本地声明 HarnessError，rc.3 改为 `import { HarnessError } from '@deepseek-ai/dsh-error'; export { HarnessError };` ✓；`AttachmentError extends Error`（rc.1）→ `extends HarnessError`（rc.3，自 dsh-error 导入）✓；`LlmError` 构造第二参 `string` → `BuiltinLlmFailureCode` + 新增 `static fromFailure` ✓。
- **src/ 从不构造**：grep `new (LlmError|HarnessError)` 零命中；唯一消费点 `src/index.ts:286` 只读 `reason.failure.code/message` 后抛普通 Error ✓。
- **staticModules**：自写 asar reader 从 `dsh-web-frontend/dist/assets/index-Ciz7DZxv.js` 提取 `qJ()` 映射 = **11 个模块**（react / react/jsx-runtime / react-dom / react-dom/client / cordis / zod / @tanstack/react-virtual / client-store / ui-slots / ui-primitives / ui-dockkit），与文档及 rc.1 时代记录完全一致 ✓。
- ModuleLoader：rc.1 多行（1523 行）→ rc.3 压缩（3 行），`window.__ModuleLoader__.load({id, factory})` 包装形态保持 ✓。
- `modelCatalog` / `eventSource` / `binding` / `entries` 在 dsh-api-session-controller 两版均存在（命中文件数 6/5/15/13→17）✓。
- asar：顶层 `@deepseek-ai/dsh-desktop@0.2.2-rc.3`；runtime 树 **338 包 / 328 个 rc.3**；顶层 node_modules 收窄为 **8 包** ✓。
- 背景声明：compare `ahead_by = 1574` ✓；rc.2 发布 2026-11-11、rc.3 发布 2026-11-13 ✓；`SlotKind` 四值→五值（+'hoc'）✓；dsh-llm 四方法面两版均在 ✓；zod 4.4.3→4.6.6 ✓。

**3. 文档口径 ✓（除④所列）**
- 版本 0.6.5、19→20 包、日期 2026-11-16、E2E 4.2s/5.3s 在 README 中英 / diff / release 四处一致；中英关键数字与结论同步 ✓。
- 兼容性标注：README 与 release notes 均正确区分 **0.2.1-rc.2 = 产物核对**、rc.3/rc.1/rc.5/rc.3(0.2.1) = 实测；「0.2.2-rc.2 未单独实测」说明准确 ✓。
- 截图：两张均存在，与证据目录副本逐字节相同；读图确认为**真实成功态**（优化稿内容 + 「替换输入框/复制/重新优化/关闭」+ 徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 4.2s`）与**设置卡**（内置插件 →「提示词优化」标签 + 模型/调用参数分组）✓。草稿原文 46 字符与文档「撤回恢复原文(46 字符)」吻合 ✓。宿主日志含 `[dsh-prompt-optimizer] loaded` ✓。

**4. 守卫精度 ✓**
- u3b 锚定 `readonly phase`（上一轮问题⑥未重犯）；u1 按 PACKAGES 表**动态全量**校验当前 20 项 + dsh-llm 单独断言。

## ④ 发现项清单

### 严重
无。

### 中
**M1 — 「0.1.x 宿主没有 phase 字段」错误表述重犯（上一轮发现项①）**
- 位置：`docs/dsh-022-rc3-diff.md:174`。
- 证据：独立下载并解包 `dsh-client-ui-conversation` 的 **0.1.0-rc.7 / 0.1.1-rc.2 / 0.1.2-rc.1 / 0.1.5-rc.3** 四个版本，`input` 契约均声明 `readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'`——**phase 自 engines 下限 0.1.0-rc.7 起就存在**，只是不含 `'sending'`。
- 影响：与同 PR 的 `release-v0.6.5.md:58`（「0.1.x 宿主的 phase 不含 'sending'」）、README、`src/client/controller.ts:68` 注释直接矛盾；误导后续维护者对旧宿主行为的判断。无运行时影响（`shouldAutoClose` 对缺省值安全）。
- 修复：将该句改为「0.1.x 宿主的 `phase` 不含 `'sending'`，……」，与 release notes 对齐（一行改动）。

### 轻微
**L1 — diff 文档兼容性表抹平「实测 / 产物核对」区分（上一轮发现项②的弱化重犯）**
- 位置：`docs/dsh-022-rc3-diff.md:169`，「0.2.1-rc.3 / rc.2」合并为一行裸 ✅。
- 证据：README 与 release notes 明确 rc.3(0.2.1)=实测、rc.2(0.2.1)=产物核对；diff 文档该行无标注，读者易将 rc.2 误读为同等实测。非显式误标，但口径倒退。
- 修复：拆行或加标注（rc.3 实测 / rc.2 产物核对）。

**L2 — 徽章引用与所附截图不符**
- 位置：`docs/dsh-022-rc3-diff.md:146`、`docs/release-v0.6.5.md:27`、`README.md:168`、README.en.md 验证段。
- 证据：四处均引用徽章「用时 **5.3s**」，但所附成功截图显示的是 **4.2s** 那次运行。两次运行均真实，引用与附件不匹配。
- 修复：引用改为 4.2s 以匹配截图，或补附 5.3s 运行截图。

**L3 — SessionStandardProps 哈希的证据口径不精确**
- 位置：`docs/dsh-022-rc3-diff.md:44`。
- 证据：该表行以 SessionStandardProps 块哈希作为「composer 标准 props（useInput/inputActions/**sessionId**）」的证据，但块内只有 useConversation/useInput/inputActions；**sessionId 由 ui-slots 框架按 `scope:'session'` 经 `InjectParams` 注入**（已独立核实两版该行逐字相同，哈希 `8d81d39326eab80a`）。结论本身成立，证据引用越界。
- 修复：表行注明 sessionId 来自 ui-slots 的 session-scope 注入面（两版相同）。

**L4 — vendor 名单漏列 2 包**
- 位置：`docs/dsh-022-rc3-diff.md:104`。
- 证据：338−328=10 个非 rc.3，文档只列 8 个；缺 `libreoffice-kit@0.2.3` / `libreoffice-kit-win32-x64@0.2.3`（package.json 在 asar.unpacked，已独立读出）。数字 338/328 本身正确。
- 修复：补列两包或加「等」。

### 观察项（非本 PR 缺陷，不计入发现项）
- u3 的 `sessionId` 断言对整个 conversation `slots.d.ts` 做正则；rc.3 中 `sessionId` 亦出现在无关的 `ContextMenuTargetMap.sessionHeader`。真实 sessionId prop 来自 ui-slots InjectParams（已核实保持），E2E 证明实际投递正常。测试文件本 PR 未改动，属既有守卫设计。
- `syncPins()` 的 `>= 19` 解析下限为 19 包时代遗留；u1 实际按当前表 20 项全量校验，不影响本轮结论。

## ⑤ 总体结论

**可以合并（建议先修 M1 一行表述）。**

- PR 全部核心声明经独立证据核实成立：src/ 零改动、20 包钉版一致、lock 干净、四个契约块哈希可复现且两版相同、dsh-error 拆包属实且插件不受影响、staticModules/ModuleLoader/engines/守卫全部通过；typecheck 零错误、100 项测试全绿、双平台 CI 已绿、E2E 截图真实。
- 无严重问题；1 项中等（M1，文档事实错误，上一轮同类问题重犯，一行可修）+ 4 项轻微表述/口径问题，均不影响运行时正确性。按上一轮「发现项在 PR 内修复」的惯例，建议至少修复 M1 后合并，L1–L4 可一并顺手处理。

**验证局限**：
1. 未复跑 `npm run build`（遵守「不修改任何文件」约束；`lib/` 为 gitignore 产物，src/ 与 main 完全一致，测试跑在既有产物上，不存在源码-产物漂移）。
2. 桌面端已升级 rc.3，rc.1 的 asar 不在本机；「staticModules 与 rc.1 一致」依据 rc.1 时代文档记录 + 本轮 rc.3 独立提取（11 模块完全吻合），未能对 rc.1 asar 重新解包。
3. E2E 的 5.3s 第二次运行无独立截图佐证（见 L2），4.2s 运行有截图 + 宿主日志；两次耗时数字本身无法事后复测。
4. 0.1.x phase 核验用各版本线已发布的 prerelease 包（0.1.2 / 0.1.5 无稳定版发布），与插件实际适配过的版本线一致。

## ⑥ 修复回执（PR 作者）

审核提出的 M1 与 L1–L4 已全部在本 PR 内修复（均为文档口径，无运行时改动）：

1. **M1**：`docs/dsh-022-rc3-diff.md` 兼容性表下注「0.1.x 宿主没有 phase 字段」改为「0.1.x 宿主的 `phase` 不含 `'sending'`（四值自 0.1.0-rc.7 起即存在）」，与 release notes / README / `controller.ts` 注释对齐。
2. **L1**：diff 文档兼容性表把「0.2.1-rc.3 / rc.2」合并行拆为两行——rc.3 标「实测（路由/SSE/错误态）」、rc.2 标「产物核对」，与 README / release notes 口径一致。
3. **L2**：diff / release / README 中英四处徽章引用由「用时 5.3s」改为「用时 4.2s」以匹配所附成功截图（首次运行），并注明截图为首次运行；「4.2s / 5.3s」双次耗时表述保留。
4. **L3**：diff 文档汇总表 composer 标准 props 行注明 `SessionStandardProps` 块内含 useConversation/useInput/inputActions，`sessionId` 另由 ui-slots 按 `scope:'session'` 经 `InjectParams` 注入（该注入面两版逐字相同，哈希 `8d81d39326eab80a`），证据引用不再越界。
5. **L4**：diff 文档 vendor 名单补列 `libreoffice-kit / libreoffice-kit-win32-x64 0.2.3`，并明确非 rc.3 共 10 包（338−328）。

观察项（u3 的 sessionId 正则、`syncPins()` 的 >=19 下限）属既有守卫设计、本 PR 未改测试文件，且 u1 实际按当前 20 包全量校验、E2E 证明 sessionId 投递正常，故不在本轮改动。修复后复跑 `npm run typecheck` 零错误、`npm test` 5 套 / 100 项全绿。