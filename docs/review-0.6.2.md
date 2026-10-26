# PR #15 独立审核报告 — 适配 dsh 0.2.1-rc.3 / v0.6.2

- 审核对象:PR #15(作者 Y1X1n),head `1df84d6`,base `main`(`71e4229`)
- 审核日期:2026-10-26;环境:Windows,Node v24.11.1,桌面端 runtime CLI `0.2.1-rc.3`
- 方法:通读 diff + 本机复跑命令 + 独立下载 rc.2/rc.3 tarball 做哈希比对 + 变异验证 + 桌面端 asar/E2E 产物核对;不以作者结论为依据

## 结论

**通过,无阻塞项。** 改动范围干净(`src/`、构建脚本、CI、既有测试零改动),版本/锁/契约/文档数字均实测复现:99/99 用例通过,CI ubuntu+macos 双绿(同一 head);E2E 声明把「只到 QUOTA 错误态」如实标注,未夸大为「优化成功」。附 5 条非阻塞建议。

## 一、改动范围(与 GitHub PR API 一致,8 个文件)

`README.md`、`README.en.md`、`docs/dsh-021-rc3-diff.md`(新增)、`docs/release-v0.6.2.md`(新增)、`package-lock.json`、`package.json`、`scripts/sync-types.mjs`、`test/upstream-contract.test.mjs`(新增)。
`git diff main...HEAD -- src cordis.patch.yml scripts/build.mjs .github test/{smoke,prompt.test,controller.test,slot-guard.test}.mjs` 输出 0 行,范围符合要求。

## 二、本机复跑

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0,零错误 |
| `npm run build` | exit 0,产出 4 个 lib 产物 |
| `npm test` | exit 0,五套 99 项全绿:smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 5(逐条计数,与 README、release notes 声明一致) |
| 临时目录 `npm ci --legacy-peer-deps --ignore-scripts` | exit 0,23 包装好,lock 可用 |
| 干净克隆全序 `npm ci → sync:types(41 stubs) → typecheck → test` | 四步均 exit 0;新增测试在真实 rc.3 类型包上通过 |
| CI(gh pr checks 15) | ubuntu-latest pass 44s、macos-latest pass 57s,run head = `1df84d6` |

## 三、逐项核对

| 核对项 | 结果 |
|---|---|
| sync-types PACKAGES 19 项 | 全部 `0.2.1-rc.3`;diff 仅版本串 + 1 处注释,无逻辑改动 |
| devDeps `dsh-client-ui-slots` / `dsh-llm` | 均 `0.2.1-rc.3`;node_modules 内 19 包 + dsh-llm 实测全部 rc.3 |
| package-lock | root `0.6.2`;22 处 rc.3,0 处 rc.2;62 行变更只含 version/resolved/integrity,无依赖树漂移 |
| engines.dsh | 未改(`>=0.1.0-rc.7 <0.3.0-0`);宿主 `dsh-app-boot/lib/index.js:276-284` 实测为 `semver.satisfies(..., {includePrerelease:true})`;该语义下 0.2.1-rc.3=true、0.2.2=true、0.3.0-rc.0/0.3.0=false,声明成立 |
| composer 槽位 | rc.3 `slots.d.ts:301/322` 仍 `kind:'list'`/`scope:'session'`;标准 props `useInput`/`inputActions`/`sessionId` 仍在 |
| settings 槽位 | `settings.plugins.tab` 类型 `slots.d.ts:86` + 运行时 `ui-settings-plugins/lib/client.js` 仍在;`settings.plugin.item` 在 node_modules 与 asar 59 个 client bundle 中均 0 命中 |
| 上游 6 commit | `gh api compare dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3`:ahead_by=6,6 个 SHA 与差异文档逐一相同 |
| 「纯加法/逐字节不变」声明 | 独立下载 rc.2/rc.3 tarball 逐文件 SHA-256:ui-slots(3 d.ts+js)、ui-settings(9 d.ts)、settings-plugins(4 d.ts+js)、dsh-llm(15 d.ts+16 js)、app-boot(23 d.ts+`lib/index.js` 203,572B)、package-manifest(2 d.ts)仅 package.json 不同;ui-conversation 变更集与文档 §2.6 完全吻合(+view-pins.d.ts 为新增) |
| 桌面端 asar | 307 个 `@deepseek-ai/*` = 297×rc.3 + 10 个工具链例外(与文档清单一致);根包 `@deepseek-ai/dsh-desktop@0.2.1-rc.3`;`desktop-runtime.json` 字段/值同文档且无 commit 字段;app-boot 哈希与 npm 包一致 |

