import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
// 0.1.2-rc.1 起设置能力改为 SettingsProvider 实例方法(installSection);
// 这里只导类型,运行时经 ctx.settings 注入拿实例(服务缺席回落组合层配置)。
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildSystemPrompt, buildUserPayload, capConversationContext, estimateTokens, parseOptimizerOutput, type ConversationTurn, type OptimizerMode, type OutputLanguage } from './prompt.js'

export const name = 'dsh-prompt-optimizer'
// 硬依赖只有 llm。HTTP 载体服务名在发布版间漂移过(npm 0.0.1-rc.x 类型包叫
// httpServer,0.1.0-rc.x 运行时叫 webServer),用 ctx.inject 双名等待,避免
// 静态 inject 声明错位时把整个 Harness 组合启动拖垮。
export const inject = ['llm']

export interface Config {
  /** 优化输出的语言('zh'/'en';其他值按 'zh' 处理)。 */
  language: string
  /** 固定模型,'provider/model' 形式;留空 = 跟随发起请求的会话当前选择。 */
  model?: string
  /** 回退模型('provider/model',留空 = 无);主路由在未产出任何内容就失败时自动换用。 */
  fallbackModel?: string
  /** 单次优化调用的最大输出 token 数。 */
  maxTokens: number
  /** 单次优化调用的超时时间(秒);超时后中止模型调用并通知客户端。 */
  timeoutSeconds: number
  /** 优化模式('full'/'fast';其他值按 'full' 处理)。 */
  mode: string
  /** 推理强度('lowest'/'session';其他值按 'lowest' 处理)。默认钳最低档:优化是格式化元任务,高档推理只拉长首 token 前的空等。 */
  reasoningEffort: string
  /** 采样温度(0-2,默认 0.2);优化是格式化任务,低温输出更稳定。 */
  temperature: number
  /** 输出上限跟随输入长度(默认开):长草稿时按输入 token 估算提高 maxTokens,避免截断。 */
  autoMaxTokens: boolean
  /** 优化时携带会话近期对话作为上下文(默认开):方向更贴合;关闭后仅看草稿本身。 */
  includeContext: boolean
}

// 枚举字段刻意用宽松 string 而非 union:设置文档持久化在 ~/.dsh/settings.yaml,
// 旧版本写过的枚举值(如 mode: custom)若撞上严格 union 会让 schema 校验抛错,
// 整个命名空间注册失败、设置页卡片直接消失。宽松接收 + 使用处归一化更稳。
export const Config: Schema<Config> = Schema.object({
  language: Schema.string().default('zh'),
  model: Schema.string(),
  fallbackModel: Schema.string(),
  maxTokens: Schema.number().min(1024).max(32768).default(8192),
  timeoutSeconds: Schema.number().min(10).max(600).default(120),
  mode: Schema.string().default('full'),
  reasoningEffort: Schema.string().default('lowest'),
  temperature: Schema.number().min(0).max(2).default(0.2),
  autoMaxTokens: Schema.boolean().default(true),
  includeContext: Schema.boolean().default(true),
})

// 0.1.2-rc.1 起 ns 直接传字符串,由 SettingsNamespaceInput 做小写-连字符校验。
const NS = 'prompt-optimizer' as const
const ROUTE_PATH = '/dsh-prompt-optimizer/optimize'
const TEST_ROUTE_PATH = '/dsh-prompt-optimizer/test-model'
const MAX_BODY_BYTES = 256 * 1024

// R27:宽 string schema 的配套告警(枚举值在用处处静默归一化,这里至少让用户
// 在日志里看到自己手填的值不被支持)。每个 非法字段=值 组合只提醒一次。
const warnedConfigValues = new Set<string>()
function warnUnknownEnum(value: string, allowed: readonly string[], label: string): void {
  const key = `${label}=${value}`
  if (!allowed.includes(value) && !warnedConfigValues.has(key)) {
    warnedConfigValues.add(key)
    console.warn(`[${name}] 配置 ${label}="${value}" 不是有效值(支持:${allowed.join('/')}),已按默认处理`)
  }
}

