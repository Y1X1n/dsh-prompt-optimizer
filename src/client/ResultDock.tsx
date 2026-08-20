import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型级引入,激活 'conversation.input.dock' 的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SparkleIcon } from './SparkleIcon.js'
import { shouldAutoClose, type OptimizerController } from './controller.js'
import { useT } from './i18n.js'

export type ResultDockProps = PropsRuntime<'conversation.input.dock'>

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非安全上下文(局域网 http)没有 clipboard API,走 textarea 兜底。
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** 全部走 Harness 设计令牌(--dsw-alias-*),明暗主题自动跟随;变量缺失时用括号内兜底值。 */
const styles = {
  panel: {
    marginBottom: 6,
    borderRadius: 10,
    border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3))',
    background: 'var(--dsw-alias-bg-layer-2, #202226)',
    color: 'var(--dsw-alias-label-primary, inherit)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    padding: '10px 12px',
    fontSize: 12.5,
    lineHeight: 1.5,
    fontFamily: 'var(--dsw-font-family, inherit)',
  } as const,
  header: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } as const,
  title: { fontWeight: 600, flex: 1 } as const,
  modelBadge: {
    fontSize: 11,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
    border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.25))',
    borderRadius: 999,
    padding: '0 8px',
  } as const,
  close: {
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary-dimmed, inherit)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
  } as const,
  body: { maxHeight: '26vh', overflowY: 'auto', paddingRight: 4 } as const,
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
    margin: '6px 0 2px',
  } as const,
  pre: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' } as const,
  optimizedBox: {
    background: 'var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.08))',
    borderRadius: 6,
    padding: '6px 8px',
  } as const,
  actions: { display: 'flex', gap: 8, marginTop: 8 } as const,
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))',
    background: 'var(--dsw-alias-button-tool-bar-fill, transparent)',
    color: 'var(--dsw-alias-label-primary, inherit)',
    cursor: 'pointer',
  } as const,
  primaryBtn: {
    background: 'var(--dsw-alias-button-primary-fill, #3b6ef6)',
    borderColor: 'transparent',
    color: 'var(--dsw-alias-label-primary-inverted, #fff)',
  } as const,
  errorText: { color: 'var(--dsw-alias-state-error-primary, #e5534b)', whiteSpace: 'pre-wrap' } as const,
  appliedHint: {
    alignSelf: 'center',
    fontSize: 12,
    color: 'var(--dsw-alias-state-success-primary, #2da44e)',
  } as const,
  warnText: {
    marginTop: 8,
    fontSize: 12,
    color: 'var(--dsw-alias-state-warn-primary, #d4a72c)',
  } as const,
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--dsw-alias-label-primary-dimmed, inherit)',
    padding: '8px 0',
  } as const,
}

