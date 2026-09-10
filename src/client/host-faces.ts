/**
 * 与宿主客户端服务对接的最小结构面(版本稳定的自有定义)。
 *
 * 背景:0.1.x 各版本间上游类型多次搬家——`dsh-client-runtime` 在 0.1.2 被并包移除,
 * `HistoryEntry` / `ModelProviderGroup` 迁往未发布的 `dsh-api-session-controller`。
 * 插件因此自带结构定义:只声明实际消费的字段,不追着上游类型跑,跨版本稳定。
 */

/** 会话历史条目的最小结构面(只消费 `event.type` / `event.data`)。 */
export interface OptimizerHistoryEntry {
  event?: { type?: unknown; data?: unknown }
}

/** 会话当前模型选择(provider/model + 可选推理强度)。 */
export interface OptimizerSessionSelection {
  provider?: string
  model?: string
  reasoningEffort?: string
}

/** 模型目录分组(设置卡下拉用)。 */
export interface OptimizerModelGroup {
  id: string
  name: string
  models: readonly { id: string; name: string }[]
}

/** 连接层 RPC 的统一结果包络。 */
export interface OptimizerRpcResult<T> {
  result: { ok: true; value: T } | { ok: false; error?: unknown }
}

/**
 * 旧版 `connection.api.*` 会话/目录查询面。
 *
 * 上游发布版(0.1.0-rc.7 → 0.1.5)从未在 `ConnectionHandle` 上声明过 `api`,
 * 浏览器端运行时同样不提供该属性:调用会抛 TypeError,并由各调用方的
 * try/catch 捕获,分别降级为「Host 回退解析模型路由 / 无上下文优化」
 * (Console 里对应「会话模型查询失败」「会话历史查询失败」两条警告)。
 * 这里保留为可选结构面——行为与旧版一致,类型与实际对齐;
 * 宿主未来若恢复该面,无需改动即可重新生效。
 */
export interface LegacySessionQueryFace {
  api?: {
    sessions?: {
      models(args: { sessionId: string }, signal?: AbortSignal): Promise<OptimizerRpcResult<{ current: OptimizerSessionSelection }>>
      history(args: { sessionId: string; maxMessages?: number }, signal?: AbortSignal): Promise<OptimizerRpcResult<{ events?: readonly OptimizerHistoryEntry[] }>>
    }
    llm?: {
      models(args?: unknown, signal?: AbortSignal): Promise<OptimizerRpcResult<{ groups: OptimizerModelGroup[] }>>
    }
  }
}

/** 读取旧版查询面(整体缺席时返回 undefined,调用方各自降级)。 */
export function legacyQueryFace(connection: unknown): LegacySessionQueryFace['api'] {
  return (connection as LegacySessionQueryFace | undefined)?.api
}
