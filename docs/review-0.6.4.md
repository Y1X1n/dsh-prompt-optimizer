# PR #18 独立审核记录(v0.6.4 / 适配 dsh 0.2.2-rc.1)

审核对象:`Y1X1n/dsh-prompt-optimizer` PR #18,分支 `feat/dsh-0.2.2-rc.1`(base `main` `5188968` = v0.6.3)。
审核方式:独立审核代理读取 `git diff main...HEAD`,本地复跑 `typecheck` / `npm test`,核对已安装的 0.2.2-rc.1 类型包,独立下载 rc.5 / rc.1 tarball 做逐文件比对,解析桌面端 `app.asar`,并逐项核对 README / release notes / diff 文档口径。
审核账号即 PR 作者,GitHub 不允许自审 approve,故以本记录 + PR comment 形式提交结论。

## 1. 审核范围

PR 变更 13 个文件:

- 代码/测试:`src/client/controller.ts`、`src/client/ResultDock.tsx`、`test/controller.test.mjs`、`test/upstream-contract.test.mjs`;
- 声明层:`package.json`、`package-lock.json`、`scripts/sync-types.mjs`;
- 文档:`README.md`、`README.en.md`、`docs/dsh-022-rc1-diff.md`(新增)、`docs/release-v0.6.4.md`(新增)、`docs/screenshots/rc1-e2e-*.png`(新增)。

`cordis.patch.yml`、`scripts/build.mjs`、`.github/**` 零改动,与 PR 声明一致。

## 2. 实测结果(审核者复跑)

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | exit 0,零错误(0.2.2-rc.1 全量类型) |
| 测试 | `npm test` | exit 0,**五套 100 项**:smoke 35 / prompt 25 / controller 29 / slot-guard 5 / upstream-contract 6 |
| 契约守卫 | `node test/upstream-contract.test.mjs` | u1–u5 + u3b 全绿;u3b 正则能匹配已安装的 `input.d.ts` |
| 钉版一致性 | `package.json` / lock / `sync-types.mjs` / `node_modules` | 19 包 + `dsh-llm` 全为 0.2.2-rc.1;`cordis@4.1.0`、`schemastery@3.19.0` |
| 上游 tarball | 独立 `npm pack` rc.5 / rc.1 | 三个槽位声明块、`SessionStandardProps` 块逐字节相同;`ui-slots` 全部 lib 相同;`input.d.ts` 仅新增 `sending` / quotes |
| 桌面端 asar | 独立解析 `E:\DSH\resources\app.asar` | 321 个 `@deepseek-ai/*` 为 0.2.2-rc.1,`staticModules` 映射与文档一致 |
| engines | semver(`includePrerelease:true`) | `0.2.2-rc.1` 命中,`0.3.0` 排除 |
| E2E 证据 | 截图与宿主日志 | 两张截图属实;成功态徽章 5.7s、设置标签页/设置卡完整 |

## 3. phase 判定核对

- `shouldAutoClose` 先执行 `!open || loading` 守卫,再判断 `phase === 'sending'`;优化进行中不会被发送/清空误关。
- 旧宿主(0.1.x / 0.2.0 / 0.2.1)的 `phase` 只有 `plain` / `adjudicating` / `claimed` / `submitting`,不含 `'sending'`,缺省时不影响原判定。
- `ResultDock` 从 `useInput` 快照读取 `phase`,effect 依赖数组包含 `phase`,无闭包陈旧问题。
- 发送失败时面板已关闭、草稿由宿主保留——符合「发送即关闭」的设计意图,不是回归。

## 4. 发现项与修复

审核提出的问题均已在本 PR 内修复:

1. **中 — 旧宿主 phase 描述不准确**:多处写「旧宿主没有 phase 字段」,实际上 0.1.2 / 0.1.5 / 0.2.1 已声明 `phase`(四个值),只是不含 `sending`。已改为「旧宿主 phase 不含 `'sending'`」(`controller.ts`、`ResultDock.tsx`、README 中英、diff/release 文档)。
2. **中 — 兼容性表把 0.2.1-rc.2 并入「实测」**:与 README 的「产物核对」口径冲突。release notes 已拆为 `0.2.1-rc.5 / rc.3 = 实测`、`0.2.1-rc.2 = 产物核对`。
3. **轻微 — diff 文档断言数量**:「新增 4 条断言」实为 3 条(第 4 条是原有用例的守护断言),已改为 3 条并准确列项。
4. **轻微 — SessionStandardProps 哈希不可复现**:不同抽取边界会得到不同值。已改为「块级 diff 相同」并移除具体哈希;槽位与 `setDraft`/`draft` 的哈希保留。
5. **轻微 — `ui-renderer` 表述歧义**:已明确为「客户端类型文件逐字节相同;包内仅新增 6 个 locale JSON」。
6. **轻微 — u3b 正则过宽**:`phase:[^;]*'sending'` 已锚定为 `readonly phase:[^;]*'sending'`。

## 5. 结论

**通过,可以合并。** 无阻塞问题;范围干净、声明层版本/lock/engines 正确、上游契约面经独立 tarball 与 asar 双向核对成立、`phase:'sending'` 逻辑在旧/新宿主上都安全、真实 rc.1 Web 端到端证据可复现。上述 6 项表述/精度问题已全部修复并复跑测试通过(5 套 / 100 项)。

CI:ubuntu-latest / macos-latest 双平台校验由 PR 的 GitHub Actions 提供。