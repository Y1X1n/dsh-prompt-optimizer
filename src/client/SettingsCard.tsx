import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-client-connection/client'
import { useT } from './i18n.js'

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
  /** 采样温度(0-2),默认 0.2。 */
  temperature?: number
  /** 输出上限跟随输入长度,默认 true。 */
  autoMaxTokens?: boolean
  /** 优化时携带会话近期对话作为上下文,默认 true。 */
  includeContext?: boolean
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
  title: { fontSize: 14, fontWeight: 600 } as const,
  desc: { color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))', marginBottom: 12 } as const,
  headerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  } as const,
  chevron: {
    fontSize: 11,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
    transition: 'transform 0.15s ease',
  } as const,
  headerDesc: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: 400,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
  } as const,
  body: { marginTop: 12 } as const,
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
    const t = useT()
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
          setTest({ status: 'ok', message: t('settings.test.ok', { provider: data.provider, model: data.model, latencyMs: data.latencyMs }) })
        } else {
          setTest({ status: 'fail', message: String(data?.error ?? `HTTP ${resp.status}`) })
        }
      } catch (cause) {
        setTest({ status: 'fail', message: cause instanceof Error ? cause.message : String(cause) })
      }
    }

    // 卡片默认收起(设置项已较多),展开状态持久化到 localStorage。
    const EXPAND_KEY = 'dsh-prompt-optimizer.settings-expanded'
    const [expanded, setExpanded] = useState(() => {
      try {
        return localStorage.getItem(EXPAND_KEY) === '1'
      } catch {
        return false
      }
    })
    const toggle = () =>
      setExpanded((v) => {
        const next = !v
        try {
          localStorage.setItem(EXPAND_KEY, next ? '1' : '0')
        } catch {
          // 隐私模式等场景下不可写,展开态仅本次有效。
        }
        return next
      })

    return (
      <section style={styles.card}>
        <button type="button" style={styles.headerBtn} onClick={toggle} aria-expanded={expanded}>
          <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>▸</span>
          <span style={styles.title}>{t('panel.title')}</span>
          <span style={styles.headerDesc}>{t('settings.desc')}</span>
        </button>
        {expanded && (
          <div style={styles.body}>
        {snap.status === 'loading' && <div style={styles.hint}>{t('settings.loading')}</div>}
        {snap.status === 'unavailable' && (
          <div style={styles.hint}>{t('settings.unavailable')}</div>
        )}

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.model')}</span>
          {groups === null ? (
            <span style={styles.hint}>
              {catalogState === 'error' ? t('settings.catalog.error') : t('settings.catalog.loading')}
            </span>
          ) : (
            <select
              style={styles.input}
              value={value.model ?? FOLLOW_SESSION}
              onChange={(e) => void scope.set('model', e.target.value)}
            >
              <option value={FOLLOW_SESSION}>{t('settings.model.follow')}</option>
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
            title={t('settings.refreshTitle')}
            onClick={() => void loadCatalog()}
          >
            {t('settings.refresh')}
          </button>
        </div>

        {groups !== null && (
          <div style={styles.row}>
            <span style={styles.label}>{t('settings.fallbackModel')}</span>
            <select
              style={styles.input}
              value={value.fallbackModel ?? ''}
              onChange={(e) => void scope.set('fallbackModel', e.target.value)}
            >
              <option value="">{t('settings.fallbackModel.none')}</option>
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
          <span style={styles.label}>{t('settings.test')}</span>
          <button
            type="button"
            style={{ ...styles.refreshBtn, ...(test.status === 'testing' ? { opacity: 0.45, cursor: 'default' } : {}) }}
            disabled={test.status === 'testing'}
            onClick={() => void runTest()}
          >
            {test.status === 'testing' ? t('settings.test.running') : t('settings.test.run')}
          </button>
          {test.message && (
            <span style={test.status === 'fail' ? styles.fieldError : styles.hint}>{test.message}</span>
          )}
        </div>

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.language')}</span>
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
          <span style={styles.label}>{t('settings.mode')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.mode ?? 'full'}
            onChange={(e) => void scope.set('mode', e.target.value)}
          >
            <option value="full">{t('settings.mode.full')}</option>
            <option value="fast">{t('settings.mode.fast')}</option>
          </select>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.effort')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.reasoningEffort ?? 'lowest'}
            onChange={(e) => void scope.set('reasoningEffort', e.target.value)}
          >
            <option value="lowest">{t('settings.effort.lowest')}</option>
            <option value="session">{t('settings.effort.session')}</option>
          </select>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.includeContext')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.includeContext === false ? 'off' : 'on'}
            onChange={(e) => void scope.set('includeContext', e.target.value === 'on')}
          >
            <option value="on">{t('settings.includeContext.on')}</option>
            <option value="off">{t('settings.includeContext.off')}</option>
          </select>
        </div>

        <TextField
          label={t('settings.maxTokens')}
          value={String(value.maxTokens ?? 8192)}
          placeholder="8192"
          validate={(v) => {
            const n = Number.parseInt(v, 10)
            return Number.isFinite(n) && n >= 1024 && n <= 32768 ? null : t('settings.validate.maxTokens')
          }}
          onCommit={(v) => void scope.set('maxTokens', Number.parseInt(v, 10))}
        />
        <TextField
          label={t('settings.timeout')}
          value={String(value.timeoutSeconds ?? 120)}
          placeholder="120"
          validate={(v) => {
            const n = Number.parseInt(v, 10)
            return Number.isFinite(n) && n >= 10 && n <= 600 ? null : t('settings.validate.timeout')
          }}
          onCommit={(v) => void scope.set('timeoutSeconds', Number.parseInt(v, 10))}
        />
        <TextField
          label={t('settings.temperature')}
          value={String(value.temperature ?? 0.2)}
          placeholder="0.2"
          validate={(v) => {
            const n = Number.parseFloat(v)
            return Number.isFinite(n) && n >= 0 && n <= 2 ? null : t('settings.validate.temperature')
          }}
          onCommit={(v) => void scope.set('temperature', Number.parseFloat(v))}
        />

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.autoMaxTokens')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.autoMaxTokens === false ? 'off' : 'on'}
            onChange={(e) => void scope.set('autoMaxTokens', e.target.value === 'on')}
          >
            <option value="on">{t('settings.autoMaxTokens.on')}</option>
            <option value="off">{t('settings.autoMaxTokens.off')}</option>
          </select>
        </div>
        {!snap.writable && snap.status === 'ready' && (
          <div style={styles.hint}>{t('settings.memoryOnly')}</div>
        )}
          </div>
        )}
      </section>
    )
  }
}