/** 对三个宽松枚举字段做非法值告警;归一化仍由各使用处完成。 */
function warnUnknownEnumConfig(cfg: Config): void {
  if (cfg.language !== 'zh' && cfg.language !== 'en') warnUnknownEnum(cfg.language, ['zh', 'en'], 'language')
  if (cfg.mode !== 'full' && cfg.mode !== 'fast') warnUnknownEnum(cfg.mode, ['full', 'fast'], 'mode')
  if (cfg.reasoningEffort !== 'lowest' && cfg.reasoningEffort !== 'session') {
    warnUnknownEnum(cfg.reasoningEffort, ['lowest', 'session'], 'reasoningEffort')
  }
}

interface OptimizeRequestBody {
  text?: unknown
  provider?: unknown
  model?: unknown
  reasoningEffort?: unknown
  context?: unknown
  previous?: unknown
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * 校验客户端携带的会话上下文:只接受 {role:'user'|'assistant', text} 数组,
 * 坏条目静默丢弃,最终再过一遍预算收敛(防御性——客户端已按同一口径收敛过)。
 */
function parseContextInput(value: unknown): ConversationTurn[] | undefined {
  if (!Array.isArray(value)) return undefined
  const turns: ConversationTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { role, text } = item as Record<string, unknown>
    if ((role === 'user' || role === 'assistant') && typeof text === 'string' && text.trim()) {
      turns.push({ role, text: text.trim() })
    }
  }
  return turns.length ? capConversationContext(turns) : undefined
}

function writeJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * 浏览器来源围栏(本机服务的 CSRF / DNS rebinding 防线):
 * - 浏览器发出的 POST 必带 Origin 头:其 authority 必须与 Host 头一致,
 *   否则拒绝——恶意网页的跨站 text/plain POST(免预检)在此被挡下;
 * - Host 头必须是回环地址,或与本次连接的实际本地地址:端口一致——
 *   DNS rebinding 会伪造 Host=攻击域名,在此被挡下;
 * - 无 Origin 的请求(CLI / 服务端调用)放行:本插件的主要调用方是
 *   同源页面与命令行,前者 Origin 恒匹配,后者本就不带该头。
 * LAN 暴露(README 已声明)不受影响:直连 IP 访问时 Host=本机地址。
 */
function assertTrustedOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers.host
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = ''
  }
  if (!host || originHost !== host) {
    writeJson(res, 403, { ok: false, error: '已拒绝跨站请求(Origin 与 Host 不符)' })
    return false
  }
  const hostName = host.replace(/:\d+$/, '')
  const hostPort = /:(\d+)$/.exec(host)?.[1] ?? '80'
  const loopback = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '[::1]' || hostName === '::1'
  if (!loopback) {
    // Host 不是回环时,必须恰好等于本次连接的本地地址:端口(直连 IP 的 LAN 访问);
    // 拿不到 socket 信息或对不上都拒绝(fail-closed,防 rebinding 伪造 Host)。
    const sock = (req as { socket?: { localAddress?: string; localPort?: number } }).socket
    if (!(sock?.localAddress && sock?.localPort && hostName === sock.localAddress && hostPort === String(sock.localPort))) {
      writeJson(res, 403, { ok: false, error: '请求的 Host 与本机服务地址不符(可能的 DNS rebinding),已拒绝' })
      return false
    }
  }
  return true
}

/** 请求体超过大小上限时抛出,用于映射 413(与 JSON 解析失败的 400 区分)。 */
class PayloadTooLargeError extends Error {}

/** 读取并解析 JSON 请求体,带大小上限。 */
async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    size += buf.length
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError('请求体超过 256KB 上限')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

/** 读取请求体并直接应答解析错误(400/413);成功返回 body,失败返回 undefined(响应已写)。 */
async function readBodyOrReply(req: IncomingMessage, res: ServerResponse): Promise<OptimizeRequestBody | undefined> {
  try {
    return (await readJsonBody(req)) as OptimizeRequestBody
  } catch (error) {
    // 请求体问题是客户端错误(400/413),不是上游模型失败(502)。
    if (error instanceof PayloadTooLargeError) {
      writeJson(res, 413, { ok: false, error: error.message })
    } else {
      writeJson(res, 400, { ok: false, error: '请求体不是合法的 JSON' })
    }
    return undefined
  }
}

