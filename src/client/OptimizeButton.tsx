import { useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型级引入,激活 'conversation.input.right' 的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SparkleIcon } from './SparkleIcon.js'
import { useT } from './i18n.js'
import type { OptimizerController } from './controller.js'

export type OptimizeButtonProps = PropsRuntime<'conversation.input.right'>

// 发送栏工具行按钮:对齐官方工具胶囊(指令/添加附件)的实测样式 —— 全圆角、
// 无边框、5% 中性浅底。注意两点:
// 1. 官方那个浅底(#f5f6f7)不是 dsw 令牌,这里用 label-primary 做 color-mix
//    等价近似,明暗主题都能得到同档的浅底;color-mix 不被支持时整条声明
//    失效、自然回落透明底(幽灵),不会出现灰块。
// 2. 之前用的 --dsw-alias-button-tool-bar-fill 在当前主题是 50% 灰
//    (#54555780),正是按钮显灰的主因。
const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 12px',
  fontSize: 12,
  lineHeight: '18px',
  borderRadius: 999,
  border: 'none',
  color: 'var(--dsw-alias-label-primary, inherit)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  // 宽度贴住内容,不预留「优化中…」的空位(用户反馈空闲态「优化」右侧空白);
  // 加载态文案不变、仅图标旋转,宽度恒定,工具行不抖动(U4 原目标改由
  // 恒定文案达成,minWidth 随之移除)。
  // 底色与 hover 态走注入样式表的 .dsh-po-opt 规则(inline 会盖过 :hover)。
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
        <button className="dsh-po-btn dsh-po-opt"
          type="button"
          style={{ ...buttonStyle, ...(empty || loading ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
          disabled={empty || loading}
          title={loading ? t('button.optimizing') : empty ? t('button.titleEmpty') : t('button.title')}
          onClick={() => void controller.optimize(draft, p.sessionId)}
        >
          <SparkleIcon spinning={loading} />
          {/* 文案恒为「优化」:宽度贴住内容,不再预留「优化中…」的空位(用户反馈
             空闲态右侧空白)。进行中由旋转图标 + title + 面板状态条表达,
             按钮宽度恒定,工具行不抖动。 */}
          {t('button.optimize')}
        </button>
      </span>
    )
  }
}
