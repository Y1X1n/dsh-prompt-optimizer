import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { parsePartialOptimizerOutput } from '../prompt.js'

export interface OptimizeResult {
  analysis: string
  optimized: string
  wellFormed: boolean
  truncated: boolean
  provider: string
  model: string
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
}

const ROUTE = '/dsh-prompt-optimizer/optimize'

const INITIAL: OptimizerState = { open: false, status: 'idle', error: null, result: null, live: null, last: null }

/**
 * 按钮(conversation.input.right)与结果面板(conversation.input.dock)
 * 共享的状态容器:apply 闭包内创建,两个槽位组件各自 useSyncExternalStore 订阅。
 */
export function createOptimizerController(ctx: ClientContext) {
  let state: OptimizerState = INITIAL
  const listeners = new Set<() => void>()
  let abort: AbortController | null = null

  const set = (patch: Partial<OptimizerState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  async function optimize(text: string, sessionId: SessionId) {
    const draft = text.trim()
    if (!draft || state.status === 'loading') return
    abort?.abort()
    const controller = new AbortController()
    abort = controller
    set({ open: true, status: 'loading', error: null, live: { analysis: '', optimized: '' }, last: { text: draft, sessionId } })
    try {
      // 复用当前会话的模型选择(每次点击实时查询,会话里换模型立即生效);
      // 查询失败时交给 Host 端回退解析。
      let provider: string | undefined
      let model: string | undefined
      let reasoningEffort: string | undefined
      try {
        const resp = await ctx.connection.api.sessions.models({ sessionId }, controller.signal)
        if (resp.result.ok) {
          provider = resp.result.value.current.provider
          model = resp.result.value.current.model
          reasoningEffort = resp.result.value.current.reasoningEffort
        } else {
          console.warn('[dsh-prompt-optimizer] 会话模型查询被拒绝,改用 Host 回退:', resp.result.error)
        }
      } catch (cause) {
        console.warn('[dsh-prompt-optimizer] 会话模型查询失败,改用 Host 回退:', cause)
      }
      const resp = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: draft, provider, model, reasoningEffort }),
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
      let raw = ''
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
            raw += String(event.text ?? '')
            set({ live: parsePartialOptimizerOutput(raw) })
          } else if (event.type === 'done') {
            terminal = true
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
              },
            })
          } else if (event.type === 'error') {
            terminal = true
            set({ status: 'error', live: null, error: String(event.error ?? '未知错误') })
          }
        }
      }
      if (!terminal && !controller.signal.aborted) {
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
    close() {
      abort?.abort()
      abort = null
      set({ ...INITIAL })
    },
  }
}

export type OptimizerController = ReturnType<typeof createOptimizerController>
