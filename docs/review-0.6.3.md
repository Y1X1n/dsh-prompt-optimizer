# PR #16 独立审核记录(v0.6.3 / 适配 dsh 0.2.1-rc.5)

审核对象:`Y1X1n/dsh-prompt-optimizer` PR #16,head `b5225d8`(base `main` `c9cbf9e` = v0.6.2)。
审核方式:本地复跑 + 独立下载 npm tarball 逐文件 SHA-256 + 独立解析桌面端 `app.asar` + 真实 rc.5 Web 端到端重跑 + 契约测试变异验证。
审核账号即 PR 作者,GitHub 不允许自审 approve,故以 comment 形式提交结论。

## 1. 审核范围

`gh pr diff 16` 变更 8 个文件:`README.md`、`README.en.md`、`docs/dsh-021-rc5-diff.md`(新增)、`docs/release-v0.6.3.md`(新增)、`docs/screenshots/rc5-e2e-optimize-success.png`(新增)、`package-lock.json`、`package.json`、`scripts/sync-types.mjs`。
`git diff --name-only c9cbf9e b5225d8 -- src cordis.patch.yml scripts/build.mjs .github test` → 空:代码、组合层、构建脚本、CI、测试零改动,与 PR 声明一致。
`git diff cf7ebb6 b5225d8` → 仅 `docs/release-v0.6.3.md` 一行文案(耗时改为「约 6–7s(两次实测 7.0s / 5.9s)」),无基线/代码改动,确认本轮 head 更新范围符合预期。

## 2. 实测结果(本机复跑)

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | exit 0,零错误(rc.5 全量类型) |
| 构建 | `npm run build` | exit 0(lib/index.js 43.2kb、client.js 83.6kb 等 4 个产物) |
| 测试 | `npm test` | exit 0,**五套 99 项**:smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 5 |
| 干净 lock 校验 | 临时目录 `npm ci --legacy-peer-deps --ignore-scripts` | exit 0,23 包安装成功 |
| 已装基线 | `node_modules/@deepseek-ai` 实读版本 | 19 个 `sync-types` 钉版包 + `dsh-llm` 全为 `0.2.1-rc.5` |
| CI | GitHub Actions(新 head b5225d8) | ubuntu-latest / macos-latest 均 SUCCESS |

## 3. 逐项核对

### 3.1 声明层基线
- `scripts/sync-types.mjs` PACKAGES **19 项全部 `0.2.1-rc.5`**(含注释同步),`package.json` devDeps 的 `dsh-client-ui-slots` / `dsh-llm` 同为 rc.5;`upstream-contract` u1 在 CI 里再校验一次「已装版本 == 钉版」。
- `package-lock.json`:`@deepseek-ai/*` 条目共 10 条,旧版本字符串(rc.3/rc.4/0.2.0-rc.x/0.1.x-rc.x)**0 处**;非 rc.5 的只有工具链 `cordis@4.0.4`、`cosmokit@1.8.6`、`schemastery@3.18.5`,符合预期。
- `engines.dsh` 未改(`>=0.1.0-rc.7 <0.3.0-0`)。用 npm `semver`(`includePrerelease: true`)实测:0.1.0-rc.7 / 0.2.1-rc.3 / rc.4 / rc.5 / 0.2.2 → true;0.3.0-rc.0 / 0.3.0 → false。**覆盖 rc.5 且排除 0.3.0**,与声明一致。
- `version` = 0.6.3,`description` 含「适配 dsh 0.2.1-rc.5」;`dsh.manifestVersion` / `dsh.client.inject` 未动;`package.json` 为合法 UTF-8 无 BOM。

