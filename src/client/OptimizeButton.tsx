import { useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型级引入,激活 'conversation.input.right' 的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SparkleIcon } from './SparkleIcon.js'
import { useT } from './i18n.js'
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
  // U4:预留最宽文案(「优化中…」/「Optimizing…」)的宽度,状态切换不引起工具栏抖动。
  minWidth: 92,
} as const

/** 发送栏工具行右区的触发按钮;结果面板由 conversation.input.dock 槽位的 Dock 渲染。 */
export function createOptimizeButton(controller: OptimizerController) {
  return function OptimizeButton(props: OptimizeButtonProps) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    const t = useT()
    // 输入状态的两种宿主形态:0.1.2 起渲染器提供 useInput standard hook;
    // 旧版(0.1.0-rc.x/0.1.1-rc.x)渲染器直传 input 快照对象。
    const p = props as OptimizeButtonProps & {
      useInput?: (selector: (s: unknown) => unknown) => unknown
      input?: { draft?: string }
      sessionId?: string
    }
    const input = p.useInput ? (p.useInput((s: unknown) => s) as { draft?: string }) : p.input
    const draft = input?.draft ?? ''
    const empty = !draft.trim()
    const loading = state.status === 'loading'

    return (
      <span style={{ display: 'inline-flex' }}>
        <button className="dsh-po-btn"
          type="button"
          style={{ ...buttonStyle, ...(empty || loading ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
          disabled={empty || loading}
          title={empty ? t('button.titleEmpty') : t('button.title')}
          onClick={() => void controller.optimize(draft, p.sessionId)}
        >
          <SparkleIcon spinning={loading} />
          {loading ? t('button.optimizing') : t('button.optimize')}
        </button>
      </span>
    )
  }
}