/** 折叠流式输出为纯文本;finish 为 error/aborted 时抛出,max-tokens 标记截断。onDelta 逐段回调增量(用于 SSE 透传)。 */
async function collectText(
  stream: AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>,
  onDelta?: (text: string) => void,
): Promise<{ text: string; truncated: boolean }> {
  let deltas = ''
  const blocks = new Map<number, string>()
  let truncated = false
  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text-delta':
        deltas += chunk.text
        onDelta?.(chunk.text)
        break
      case 'block-end':
        if (chunk.block.type === 'text') blocks.set(chunk.index, chunk.block.text)
        break
      case 'finish': {
        const reason = chunk.reason
        if (reason.kind === 'error' || reason.kind === 'aborted') {
          throw new Error(`模型调用失败(${reason.failure.code}): ${reason.failure.message}`)
        }
        // 优化调用不带工具,模型请求工具说明路由/适配异常,明确报错而非当成功展示。
        if (reason.kind === 'tool-calls') {
          throw new Error('模型意外请求工具调用(优化调用不提供工具),请检查模型路由配置')
        }
        if (reason.kind === 'max-tokens') truncated = true
        break
      }
      default:
        break
    }
  }
  // 优先使用增量(delta 是协议主通道);某些适配器只发 block-end 时降级。
  const text = deltas || [...blocks.entries()].sort(([a], [b]) => a - b).map(([, t]) => t).join('')
  return { text, truncated }
}

/**
 * 解析指定路由支持的最低推理强度(「最低档」配置用)。
 * 优先按常见低档关键词匹配 effort 的 id/name;匹配不到取适配器展示顺序首位。
 * 目录查询失败或模型不支持推理时返回 undefined,调用方回退到会话选择。
 */
async function resolveLowestEffort(
  llm: Context['llm'],
  provider: string,
  model: string,
): Promise<string | undefined> {
  try {
    // reasoning 只在精确路由元数据上,listModels 的目录项没有。
    const efforts = (await llm.resolveModelInfo(provider, model)).reasoning?.efforts
    if (!efforts?.length) return undefined
    const keyworded = efforts.find((e) => /none|minimal|low|低/i.test(`${e.id} ${e.name}`))
    return String((keyworded ?? efforts[0]).id)
  } catch {
    return undefined
  }
}

// 路由 → 最低档 effort 缓存的生存期(实例级,挂在 apply 闭包内,见下)。
const EFFORT_CACHE_TTL = 10 * 60 * 1000

/**
 * 模型路由解析:设置里固定的 'provider/model' → 请求方会话当前选择 → 第一个可用路由。
 * 空字符串视为未设置;provider 路由键不含 '/',模型 id 可以含。无可用路由时返回 undefined。
 */
async function resolveRoute(
  llm: Context['llm'],
  pinnedModel: string | undefined,
  bodyProvider: string | undefined,
  bodyModel: string | undefined,
): Promise<{ provider: string; model: string } | undefined> {
  let provider: string | undefined
  let model: string | undefined
  const pinned = asOptionalString(pinnedModel)
  if (pinned) {
    const slash = pinned.indexOf('/')
    if (slash > 0 && slash < pinned.length - 1) {
      provider = pinned.slice(0, slash)
      model = pinned.slice(slash + 1)
    }
  }
  provider ??= bodyProvider
  model ??= bodyModel
  if (!provider || !model) {
    const first = llm.listProviders()[0]
    if (!provider && first) provider = first.id
    if (provider && !model) {
      try {
        model = (await llm.listModels(provider))[0]?.id
      } catch {
        // 目录查询失败不代表路由不可用,留空往下走到明确报错。
      }
    }
  }
  return provider && model ? { provider, model } : undefined
}

/** HTTP 载体服务的最小依赖面(webServer / httpServer 两个名字共用同一形状)。 */
interface WebRouteService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

