# v0.3.17 — 适配 DeepSeek Harness 0.1.5 线

本版是 v0.3.17 起的首个公开发布:本地 0.3.18~0.3.22 的开发改动从未发布,现合并为一次公开发版,公开版本线收敛为 **0.3.17**。

## 兼容性(全部实测)

| dsh 版本 | 优化路由 / 模型调用 | 设置页(含 GitHub 入口) | 发送栏按钮 / 结果面板 |
|---|---|---|---|
| **0.1.5-rc.2** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.5-rc.1** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.2-rc.1 / 0.1.2-alpha.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.1-rc.2 及以下**(0.1.0-rc.7+) | ✅ 实测 | ✅ 实测 | ✅ 实测 |

同一份构建覆盖 0.1.0-rc.7 至 0.1.5 全线。

## 主要变更

- **适配 dsh 0.1.5 线**:客户端类型面迁移 —— `dsh-client-runtime` 包已从上游移除,`ClientContext` 即 cordis 的 `Context`;`SettingsScope` 迁至 `@deepseek-ai/dsh-client-ui-settings/client`;`ctx.slots` 合并由 `dsh-client-ui-renderer/client` 提供。新增 `src/client/host-faces.ts` 自带最小结构面,不再追上游类型。
- **会话模型与目录接入宿主真实通道**:模型目录走连接层通用 RPC `session/modelCatalog`;「跟随会话」读取官方 `ctx.modelDirectories`(与 `/model` 弹窗共用同一份目录),经独立可选 inject 捕获,缺席时回落 Host 回退解析。
- **发送栏「优化」按钮对齐官方工具胶囊**:按钮宽度贴住内容,去除右侧预留空白。
- **结果面板去灰收紧**:视觉更紧凑。
- **修复推理模型 `<think>` 块污染标记解析**:剥离思考块,多组标记时取最后一组。
- **dsh-settings API 兼容层**:0.1.2 线重写设置 API 后,运行时按能力探测自动分派,同一份构建向下兼容 0.1.0-rc.7+。

## 验证

- **dsh 0.1.5-rc.2 全链路复测**(2026-09-11,Windows,真实 profile):组合层注入、Host 加载、路由契约 405/400/200、SSE 端到端 155 帧 delta(`wellFormed: true`)、四种策略路径(模板/提炼目的/斜杠/记忆链)、client bundle 槽位与设置卡 API —— 全项通过。
- **dsh 0.1.5-rc.1 端到端实测**(2026-09-10):发送栏按钮随输入启停、点击后面板打开并按 SSE 透传上游错误、设置卡片折叠摘要与展开配置齐全。
- **dsh 0.1.2 线端到端实测**(v0.3.16 起):0.1.2-rc.1 / 0.1.2-alpha.5。
- **macOS 自动化实测通过**(2026-09-02,macOS 26.5,62 项测试全绿);CI 常驻 ubuntu-latest + macos-latest 跑 typecheck 与全量测试。
- `npm test` **69 例全绿**;`npm run typecheck` **零错误**。

## 安装

```sh
dsh plugin --profile web add @y1x1n/dsh-prompt-optimizer
```

或从 Release 下载 `y1x1n-dsh-prompt-optimizer-0.3.17.tgz` 后本地安装:

```sh
dsh plugin --profile web add ./y1x1n-dsh-prompt-optimizer-0.3.17.tgz
```
