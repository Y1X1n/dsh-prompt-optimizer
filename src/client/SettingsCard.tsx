import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-client-connection/client'

/** 与 Host 侧 Config 对应的设置分节形状(仅客户端使用)。 */
export interface OptimizerSettingsValue {
  language?: 'zh' | 'en'
  /** '' = 跟随当前会话;否则 'provider/model'。 */
  model?: string
  /** '' = 无回退;否则 'provider/model'。 */
  fallbackModel?: string
  maxTokens?: number
  /** 单次优化调用的超时时间(秒)。 */
  timeoutSeconds?: number
  /** full = 分析 + 优化;fast = 仅优化(输出 token 约减半,等待更短)。 */
  mode?: 'full' | 'fast'
  /** session = 跟随会话;lowest = 钳到该模型支持的最低档(推理模型等待显著缩短)。 */
  reasoningEffort?: 'session' | 'lowest'
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
  refreshBtn: {
    flexShrink: 0,
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))',
    background: 'var(--dsw-alias-button-tool-bar-fill, transparent)',
    color: 'var(--dsw-alias-label-primary, inherit)',
    cursor: 'pointer',
  } as const,
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

    // 模型下拉需要目录:挂载时拉取一次,失败或后续新增 provider 时可手动刷新。
    const [groups, setGroups] = useState<ModelProviderGroup[] | null>(null)
    const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
    const loadCatalog = async () => {
      setCatalogState('loading')
      try {
        const resp = await ctx.connection.api.llm.models({})
        if (resp.result.ok) {
          setGroups(resp.result.value.groups)
          setCatalogState('ready')
        } else {
          setCatalogState('error')
        }
      } catch {
        setCatalogState('error')
      }
    }
    useEffect(() => {
      void loadCatalog()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 模型连通性测试:Host 按同一套路由解析发探活调用,响应里带回实际测试的路由。
    const [test, setTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({ status: 'idle' })
    const runTest = async () => {
      setTest({ status: 'testing' })
      try {
        const resp = await fetch('/dsh-prompt-optimizer/test-model', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        const data = await resp.json().catch(() => null)
        if (data?.ok) {
          setTest({ status: 'ok', message: `连接正常:${data.provider} / ${data.model}(${data.latencyMs}ms)` })
        } else {
          setTest({ status: 'fail', message: String(data?.error ?? `请求失败(HTTP ${resp.status})`) })
        }
      } catch (cause) {
        setTest({ status: 'fail', message: cause instanceof Error ? cause.message : String(cause) })
      }
    }

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
            <span style={styles.hint}>
              {catalogState === 'error' ? '模型目录加载失败,点右侧按钮重试。' : '模型目录加载中…'}
            </span>
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
          <button
            type="button"
            style={{ ...styles.refreshBtn, ...(catalogState === 'loading' ? { opacity: 0.45, cursor: 'default' } : {}) }}
            disabled={catalogState === 'loading'}
            title="重新拉取模型目录(新增提供方/模型后使用)"
            onClick={() => void loadCatalog()}
          >
            ↻ 刷新
          </button>
        </div>

        {groups !== null && (
          <div style={styles.row}>
            <span style={styles.label}>回退模型</span>
            <select
              style={styles.input}
              value={value.fallbackModel ?? ''}
              onChange={(e) => void scope.set('fallbackModel', e.target.value)}
            >
              <option value="">无(默认)</option>
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
          </div>
        )}

        <div style={styles.row}>
          <span style={styles.label}>模型连通性</span>          <button
            type="button"
            style={{ ...styles.refreshBtn, ...(test.status === 'testing' ? { opacity: 0.45, cursor: 'default' } : {}) }}
            disabled={test.status === 'testing'}
            onClick={() => void runTest()}
          >
            {test.status === 'testing' ? '测试中…' : '测试连接'}
          </button>
          {test.message && (
            <span style={test.status === 'fail' ? styles.fieldError : styles.hint}>{test.message}</span>
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

        <div style={styles.row}>
          <span style={styles.label}>优化模式</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.mode ?? 'full'}
            onChange={(e) => void scope.set('mode', e.target.value)}
          >
            <option value="full">完整(分析诊断 + 优化)</option>
            <option value="fast">快速(仅优化,等待约减半)</option>
          </select>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>推理强度</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.reasoningEffort ?? 'session'}
            onChange={(e) => void scope.set('reasoningEffort', e.target.value)}
          >
            <option value="session">跟随当前会话(默认)</option>
            <option value="lowest">降到最低档(推理模型更快)</option>
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
