import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'

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
  /** 最近一次成功发起的请求,供「重新优化」复用。 */
  last: { text: string; sessionId: SessionId } | null
}

const ROUTE = '/dsh-prompt-optimizer/optimize'

const INITIAL: OptimizerState = { open: false, status: 'idle', error: null, result: null, last: null }

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
    set({ open: true, status: 'loading', error: null, last: { text: draft, sessionId } })
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
      const data = await resp.json().catch(() => null)
      if (controller.signal.aborted) return
      if (data?.ok) {
        set({
          status: 'done',
          result: {
            analysis: data.analysis ?? '',
            optimized: data.optimized ?? '',
            wellFormed: data.wellFormed !== false,
            truncated: data.truncated === true,
            provider: String(data.provider ?? ''),
            model: String(data.model ?? ''),
          },
        })
      } else {
        set({ status: 'error', error: String(data?.error ?? `请求失败(HTTP ${resp.status})`) })
      }
    } catch (cause) {
      if (controller.signal.aborted) return
      set({ status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
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
