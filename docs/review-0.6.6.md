# PR #20 独立审核报告(v0.6.6 / 适配 dsh 0.2.2-rc.5)

审核对象:`Y1X1n/dsh-prompt-optimizer` PR #20,分支 `feat/dsh-0.2.2-rc.5`,base `main`(`3533a78`)。审核基线 HEAD `55b03db`,修复提交 `a318f45`,PR 已合并为 `f4d6472`;变更范围 9 文件、+320/−71。
审核方式:独立复跑 + 从 27 个 npm 包双组 tarball **重新解包**逐文件字节比对 + 独立复算契约块哈希 + 检查运行中的 rc.5 宿主 / boot manifest / profile / 截图 + semver 与文档交叉核对。**未修改仓库文件**(取证脚本在 `Temp/review-066/`)。

---

## ① 审核范围(实际变更文件)

`git diff main...HEAD --stat`:**9 个文件,+320/−71**

| 文件 | 状态 |
|---|---|
| `package.json` / `package-lock.json` / `scripts/sync-types.mjs` | M(声明层) |
| `README.md` / `README.en.md` | M |
| `docs/dsh-022-rc5-diff.md` / `docs/release-v0.6.6.md` | A |
| `docs/screenshots/dsh-022-rc5-e2e-optimize-success.png` / `dsh-022-rc5-e2e-settings.png` | A |

**零改动核实**:`git diff main...HEAD -- src/ cordis.patch.yml scripts/build.mjs .github/` 输出 **0 行** ✓。

## ② 实测结果(审核者复跑)

| 项目 | 结果 |
|---|---|
| 钉版一致性 | `sync:types` 20 包全 rc.5;devDeps 两包 rc.5;lock 无 rc.3 残留,`dsh-error@0.2.2-rc.5` 在 lock 中 |
| 四块契约哈希 | 独立复算两版一致:`42609d09c15c01e2` / `3877c57ff1a60932` / `2e49302e62eee7c7` / `a88c9594ca61cd76` |
| 27 包逐文件比对 | 除 `dsh-api-remotes`(仅 source line 注解位移)与 `dsh-llm`(新增 `CONTENT_REFUSED`)外,其余包只改 `package.json`;`dsh-client-ui-settings-web-search` 13 文件变化属实 |
| 静态基线 | `dsh-web-frontend` dist 字节相同;`staticModules` 恰 11 项;`dsh-client-connection` 除 `package.json` 外字节相同 |
| 上游 compare | `ahead_by=13`、`total_commits=13`,属实 |
| 上游语义 | rc.4/rc.5 release notes 与文档吻合;`CONTENT_REFUSED` 在 rc.5 源码与 `dsh-llm` 中属实;插件源码 0 处构造 `LlmError` |
| E2E | 运行中宿主 `__DSH_BOOT__.release.version = 0.2.2-rc.5`;boot manifest 含本插件;宿主返回的 client bundle 与 HEAD 一致;截图显示 2.6s 成功态与设置卡 |
| 自动化 | `npm run typecheck` 零错误;`npm test` 5 套 100 项全绿 |
| CI | ubuntu-latest / macos-latest 均 pass(run 44898876337) |

## ③ 发现项清单

### 严重 / 中

无。

### 轻微(均已在 PR 内修复)

**L1 — 「18/20 个钉版包 lib 相同」不准确**
- 位置:`docs/dsh-022-rc5-diff.md:6`、`docs/release-v0.6.6.md:17`、`README.md:145`、`README.en.md:144`。
- 证据:独立比对 20 个 `PACKAGES`:**19 个**包 `lib/` 字节相同,仅 `dsh-api-remotes` 不同(一处 source line 注解);`dsh-llm` 不在 20 个钉版包内,是额外 devDep。
- 修复:四处统一改为「19/20 个钉版包 lib 字节相同;devDep `dsh-llm` 唯一类型变化是新增 `CONTENT_REFUSED`」。

**L2 — 模型目录「85+ 项」与实测不符**
- 位置:`docs/dsh-022-rc5-diff.md:135`。
- 证据:运行中 rc.5 宿主 `session/modelCatalog` 实测 5 组 **82 个模型**。
- 修复:改为「5 组 82 个模型」。

**L3 — LlmError 传播机制描述不精确**
- 位置:`docs/dsh-022-rc5-diff.md:22`、`:78`。
- 证据:`dsh-llm` 的 `adapterStream` 会捕获 adapter 抛出的 `LlmError` 并转成 `finish` 失败块;插件 `collectText` 见到 `finish.kind === 'error'` 后再抛 `模型调用失败(CONTENT_REFUSED): ...`,并非 `LlmError` 直接从 `for await` 冒泡。可观察行为与文档结论一致。
- 修复:改为「adapterStream 转 finish 失败块 → collectText 包装」的准确链路。

**L4 — Markdown 表格行合并**
- 位置:`docs/dsh-022-rc5-diff.md:43`。
- 证据:`dsh-api-remotes` 行尾出现 `无需改 || dsh-client-ui-settings-web-search`,两行被合并,列数异常。
- 修复:拆成两行。

**L5 — E2E 日志口径越界**
- 位置:`docs/dsh-022-rc5-diff.md:131`、`:133`。
- 证据:`web.log` 只含 `loaded/POST` 与端口信息,不含 HTTP 200、3.1s 等待或控制台错误留档;HTTP 200 来自 Playwright 网络观测。
- 修复:改为「Playwright 网络观测到优化路由 HTTP 200」「面板在 3.1s 内出现成功态」,不再声称 `web.log` 含这些记录。

## ④ 总体结论

**可以合并。** 本 PR 是纯声明层适配:`src/` 零改动,20 个类型包与 lock 完整升级到 rc.5,四个关键契约块与草稿/发送阶段接口逐字节不变,27 包比对结论可靠,typecheck、100 项测试与双平台 CI 全部通过。E2E 通过运行中的 rc.5 宿主、boot manifest、插件 bundle、profile 与截图得到较强印证。

**验证局限**:`web.log` 未保存 HTTP 200 / 控制台日志;截图只覆盖成功态与设置卡上半部分;rc.5 官方桌面端 asar 未解析(桌面端结论依赖 `dsh-web-frontend` / `dsh-client-connection` 静态基线);未重跑 `npm run build`(CI prepare 已覆盖,且 E2E tgz 的 lib 与 HEAD 同哈希)。

## ⑤ 修复回执(PR 作者)

审核提出的 L1–L5 已全部在本 PR 内修复(均为文档口径,无运行时改动):

1. **L1**:四处「18/20」改为「19/20」,并明确 `dsh-llm` 是额外 devDep。
2. **L2**:模型目录数字改为「5 组 82 个模型」。
3. **L3**:`docs/dsh-022-rc5-diff.md:22`(§0.1 表格)与 `:78`(§2.2)两处均按 `adapterStream → finish 失败块 → collectText 包装` 修正机制描述。
4. **L4**:拆开被合并的 Markdown 表格行。
5. **L5**:E2E 日志口径改为可复核的 Playwright 网络观测表述。

修复后复跑 `npm run typecheck` 零错误、`npm test` 5 套 / 100 项全绿。
