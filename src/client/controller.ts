import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { HistoryEntry, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { capConversationContext, parsePartialOptimizerOutput, type ConversationTurn } from '../prompt.js'

export interface OptimizeResult {
  analysis: string
  optimized: string
  wellFormed: boolean
  truncated: boolean
  provider: string
  model: string
  /** 主路由失败、实际由回退路由产出时为 true。 */
  fallbackUsed: boolean
}

export interface OptimizerState {
  open: boolean
  status: 'idle' | 'loading' | 'done' | 'error'
  error: string | null
  result: OptimizeResult | null
  /** 流式进行中的分段实况,仅 loading 期间有值。 */
  live: { analysis: string; optimized: string } | null
  /** 最近一次成功发起的请求,供「重新优化」复用。 */
  last: { text: string; sessionId: SessionId } | null
  /** 「替换输入框」后的撤回依据:替换前的原文 + 替换后的文本(用于检测用户编辑)。 */
  applied: { backup: string; text: string } | null
}

const ROUTE = '/dsh-prompt-optimizer/optimize'

const INITIAL: OptimizerState = { open: false, status: 'idle', error: null, result: null, live: null, last: null, applied: null }

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
 * 从 session.history 事件页提取优化上下文:真实用户输入(user/message 且
 * source.kind 为 'user',排除插件/系统注入的 user 角色消息)+ 助手回复
 * (assistant/message,跳过只承载 usage 的空壳消息)。返回按时间升序,
 * 已按共享预算收敛(最近 8 条 / 1600 字符)。
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
  return capConversationContext(turns)
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
  opts: { isModelPinned?: () => boolean; isContextEnabled?: () => boolean } = {},
) {
  let state: OptimizerState = INITIAL
  const listeners = new Set<() => void>()
  let abort: AbortController | null = null
  // 流式实况的合帧缓冲:delta 碎(实测 2 字符一帧),每帧都 set 会让面板
  // 整树重渲染数千次。攒 50ms 刷一次,人眼无感、滚动不卡。
  let liveRaw = ''
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
    const draft = text.trim()
    if (!draft || state.status === 'loading') return
    abort?.abort()
    clearLiveTimer()
    liveRaw = ''
    const controller = new AbortController()
    abort = controller
    set({ open: true, status: 'loading', error: null, live: { analysis: '', optimized: '' }, last: { text: draft, sessionId }, applied: null })
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
            const resp = await ctx.connection.api.sessions.history({ sessionId, maxMessages: 12 }, controller.signal)
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
        body: JSON.stringify({ text: draft, provider: selection?.provider, model: selection?.model, reasoningEffort: selection?.reasoningEffort, context }),
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
                  set({ live: parsePartialOptimizerOutput(liveRaw) })
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
              },
            })
          } else if (event.type === 'error') {
            terminal = true
            clearLiveTimer()
            set({ status: 'error', live: null, error: String(event.error ?? '未知错误') })
          }
        }
      }
      if (!terminal && !controller.signal.aborted) {
        clearLiveTimer()
        set({ status: 'error', live: null, error: '连接中断:响应流提前结束' })
      }
    } catch (cause) {
      if (controller.signal.aborted) return
      set({ status: 'error', live: null, error: cause instanceof Error ? cause.message : String(cause) })
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
  }
}

export type OptimizerController = ReturnType<typeof createOptimizerController>
