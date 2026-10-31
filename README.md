# dsh-prompt-optimizer

**中文** | [English](README.en.md) | [🐣 小白版](README.simple.md)

[![CI](https://github.com/Y1X1n/dsh-prompt-optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Y1X1n/dsh-prompt-optimizer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@y1x1n/dsh-prompt-optimizer?label=npm&color=cb3837)](https://www.npmjs.com/package/@y1x1n/dsh-prompt-optimizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Y1X1n/dsh-prompt-optimizer?label=release)](https://github.com/Y1X1n/dsh-prompt-optimizer/releases/latest)
[![Stars](https://img.shields.io/github/stars/Y1X1n/dsh-prompt-optimizer?logo=github)](https://github.com/Y1X1n/dsh-prompt-optimizer/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

DeepSeek Harness 插件:在会话输入框(发送栏)旁提供一个「优化」按钮(✨ 图标),一键分析并优化当前输入的提示词草稿,**结果经 SSE 流式逐段上屏**。优化调用默认复用当前会话的模型路由(每次点击实时读取,会话里切换模型立即生效)。

- **Host 半侧**:注册 `POST /dsh-prompt-optimizer/optimize`(SSE 流式)与 `POST /dsh-prompt-optimizer/test-model`(连通性探活)两条路由,调用 `ctx.llm` 完成「分析 + 改写」。
- **Client 半侧**:向 `conversation.input.right` 槽位注入按钮,向 `conversation.input.dock` 注入结果面板(输入卡上方整行、与 TodoDock 同族,新会话界面也渲染,且不遮挡输入框),向 `settings.plugin.item` 注入可折叠的设置卡片(设置页自动获得配置界面,无需单独开发页面)。界面文案跟随 DSH 界面语言(中文 / English)。

## 目录

- [功能](#功能)
- [安装](#安装)
  - [从 npm 安装(推荐,最简)](#从-npm-安装推荐最简)
  - [从 Release 安装(tarball,免构建)](#从-release-安装tarball免构建)
  - [本地源码安装(tarball)](#本地源码安装tarball)
  - [从 GitHub 安装](#从-github-安装)
  - [卸载](#卸载)
- [兼容性](#兼容性)
- [常见问题](#常见问题)
- [验证状态](#验证状态)
- [工作原理](#工作原理)
- [开发](#开发)
- [安全说明](#安全说明)
- [贡献者](#贡献者)
- [License](#license)

> 🐣 **第一次用 dsh 插件?** 直接看[小白版指南](README.simple.md):三步装好、点按钮就用,全程大白话。

![结果面板:五维诊断与优化稿流式上屏,可替换/撤回/复制;徽章显示实际路由与用时](docs/screenshots/optimize-panel.png)

| | |
|---|---|
| ![发送栏空闲态:✨ 优化按钮位于模型选择旁,空输入时禁用](docs/screenshots/composer-idle.png) | ![面板错误态:上游模型错误完整透传,可一键重试](docs/screenshots/panel-error.png) |
| ![设置页:模型 / 调用参数 / 上下文 三组配置](docs/screenshots/settings-expanded.png) | ![结果面板:诊断与优化稿](docs/screenshots/optimize-panel.png) |

## 功能

- 发送栏工具行右侧新增「优化」按钮(输入为空时禁用,优化中带呼吸动画);等待期间面板实时显示当前阶段(等待模型响应 / 分析诊断 / 输出优化稿)与已用秒数,完成后模型徽章处展示总用时。
- 点击后实时读取当前会话的 provider/model 发起辅助调用;**分析与优化结果逐段流式显示**在输入卡上方的面板里,不用干等整段生成。
- **双策略优化**:无上下文(空会话/关闭携带)时按**结构模板**规范化改写(角色/任务/约束/输出格式);有上下文时自动切换为**提炼目的 + 顺势润色**——先通读会话近期对话提炼真实意图,保留草稿原始表达框架打磨,不套模板,不重复追问上下文已给出的信息,且**已否决方向不再重提**(禁入集合)。
- **保真纪律**(借鉴 Fishsb/dsh-prompt-enhancer):语义等价底线、来源可回溯(推断处以「如无特别说明/默认」标注)、输出前逐要素**保真自检**防漂移且**保真自检优先于长度纪律**(简单任务目标 500 字符内;优化稿就是提示词本身——不复述原稿、不加多余解释;要素缺失比冗长更严重),并带 few-shot 示例稳定输出风格。
- **轻量记忆链**:在我们产出的优化稿上继续修改后再点优化,自动携带上一轮结果作为延续参考(沿用已确认决策,只围绕变化点调整);同文重试、跨会话、上轮格式退化的结果都不带(格式退化仅在完整模式判定,快速模式恒视为合规),发送或关闭面板后自然归零;跟随「携带上下文」开关,关闭后不携带。
- **优化稿先行(0.5.0)**:完整模式的输出顺序改为**先优化稿、后诊断分析**——最关心的交付物先流式到达,等待期即可复制取走,分析随后补上;配合默认快速模式(仅优化稿),长文本从点击到可用的等待显著缩短。
- **斜杠命令安全**:「/goal 帮我……」这类输入只优化正文,替换时自动拼回命令前缀,不会把命令词改坏;只敲命令没有正文时直接提示、不发无意义请求。
- **上下文感知**:默认携带当前会话的近期对话作为参考(**用户消息优先保底**——agentic 会话里 assistant 步骤碎片远多于用户输入,纯按时间取样会把你的真实诉求挤出去),总量 ≤8 条 / 1600 字符;上下文仅供模型理解意图,提示词中明确禁止其回答或延续上下文;空会话自动退化为模板策略。可在设置卡关闭。
- 结果面板:**分析诊断**(五维度:目标清晰度/上下文/约束/结构/输出规格)+ **优化后的完整提示词**;操作:**替换输入框**(可**撤回**,在替换内容上继续编辑时撤回入口自动失效)/ 复制 / 重新优化 / 关闭。**发送消息后或清空输入框时面板自动关闭。**
- **取消不丢内容**:优化中按 Esc 取消,面板定格展示已生成的部分,可直接查看、「重新优化」续跑或关闭;非加载状态按 Esc 直接关闭面板。客户端另带**超时看门狗**(设置超时秒数 + 5s 余量):Host 挂死或网络黑洞时不再无限转圈,直接落明确的超时错误。
- 面板按会话隔离:切换会话后旧结果不会飘到别的会话,也不会误替换别的会话的输入框。
- **流式自动跟随滚动**:实况内容增长时贴住底部,向上滚动即暂停跟随,滚回底部附近自动恢复。
- 面板样式全部走 Harness 官方设计令牌(`--dsw-alias-*`),明暗主题自动跟随。
- 长草稿友好:输出上限默认跟随输入长度自动抬升(按本地 token 估算,完整模式 ×2 / 快速模式 ×1.5,32768 封顶);真截断时也会展示已生成部分并明确提示,不会整段消失。
- 格式容错:模型输出的标记变体(如 `<<< ANALYSIS >>>`)能正确解析;完整模式不遵守格式时降级展示并给出警示;快速模式只有单段落,无论模型是否输出标记都视为合规(不弹警示、记忆链照常携带)——对不输出标记的第三方/免费模型友好,且其原始流可直接实时逐字预览(标记出现前)。
- 设置 → 插件配置 → 「提示词优化」页(平铺行布局,分「模型 / 调用参数 / 上下文」三组;所有改动可一步撤销——底部「撤销上一次修改」,内存栈最近 20 次;底部右侧为 GitHub 仓库入口):
  - **模型**:优化用模型(**跟随当前会话**(默认),或从模型目录固定一个,provider/model 下拉、目录可手动刷新)/ 回退模型(主路由零产出失败时自动 failover,面板徽章显示「· 已回退」,悬停可见失败原因)/ 模型连通性(「测试连接」,32 token / 20s 封顶探活,显示实际路由与耗时)
  - **调用参数**:输出语言(中文 / English);优化模式:**快速**(默认,仅优化,输出 token 约减半)/ 完整(分析 + 优化);推理强度:降到最低档(默认,推理模型首 token 前的空转显著缩短)/ 跟随会话;最大输出 Token(默认 8192)、超时时间(默认 120s)、采样温度(默认 0.2,悬停见设计依据);输出上限自适应开关(默认开)
  - **上下文**:携带上下文开关(默认开):关闭后仅看草稿本身,不读取会话历史

## 安装

前提:已安装 `dsh` CLI(`npx @deepseek-ai/dsh web` 可用的环境)。

### 从 npm 安装(推荐,最简)

```sh
dsh plugin --profile web add @y1x1n/dsh-prompt-optimizer
```

### 从 Release 安装(tarball,免构建)

到 [Releases 页面](https://github.com/Y1X1n/dsh-prompt-optimizer/releases/latest) 下载 `y1x1n-dsh-prompt-optimizer-<版本号>.tgz`,再安装本地文件:

```sh
dsh plugin --profile web add ./y1x1n-dsh-prompt-optimizer-<版本号>.tgz
```

### 本地源码安装(tarball)

```sh
cd dsh-prompt-optimizer
npm install --legacy-peer-deps   # prepare 钩子会自动构建 lib/
npm pack                          # 产出 y1x1n-dsh-prompt-optimizer-<version>.tgz
dsh plugin --profile web add ./y1x1n-dsh-prompt-optimizer-<version>.tgz
```

然后(重新)启动 `dsh web`,打开 Web UI 即可在发送栏旁看到按钮。

> **Windows 注意**:`dsh plugin add ./目录` 走 pnpm 的 `link:`,目前会把盘符冒号错解析成协议分隔符,生成失效符号链接(`node_modules/<pkg>` 指向不存在的路径),表现为插件不加载。本地安装请用上面的 tarball 形式;目录链接形式在 macOS/Linux 正常。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Y1X1n/dsh-prompt-optimizer
```

Git 安装拉取的是源码,本包通过 `prepare` 脚本在安装时自包含构建(只需 Node,不依赖 monorepo 环境)。pnpm ≥10 首次会拒绝运行构建脚本,按终端提示把包名加入该 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重试即可。建议锁定 commit:`github:Y1X1n/dsh-prompt-optimizer#<sha>`。

### 卸载

```sh
dsh plugin --profile web remove @y1x1n/dsh-prompt-optimizer
```

## 兼容性

> **当前版本(v0.6.3)适配 DeepSeek Harness**:
>
> | dsh 版本 | 优化路由 / 模型调用 | 设置页(含 GitHub 入口) | 发送栏按钮 / 结果面板 | 携带会话上下文 |
> |---|---|---|---|---|
> | **0.2.1-rc.5(Web + 官方桌面端运行时)** | ✅ 实测(成功产出优化稿) | ✅ 实测(标签页 + 设置卡渲染) | ✅ 实测 | ✅ 契约核对 |
> | **0.2.1-rc.3(Web + 官方桌面端运行时)** | ✅ 实测(路由/SSE/错误态) | ✅ 实测(标签页 + 设置卡读写) | ✅ 实测 | ✅ 契约核对 |
> | **0.2.1-rc.2(Web + 官方桌面端)** | ✅ 产物核对 | ✅ 产物核对(含槽位注册修复) | ✅ 产物核对 | ✅ 新增可用 |
> | **0.2.0-rc.2(Web + 官方桌面端)** | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ |
> | **0.1.5-rc.2** | ✅ 实测 | ✅ 实测 | ✅ 实测 | 降级(无 `ctx.sessions`) |
> | **0.1.5-rc.1** | ✅ 实测 | ✅ 实测 | ✅ 实测 | 降级(无 `ctx.sessions`) |
> | **0.1.2-rc.1 / 0.1.2-alpha.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 | 降级(无 `ctx.sessions`) |
> | **0.1.1-rc.2 及以下**(0.1.0-rc.7+) | ✅ 实测 | ✅ 实测 | ✅ 实测 | 降级(无 `ctx.sessions`) |
>
> 同一份构建覆盖 0.1.0-rc.7 至 0.2.1 全线;`package.json` 现声明 `engines.dsh: ">=0.1.0-rc.7 <0.3.0-0"`,由宿主在启动期校验(含 prerelease),把 0.3.x 显式排除在外。
>
> **关于「产物核对」**:v0.6.0 的 0.2.1-rc.2 支持是对**上游随包发布的真实运行时**逐项核对得到的(槽位声明、`SlotCore` 抛错行为、`ctx.sessions` 提供方、`session/page` 分页语义、`ConfigFormSnapshot` 形状、`engines.dsh` 校验、client baseline 静态模块表),并配有针对性回归测试;当时未在 0.2.1-rc.2 的真实 GUI 里点通全流程(本机实例需要 launch token)。**v0.6.2 的 0.2.1-rc.3 支持升级为真实端到端实测**:用官方桌面端自带的 rc.3 runtime CLI 引导临时 profile 并安装发布的 tgz,在页面上确认了发送栏「优化」按钮、`settings.plugins.tab` 标签页与设置卡渲染、设置写入落盘到 profile 补丁;优化请求确实到达 Host 路由并经 SSE 返回上游错误(测试账户余额为 0,因此验证的是错误态而非成功输出)。逐项差异核对见 [`docs/dsh-021-rc3-diff.md`](docs/dsh-021-rc3-diff.md)。此标注自 v0.3.15 起在每个 Release 说明中固定维护,更早 Release 的说明已回溯补注。

- **v0.4.0 适配 dsh 0.2.0-rc.2(2026-10-03,Windows,真实 profile 端到端)**:①设置迁移——0.2.0 移除 `settingsScope` 服务与 `settings.plugin.item` 槽位,设置改由宿主按插件 Config schema 自动生成表单;本插件 Config 全字段声明 `.volatile()`(volatile 字段经引用 cell 原位更新,**修改设置不重挂载插件**),客户端经 `configForms` 读写,设置卡同时注册 0.2.0 的 `settings.plugins.tab` 与 0.1.x 的 `settings.plugin.item` 双槽位,宿主各自渲染认识的那一个;②设置卡按 0.2.0 官方设计语言重做(平铺行布局、官方同款分段控件与开关、`configure({auto:false})` 关闭宿主原生表单避免重复);③消息源 `kind:'plugin'` 以结构断言跨过 0.2.0 收窄后的联合类型(运行时按 merge-extensible 容忍);④已在 **0.2.0-rc.2 Web**(按钮、SSE 面板、模型目录 RPC、设置卡读写与撤销、配置写入 profile 补丁且插件不重启)与**官方桌面端**(Electron `DeepSeek Harness 0.2.0-rc.2`,desktop profile 经应用自带 CLI 安装,发送栏按钮与设置卡 UIA 实测)通过验证。
- **llm 调用标注会话 id(v0.4.0 修复 opencode)**:opencode(`opencode-go`)要求请求携带 `x-opencode-session` 会话头,pi-ai 适配器仅在 `GenerateOptions.sessionId` 存在时注入——插件的一次性调用原本不带,被 API 以缺少请求头拒绝(表现为 opencode 无法测试连接/优化)。现客户端优化请求携带会话 id 由 Host 标注(费用等会话级计量随之正确归属),探活标注固定合成 id;其余适配器视其为模型不可见的传输元数据,不外发。
- **会话标注恒存在(v0.5.0 补强 opencode)**:v0.4.0 的标注依赖客户端携带会话 id,个别宿主形态不向槽位组件投递 `sessionId` 时请求体会缺失、opencode 依旧报「缺少请求头」。0.5.0 起 Host 侧兜底:客户端未携带(或为空白)时标注合成 id `prompt-optimizer-one-shot`,任何调用路径都满足会话头要求;客户端正常携带时仍用真实会话 id(计量归属不变)。注意旧 profile 里装的插件(0.3.x 及更早)不含修复,升级到 0.5.0+ 并重启宿主/刷新页面。
- **官方桌面端安装**:桌面应用首次启动初始化 `desktop` profile 后,完全退出应用,用应用自带 CLI 安装并重启:`"E:\Deepseek-Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add @y1x1n/dsh-prompt-optimizer`(macOS/Linux 路径见应用安装目录);不要用 npm 版 CLI 管理桌面保留 profile。

- 开发基线:`@deepseek-ai/*` **0.2.1-rc.5**(v0.6.3 起,`sync:types` 与 devDeps 钉同一版本);此前基线为 **0.2.1-rc.3**(v0.6.2 起)、**0.2.1-rc.2**(v0.6.0 起)、**0.2.0-rc.2**(v0.4.0 起)、**0.1.5-rc.1**(v0.3.17 起)。已实测通过 **0.1.0-rc.8**(2026-08-20,Windows,真实 profile 安装 + Web 路由/客户端 bundle/会话历史 RPC/端到端 LLM 调用)、复测通过 **0.1.1-rc.2**(2026-08-27)、适配并通过 **0.1.2-rc.1 与 0.1.2-alpha.5**(2026-09-05/06)、**0.1.5-rc.1**(2026-09-10,真实 profile 端到端冒烟:组合层注入、路由 SSE、client bundle、发送栏按钮与结果面板、设置卡片)、**0.1.5-rc.2**(2026-09-11,全链路复测:组合层注入、Host 加载、路由契约 405/400/200、SSE 端到端 155 帧 delta、四种策略路径、client bundle 槽位与设置卡 API 全部通过,69 项测试全绿)。**0.2.1-rc.2** 于 2026-10-18 完成适配(对上游 `app.asar` 运行时逐项核对,`typecheck` 与四套测试全绿;未在真实 GUI 点通全流程)。**0.2.1-rc.3** 于 2026-10-26 完成适配:上游 6 个 commit 逐项差异核对(见 [`docs/dsh-021-rc3-diff.md`](docs/dsh-021-rc3-diff.md))、类型基线升到 rc.3,并用官方桌面端自带的 rc.3 runtime 引导临时 profile 完成**真实 Web 端到端**(发送栏按钮、结果面板错误态、设置标签页与设置卡读写;LLM 成功输出受测试账户余额限制未验证)。
- 已在 **macOS** 端通过自动化实测(2026-09-02,macOS 26.5(Darwin 25.5.0),Node.js v26.0.0,`npm install --legacy-peer-deps` 后 `sync:types` / `typecheck` / `build` / `npm test` 全部通过,62 项测试全绿);CI 现同时在 ubuntu-latest 与 macos-latest 上跑 typecheck + 全量测试(@ruijiaang-lab,#3)。
- **dsh-settings API 兼容层**:0.1.2 线重写了设置 API(独立函数 `installSettingsSection` 移除,改为 `ctx.settings` 服务的 `installSection` 方法)。0.3.16+ 运行时按能力探测自动分派:新 API 存在则走新接口,否则内联等价实现(register+watch+卸载回落),settings 服务整体缺席时回落组合层配置。
- **客户端类型面随 0.1.2/0.1.5 迁移**(v0.3.17 适配):`dsh-client-runtime` 包已从上游移除,`ClientContext` 即 cordis 的 `Context`;`SettingsScope` 迁至 `@deepseek-ai/dsh-client-ui-settings/client`(其 `SettingsScopeBinder` 自带 `ctx.settingsScope` 的 Context 合并,插件不再重复声明,否则合并冲突);`ctx.slots` 的合并由 `@deepseek-ai/dsh-client-ui-renderer/client` 提供。`HistoryEntry` / `ModelProviderGroup` 迁入未发布的 `dsh-api-session-controller`,插件改在 `src/client/host-faces.ts` 自带最小结构面,不再追上游类型。
- **会话模型与目录(v0.3.17 起真实可用)**:模型目录走连接层通用 RPC `session/modelCatalog`(`/api` 通道,载荷信封要求恰好一个纯对象 `args` 字段,零参方法即 `{ args: {} }`);「跟随会话」读取官方会话模型目录服务 `ctx.modelDirectories`(`dsh-client-ui-model-selection` 提供,与 /model 弹窗共用同一份目录,其 `current` 即会话实际将使用的模型)。该服务经**独立的可选 inject** 捕获——不能并进主 inject,否则无此服务的宿主会让客户端永远等不到就绪;缺席时回落 Host 回退解析。
- **会话历史(上下文)在 0.2.x 上已可用(v0.6.0 修复)**:`connection.api.sessions.history` 这一旧查询面上游从未实现过(0.1.0-rc.7 → 0.2.1 全线都不提供),所以 v0.5.0 及更早的「携带会话近期对话」实际一直静默降级。0.2.0/0.2.1 起改走**会话事件窗口**:`ctx.sessions.binding(sessionId).eventSource` 里就是宿主已经灌好的尾部页(`maxMessages:500` / 至少 2 个 turn / 50 条消息,`loadOlder()` 再向前翻页),条目形如 `{type:'event', event}`,据此提炼最近 4 条真实用户输入 + 4 条助手回复。注意 `session/page` RPC 看似可用,但要求调用方先给出 follow 开场帧里的 `throughSeq`;冷调用传 `-1` 会被 `paginate()` 算成 `end=0` 返回空页,因此不采用。该服务经**独立可选 inject** 捕获,0.1.x 宿主无此服务时保持旧降级路径(逐级回退:事件窗口 → legacy 查询面 → 无上下文)。
- **0.2.1-rc.5 适配要点(v0.6.3)**:rc.4/rc.5 对本插件仍是纯加法,`src/` 零行为改动即可无损升级。插件依赖的四个宿主面(`conversation.input.right` / `conversation.input.dock` 仍 `list`/`session`、composer 标准 props、`settings.plugins.tab` 类型 + 运行时、legacy `settings.plugin.item` 仍 0 命中)与 rc.3 逐字节相同;真实代码变化只落在 `ui-chat`(思考块新增 `rawText`,插件不占 `conversation.chat.*` 槽位、类型图 0 引用)与 `ui-conversation` 的 view-tab tooltip(契约/facade/apply 的 blob SHA 两版全同)。本版只做声明层适配:类型基线(`sync:types` 19 包 + devDeps)升到 0.2.1-rc.5、`package-lock.json` 重新生成、描述/版本/文档更新;并在真实 rc.5 Web 上完成一次**成功产出优化稿**的端到端验证(见下)。
- **0.2.1-rc.3 适配要点(v0.6.2)**:rc.3 对本插件是纯加法,`src/` 零行为改动即可无损升级——插件依赖的 `conversation.input.right` / `conversation.input.dock`(仍 `list` / `session`)、`settings.plugins.tab`、composer 标准 props(`useInput` / `inputActions` / `sessionId`)、`ui-slots` / `ConnectionHandle` / `dsh-llm` / `ConfigFormSnapshot` / `SessionSnapshot`、包清单校验与 client `staticModules` 基线均与 rc.2 逐字节相同;ui-conversation 仅新增「更多菜单」槽位与草稿初始化 `whenDraftExists` / `appendDraft`(插件不经过该 API)。本版只做声明层适配:类型基线(`sync:types` 19 包 + devDeps `dsh-client-ui-slots` / `dsh-llm`)升到 0.2.1-rc.3、`package-lock.json` 重新生成、描述/版本/README 更新,并新增 `test/upstream-contract.test.mjs` 把钉版版本与三个槽位契约锁进 CI。上游行为变化提示:官方 API-key 路由的模型列表改为跟随 `/models`(集合可能随账号变化),官方模型上下文窗口标注为 1M;若设置卡固定了已下线模型,调用会以宿主错误结束(面板 error 态可见)。
- **0.2.1-rc.2 适配要点(v0.6.0)**:①`settings.plugin.item` 槽位已被上游彻底移除(运行时 bundle 与 npm 包双向确认),而 `SlotCore.register` 对未声明槽位是**同步抛错**、`slots.inject` 的异常还会被 `queueMicrotask` 抛成页面级未捕获错误——旧实现把 `settings.plugins.tab` 与 `settings.plugin.item` 放在同一个 `slots.inject` 回调里,在 0.2.1 上会先注册成功再抛错;现改为**两个槽位各自独立 inject**,任一未声明都只跳过自己(`test/slot-guard.test.mjs` 用真实 `SlotCore` 固化该边界)。②`ConfigFormSnapshot` 删除了 `mode: 'host' | 'memory'`,内存模式不复存在,设置卡文案随之去掉「内存模式」措辞并改用 `settings.readOnly`。③`package.json` 补 `dsh.manifestVersion: 1` 与 `engines.dsh`。④类型基线(baseline)钉到 `0.2.1-rc.2`。
- **客户端槽位 props 双形态**:0.1.2 起 composer 槽位改为 session scope,组件经 standard hooks(`useInput`/`useSession`)读取会话与草稿状态,注册需采用「注入回调内 scope 化注册 + `inject(sessionId)` 钩子」的官方双层形态。组件按 props 形态自动分派(0.1.2 走 hooks,旧版读直传快照),两种宿主共用同一份构建。
- **client bundle 注册 id**:`lib/client.js` 的 loader id 必须等于插件 npm 包名(宿主 client-modules 按包名校验注册);client 注入列表已随 0.1.2 移除已合并的 `dsh-client-runtime`。0.1.5 起 bundle 以 `/plugins/??<id>/client.js,…&rev=<hash>` 组合 URL 提供,单插件裸路径不再单独暴露(以 boot manifest 里的组合 URL 为准)。
- HTTP 载体服务名在发布版间漂移过(npm 0.0.1-rc.x 类型包叫 `httpServer`,0.1.0-rc.x 运行时叫 `webServer`):本插件用 `ctx.inject` 同时等待两个名字,且不做静态硬依赖——即使服务名再次变化,也只会使本插件的路由不注册(10 秒后日志告警),不会拖垮整个 Harness 启动。
- **客户端协议口径**:`/dsh-prompt-optimizer/optimize` 预校验失败返回 400/405/409/413(普通 JSON)、并发超限返回 429,成功后进入 SSE 流,模型错误经 `error` 事件传达;`/dsh-prompt-optimizer/test-model` **无论成败一律 HTTP 200**,由 body 的 `ok` 字段区分(探活是应用层语义,刻意不走传输层状态码)——对接方请以 `ok` 为准。请求体必须是 JSON **对象**:`null`/标量/数组一律 400。
- 客户端与 Host 需同版本(SSE 协议是私有约定):升级插件后请重启 `dsh web` 并刷新浏览器页面。

## 常见问题

- **点了「优化」没有反应?** 打开浏览器 Console 查看 `[dsh-prompt-optimizer]` 开头的日志;常见原因是未配置任何模型(先在 设置 → 模型 里配好提供方),或面板所需的上游槽位尚未就绪(刷新页面)。
- **提示「未找到可用模型」?** 会话没有选择可路由的模型,且设置卡里也没有固定模型;两者补其一即可。也可以展开设置卡点「测试连接」确认路由可用。
- **设置卡显示「模型目录加载失败」?** v0.3.17 起目录改走宿主 `session/modelCatalog` RPC,正常应能列出全部提供方与模型;仍失败时提示会附上具体原因(点「刷新」重试)。注意「跟随会话」依赖宿主的会话模型目录服务(`ctx.modelDirectories`),个别宿主形态缺席时优化调用会回落到 Host 的第一个可用路由(Console 有对应告警)。
- **结果被截断?** 面板会出现截断提示;默认开启的「输出上限自适应」会按草稿长度自动抬升上限,仍不够再到设置卡调高「最大输出 Token」。
- **换了会话模型没生效?** 每次点击都会实时查询会话当前模型;若仍不对,看 Console 是否有 `会话模型查询失败` 的警告(此时会用第一个可用路由兜底)。注意:设置卡里固定了模型时会话选择不生效。
- **优化调用偶发超时 / RATE_LIMIT 失败?** 这类瞬态错误的重试由宿主在**提供方层**统一处理(dsh 0.1.1+ 的提供方配置内置重试策略,默认覆盖 `RATE_LIMIT / SERVER / TIMEOUT / TRANSPORT / EMPTY_RESPONSE`)。到 设置 → 模型 → 对应提供方 里调整重试次数与退避,而不是调本插件的「超时时间」——后者只管单次调用的总时长。
- **opencode(opencode-go)模型仍提示「缺少请求头」?** 需要 v0.5.0+ 且宿主为 0.2.x 线(pi-ai 适配器才会按 `GenerateOptions.sessionId` 注入 `x-opencode-session` 会话头)。确认 profile 里装的插件版本 ≥0.5.0(`dsh plugin --profile <profile> list`),升级后重启宿主/刷新页面;个别宿主不向槽位投递会话 id 时,0.5.0 起 Host 会兜底标注合成 id,不再依赖客户端携带。
- **设置页找不到卡片?** 0.3.0 的严格枚举 schema 与旧版设置文档冲突会导致卡片不渲染,0.3.1 起已修复(未知枚举值自动回落默认);确认版本 ≥0.3.1 并刷新页面。
- **卸载后按钮还在?** 插件集合变更需重启 `dsh web` 才生效;刷新页面不够。

## 验证状态

**v0.6.3 在真实 0.2.1-rc.5 Web 端到端验证**(2026-10-31,Windows,官方桌面端自带的 rc.5 runtime CLI 引导独立 profile + 无头 Chrome/CDP 真实驱动):Host 日志 `[dsh-prompt-optimizer] loaded`;发送栏「优化」按钮随草稿输入由 disabled 变 enabled;点击后流式输出,约 6-7s **成功产出优化稿**,面板出现「替换输入框 / 复制 / 重新优化 / 关闭」,徽章 `magpie / trae-cn/deepseek-v4.1-flash-max · 用时 5.9s`(另一次实测 7.0s);设置 → 内置插件 → 「提示词优化」标签页与设置卡完整渲染,模型下拉列出宿主全部目录;浏览器控制台零错误。**v0.6.2 在真实 0.2.1-rc.3 Web 端到端验证**(2026-10-26,Windows,官方桌面端自带的 rc.3 runtime CLI 引导临时 profile + 浏览器驱动):安装发布的 tgz 后 Host 启动日志出现 `[dsh-prompt-optimizer] loaded`、路由已注册;页面发送栏「优化」按钮随输入出现并带本插件样式类;点击后结果面板打开,请求经 Host 路由与 SSE 返回上游错误(`QUOTA: Insufficient Balance`,测试账户余额为 0——错误态与透传链路由此验证);设置页「内置插件 → 提示词优化」标签页与设置卡完整渲染,切换输出语言后写入持久化到 profile 的 `cordis.patch.yml`。已在真实环境验证(dsh 0.1.0-rc.8 实测 + 0.1.1-rc.2 复测,Windows,详见「兼容性」);macOS 端自动化实测通过(2026-09-02,macOS 26.5,62 项测试全绿,CI 亦常驻 macos-latest 跑全量测试);**v0.3.16 起 0.1.2 线(dsh 0.1.2-rc.1 / 0.1.2-alpha.5)完成端到端实测**(发送栏按钮、结果面板、设置卡片、优化路由与 SSE);**v0.3.17 起 0.1.5-rc.1 完成端到端实测**(2026-09-10,Windows,真实 profile + 浏览器驱动:发送栏「优化」按钮随输入启停、点击后面板打开并按 SSE 透传上游错误、设置卡片折叠摘要与展开配置齐全),**并在 0.1.5-rc.2 上完成全链路复测**(2026-09-11:组合层注入、Host 加载、路由契约、SSE 端到端、四种策略路径、client bundle 槽位与设置卡 API 全项通过);v0.3.9–0.3.11 另在**第三方免费模型**(openrouter 的 `minimax/minimax-m3:free`,不输出标记格式)上完成端到端实测:模板/意图双策略、保真逐要素保留、待补充标记、记忆链与取消保留等行为均按设计工作,并据此修复了快速模式的格式误报。

- 组合层加载:`--dump-config` 出现 `# == @y1x1n/dsh-prompt-optimizer` 层;
- Host:启动日志 `[dsh-prompt-optimizer] loaded`,优化路由与测试路由的 400/405/409/413 各路径行为正确,SSE 流式输出实测正常;
- Client:bundle 被 client-modules 扫描收录并出现在页面 boot manifest(0.1.5 起以 `/plugins/??<ids>&rev=<hash>` 组合 URL 提供),插件行出现在模块清单中;
- 端到端:真实调用 `ctx.llm` 完成「分析 + 优化」,标记解析正确(`wellFormed: true`)。**v0.6.3 的 rc.5 复测已成功产出优化稿**(`provider: magpie`、`model: group/safely-deepseek`、`wellFormed: true`、`truncated: false`);v0.6.2 的 rc.3 复测因测试账户余额为 0,只验证到上游错误态与面板透传。
- 自动化测试(`npm test`,共 99 例):
  - `test/smoke.mjs`:35 项 Host 冒烟用例(真实 cordis Context + mock 服务,覆盖路由解析优先级、空字符串/畸形配置、400/405/409/413、非对象 JSON 体拒绝、SSE 事件流、SSE 阶段错误不逃出路由、并发上限 429、载体服务只挂载一次、max-tokens 截断、超时、快速模式与默认模式、推理钳档(按强度序数而非展示顺序)、旧版设置文档归一化、连接测试、会话标注兜底、回退链与回退原因透传、tool-calls 防御、输出上限自适应、上下文注入与硬开关、策略选择、记忆链注入与截断、来源围栏);
  - `test/prompt.test.mjs`:25 项元提示词解析用例(标记空白变体、降级路径、空 OPTIMIZED 段不回退、标记字样不进入结果、未闭合思考块不污染解析、流式实况解析、新旧两种输出顺序、流式缓冲压缩(单段/两段式)、token 估算 CJK 覆盖、上下文载荷与预算收敛、策略分叉、保真纪律与示例、记忆链载荷);
  - `test/controller.test.mjs`:29 项客户端纯逻辑用例(SSE 帧解析与损坏帧跳过、合帧节流、连接中断、跳过会话查询、撤回流转、retry 保留斜杠前缀、close 中止、cancel 取消保留已生成部分及其状态门槛、客户端超时看门狗、历史提取过滤与失败降级、斜杠前缀拆分与空命令拦截、记忆链传递与门槛、发送即关闭判定、耗时记录、上下文取样用户消息保底、新输出顺序的流式预览与压缩兜底);
  - `test/slot-guard.test.mjs`:5 项槽位守卫(`s1–s4` 对真实上游 `SlotCore` 固化「未声明槽位同步抛错 + 独立 inject 守卫」边界,`s5` 加载真实 `lib/client.js` 并调用真实 `apply()`);
  - `test/upstream-contract.test.mjs`:5 项上游契约守卫(v0.6.2 新增;钉版包安装版本一致性、composer 两槽位仍为 list/session、composer 标准 props 仍在、`settings.plugins.tab` 类型与运行时声明仍在、legacy `settings.plugin.item` 仍不存在)。

## 工作原理

```
点击「优化」
  → Client 拆分斜杠命令前缀(/goal 等只优化正文),并行拉取当前会话模型选择
    (session.models RPC,每次点击实时查询;设置里固定了模型时跳过,Host 固定值优先)
    与会话近期对话(session.history RPC,最近 8 条/1600 字符封顶,可在设置卡关闭)
  → POST /dsh-prompt-optimizer/optimize { text, sessionId, provider, model, reasoningEffort, context?, previous? }
    (sessionId = 发起会话 id,Host 标注到 llm 调用;缺席时 Host 兜底合成 id。
     previous = 轻量记忆链:在优化稿上修改后再优化时携带的上轮结果)
  → Host 以系统元提示词调用 ctx.llm.stream()
    (路由解析:设置固定值 → 会话选择 → 第一个可用路由;可配回退路由,零产出失败自动 failover;
     策略分叉:有上下文走「提炼目的+润色」,无上下文走「结构模板」;
     输出上限默认按输入 token 估算抬升;默认推理钳最低档/低温度)
  → text-delta 经 SSE 逐段推送,面板实时显示「优化结果 / 分析诊断」两段
    (按 <<<OPTIMIZED>>> / <<<ANALYSIS>>> 标记增量解析,容忍标记空白变体、与标记顺序无关;
     0.5.0 起完整模式优化稿先流式到达)
  → done 事件携带最终解析结果;max-tokens 结束带 truncated 标记;回退发生时附 fallbackReason
  → 一键替换输入框(可撤回,自动拼回斜杠前缀)/ 复制 / 重新优化(改稿续接带上轮结果,同文全新生成);发送消息后面板自动关闭
  → 优化中 Esc = 取消(cancelled 态,保留已生成的部分);客户端看门狗在 Host 无响应时兜底超时
```

## 开发

```sh
npm install --legacy-peer-deps   # 安装依赖并触发构建
npm run sync:types               # 同步客户端类型包(见下)
npm run typecheck                # tsc --noEmit
npm run build                    # 产出 lib/{index,client,prompt,controller}.js
npm test                         # smoke + prompt + controller + slot-guard + upstream-contract 五套测试
```

### 关于 `sync:types`

上游 monorepo 只发布了部分 `@deepseek-ai/*` 包(其余 `publishConfig: restricted`),客户端类型包的传递依赖无法直接从 npm 安装。`scripts/sync-types.mjs` 的处理方式:

1. 对已发布的包,`npm pack` 后直接解压进 `node_modules`(绕开 npm 依赖树解析);
2. 对未发布的包(如 `dsh-type-meta`),扫描全部 `.d.ts` 引用并生成最小占位包(`skipLibCheck` 下仅要求模块可解析)。

这些包只参与类型检查;运行时一律由 Harness 页面/进程提供(`react`、`@deepseek-ai/*` 均为外部依赖)。

### 目录结构

```
dsh-prompt-optimizer/
├── package.json          # dsh.bundle + dsh.client 双 manifest
├── cordis.patch.yml      # 组合层:插入 Host 插件行
├── src/
│   ├── index.ts          # Host 插件:设置命名空间 + 两条 HTTP 路由 + llm 调用(含回退链)
│   ├── prompt.ts         # 元提示词、标记解析、token 估算(纯函数)
│   └── client/
│       ├── index.tsx     # Client 入口:槽位注册
│       ├── controller.ts # 按钮/面板共享的状态机与 SSE 消费(独立产物,可单测)
│       ├── host-faces.ts # 宿主客户端服务的最小结构面(自带定义,跨版本稳定)
│       ├── i18n.ts       # 界面文案 zh/en 字典,跟随 DSH 界面语言
│       ├── OptimizeButton.tsx   # 发送栏按钮
│       ├── ResultDock.tsx       # 输入卡上方的结果面板(流式实况 + 撤回)
│       ├── SettingsCard.tsx     # 设置页(模型/调用参数/上下文 三组行)
│       ├── SparkleIcon.tsx      # 手绘 ✨ 图标
│       └── GitHubIcon.tsx       # GitHub 图标(设置页底部仓库入口)
├── scripts/build.mjs     # esbuild:Host ESM + Client lazy-CJS factory + 两个测试用产物
├── scripts/sync-types.mjs
├── scripts/prompt-probe.mjs  # 提示词实证探针:对运行实例发真实优化请求(PROBE_ROUTE=provider/model 可指定路由)
└── test/                 # smoke.mjs(Host)/ prompt.test.mjs / controller.test.mjs
```

## 安全说明

- HTTP 路由注册在 dsh 自带的 Web 服务器上。默认监听 `127.0.0.1`;若把 dsh 暴露到局域网(`0.0.0.0`),本插件的优化接口同样可被局域网调用——它会消耗你配置的模型额度,请知悉。
- 两条路由均带**来源围栏**:带 `Origin` 头的请求(浏览器 POST 必带)必须与 `Host` 同源,且 `Host` 必须是回环地址或本机实际地址——网页侧的跨站伪造请求(CSRF)与 DNS rebinding 会被 403 拒绝;不带 `Origin` 的命令行调用不受影响。
- 优化路由带**并发上限**(同时最多 3 个在途调用),超出直接 `429`;每次优化都是一次真实计费的模型调用,该上限用于挡住多标签页/脚本刷调用。
- SSE 阶段每 15 秒发送注释帧心跳(`: ping`),避免经反向代理/隧道访问时被空闲超时掐断(注释帧不含数据,客户端解析器天然忽略)。
- 插件不持有任何 API Key:模型调用全部经由 Harness 已配置的 `ctx.llm` 路由。

## 贡献者

感谢以下贡献者为本项目提交改进(见 [贡献指南](CONTRIBUTING.md)):

- [@ruijiaang-lab](https://github.com/ruijiaang-lab) — 贡献指南([#2](https://github.com/Y1X1n/dsh-prompt-optimizer/pull/2))

## License

MIT
