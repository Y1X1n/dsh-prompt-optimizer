import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { HistoryEntry, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { capConversationContext, compactPartialBuffer, parsePartialOptimizerOutput, type ConversationTurn } from '../prompt.js'

export interface OptimizeResult {
  analysis: string
  optimized: string
  wellFormed: boolean
  truncated: boolean
  provider: string
  model: string
  /** 主路由失败、实际由回退路由产出时为 true。 */
  fallbackUsed: boolean
  /** O12:触发回退的主路由失败原因(回退未发生时为空),用于徽章 tooltip。 */
  fallbackReason?: string
  /** 从点击到 done 的客户端实测耗时(毫秒),含会话查询与排队等待。 */
  durationMs?: number
}

export interface OptimizerState {
  open: boolean
  /** cancelled = loading 中被用户取消(O2):面板保持打开,冻结展示已生成的部分。 */
  status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled'
  error: string | null
  result: OptimizeResult | null
  /** 流式进行中的分段实况,仅 loading/cancelled 期间有值(cancelled 时为取消瞬间的定格)。 */
  live: { analysis: string; optimized: string } | null
  /** 最近一次成功发起的请求,供「重新优化」复用;prefix 为斜杠命令前缀(替换时拼回)。 */
  last: { text: string; sessionId: SessionId; prefix?: string } | null
  /** 「替换输入框」后的撤回依据:替换前的原文 + 替换后的文本(用于检测用户编辑)。 */
  applied: { backup: string; text: string } | null
}

const ROUTE = '/dsh-prompt-optimizer/optimize'

const INITIAL: OptimizerState = { open: false, status: 'idle', error: null, result: null, live: null, last: null, applied: null }

/**
 * 拆斜杠命令前缀:「/goal 帮我……」只优化正文,替换时拼回前缀,避免命令词被改写。
 * 正文为空(只敲了命令,如 "/goal")时返回 commandOnly:true,调用方直接提示、
 * 不发请求(O11:把命令词本身拿去优化只会得到垃圾输出);不像命令(如 /path/to/file)不拆。
 */
export function splitCommandPrefix(text: string): { prefix?: string; body: string; commandOnly?: boolean } {
  const trimmed = text.trim()
  const match = /^(\/[A-Za-z][\w-]*)(?:\s+([\s\S]+))?$/.exec(trimmed)
  if (!match) return { body: trimmed }
  if (!match[2] || !match[2].trim()) return { body: trimmed, commandOnly: true }
  return { prefix: match[1], body: match[2].trim() }
}

/**
 * 发送即关闭面板的判定(纯函数,便于测试)。三条信号任一命中即认为消息已发出:
 * 草稿被清空(直发/入队都会清,用户手动清空同理——面板引用的草稿已不存在)、
 * 会话开始运行(直发)、队列变长(忙时入队)。
 * loading(优化中)期间一律不关:发送/清空不应误中止在跑的优化,取消走 Esc。
 */
export function shouldAutoClose(input: {
  open: boolean
  status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled'
  draft: string
  prevRunning: boolean
  running: boolean
  prevQueued: number
  queued: number
}): boolean {
  if (!input.open || input.status === 'loading') return false
  return !input.draft.trim() || (!input.prevRunning && input.running) || input.queued > input.prevQueued
}

/** 摊平 content blocks 为纯文本(图片等非文本块对优化意图无帮助,忽略)。 */
function flattenText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) =>
      block && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
        ? String((block as { text?: unknown }).text ?? '')
        : '',
    )
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * 上下文取样:用户消息优先保底。真实 agentic 会话里最近的消息往往是成串的
 * assistant 步骤碎片(实测一个 30 条消息的会话只有 5 条用户消息),纯按时间取
 * 最近 N 条会把用户的真实诉求挤出上下文。取「最近 4 条用户消息 + 最近 4 条助手
 * 回复」按原始顺序合并(总量 ≤8,不再触发条数裁剪),再交预算收敛。
 */
function sampleContextTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const users = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === 'user').slice(-4)
  const assistants = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === 'assistant').slice(-4)
  const merged = [...users, ...assistants].sort((a, b) => a.i - b.i).map((x) => x.t)
  return capConversationContext(merged)
}

