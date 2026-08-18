import { useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型级引入,激活 'conversation.input.right' 的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SparkleIcon } from './SparkleIcon.js'
import type { OptimizerController } from './controller.js'

export type OptimizeButtonProps = PropsRuntime<'conversation.input.right'>

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  fontSize: 12,
  lineHeight: '18px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
  background: 'var(--dsw-alias-button-tool-bar-fill, transparent)',
  color: 'var(--dsw-alias-label-primary, inherit)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
} as const

/** 发送栏工具行右区的触发按钮;结果面板由 composer.dock 槽位的 Dock 渲染。 */
export function createOptimizeButton(controller: OptimizerController) {
  return function OptimizeButton(props: OptimizeButtonProps) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    const draft = props.input.draft
    const empty = !draft.trim()
    const loading = state.status === 'loading'

    return (
      <span style={{ display: 'inline-flex' }}>
        <button
          type="button"
          style={{ ...buttonStyle, ...(empty || loading ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
          disabled={empty || loading}
          title={empty ? '先在输入框输入提示词' : '分析并优化当前输入的提示词'}
          onClick={() => void controller.optimize(draft, props.sessionId)}
        >
          <SparkleIcon spinning={loading} />
          {loading ? '优化中…' : '优化'}
        </button>
      </span>
    )
  }
}
