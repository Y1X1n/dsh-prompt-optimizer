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
  - [从 Release 安装(推荐,免构建)](#从-release-安装推荐免构建)
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
| ![设置卡折叠态:标题栏显示「模型 · 模式」关键摘要](docs/screenshots/settings-collapsed.png) | ![设置卡展开态:模型 / 调用参数 / 上下文 三组配置](docs/screenshots/settings-expanded.png) |

## 功能

- 发送栏工具行右侧新增「优化」按钮(输入为空时禁用,优化中带呼吸动画);等待期间面板实时显示当前阶段(等待模型响应 / 分析诊断 / 输出优化稿)与已用秒数,完成后模型徽章处展示总用时。
- 点击后实时读取当前会话的 provider/model 发起辅助调用;**分析与优化结果逐段流式显示**在输入卡上方的面板里,不用干等整段生成。
- **双策略优化**:无上下文(空会话/关闭携带)时按**结构模板**规范化改写(角色/任务/约束/输出格式);有上下文时自动切换为**提炼目的 + 顺势润色**——先通读会话近期对话提炼真实意图,保留草稿原始表达框架打磨,不套模板,不重复追问上下文已给出的信息,且**已否决方向不再重提**(禁入集合)。
- **保真纪律**(借鉴 Fishsb/dsh-prompt-enhancer):语义等价底线、来源可回溯(推断处以「如无特别说明/默认」标注)、输出前逐要素**保真自检**防漂移且**保真自检优先于长度纪律**(简单任务目标 800 字符内,要素缺失比冗长更严重),并带 few-shot 示例稳定输出风格。
- **轻量记忆链**:在我们产出的优化稿上继续修改后再点优化,自动携带上一轮结果作为延续参考(沿用已确认决策,只围绕变化点调整);同文重试、跨会话、上轮格式退化的结果都不带(格式退化仅在完整模式判定,快速模式恒视为合规),发送或关闭面板后自然归零;跟随「携带上下文」开关,关闭后不携带。
- **斜杠命令安全**:「/goal 帮我……」这类输入只优化正文,替换时自动拼回命令前缀,不会把命令词改坏;只敲命令没有正文时直接提示、不发无意义请求。
- **上下文感知**:默认携带当前会话的近期对话作为参考(**用户消息优先保底**——agentic 会话里 assistant 步骤碎片远多于用户输入,纯按时间取样会把你的真实诉求挤出去),总量 ≤8 条 / 1600 字符;上下文仅供模型理解意图,提示词中明确禁止其回答或延续上下文;空会话自动退化为模板策略。可在设置卡关闭。
- 结果面板:**分析诊断**(五维度:目标清晰度/上下文/约束/结构/输出规格)+ **优化后的完整提示词**;操作:**替换输入框**(可**撤回**,在替换内容上继续编辑时撤回入口自动失效)/ 复制 / 重新优化 / 关闭。**发送消息后或清空输入框时面板自动关闭。**
- **取消不丢内容**:优化中按 Esc 取消,面板定格展示已生成的部分,可直接查看、「重新优化」续跑或关闭;非加载状态按 Esc 直接关闭面板。客户端另带**超时看门狗**(设置超时秒数 + 5s 余量):Host 挂死或网络黑洞时不再无限转圈,直接落明确的超时错误。
- 面板按会话隔离:切换会话后旧结果不会飘到别的会话,也不会误替换别的会话的输入框。
- **流式自动跟随滚动**:实况内容增长时贴住底部,向上滚动即暂停跟随,滚回底部附近自动恢复。
- 面板样式全部走 Harness 官方设计令牌(`--dsw-alias-*`),明暗主题自动跟随。
- 长草稿友好:输出上限默认跟随输入长度自动抬升(按本地 token 估算,完整模式 ×2 / 快速模式 ×1.5,32768 封顶);真截断时也会展示已生成部分并明确提示,不会整段消失。
- 格式容错:模型输出的标记变体(如 `<<< ANALYSIS >>>`)能正确解析;完整模式不遵守格式时降级展示并给出警示;快速模式只有单段落,无论模型是否输出标记都视为合规(不弹警示、记忆链照常携带)——对不输出标记的第三方/免费模型友好,且其原始流可直接实时逐字预览(标记出现前)。
- 设置 → 插件配置 → 「提示词优化」卡片(默认收起,点击标题栏展开;收起时标题栏显示「模型 · 模式」关键摘要;所有改动可一步撤销——底部「撤销上一次修改」,内存栈最近 20 次):
  - **模型**:优化用模型(**跟随当前会话**(默认),或从模型目录固定一个,provider/model 下拉、目录可手动刷新)/ 回退模型(主路由零产出失败时自动 failover,面板徽章显示「· 已回退」,悬停可见失败原因)/ 模型连通性(「测试连接」,32 token / 20s 封顶探活,显示实际路由与耗时)
  - **调用参数**:输出语言(中文 / English);优化模式:完整(分析 + 优化)/ **快速**(仅优化,输出 token 约减半);推理强度:降到最低档(默认,推理模型首 token 前的空转显著缩短)/ 跟随会话;最大输出 Token(默认 8192)、超时时间(默认 120s)、采样温度(默认 0.2,悬停见设计依据);输出上限自适应开关(默认开)
  - **上下文**:携带上下文开关(默认开):关闭后仅看草稿本身,不读取会话历史

## 安装

前提:已安装 `dsh` CLI(`npx @deepseek-ai/dsh web` 可用的环境)。

### 从 Release 安装(推荐,免构建)

```sh
# 下载 y1x1n-dsh-prompt-optimizer.tgz(始终指向最新版),再安装本地文件
dsh plugin --profile web add ./y1x1n-dsh-prompt-optimizer.tgz
```

下载地址:https://github.com/Y1X1n/dsh-prompt-optimizer/releases/latest/download/y1x1n-dsh-prompt-optimizer.tgz

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

> **当前版本(v0.3.16)适配 DeepSeek Harness**:
>
> | dsh 版本 | 优化路由 / 模型调用 | 设置页(含 GitHub 入口) | 发送栏按钮 / 结果面板 |
> |---|---|---|---|
> | **0.1.2-rc.1 / 0.1.2-alpha.5** | ✅ 实测 | ✅ 实测 | ✅ 实测 |
> | **0.1.1-rc.2 及以下**(0.1.0-rc.7+) | ✅ 实测 | ✅ 实测 | ✅ 实测 |
>
> 同一份构建覆盖 0.1.0-rc.7 至 0.1.2 全线;此标注自 v0.3.15 起在每个 Release 说明中固定维护,更早 Release 的说明已回溯补注。

- 开发基线:`@deepseek-ai/*` **0.1.0-rc.7**;已实测通过 **0.1.0-rc.8**(2026-08-20,Windows,真实 profile 安装 + Web 路由/客户端 bundle/会话历史 RPC/端到端 LLM 调用)、复测通过 **0.1.1-rc.2**(2026-08-27)、适配并通过 **0.1.2-rc.1 与 0.1.2-alpha.5**(2026-09-05/06,真实 profile 端到端冒烟:组合层注入、路由 SSE、client bundle、发送栏按钮与结果面板、设置卡片)。
- **dsh-settings API 兼容层**:0.1.2 线重写了设置 API(独立函数 `installSettingsSection` 移除,改为 `ctx.settings` 服务的 `installSection` 方法)。0.3.16+ 运行时按能力探测自动分派:新 API 存在则走新接口,否则内联等价实现(register+watch+卸载回落),settings 服务整体缺席时回落组合层配置。
- **客户端槽位 props 双形态**:0.1.2 起 composer 槽位改为 session scope,组件经 standard hooks(`useInput`/`useSession`)读取会话与草稿状态,注册需采用「注入回调内 scope 化注册 + `inject(sessionId)` 钩子」的官方双层形态。组件按 props 形态自动分派(0.1.2 走 hooks,旧版读直传快照),两种宿主共用同一份构建。
- **client bundle 注册 id**:`lib/client.js` 的 loader id 必须等于插件 npm 包名(宿主 client-modules 按包名校验注册);client 注入列表已随 0.1.2 移除已合并的 `dsh-client-runtime`。
- HTTP 载体服务名在发布版间漂移过(npm 0.0.1-rc.x 类型包叫 `httpServer`,0.1.0-rc.x 运行时叫 `webServer`):本插件用 `ctx.inject` 同时等待两个名字,且不做静态硬依赖——即使服务名再次变化,也只会使本插件的路由不注册(10 秒后日志告警),不会拖垮整个 Harness 启动。
- **客户端协议口径**:`/dsh-prompt-optimizer/optimize` 预校验失败返回 400/405/409/413(普通 JSON),成功后进入 SSE 流,模型错误经 `error` 事件传达;`/dsh-prompt-optimizer/test-model` **无论成败一律 HTTP 200**,由 body 的 `ok` 字段区分(探活是应用层语义,刻意不走传输层状态码)——对接方请以 `ok` 为准。
- 客户端与 Host 需同版本(SSE 协议是私有约定):升级插件后请重启 `dsh web` 并刷新浏览器页面。

## 常见问题

- **点了「优化」没有反应?** 打开浏览器 Console 查看 `[dsh-prompt-optimizer]` 开头的日志;常见原因是未配置任何模型(先在 设置 → 模型 里配好提供方),或面板所需的上游槽位尚未就绪(刷新页面)。
- **提示「未找到可用模型」?** 会话没有选择可路由的模型,且设置卡里也没有固定模型;两者补其一即可。也可以展开设置卡点「测试连接」确认路由可用。
- **结果被截断?** 面板会出现截断提示;默认开启的「输出上限自适应」会按草稿长度自动抬升上限,仍不够再到设置卡调高「最大输出 Token」。
- **换了会话模型没生效?** 每次点击都会实时查询会话当前模型;若仍不对,看 Console 是否有 `会话模型查询失败` 的警告(此时会用第一个可用路由兜底)。注意:设置卡里固定了模型时会话选择不生效。
- **优化调用偶发超时 / RATE_LIMIT 失败?** 这类瞬态错误的重试由宿主在**提供方层**统一处理(dsh 0.1.1+ 的提供方配置内置重试策略,默认覆盖 `RATE_LIMIT / SERVER / TIMEOUT / TRANSPORT / EMPTY_RESPONSE`)。到 设置 → 模型 → 对应提供方 里调整重试次数与退避,而不是调本插件的「超时时间」——后者只管单次调用的总时长。
- **设置页找不到卡片?** 0.3.0 的严格枚举 schema 与旧版设置文档冲突会导致卡片不渲染,0.3.1 起已修复(未知枚举值自动回落默认);确认版本 ≥0.3.1 并刷新页面。
- **卸载后按钮还在?** 插件集合变更需重启 `dsh web` 才生效;刷新页面不够。

## 验证状态

已在真实环境验证(dsh 0.1.0-rc.8 实测 + 0.1.1-rc.2 复测,Windows,详见「兼容性」);v0.3.9–0.3.11 另在**第三方免费模型**(openrouter 的 `minimax/minimax-m3:free`,不输出标记格式)上完成端到端实测:模板/意图双策略、保真逐要素保留、待补充标记、记忆链与取消保留等行为均按设计工作,并据此修复了快速模式的格式误报。

- 组合层加载:`--dump-config` 出现 `# == dsh-prompt-optimizer` 层;
- Host:启动日志 `[dsh-prompt-optimizer] loaded`,优化路由与测试路由的 400/405/409/413 各路径行为正确,SSE 流式输出实测正常;
- Client:bundle 被 client-modules 扫描收录并出现在 `window.__DSH_BOOT__`,`/plugins/dsh-prompt-optimizer/client.js` 可访问;
- 端到端:真实调用 `ctx.llm`(DeepSeek 路由)完成「分析 + 优化」,标记解析正确(`wellFormed: true`)。
- 自动化测试(`npm test`,共 62 例):
  - `test/smoke.mjs`:28 项 Host 冒烟用例(真实 cordis Context + mock 服务,覆盖路由解析优先级、空字符串/畸形配置、400/405/409/413、SSE 事件流、max-tokens 截断、超时、快速模式、推理钳档、旧版设置文档归一化、连接测试、回退链与回退原因透传、tool-calls 防御、输出上限自适应、上下文注入与硬开关、策略选择、记忆链注入与截断、来源围栏);
  - `test/prompt.test.mjs`:13 项元提示词解析用例(标记空白变体、降级路径、流式实况解析、流式缓冲压缩、token 估算、上下文载荷与预算收敛、策略分叉、保真纪律与示例、记忆链载荷);
  - `test/controller.test.mjs`:21 项客户端纯逻辑用例(SSE 帧解析、合帧节流、连接中断、跳过会话查询、撤回流转、retry、close 中止、cancel 取消保留已生成部分及其状态门槛、客户端超时看门狗、历史提取过滤与失败降级、斜杠前缀拆分与空命令拦截、记忆链传递与门槛、发送即关闭判定、耗时记录、上下文取样用户消息保底)。

## 工作原理

```
点击「优化」
  → Client 拆分斜杠命令前缀(/goal 等只优化正文),并行拉取当前会话模型选择
    (session.models RPC,每次点击实时查询;设置里固定了模型时跳过,Host 固定值优先)
    与会话近期对话(session.history RPC,最近 8 条/1600 字符封顶,可在设置卡关闭)
  → POST /dsh-prompt-optimizer/optimize { text, provider, model, reasoningEffort, context?, previous? }
    (previous = 轻量记忆链:在优化稿上修改后再优化时携带的上轮结果)
  → Host 以系统元提示词调用 ctx.llm.stream()
    (路由解析:设置固定值 → 会话选择 → 第一个可用路由;可配回退路由,零产出失败自动 failover;
     策略分叉:有上下文走「提炼目的+润色」,无上下文走「结构模板」;
     输出上限默认按输入 token 估算抬升;默认推理钳最低档/低温度)
  → text-delta 经 SSE 逐段推送,面板实时显示「分析诊断 / 优化结果」两段
    (按 <<<ANALYSIS>>> / <<<OPTIMIZED>>> 标记增量解析,容忍标记空白变体)
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
npm test                         # smoke + prompt + controller 三套测试
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
│       ├── i18n.ts       # 界面文案 zh/en 字典,跟随 DSH 界面语言
│       ├── OptimizeButton.tsx   # 发送栏按钮
│       ├── ResultDock.tsx       # 输入卡上方的结果面板(流式实况 + 撤回)
│       ├── SettingsCard.tsx     # 设置页折叠卡片
│       └── SparkleIcon.tsx      # 手绘 ✨ 图标
├── scripts/build.mjs     # esbuild:Host ESM + Client lazy-CJS factory + 两个测试用产物
├── scripts/sync-types.mjs
├── scripts/prompt-probe.mjs  # 提示词实证探针:对运行实例发真实优化请求(PROBE_ROUTE=provider/model 可指定路由)
└── test/                 # smoke.mjs(Host)/ prompt.test.mjs / controller.test.mjs
```

## 安全说明

- HTTP 路由注册在 dsh 自带的 Web 服务器上。默认监听 `127.0.0.1`;若把 dsh 暴露到局域网(`0.0.0.0`),本插件的优化接口同样可被局域网调用——它会消耗你配置的模型额度,请知悉。
- 两条路由均带**来源围栏**:带 `Origin` 头的请求(浏览器 POST 必带)必须与 `Host` 同源,且 `Host` 必须是回环地址或本机实际地址——网页侧的跨站伪造请求(CSRF)与 DNS rebinding 会被 403 拒绝;不带 `Origin` 的命令行调用不受影响。
- 插件不持有任何 API Key:模型调用全部经由 Harness 已配置的 `ctx.llm` 路由。

## 贡献者

感谢以下贡献者为本项目提交改进(见 [贡献指南](CONTRIBUTING.md)):

- [@ruijiaang-lab](https://github.com/ruijiaang-lab) — 贡献指南([#2](https://github.com/Y1X1n/dsh-prompt-optimizer/pull/2))

## License

MIT
