# v0.4.0 — 适配 DeepSeek Harness 0.2.0 与官方桌面端

本版适配 **dsh 0.2.0-rc.2**(npm latest,2026-09-29 发布)与 **Electron 官方桌面端**(`DeepSeek Harness 0.2.0-rc.2`)。同一份构建继续向下覆盖 0.1.0-rc.7 ~ 0.1.5 全线,本地 0.4.0 线的改动(0.2.0 适配 + opencode 修复)合并为这一次公开发布。

## 兼容性(全部实测)

| dsh 版本 | 优化路由 / 模型调用 | 设置页(含 GitHub 入口) | 发送栏按钮 / 结果面板 |
|---|---|---|---|
| **0.2.0-rc.2(Web + 官方桌面端)** | ✅ 实测 | ✅ 实测(volatile 配置 + 原生风格设置卡) | ✅ 实测 |
| **0.1.5-rc.2** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.5-rc.1** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.2-rc.1 / 0.1.2-alpha.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
| **0.1.1-rc.2 及以下**(0.1.0-rc.7+) | ✅ 实测 | ✅ 实测 | ✅ 实测 |

## 主要变更

- **适配 dsh 0.2.0 设置系统重写**:0.2.0 移除 `settingsScope` 服务与 `settings.plugin.item` 槽位,设置改由宿主按插件 Config schema 自动生成表单。本插件 Config 全字段声明 `.volatile()`——volatile 字段经引用 cell 原位更新,**修改设置不再重挂载插件**;客户端新增 `settings-face.ts` 统一快照面(0.2.0 `configForms` / 0.1.x `settingsScope` 双后端,可选注入、先到先生效);设置卡双槽位并挂,宿主各自渲染认识的那一个。
- **设置卡重设计为 0.2.0 原生风格**:去掉折叠卡片,平铺行布局对齐官方设置页(行标题/次级描述/0.5px 分隔线);枚举项用官方 SegmentedControl 同款分段控件、布尔项用同款开关(样式取自 ui-primitives,手写注入,零新增模块依赖);`configure({auto:false})` 关闭宿主自动表单避免重复入口。模型目录下拉、连接测试、撤销栈保留。
- **修复 opencode 无法测试连接/优化**:opencode(`opencode-go`)要求请求携带 `x-opencode-session` 会话头,pi-ai 适配器仅在 `GenerateOptions.sessionId` 存在时注入,插件的一次性调用原本不带而被 API 拒绝。现优化请求携带发起会话的 id 由 Host 标注(会话级计量随之正确归属),探活标注固定合成 id;其余适配器视其为模型不可见的传输元数据。
- **消息源类型跨版本**:0.2.0 把消息源联合收窄(移除 `kind:'plugin'`),插件保留运行时形状以结构断言跨两代类型(运行时按 merge-extensible 容忍未知源)。
- **依赖升级**:devDeps 升至 cordis ^4.0.4、dsh-llm 0.2.0-rc.2;`sync:types` 类型包清单钉 0.2.0-rc.2(0.2.0 起 monorepo 全量发包);移除不再使用的 dsh-settings / dsh-host-webserver 运行时依赖。

## 验证

- **dsh 0.2.0-rc.2 Web 全链路实测**(2026-10-03,Windows,真实 profile po-020):发送栏按钮渲染与点击、SSE 结果面板、模型目录 RPC、设置卡读取;分段控件/开关写入 profile 补丁文件且**插件不重启**(volatile cell 原位更新);撤销栈还原;真实模型调用链路端到端。
- **官方桌面端实测**(2026-10-03):插件经应用自带 CLI 装入 `desktop` profile,重启后发送栏「优化」按钮与设置页「提示词优化」标签均正常(UIA 实测,Electron `DeepSeek Harness 0.2.0-rc.2`)。
- **opencode 真实 API 实测**(2026-10-04,凭据经 DSH vault):`test-model` 返回 `ok:true`(8.4s),`optimize` SSE 全链路 `done` 事件带完整分析 + 优化稿。
- `npm test` **70 例全绿**(smoke 30 + prompt 17 + controller 23);`npm run typecheck` 零错误;CI(ubuntu-latest + macos-latest)全绿。

## 安装

```sh
dsh plugin --profile web add @y1x1n/dsh-prompt-optimizer
```

或从 Release 下载 `y1x1n-dsh-prompt-optimizer-0.4.0.tgz` 后本地安装:

```sh
dsh plugin --profile web add ./y1x1n-dsh-prompt-optimizer-0.4.0.tgz
```

**官方桌面端**:桌面应用首次启动初始化 `desktop` profile 后,完全退出应用,用应用自带 CLI 安装并重启(Windows 示例):

```sh
"E:\Deepseek-Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add @y1x1n/dsh-prompt-optimizer
```