## 四、新增契约测试非空转(变异验证)

在临时镜像(复制真实 rc.3 包,不改工作区)上做 6 组变异,均按预期失败;还原后基线通过:

1. 篡改已安装 slots 版本 rc.3→rc.2 → `u1` 失败(正是 v0.6.1 旧 node_modules 事故场景);
2. `conversation.input.right` 的 `kind` 改 `single` → `u2` 失败;
3. 删 `settings.plugins.tab` 类型声明 → `u4` 失败;
4. runtime bundle 注入 `settings.plugin.item` 字符串 → `u5` 失败;
5. sync-types 钉版改 rc.2 → 与 devDeps 不一致,line 40 失败;
6. 删除一个必需包并置 `CI=true` → exit 1;不置 CI → SKIP exit 0(缺包策略符合注释)。

## 五、E2E 声明核对

- 产物:`~/.dsh/profiles/po-rc3-test` 依赖 `y1x1n-dsh-prompt-optimizer-0.6.2.tgz`,已装插件 `0.6.2`,其 `lib/*` 4 个文件与当前 HEAD 构建 SHA-256 完全一致;`cordis.patch.yml` 含 `prompt-optimizer: language: zh`(mtime 14:39)。
- 截图(`%TEMP%\po-rc3-*.png`):插件详情页显示 v0.6.2「运行中」、来源 `file:...0.6.2.tgz`;新会话发送栏出现「✦ 优化」按钮;设置页出现「内置插件 → 提示词优化」标签页与完整设置卡,输出语言 English/中文两种状态均有留存。
- 文档口径:README/release notes 均明确写「测试账户余额为 0,只验证到 QUOTA 错误态与透传,成功输出沿用此前版本实测」,未发现「优化成功」类夸大。
- 精确性注:English 语言切换截图(14:38)与 patch 写入(14:39)发生在详情页仍显示 0.6.1 的时段,0.6.2 于 14:52 才装入并复验渲染。因 0.6.1→0.6.2 `src/` 零改动且 lib 不含版本串(实测哈希一致),结论不受影响;建议 release notes 措辞拆开或补一次 0.6.2 下的写入复验。

## 六、非阻塞建议

1. `README.md:204` / `README.en.md:203`:开发命令注释仍写「smoke + prompt + controller 三套测试 / three suites」,而 test 脚本已是五套;建议补齐。
2. `docs/release-v0.6.2.md:78`:兼容表 rc.3 行「优化路由 / 模型调用 ✅ 实测」建议与 README 一致加「(路由/SSE/错误态)」限定,避免读者误读为成功输出已验证。
3. `test/upstream-contract.test.mjs:57`:`u1` 只校验 4 个 REQUIRED + dsh-llm 的已装版本(20 个钉版中的 5 个),与文件头「已安装版本必须与钉版一致」的全量表述有差距;建议遍历 `Object.entries(pins)` 校验所有已装包版本。
4. `test/upstream-contract.test.mjs:67`:`u2` 用 `{0,160}`/`{0,80}` 窗口匹配 `kind`/`scope`,对上游排版敏感;建议放宽窗口或按槽位块解析,降低下轮升级的假失败概率。
5. `docs/release-v0.6.2.md:47-54`:建议把 QUOTA 错误态截图/日志作为证据留存到 docs(目前 E2E 证据只有按钮/设置/profile 产物),便于发版后追溯。

## 七、非本 PR 引入(记录,不阻塞)

`README.md:15` 仍写向 `settings.plugin.item` 注入设置卡(0.2.x 实为 `settings.plugins.tab`);`README.md:132` 桌面端路径 `E:\Deepseek-Harness\...` 与实机 `E:\DSH\...` 不符;`README.md:181` 仍提 `session.history RPC`(后文已改为事件窗口)。均为既有文本,建议后续顺手修正。

## 附:关键复现命令

```powershell
npm run typecheck; npm run build; npm test
$env:HTTPS_PROXY='http://127.0.0.1:18081'; $env:HTTP_PROXY='http://127.0.0.1:18081'
gh pr checks 15
gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3
# lock/CI 同序:干净目录 npm ci --legacy-peer-deps → npm run sync:types → npm run typecheck → npm test
```