export function apply(ctx: Context, config: Config) {
  // 路由 → 最低档 effort 的实例级缓存:每次优化点击都会解析一遍,而模型的推理
  // 档位表极少变化。仅缓存成功结果,失败不缓存——下次点击重试,避免一次目录
  // 抖动永久挡住钳档。挂在 apply 闭包内:随插件实例生灭,测试间天然隔离。
  const effortCache = new Map<string, { effort: string; at: number }>()
  const resolveLowestEffortCached = async (llm: Context['llm'], provider: string, model: string): Promise<string | undefined> => {
    const key = `${provider}/${model}`
    const hit = effortCache.get(key)
    if (hit && Date.now() - hit.at < EFFORT_CACHE_TTL) return hit.effort
    const effort = await resolveLowestEffort(llm, provider, model)
    if (effort !== undefined) effortCache.set(key, { effort, at: Date.now() })
    return effort
  }

  // 设置页命名空间:组合层配置作为 base,用户在 设置→插件配置 中的修改实时生效。
  // dsh-settings API 在 0.1.2 线重写(独立函数 installSettingsSection 移除,改为
  // SettingsProvider 实例方法 installSection)。这里运行时按能力探测分派,保证
  // 同一份构建向下兼容:
  //  - settings.installSection 是函数(0.1.2-alpha.5+ / 0.1.2-rc.1)→ 新 API;
  //  - 否则(0.1.0-rc.x / 0.1.1-rc.x)→ 旧独立函数的等价内联
  //    (register{base} + setSource + watch + 卸载回落 entry,对照 0.1.0-rc.7 实现);
  //  - settings 服务整体缺席 → current 保持组合层配置,行为与更早版本一致。
  let current = (): Config => config
  ctx.inject(['settings'], (sctx) => {
    const settings = (sctx as unknown as { settings?: SettingsProvider }).settings
    if (!settings) return
    const hooks = {
      setSource: (source: () => Config) => {
        current = source
      },
      onChange: () => {},
    }
    if (typeof settings.installSection === 'function') {
      settings.installSection(ctx, NS, Config, config, hooks)
      return
    }
    const scope = settings.register(NS, Config, { base: config })
    hooks.setSource(() => scope.get())
    hooks.onChange()
    const disposeWatch = scope.watch(() => hooks.onChange())
    ctx.effect(() => () => {
      disposeWatch()
      hooks.setSource(() => config)
      hooks.onChange()
    })
  })
  // 启动即对初始配置做一次非法枚举告警;请求期配置可能被实时改写,handler 内还会复查。
  warnUnknownEnumConfig(config)

  let mounted = false
  const mount = (server: WebRouteService | undefined) => {
    if (!server || mounted) return
    mounted = true
    ctx.effect(() => {
      const disposeOptimize = server.register({ kind: 'exact', path: ROUTE_PATH, handler })
      const disposeTest = server.register({ kind: 'exact', path: TEST_ROUTE_PATH, handler: testHandler })
      return () => {
        disposeOptimize()
        disposeTest()
      }
    })
    console.log(`[${name}] loaded, POST ${ROUTE_PATH}`)
  }
  ctx.inject(['webServer'], (sctx) => mount((sctx as unknown as { webServer?: WebRouteService }).webServer))
  ctx.inject(['httpServer'], (sctx) => mount((sctx as unknown as { httpServer?: WebRouteService }).httpServer))
  ctx.effect(() => {
    const timer = setTimeout(() => {
      if (!mounted) {
        console.error(`[${name}] 未找到 webServer/httpServer 服务,路由未注册——当前 dsh 版本可能不兼容`)
      }
    }, 10_000)
    return () => clearTimeout(timer)
  })

  async function handler(req: IncomingMessage, res: ServerResponse) {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
        return
      }
      if (!assertTrustedOrigin(req, res)) return
      // 客户端在响应结束前断开连接时,中止模型调用。
      // 注意:必须用 res 的 close;req 的 close 在请求体读完就会触发,不代表断连。
      const abort = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) abort.abort()
      })

      try {
        const body = await readBodyOrReply(req, res)
        if (!body) return
        const text = asOptionalString(body.text)
        if (!text) {
          writeJson(res, 400, { ok: false, error: '提示词内容为空' })
          return
        }

        const cfg = current()
        // 宽松 schema 的配套归一化:未知枚举值一律回落默认,保证旧版设置文档可用
        //(非法值会先告警一次,见 warnUnknownEnumConfig)。
        warnUnknownEnumConfig(cfg)
        const language: OutputLanguage = cfg.language === 'en' ? 'en' : 'zh'
        const mode: OptimizerMode = cfg.mode === 'fast' ? 'fast' : 'full'
        const route = await resolveRoute(ctx.llm, cfg.model, asOptionalString(body.provider), asOptionalString(body.model))
        if (!route) {
          writeJson(res, 409, {
            ok: false,
            error: '未找到可用模型:请先在 设置 → 模型 中配置提供方,或在 设置 → 插件配置 → 提示词优化 中固定一个模型',
          })
          return
        }
        // 回退模型链:设置里配了 fallbackModel('provider/model')时追加一条备用路由。
        // 仅当某次尝试还没向客户端推送过任何 delta 就失败时才换路由重试——
        // 客户端已经看到部分内容后再换路由,输出会变成两个模型的拼接。
        const routes = [route]
        const fallbackRaw = asOptionalString(cfg.fallbackModel)
        if (fallbackRaw) {
          const slash = fallbackRaw.indexOf('/')
          if (slash > 0 && slash < fallbackRaw.length - 1) {
            const fb = { provider: fallbackRaw.slice(0, slash), model: fallbackRaw.slice(slash + 1) }
            if (fb.provider !== route.provider || fb.model !== route.model) routes.push(fb)
          }
        }

        // 设置里关掉「携带上下文」时,即使客户端带了 context 也忽略(Host 侧硬开关)。
        const context = cfg.includeContext === false ? undefined : parseContextInput(body.context)
        // 轻量记忆链:上一轮优化结果,截断到 1500 字符(它只是延续参考,不是优化对象)。
        // 与 context 一样跟随「携带上下文」开关——关闭后不带任何会话衍生材料。
        const previousRaw = cfg.includeContext === false ? undefined : asOptionalString(body.previous)
        const previous = previousRaw ? (previousRaw.length > 1500 ? `${previousRaw.slice(0, 1500)}…` : previousRaw) : undefined
        const message: Message = {
          id: `prompt-optimizer-${crypto.randomUUID()}` as Message['id'],
          role: 'user',
          content: [{ type: 'text', text: buildUserPayload(text, language, context, previous) }],
          source: { kind: 'plugin', plugin: name },
        }
        // 策略分叉:有上下文走「提炼目的 + 润色」(不套模板),无上下文走「结构模板」改写。
        const system = buildSystemPrompt(language, mode, context?.length ? 'intent' : 'template')
        // 输出上限跟随输入长度:优化结果体量与草稿正相关(完整模式还多一段分析),
        // 长草稿撞固定上限会被截断。取配置值与「输入估算 × 模式系数」的较大者,32768 封顶。
        const maxTokens =
          cfg.autoMaxTokens === false
            ? cfg.maxTokens
            : Math.min(32768, Math.max(cfg.maxTokens, Math.ceil(estimateTokens(text) * (mode === 'fast' ? 1.5 : 2))))
        // 推理强度:默认钳到该模型支持的最低档(优化是格式化元任务,高推理只会拉长
        // 首 token 前的空等),按路由逐次解析;仅显式配置 'session' 时透传会话选择。
        // 无法确定最低档(目录失败/模型不暴露推理)时回退到会话值,不冒险乱发。
        const sessionEffort = asOptionalString(body.reasoningEffort)
        // 宽松 schema 的配套归一化:仅 'session' 视为跟随会话,其余(含缺省)都钳最低档。
        const preferSessionEffort = cfg.reasoningEffort === 'session'

        // 阶段二:流式响应。delta 逐段推送(SSE),done 携带最终解析结果;
        // 此阶段响应头已发出,模型错误也走事件通道,无法再改状态码。
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'x-accel-buffering': 'no',
        })
        const send = (event: Record<string, unknown>) => {
          if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
        // 超时兜底:模型挂死时中止调用并通知客户端(timedOut 与客户端断连共用 abort,靠标志位区分)。
        const timeoutSec = cfg.timeoutSeconds ?? 120
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          abort.abort()
        }, timeoutSec * 1000)
        try {
          let sentAny = false
          let used = routes[0]
          let raw: { text: string; truncated: boolean } | null = null
          let lastError: unknown = null
          // O12:主路由零产出失败而启用回退时,把失败原因带给客户端(徽章 tooltip 展示)。
          let fallbackReason: string | undefined
          for (const attempt of routes) {
            used = attempt
            try {
              const options: GenerateOptions = {
                provider: attempt.provider,
                model: attempt.model,
                system,
                messages: [message],
                maxTokens,
                temperature: cfg.temperature ?? 0.2,
                signal: abort.signal,
              }
              let effort = sessionEffort
              if (!preferSessionEffort) {
                effort = (await resolveLowestEffortCached(ctx.llm, attempt.provider, attempt.model)) ?? sessionEffort
              }
              if (effort) {
                options.reasoningEffort = effort as GenerateOptions['reasoningEffort']
              }
              raw = await collectText(ctx.llm.stream(options), (delta) => {
                sentAny = true
                send({ type: 'delta', text: delta })
              })
              lastError = null
              break
            } catch (error) {
              lastError = error
              if (timedOut || abort.signal.aborted || sentAny) break
              if (attempt !== routes[routes.length - 1]) {
                fallbackReason = error instanceof Error ? error.message : String(error)
                console.error(`[${name}] 主路由 ${attempt.provider}/${attempt.model} 失败,尝试回退路由:`, error)
              }
            }
          }
          if (raw) {
            const parsed = parseOptimizerOutput(raw.text, mode)
            send({
              type: 'done',
              ...parsed,
              truncated: raw.truncated,
              provider: used.provider,
              model: used.model,
              fallbackUsed: used !== routes[0],
              ...(fallbackReason ? { fallbackReason } : {}),
            })
          } else if (timedOut) {
            send({
              type: 'error',
              error: `优化超时:${timeoutSec} 秒内未生成完毕。可在 设置 → 插件配置 → 提示词优化 中调高「超时时间」。`,
            })
          } else if (!abort.signal.aborted && lastError) {
            const message = lastError instanceof Error ? lastError.message : String(lastError)
            console.error(`[${name}] optimize failed:`, lastError)
            send({ type: 'error', error: message })
          }
        } finally {
          clearTimeout(timer)
        }
        res.end()
      } catch (error) {
        if (abort.signal.aborted) return // 客户端已断开,无需应答
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[${name}] optimize failed:`, error)
        writeJson(res, 502, { ok: false, error: message })
      }
  }

  /** 模型连通性测试:按同一套路由解析发一个 32 token 封顶的探活调用,20s 超时。结果(含失败)一律 200 返回,ok 标志区分。 */
  async function testHandler(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
      return
    }
    if (!assertTrustedOrigin(req, res)) return
    const body = await readBodyOrReply(req, res)
    if (!body) return
    const cfg = current()
    const route = await resolveRoute(ctx.llm, cfg.model, asOptionalString(body.provider), asOptionalString(body.model))
    if (!route) {
      writeJson(res, 409, {
        ok: false,
        error: '未找到可用模型:请先在 设置 → 模型 中配置提供方,或在 设置 → 插件配置 → 提示词优化 中固定一个模型',
      })
      return
    }
    const abort = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) abort.abort()
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      abort.abort()
    }, 20_000)
    const started = Date.now()
    try {
      const message: Message = {
        id: `prompt-optimizer-test-${crypto.randomUUID()}` as Message['id'],
        role: 'user',
        content: [{ type: 'text', text: 'ping' }],
        source: { kind: 'plugin', plugin: name },
      }
      const result = await collectText(
        ctx.llm.stream({ provider: route.provider, model: route.model, messages: [message], maxTokens: 32, signal: abort.signal }),
      )
      writeJson(res, 200, {
        ok: true,
        provider: route.provider,
        model: route.model,
        latencyMs: Date.now() - started,
        reply: result.text.slice(0, 80),
      })
    } catch (error) {
      if (timedOut) {
        writeJson(res, 200, { ok: false, error: '连接测试超时(20s 无响应)' })
      } else if (!abort.signal.aborted) {
        writeJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