/**
 * 从 session.history 事件页提取优化上下文:真实用户输入(user/message 且
 * source.kind 为 'user',排除插件/系统注入的 user 角色消息)+ 助手回复
 * (assistant/message,跳过只承载 usage 的空壳消息)。返回按时间升序,
 * 已按共享预算收敛(用户消息保底 4 条,总量 ≤8 条 / 1600 字符)。
 */
export function extractContextTurns(entries: readonly HistoryEntry[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  for (const entry of entries) {
    const event = entry?.event
    if (!event || typeof event !== 'object') continue
    if (event.type === 'user/message') {
      const data = event.data as { source?: { kind?: unknown }; content?: unknown }
      if (data?.source?.kind !== 'user') continue
      const text = flattenText(data.content)
      if (text) turns.push({ role: 'user', text })
    } else if (event.type === 'assistant/message') {
      const data = event.data as { message?: { content?: unknown } }
      const text = flattenText(data?.message?.content)
      if (text) turns.push({ role: 'assistant', text })
    }
  }
  return sampleContextTurns(turns)
}

/**
 * 按钮(conversation.input.right)与结果面板(conversation.input.dock)
 * 共享的状态容器:apply 闭包内创建,两个槽位组件各自 useSyncExternalStore 订阅。
 * opts.isModelPinned:设置里固定了模型时返回 true(Host 固定值优先,
 * 会话模型查询的结果反正用不上,跳过可省一次 RPC 往返)。
 * opts.isContextEnabled:设置里关闭「携带上下文」时返回 false,
 * 跳过会话历史查询;默认开启。
 */
export function createOptimizerController(
  ctx: ClientContext,
  opts: {
    isModelPinned?: () => boolean
    isContextEnabled?: () => boolean
    /** 快速模式(与 Host 归一化口径一致:仅 mode==='fast' 为真)。决定无标记流是否可直接预览。 */
    isFastMode?: () => boolean
    /**
     * R21 客户端超时看门狗的总时长(毫秒)。由入口按设置里的 timeoutSeconds 计算
     * (设置秒数 × 1000 + 5s 余量);缺省 125s。看门狗兜底 Host 挂死/网络黑洞——
     * 正常情况下 Host 会先到超时并以 error 事件返回更友好的文案。
     */
    getWatchdogMs?: () => number
  } = {},
) {
  let state: OptimizerState = INITIAL
  const listeners = new Set<() => void>()
  let abort: AbortController | null = null
  // 流式实况的合帧缓冲:delta 碎(实测 2 字符一帧),每帧都 set 会让面板
  // 整树重渲染数千次。攒 50ms 刷一次,人眼无感、滚动不卡。
  let liveRaw = ''
  // R14:OPTIMIZED 标记确认后缓冲被压缩,分析段在此定格(压缩后解析不出 analysis)。
  let frozenAnalysis = ''
  let liveTimer: ReturnType<typeof setTimeout> | null = null

  const clearLiveTimer = () => {
    if (liveTimer) {
      clearTimeout(liveTimer)
      liveTimer = null
    }
  }

  const set = (patch: Partial<OptimizerState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  async function optimize(text: string, sessionId: SessionId) {
    // 斜杠命令只优化正文;前缀记入 last,「替换输入框」时拼回(ResultDock 负责)。
    const split = splitCommandPrefix(text)
    const { prefix, body: draft } = split
    if (!draft || state.status === 'loading') return
    // O11:只有命令没有正文——把命令词拿去优化只会得到垃圾输出,直接提示不发请求。
    if (split.commandOnly) {
      set({
        open: true,
        status: 'error',
        error: '检测到斜杠命令但没有正文:请先输入要优化的内容。',
        live: null,
        last: { text: draft, sessionId },
      })
      return
    }
    // 轻量记忆链:同一会话已有优化结果、且本轮草稿较上轮发生了变化(用户在我们
    // 的产物上继续编辑)时,把上轮结果作为延续参考传给模型;发送即关闭面板会清掉
    // result,记忆链自然归零。同文重试(retry)不带——那是重新生成,不是迭代。
    // 跟随「携带上下文」开关:关闭后不带任何会话衍生材料;上轮格式退化
    // (wellFormed=false,可能混入多余文字)的结果也不传,避免噪声延续。
    // 注意:必须在下面 set(loading) 之前读旧 state。
    const previous =
      state.result &&
      state.result.wellFormed &&
      state.last?.sessionId === sessionId &&
      state.last.text !== draft &&
      (opts.isContextEnabled?.() ?? true)
        ? state.result.optimized
        : undefined
    abort?.abort()
    clearLiveTimer()
    liveRaw = ''
    frozenAnalysis = ''
    const controller = new AbortController()
    abort = controller
    // R21 客户端超时看门狗:Host 进程挂死或网络黑洞时,SSE 可能永远不返回首字节,
    // 客户端不能无限转圈。超时触发 abort 并落 error;用户主动取消走 cancel()/close()。
    const watchdogMs = Math.max(1_000, opts.getWatchdogMs?.() ?? 125_000)
    let clientTimedOut = false
    const watchdog = setTimeout(() => {
      clientTimedOut = true
      controller.abort()
    }, watchdogMs)
    // 看门狗触发的超时落明确错误(fetch 抛异常与读流静默结束两条路都要覆盖);
    // 用户主动取消/关闭的状态由 cancel()/close() 负责。
    const failTimeout = () => {
      clearLiveTimer()
      const seconds = Math.round(watchdogMs / 1000)
      set({
        status: 'error',
        live: null,
        error: `请求超时(客户端 ${seconds} 秒无响应,Host 可能未运行)。可在 设置 → 插件配置 → 提示词优化 中调高「超时时间」。`,
      })
    }
    // 从点击起计时(含会话查询与首 token 前的等待),done 时记入 result 展示。
    const startedAt = Date.now()
    set({ open: true, status: 'loading', error: null, live: { analysis: '', optimized: '' }, last: { text: draft, sessionId, prefix }, applied: null })
    try {
      // 复用当前会话的模型选择(每次点击实时查询,会话里换模型立即生效);
      // 查询失败时交给 Host 端回退解析。设置里固定了模型时跳过:Host 端
      // 固定值优先,查询结果用不上,省一次 RPC 往返。
      // 会话近期对话作为优化上下文(避免脱离语境「南辕北辙」);与模型查询
      // 相互独立,并行拉取,各自失败各自降级,不阻塞主流程。
      const [selection, context] = await Promise.all([
        (async (): Promise<{ provider?: string; model?: string; reasoningEffort?: string } | undefined> => {
          if (opts.isModelPinned?.()) return undefined
          try {
            const resp = await ctx.connection.api.sessions.models({ sessionId }, controller.signal)
            if (resp.result.ok) {
              const current = resp.result.value.current
              return { provider: current.provider, model: current.model, reasoningEffort: current.reasoningEffort }
            }
            console.warn('[dsh-prompt-optimizer] 会话模型查询被拒绝,改用 Host 回退:', resp.result.error)
          } catch (cause) {
            console.warn('[dsh-prompt-optimizer] 会话模型查询失败,改用 Host 回退:', cause)
          }
          return undefined
        })(),
        (async (): Promise<ConversationTurn[] | undefined> => {
          if (!(opts.isContextEnabled?.() ?? true)) return undefined
          try {
            // 页大小放宽到 24:agentic 会话里 assistant 步骤消息远多于用户消息,
            // 取样要保证能捞到最近 4 条用户输入(见 sampleContextTurns)。
            const resp = await ctx.connection.api.sessions.history({ sessionId, maxMessages: 24 }, controller.signal)
            if (resp.result.ok) {
              const turns = extractContextTurns(resp.result.value.events)
              return turns.length ? turns : undefined
            }
            console.warn('[dsh-prompt-optimizer] 会话历史查询被拒绝,按无上下文优化:', resp.result.error)
          } catch (cause) {
            console.warn('[dsh-prompt-optimizer] 会话历史查询失败,按无上下文优化:', cause)
          }
          return undefined
        })(),
      ])
      const resp = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: draft, provider: selection?.provider, model: selection?.model, reasoningEffort: selection?.reasoningEffort, context, previous }),
        signal: controller.signal,
      })
      // 预校验失败(400/405/409/413/502)仍是普通 JSON;成功则进入 SSE 流。
      if (!resp.ok || !(resp.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const data = await resp.json().catch(() => null)
        if (!controller.signal.aborted) {
          set({ status: 'error', live: null, error: String(data?.error ?? `请求失败(HTTP ${resp.status})`) })
        }
        return
      }
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('当前环境不支持流式响应')
      const decoder = new TextDecoder()
      let buffer = ''
      let terminal = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const line = frame.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>
          if (event.type === 'delta') {
            liveRaw += String(event.text ?? '')
            if (!liveTimer) {
              liveTimer = setTimeout(() => {
                liveTimer = null
                // 仅在仍是当前请求的 loading 期间落帧(竞态:retry/close 后旧定时器不得复活)。
                if (state.status === 'loading' && abort === controller) {
                  // R14:OPTIMIZED 标记确认后压缩缓冲,分析段定格(只发生一次),
                  // 长输出下缓冲与每帧扫描都收敛到尾部窗口。
                  const comp = compactPartialBuffer(liveRaw)
                  if (comp.compacted !== null) {
                    frozenAnalysis = comp.analysis
                    liveRaw = comp.compacted
                  }
                  const partial = parsePartialOptimizerOutput(liveRaw)
                  const live = { analysis: partial.analysis || frozenAnalysis, optimized: partial.optimized }
                  // 快速模式 + 模型不输出标记:解析不出任何段落时,原始流即优化稿本身,
                  // 直接实时预览(整段空等到 done 比看到逐字增长糟得多)。缓冲里出现
                  // 「<<<」视为标记正在形成,交回正常解析,避免把半个标记闪进预览。
                  if (opts.isFastMode?.() && !live.analysis && !live.optimized && liveRaw.trim() && !liveRaw.includes('<<<')) {
                    live.optimized = liveRaw.trim()
                  }
                  set({ live })
                }
              }, 50)
            }
          } else if (event.type === 'done') {
            terminal = true
            clearLiveTimer()
            set({
              status: 'done',
              live: null,
              result: {
                analysis: String(event.analysis ?? ''),
                optimized: String(event.optimized ?? ''),
                wellFormed: event.wellFormed !== false,
                truncated: event.truncated === true,
                provider: String(event.provider ?? ''),
                model: String(event.model ?? ''),
                fallbackUsed: event.fallbackUsed === true,
                fallbackReason: typeof event.fallbackReason === 'string' && event.fallbackReason ? event.fallbackReason : undefined,
                durationMs: Date.now() - startedAt,
              },
            })
          } else if (event.type === 'error') {
            terminal = true
            clearLiveTimer()
            set({ status: 'error', live: null, error: String(event.error ?? '未知错误') })
          }
        }
      }
      if (!terminal) {
        if (!controller.signal.aborted) {
          clearLiveTimer()
          set({ status: 'error', live: null, error: '连接中断:响应流提前结束' })
        } else if (clientTimedOut && abort === controller) {
          failTimeout()
        }
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        if (clientTimedOut && abort === controller) failTimeout()
        return
      }
      set({ status: 'error', live: null, error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      clearTimeout(watchdog)
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => state,
    optimize,
    retry() {
      if (state.last) void optimize(state.last.text, state.last.sessionId)
    },
    markApplied(applied: { backup: string; text: string }) {
      set({ applied })
    },
    clearApplied() {
      if (state.applied) set({ applied: null })
    },
    close() {
      abort?.abort()
      abort = null
      clearLiveTimer()
      set({ ...INITIAL })
    },
    /**
     * O2:loading 中取消(Esc)。与 close 不同:中止请求但不清空状态,
     * 面板定格展示已生成的部分——用户等了几十秒的内容不应一键蒸发。
     * 后续可「重新优化」续跑或「关闭」彻底收起。
     */
    cancel() {
      if (state.status !== 'loading') return
      abort?.abort()
      abort = null
      clearLiveTimer()
      set({ status: 'cancelled' })
    },
  }
}

export type OptimizerController = ReturnType<typeof createOptimizerController>