/** 输入卡上方整行的结果面板:注册进 'conversation.input.dock',不遮挡输入框。 */
export function createResultDock(controller: OptimizerController) {
  return function OptimizerResultDock(props: ResultDockProps) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    const t = useT()
    const [copied, setCopied] = useState(false)
    // controller 是会话间共享的单例:面板只对发起优化的那个会话渲染,
    // 避免切会话后旧结果跟着飘过来、甚至误替换别的会话的输入框。
    const owns = state.open && state.last?.sessionId === props.sessionId

    useEffect(() => {
      if (!owns) return
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') controller.close()
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owns])

    // 发送即关闭:判定逻辑在 controller.shouldAutoClose(纯函数,有单测)。
    // 顺带限定 owns:其他会话的 dock 实例不得因自身状态变化影响本会话的撤回依据。
    const applied = state.applied
    const draft = props.input.draft
    const running = Boolean(props.session?.running)
    const queued = props.session?.queue?.length ?? 0
    const prevRef = useRef({ running, queued })
    useEffect(() => {
      const prev = prevRef.current
      prevRef.current = { running, queued }
      if (!owns) return
      if (shouldAutoClose({ open: true, status: state.status, draft, prevRunning: prev.running, running, prevQueued: prev.queued, queued })) {
        controller.close()
        return
      }
      // 撤回自动失效:替换后用户手动改过草稿(内容不再等于替换文本),
      // 撤回会覆盖用户编辑,此时撤掉撤回入口。
      if (applied && draft !== applied.text) controller.clearApplied()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, applied, owns, state.status, running, queued])

    // loading 期间的耗时读数:进入 loading 起每秒刷新,离开即停。
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
      if (state.status !== 'loading') return
      const started = Date.now()
      setElapsed(0)
      const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
      return () => clearInterval(timer)
    }, [state.status])

    if (!owns) return null
    const { result } = state
    // 阶段提示:首 token 前(等待响应)→ 分析诊断 → 输出优化稿,跟随流式段落推进。
    const stage = state.live?.optimized ? t('panel.stage.writing') : state.live?.analysis ? t('panel.stage.analyzing') : t('panel.stage.waiting')

    const onCopy = async () => {
      if (!result) return
      setCopied(await copyText(result.optimized))
      setTimeout(() => setCopied(false), 1500)
    }
    const onReplace = () => {
      if (!result) return
      // 面板保持打开进入「已替换」态,撤回依据 = 替换前的原文。
      // 斜杠命令前缀拼回:优化只针对正文,命令词原样保留;
      // applied.text 必须是替换后的完整草稿(含前缀),否则撤回失效检测会误判为用户编辑。
      const nextDraft = state.last?.prefix ? `${state.last.prefix} ${result.optimized}` : result.optimized
      controller.markApplied({ backup: props.input.draft, text: nextDraft })
      props.inputActions.setDraft(nextDraft)
    }
    const onUndo = () => {
      if (!applied) return
      props.inputActions.setDraft(applied.backup)
      controller.clearApplied()
    }

    return (
      <div style={styles.panel} role="dialog" aria-label={t('panel.aria')}>
        <div style={styles.header}>
          <SparkleIcon size={15} />
          <span style={styles.title}>{t('panel.title')}</span>
          {result && (
            <span style={styles.modelBadge}>
              {result.provider} / {result.model}
              {result.fallbackUsed ? ` · ${t('panel.fallback')}` : ''}
              {typeof result.durationMs === 'number' ? ` · ${t('panel.duration')} ${(result.durationMs / 1000).toFixed(1)}s` : ''}
            </span>
          )}
          <button type="button" style={styles.close} title={t('panel.closeTitle')} onClick={() => controller.close()}>
            ✕
          </button>
        </div>

        {state.status === 'loading' && (
          <>
            <div style={styles.loading}>
              <SparkleIcon spinning />
              {stage}…({elapsed}s,{t('panel.escCancel')})
            </div>
            {state.live && (state.live.analysis || state.live.optimized) && (
              <div style={styles.body}>
                {state.live.analysis && (
                  <>
                    <div style={styles.sectionTitle}>{t('panel.analysis')}</div>
                    <pre style={styles.pre}>{state.live.analysis}</pre>
                  </>
                )}
                {state.live.optimized && (
                  <>
                    <div style={styles.sectionTitle}>{t('panel.optimized')}</div>
                    <div style={styles.optimizedBox}>
                      <pre style={styles.pre}>{state.live.optimized}</pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {state.status === 'error' && (
          <>
            <div style={styles.sectionTitle}>{t('panel.error')}</div>
            <div style={styles.errorText}>{state.error}</div>
            <div style={styles.actions}>
              <button type="button" style={styles.actionBtn} onClick={() => controller.retry()}>
                {t('panel.retry')}
              </button>
              <button type="button" style={styles.actionBtn} onClick={() => controller.close()}>
                {t('panel.close')}
              </button>
            </div>
          </>
        )}

        {state.status === 'done' && result && (
          <>
            <div style={styles.body}>
              {result.analysis && (
                <>
                  <div style={styles.sectionTitle}>{t('panel.analysis')}</div>
                  <pre style={styles.pre}>{result.analysis}</pre>
                </>
              )}
              <div style={styles.sectionTitle}>{t('panel.optimized')}</div>
              <div style={styles.optimizedBox}>
                <pre style={styles.pre}>{result.optimized}</pre>
              </div>
              {result.truncated && <div style={styles.warnText}>{t('panel.truncated')}</div>}
              {!result.wellFormed && <div style={styles.warnText}>{t('panel.notWellFormed')}</div>}
            </div>
            <div style={styles.actions}>
              {applied ? (
                <>
                  <span style={styles.appliedHint}>{t('panel.applied')}</span>
                  <button type="button" style={{ ...styles.actionBtn, ...styles.primaryBtn }} onClick={onUndo}>
                    {t('panel.undo')}
                  </button>
                  <button type="button" style={styles.actionBtn} onClick={() => controller.retry()}>
                    {t('panel.reoptimize')}
                  </button>
                  <button type="button" style={styles.actionBtn} onClick={() => controller.close()}>
                    {t('panel.close')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" style={{ ...styles.actionBtn, ...styles.primaryBtn }} onClick={onReplace}>
                    {t('panel.replace')}
                  </button>
                  <button type="button" style={styles.actionBtn} onClick={onCopy}>
                    {copied ? t('panel.copied') : t('panel.copy')}
                  </button>
                  <button type="button" style={styles.actionBtn} onClick={() => controller.retry()}>
                    {t('panel.reoptimize')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    )
  }
}