### 3.2 上游事实(独立下载 tarball,非引用文档)
自行 `npm pack` rc.3 / rc.5 并逐文件 SHA-256(共 35 个包,含 19 个钉版包 + `dsh-llm` + 相关包):
- `dsh-client-ui-slots` / `dsh-client-ui-settings` / `dsh-client-ui-settings-plugins` / `dsh-llm`:仅 `package.json` 变化,**lib/** 逐文件相同**;
- `dsh-client-ui-conversation`:6 个文件变化(README×3、`lib/client.js`、`lib/types/client/locales.d.ts`、`package.json`);`contract/` 下 14 个 d.ts **全部相同**;`conversation.input.right`/`dock` 仍 `kind:'list'`/`scope:'session'`,`dock` owner `InputZone` 不变;`useInput`/`inputActions`/`sessionId` 仍在;
- `dsh-client-ui-settings` 的 `settings.plugins.tab` 声明(@L86)与运行时注册均在;`settings.plugin.item` 在全部受检 `lib/**` 中 **0 命中**;
- `dsh-client-ui-chat`:8 文件变化 + 新增 `reasoning-text.d.ts`;`reasoning.body` 新增必填 `rawText` 仅出现在 **rc.5**(rc.4 无 `rawText`、无 `reasoning-text.d.ts`),文档「rc.4=tooltip / rc.5=思考块」的版本归属正确;
- 另有 11 个包:仅 `package.json` 变化,或仅构建元数据(`dsh-client-modules` 的 `const commit`、`dsh-client-ui-sidebar` 的版本标签、`dsh-client-ui-settings-general` 的版本字符串、`dsh-cordis-client-runner` 的槽位目录、`dsh-llm-deepseek-account` 的 `console.info→error`)。与 release notes「真实代码变化只落在 ui-conversation 的 tooltip 与 ui-chat 的思考块」一致。
- 上游语义:`compare dsh-v0.2.1-rc.3...dsh-v0.2.1-rc.5` = **13 commits**,与文档 §0.1 表逐条吻合;release 日期 rc.4=2026-10-28、rc.5=2026-10-30,与文档一致。
- 插件侧类型图对 ui-chat 的引用数:`node_modules/@deepseek-ai/**` 的 d.ts 中 **0**,`src/` 中 `conversation.chat`/`ui-chat` **0 命中** → 「不占该槽位、零影响」成立。

### 3.3 桌面端 asar(独立解析,未用作者脚本产物)
`E:\DSH\resources\app.asar` 顶层 `@deepseek-ai/dsh-desktop@0.2.1-rc.5`,`dshBuildCommit=d4db512a…`;`@deepseek-ai/*` `package.json` 记录 313 条 → **302 条 rc.5**,非 rc.5 为 8 个工具链包(cordis 4.0.5 / cosmokit 1.8.6 / schemastery 3.18.5 等);8 个重名包两处版本一致,无「双版本」。
`dsh-web-frontend` 入口 `dist/assets/index-BXV-oxvX.js`(941,436 字节)SHA-256 = `0f3fc6b857e4f8bd…`,**npm rc.3 与 rc.5 同哈希**,asar 内亦同 → client `staticModules` 基线零变化,插件 external 仅 react/react-jsx-runtime 仍在基线内。
asar 槽位扫描:`settings.plugin.item` 0 命中;`conversation.input.right`/`dock`、`settings.plugins.tab` 均在 `dsh-client-ui-conversation` / `-settings-plugins` 的 `lib/client.js` 中声明。

### 3.4 契约测试非空转(变异验证)
在临时副本上做三组变异,`test/upstream-contract.test.mjs` 均**如期失败**(基线 exit 0):
1. `conversation.input.right` 的 `kind: list → single` → u2 断言失败;
2. `conversation.input.dock` 的 `scope: session → root` → u2 断言失败;
3. 在 `dsh-client-ui-settings-plugins/lib/client.js` 追加 `settings.plugin.item` 字样 → u5 `doesNotMatch` 失败。
结论:u2/u5 是真实断言而非空转,u1 还额外钉住「已装版本 == 钉版」,可防止旧 `node_modules` 让 CI 跑在旧基线上。

### 3.5 E2E 真实性(独立重跑)
用官方桌面端自带 rc.5 runtime CLI(`dsh --version` = `0.2.1-rc.5`)引导 profile `po-rc5-test`,独立端口重跑:
- 路由直连:`POST /dsh-prompt-optimizer/optimize` → 39 个 delta 帧 + `done` 帧,`wellFormed:true, truncated:false, provider:magpie, model:group/safely-deepseek, fallbackUsed:false`(11.5s);
- 真实 Web(无头 Chrome/CDP):按钮存在且带 `dsh-po-btn dsh-po-opt` 类、**空草稿 disabled → 键入后 enabled**;点击后 **4.8s 成功产出优化稿**,面板出现「替换输入框 / 复制 / 重新优化 / 关闭」,无错误态,徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 4.8s`,**控制台零错误**(独立截图留存于临时目录,不入库)。
- profile 安装物一致性:`po-rc5-test/node_modules/@y1x1n/dsh-prompt-optimizer` 的 `lib/{index,client,controller,prompt}.js` 四个 SHA-256 与 HEAD 构建产物**逐一相同**,`package.json` version 0.6.3,依赖指向 `y1x1n-dsh-prompt-optimizer-0.6.3.tgz`,该 tgz 内 `lib/**` 亦同 → 验证的是本 PR 构建,不是旧包。
- 截图与文档口径:`rc5-e2e-optimize-success.png` 徽章实为「用时 5.9s」;head 的 release notes 已按 b5225d8 修正为「约 6–7s(两次实测 7.0s / 5.9s;截图那次 5.9s)」,与截图一致。文档**未**把错误态夸大为成功(错误态仅在 rc.3 段如实描述)。
- 设置页(内置插件标签页 + 设置卡渲染):**未独立复验(沿用作者脚本输出与 Lead 证据)**,本轮未重新导航设置页。

### 3.6 文档质量
- 数字:99 项 / 五套(35/25/29/5/5)与实际复跑**完全一致**;「38 SAME / 7 DIFF」与我的独立比对口径一致。
- 相对链接:README 与两份 docs 内所有相对链接均可解析(无死链)。
- 行号引用抽查:`src/client/index.tsx:115/126/174/175`、`OptimizeButton.tsx:9/48/60`、`ResultDock.tsx:9/176/181/290/294`、`src/index.ts:333-391/635/660/752`、`controller.ts:68-79/270`、`host-faces.ts:55-94/139-174`,以及 npm 侧 `slots.d.ts:301/322/423/431/470`、`input.d.ts:248/271`、`snapshot.d.ts:62`,均与正文对得上。

## 4. 发现项(均为非阻塞,建议顺带修)

1. **README 耗时口径未随 b5225d8 同步(文档一致性)**
   - `README.md:164`、`README.en.md:163` 仍写「约 7.0s … 徽章 `… · 用时 7.0s`」,而本 PR 入库的截图徽章是 **5.9s**,且 head 的 release notes 已改为「6–7s(7.0s / 5.9s)」。建议 README 同步成区间表述(如「约 5–7s,多次实测 7.0s / 5.9s」),避免读者对照截图时发现数字对不上。
2. **`docs/dsh-021-rc5-diff.md` 残留调研期快照措辞**
   - `:442`「README 仍宣称 rc.3;`docs/release-v0.6.3.md` 尚不存在 | **建议改**」、
   - `:444`「工作区里并行的适配工作…本调研未修改这三个文件」、
   - `:474`「本轮**未**重跑 rc.5 真实 Web 端到端」、
   - `:496`/`:498`「状态:⏳ 未做」。
   这些在本 PR 落地后已不成立(README 已更新、release notes 已存在、E2E 已重跑),而文档作为证据随 PR 一起发布。建议在该文档顶部加一句「§3–§5 为调研期快照,落地状态见 §5 更新注记」,或直接把这 5 处改为完成态。
3. **(可选)E2E 耗时表述**:同一流程三次实测为 7.0s / 5.9s / 4.8s,建议统一用区间,避免单点数值被读成承诺。

## 5. 结论

**通过(建议合并),无阻塞问题。**
范围干净(`src/`、`test/**`、CI、组合层零改动)、基线/lock/engines 声明正确、上游事实经独立 tarball 与 asar 双向核对成立、契约测试经变异验证非空转、真实 rc.5 Web 端到端可复现(成功产出优化稿、控制台零错误)。上述 2 处文档一致性建议属非阻塞,可在本 PR 内顺手修或留待 v0.6.4 文档轮。
CI 在新 head 上双绿;审核账号为作者本人,按 GitHub 规则不 approve,以 comment 记录结论。
