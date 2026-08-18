# dsh-prompt-optimizer

DeepSeek Harness 插件:在会话输入框(发送栏)旁提供一个「优化」按钮(✨ 图标),一键分析并优化当前输入的提示词草稿,优化调用默认复用当前会话的模型路由。

- **Host 半侧**:注册 `POST /dsh-prompt-optimizer/optimize` 路由,调用 `ctx.llm` 完成「分析 + 改写」。
- **Client 半侧**:向 `conversation.input.right` 槽位注入按钮,向 `conversation.input.dock` 注入结果面板(输入卡上方整行、与 TodoDock 同族,新会话界面也渲染,且不遮挡输入框),向 `settings.plugin.item` 注入设置卡片(设置页自动获得配置界面,无需单独开发页面)。

## 功能

- 发送栏工具行右侧新增「优化」按钮(输入为空时禁用,优化中带呼吸动画)。
- 点击后:用当前会话选中的 provider/model 发起一次辅助调用(每次点击实时读取,会话里切换模型立即生效),返回 **分析诊断 + 优化后的完整提示词**。
- 结果面板位于输入卡上方整行,样式跟随 Harness 官方设计令牌(`--dsw-alias-*`,明暗主题自适应);操作:**替换输入框** / 复制 / 重新优化 / 关闭(Esc 取消)。
- 输出达到 Token 上限时面板会明确提示「被截断」,而不会静默给出半截结果。
- 设置 → 插件配置 → 「提示词优化」卡片:
  - 优化用模型:**跟随当前会话**(默认),或从模型目录里固定一个(provider/model 下拉)
  - 输出语言(中文 / English)
  - 最大输出 Token(默认 8192,上限 32768)

## 安装

前提:已安装 `dsh` CLI(`npx @deepseek-ai/dsh web` 可用的环境)。

### 本地安装(推荐:tarball)

```sh
cd dsh-prompt-optimizer
npm install --legacy-peer-deps   # prepare 钩子会自动构建 lib/
npm pack                          # 产出 dsh-prompt-optimizer-0.1.0.tgz
dsh plugin --profile web add ./dsh-prompt-optimizer-0.1.0.tgz
```

然后(重新)启动 `dsh web`,打开 Web UI 即可在发送栏旁看到按钮。

> **Windows 注意**:`dsh plugin add ./目录` 走 pnpm 的 `link:`,目前会把盘符冒号错解析成协议分隔符,生成失效符号链接(`node_modules/<pkg>` 指向不存在的路径),表现为插件不加载。本地安装请用上面的 tarball 形式;目录链接形式在 macOS/Linux 正常。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Y1X1n/dsh-prompt-optimizer
```

Git 安装拉取的是源码,本包通过 `prepare` 脚本在安装时自包含构建(只需 Node,不依赖 monorepo 环境)。pnpm ≥10 首次会拒绝运行构建脚本,按终端提示把包名加入该 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重试即可。建议锁定 commit:`github:Y1X1n/dsh-prompt-optimizer#<sha>`。

### 从 Release 安装(免构建)

不想授权构建脚本时,直接用 Release 里的预构建 tarball(推荐):

```sh
# 先下载 dsh-prompt-optimizer-0.1.0.tgz,再安装本地文件
dsh plugin --profile web add ./dsh-prompt-optimizer-0.1.0.tgz
```

下载地址:https://github.com/Y1X1n/dsh-prompt-optimizer/releases

### 卸载

```sh
dsh plugin --profile web remove dsh-prompt-optimizer
```

## 兼容性

- 开发基线:`@deepseek-ai/*` **0.1.0-rc.7**(与 `npx @deepseek-ai/dsh@0.1.0-rc.7` 内置包一致)。
- HTTP 载体服务名在发布版间漂移过(npm 0.0.1-rc.x 类型包叫 `httpServer`,0.1.0-rc.x 运行时叫 `webServer`):本插件用 `ctx.inject` 同时等待两个名字,且不做静态硬依赖——即使服务名再次变化,也只会使本插件的路由不注册(10 秒后日志告警),不会拖垮整个 Harness 启动。

## 验证状态

已在真实环境验证(dsh 0.1.0-rc.7,Windows):

- 组合层加载:`--dump-config` 出现 `# == dsh-prompt-optimizer` 层;
- Host:启动日志 `[dsh-prompt-optimizer] loaded`,路由 405/400/409/502 各路径行为正确;
- Client:bundle 被 client-modules 扫描收录并出现在 `window.__DSH_BOOT__`,`/plugins/dsh-prompt-optimizer/client.js` 可访问;
- 端到端:真实调用 `ctx.llm`(DeepSeek 路由)完成一次「分析 + 优化」,标记解析正确(`wellFormed: true`)。
- `node test/smoke.mjs`:9 项 Host 冒烟用例全过(真实 cordis Context + mock 服务,含空字符串配置、自定义模式缺项、max-tokens 截断等回归)。

## 工作原理

```
点击「优化」
  → Client 读取输入框草稿 + 当前会话模型选择(session.models RPC,每次点击实时查询)
  → POST /dsh-prompt-optimizer/optimize { text, provider, model, reasoningEffort }
  → Host 以系统元提示词调用 ctx.llm.stream()
    (模型路由解析:设置里固定的 'provider/model' → 会话当前选择 → 第一个可用路由;空字符串视为未设置)
  → 按 <<<ANALYSIS>>> / <<<OPTIMIZED>>> 标记解析输出(max-tokens 结束会带 truncated 标记)
  → 输入卡上方整行的面板展示分析诊断与优化稿,一键替换输入框
```

## 开发

```sh
npm install --legacy-peer-deps   # 安装依赖并触发构建
npm run sync:types               # 同步客户端类型包(见下)
npm run typecheck                # tsc --noEmit
npm run build                    # 产出 lib/index.js(Host ESM)与 lib/client.js(浏览器 bundle)
node test/smoke.mjs              # Host 半冒烟测试(真实 cordis + mock 服务)
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
│   ├── index.ts          # Host 插件:设置命名空间 + HTTP 路由 + llm 调用
│   ├── prompt.ts         # 元提示词与输出解析(纯函数)
│   └── client/
│       ├── index.tsx     # Client 入口:槽位注册
│       ├── controller.ts # 按钮/面板共享的状态与请求逻辑
│       ├── OptimizeButton.tsx   # 发送栏按钮
│       ├── ResultDock.tsx       # 输入卡下方的结果面板
│       ├── SettingsCard.tsx     # 设置页卡片(跟随会话/自定义)
│       └── SparkleIcon.tsx      # 手绘 ✨ 图标
├── scripts/build.mjs     # esbuild:Host ESM + Client lazy-CJS factory
├── scripts/sync-types.mjs
└── test/smoke.mjs
```

## 安全说明

- HTTP 路由注册在 dsh 自带的 Web 服务器上。默认监听 `127.0.0.1`;若把 dsh 暴露到局域网(`0.0.0.0`),本插件的优化接口同样可被局域网调用——它会消耗你配置的模型额度,请知悉。
- 插件不持有任何 API Key:模型调用全部经由 Harness 已配置的 `ctx.llm` 路由。

## License

MIT
