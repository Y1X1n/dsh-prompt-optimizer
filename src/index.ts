import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildSystemPrompt, buildUserPayload, estimateTokens, parseOptimizerOutput, type OptimizerMode, type OutputLanguage } from './prompt.js'

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
  /** 推理强度('session'/'lowest';其他值按 'session' 处理)。 */
  reasoningEffort: string
  /** 采样温度(0-2,默认 0.2);优化是格式化任务,低温输出更稳定。 */
  temperature: number
  /** 输出上限跟随输入长度(默认开):长草稿时按输入 token 估算提高 maxTokens,避免截断。 */
  autoMaxTokens: boolean
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
  reasoningEffort: Schema.string().default('session'),
  temperature: Schema.number().min(0).max(2).default(0.2),
  autoMaxTokens: Schema.boolean().default(true),
})

const NS = settingsNamespace('prompt-optimizer')
const ROUTE_PATH = '/dsh-prompt-optimizer/optimize'
const TEST_ROUTE_PATH = '/dsh-prompt-optimizer/test-model'
const MAX_BODY_BYTES = 256 * 1024

interface OptimizeRequestBody {
  text?: unknown
  provider?: unknown
  model?: unknown
  reasoningEffort?: unknown
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function writeJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
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
  // 设置页命名空间:组合层配置作为 base,用户在 设置→插件配置 中的修改实时生效。
  let current = (): Config => config
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })

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
        // 宽松 schema 的配套归一化:未知枚举值一律回落默认,保证旧版设置文档可用。
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

        const message: Message = {
          id: `prompt-optimizer-${crypto.randomUUID()}` as Message['id'],
          role: 'user',
          content: [{ type: 'text', text: buildUserPayload(text, language) }],
          source: { kind: 'plugin', plugin: name },
        }
        const system = buildSystemPrompt(language, mode)
        // 输出上限跟随输入长度:优化结果体量与草稿正相关(完整模式还多一段分析),
        // 长草稿撞固定上限会被截断。取配置值与「输入估算 × 模式系数」的较大者,32768 封顶。
        const maxTokens =
          cfg.autoMaxTokens === false
            ? cfg.maxTokens
            : Math.min(32768, Math.max(cfg.maxTokens, Math.ceil(estimateTokens(text) * (mode === 'fast' ? 1.5 : 2))))
        // 推理强度:默认透传会话选择;配置「最低档」时钳到该模型支持的最低
        // effort(优化是格式化元任务,高推理只会拉长首 token 前的空等),按路由逐次解析。
        // 无法确定最低档(目录失败/模型不暴露推理)时回退到会话值,不冒险乱发。
        const sessionEffort = asOptionalString(body.reasoningEffort)

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
              if (cfg.reasoningEffort === 'lowest') {
                effort = (await resolveLowestEffort(ctx.llm, attempt.provider, attempt.model)) ?? sessionEffort
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
                console.error(`[${name}] 主路由 ${attempt.provider}/${attempt.model} 失败,尝试回退路由:`, error)
              }
            }
          }
          if (raw) {
            const parsed = parseOptimizerOutput(raw.text)
            send({
              type: 'done',
              ...parsed,
              truncated: raw.truncated,
              provider: used.provider,
              model: used.model,
              fallbackUsed: used !== routes[0],
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
