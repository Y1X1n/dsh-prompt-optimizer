import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-client-connection/client'

/** 与 Host 侧 Config 对应的设置分节形状(仅客户端使用)。 */
export interface OptimizerSettingsValue {
  language?: 'zh' | 'en'
  /** '' = 跟随当前会话;否则 'provider/model'。 */
  model?: string
  maxTokens?: number
  /** 单次优化调用的超时时间(秒)。 */
  timeoutSeconds?: number
}

/** 模型下拉的“跟随会话”取值。 */
export const FOLLOW_SESSION = ''

const styles = {
  card: {
    border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3))',
    borderRadius: 10,
    padding: '14px 16px',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--dsw-alias-label-primary, inherit)',
    fontFamily: 'var(--dsw-font-family, inherit)',
  } as const,
  title: { fontSize: 14, fontWeight: 600, marginBottom: 2 } as const,
  desc: { color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))', marginBottom: 12 } as const,
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as const,
  label: { width: 110, flexShrink: 0, color: 'var(--dsw-alias-label-primary, inherit)' } as const,
  input: {
    flex: 1,
    maxWidth: 320,
    padding: '4px 8px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))',
    background: 'var(--dsw-alias-bg-layer-1, transparent)',
    color: 'var(--dsw-alias-label-primary, inherit)',
  } as const,
  hint: { color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))', fontSize: 12 } as const,
  fieldError: { color: 'var(--dsw-alias-state-error-primary, #e5534b)', fontSize: 12 } as const,
}

/** 文本输入:本地暂存,失焦或回车时校验并写入 Host 设置文档;非法输入提示并回退到生效值。 */
function TextField(props: {
  label: string
  value: string
  placeholder?: string
  /** 返回错误提示表示非法;返回 null 表示合法、可以提交。 */
  validate?: (value: string) => string | null
  onCommit: (value: string) => void
}) {
  const [text, setText] = useState(props.value)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setText(props.value), [props.value])
  const commit = () => {
    if (text === props.value) return
    const problem = props.validate?.(text) ?? null
    if (problem) {
      setError(problem)
      setText(props.value)
      return
    }
    setError(null)
    props.onCommit(text)
  }
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <input
        style={styles.input}
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {error && <span style={styles.fieldError}>{error}</span>}
    </div>
  )
}

/** 设置页卡片:注册进 `settings.plugin.item`,读写自己的 settings 命名空间。 */
export function createSettingsCard(ctx: ClientContext, scope: SettingsScope<OptimizerSettingsValue>) {
  return function PromptOptimizerSettingsCard() {
    const snap = useSyncExternalStore(
      (callback) => scope.subscribe(callback),
      () => scope.getSnapshot(),
    )
    const value = snap.value ?? {}

    // 模型下拉需要目录:卡片挂载时拉取一次(失败可重试)。
    const [groups, setGroups] = useState<ModelProviderGroup[] | null>(null)
    const [catalogError, setCatalogError] = useState(false)
    useEffect(() => {
      let stale = false
      ctx.connection.api
        .llm.models({})
        .then((resp) => {
          if (stale) return
          if (resp.result.ok) setGroups(resp.result.value.groups)
          else setCatalogError(true)
        })
        .catch(() => {
          if (!stale) setCatalogError(true)
        })
      return () => {
        stale = true
      }
    }, [])

    return (
      <section style={styles.card}>
        <div style={styles.title}>提示词优化</div>
        <div style={styles.desc}>发送栏「优化」按钮(✨ 图标)的行为配置。</div>
        {snap.status === 'loading' && <div style={styles.hint}>设置加载中…</div>}
        {snap.status === 'unavailable' && (
          <div style={styles.hint}>当前连接不可写设置(远程页面为内存模式),改动仅在本次会话生效。</div>
        )}

        <div style={styles.row}>
          <span style={styles.label}>优化用模型</span>
          {groups === null ? (
            <span style={styles.hint}>{catalogError ? '模型目录加载失败,请刷新重试。' : '模型目录加载中…'}</span>
          ) : (
            <select
              style={styles.input}
              value={value.model ?? FOLLOW_SESSION}
              onChange={(e) => void scope.set('model', e.target.value)}
            >
              <option value={FOLLOW_SESSION}>跟随当前会话(默认)</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.models.map((m) => (
                    <option key={m.id} value={`${g.id}/${m.id}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        <div style={styles.row}>
          <span style={styles.label}>输出语言</span>
          <select
            style={{ ...styles.input, maxWidth: 160 }}
            value={value.language ?? 'zh'}
            onChange={(e) => void scope.set('language', e.target.value)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <TextField
          label="最大输出 Token"
          value={String(value.maxTokens ?? 8192)}
          placeholder="8192"
          validate={(v) => {
            const n = Number.parseInt(v, 10)
            return Number.isFinite(n) && n >= 1024 && n <= 32768 ? null : '请输入 1024–32768 之间的数字'
          }}
          onCommit={(v) => void scope.set('maxTokens', Number.parseInt(v, 10))}
        />
        <TextField
          label="超时时间(秒)"
          value={String(value.timeoutSeconds ?? 120)}
          placeholder="120"
          validate={(v) => {
            const n = Number.parseInt(v, 10)
            return Number.isFinite(n) && n >= 10 && n <= 600 ? null : '请输入 10–600 之间的数字'
          }}
          onCommit={(v) => void scope.set('timeoutSeconds', Number.parseInt(v, 10))}
        />
        {!snap.writable && snap.status === 'ready' && (
          <div style={styles.hint}>当前为内存模式:设置不会持久化。</div>
        )}
      </section>
    )
  }
}
