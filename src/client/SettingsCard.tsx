import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-client-connection/client'
import { useT } from './i18n.js'
import { GitHubIcon } from './GitHubIcon.js'

/** 插件源码仓库地址(点击 GitHub 图标跳转)。 */
const REPO_URL = 'https://github.com/Y1X1n/dsh-prompt-optimizer'

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

/**
 * 设置项的可写值:字面量类型字段(如 language: 'zh'|'en')同时接受任意 string,
 * 与下拉框 onChange 的 e.target.value 对齐(校验交给 Host 侧归一化,R27)。
 */
type WritableValue<K extends keyof OptimizerSettingsValue> =
  OptimizerSettingsValue[K] | (Extract<OptimizerSettingsValue[K], string> extends never ? never : string)

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
  // U13:分组小标题(模型 / 调用参数 / 上下文),带浅分隔线。
  groupTitle: {
    margin: '14px 0 8px',
    paddingTop: 8,
    borderTop: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.18))',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
  } as const,
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
  // 标题右侧的 GitHub 仓库入口:点击在新标签打开仓库主页。
  repoLink: {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: 8,
    padding: 4,
    color: 'var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    textDecoration: 'none',
  } as const,
}

/** 文本输入:本地暂存,失焦或回车时校验并写入 Host 设置文档(U14:非法输入保留原样、红框提示,不静默擦除)。 */
function TextField(props: {
  label: string
  /** U15:标签 hover 提示(说明该项的设计意图/默认值依据)。 */
  labelTitle?: string
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
    if (text === props.value) {
      setError(null)
      return
    }
    const problem = props.validate?.(text) ?? null
    if (problem) {
      // U14:校验失败保留用户输入(只标红 + 提示),可直接修正后再次提交;
      // 生效值仍为 props.value,直到提交合法值。
      setError(problem)
      return
    }
    setError(null)
    props.onCommit(text)
  }
  return (
    <div style={styles.row}>
      <span style={styles.label} title={props.labelTitle}>{props.label}</span>
      <input
        className="dsh-po-btn"
        style={{ ...styles.input, ...(error ? { borderColor: 'var(--dsw-alias-state-error-primary, #e5534b)' } : {}) }}
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

    // U16:撤销栈。scope.set 直接持久化、没有 undo;这里在卡片层保存最近 N 次
    // 修改前的整份快照,「撤销上一次修改」把变化的键整批还原。内存栈,仅本次
    // 页面会话有效(刷新即清);撤销本身的还原不再入栈。
    type SettingValueSnapshot = Partial<OptimizerSettingsValue>
    const SETTING_KEYS = [
      'language', 'model', 'fallbackModel', 'maxTokens', 'timeoutSeconds',
      'mode', 'reasoningEffort', 'temperature', 'autoMaxTokens', 'includeContext',
    ] as const
    const SETTING_DEFAULTS: OptimizerSettingsValue = {
      language: 'zh', model: '', fallbackModel: '', maxTokens: 8192, timeoutSeconds: 120,
      mode: 'full', reasoningEffort: 'lowest', temperature: 0.2, autoMaxTokens: true, includeContext: true,
    }
    const undoStack = useRef<SettingValueSnapshot[]>([])
    const [canUndo, setCanUndo] = useState(false)
    const applyingUndo = useRef(false)
    /** 所有写入走这里:先记录快照再持久化,保证可回退一步。 */
    const setValue = <K extends keyof OptimizerSettingsValue>(key: K, v: WritableValue<K>): void => {
      if (!applyingUndo.current) {
        undoStack.current.push({ ...value })
        if (undoStack.current.length > 20) undoStack.current.shift()
        setCanUndo(true)
      }
      void scope.set(key, v as OptimizerSettingsValue[K])
    }
    const undoLastChange = () => {
      const prev = undoStack.current.pop()
      setCanUndo(undoStack.current.length > 0)
      if (!prev) return
      applyingUndo.current = true
      try {
        for (const k of SETTING_KEYS) {
          // 快照里缺失的键按出厂默认还原(与设置项各自的 UI 缺省一致)。
          const target = prev[k] ?? SETTING_DEFAULTS[k]
          if (value[k] !== target) {
            void (scope.set as (key: string, v: unknown) => Promise<void>)(k, target)
          }
        }
      } finally {
        applyingUndo.current = false
      }
    }

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

    // U17:折叠态在标题右侧展示关键摘要(模型 · 模式);展开时回落到功能说明。
    const pinnedModel = value.model?.trim()
    let modelShort = pinnedModel
    if (!pinnedModel) {
      modelShort = t('settings.model.follow')
    } else if (groups) {
      const slash = pinnedModel.indexOf('/')
      const g = slash > 0 ? groups.find((x) => x.id === pinnedModel.slice(0, slash)) : undefined
      const m = g?.models.find((mm) => mm.id === pinnedModel.slice(slash + 1))
      if (m) modelShort = m.name
    }
    const summaryText = `${t('settings.summary.model')}: ${modelShort} · ${t('settings.summary.mode')}: ${
      value.mode === 'fast' ? t('settings.mode.fast.short') : t('settings.mode.full.short')
    }`

    return (
      <section style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="dsh-po-btn" type="button" style={{ ...styles.headerBtn, flex: 1 }} onClick={toggle} aria-expanded={expanded}>
          <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>▸</span>
          <span style={styles.title}>{t('panel.title')}</span>
          <span style={styles.headerDesc}>{expanded ? t('settings.desc') : summaryText}</span>
        </button>
        <a
          className="dsh-po-btn"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.repoLink}
          title={t('settings.repoTitle')}
          aria-label={t('settings.repoTitle')}
          onClick={(e) => e.stopPropagation()}
        >
          <GitHubIcon size={16} />
        </a>
        </div>
        {expanded && (
          <div style={styles.body}>
        {snap.status === 'loading' && <div style={styles.hint}>{t('settings.loading')}</div>}
        {snap.status === 'unavailable' && (
          <div style={styles.hint}>{t('settings.unavailable')}</div>
        )}

        {/* U13 分组一:模型 */}
        <div style={styles.groupTitle}>{t('settings.group.model')}</div>
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
              onChange={(e) => void setValue('model', e.target.value)}
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
          <button className="dsh-po-btn"
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
              onChange={(e) => void setValue('fallbackModel', e.target.value)}
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
          <button className="dsh-po-btn"
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

        {/* U13 分组二:调用参数 */}
        <div style={styles.groupTitle}>{t('settings.group.params')}</div>
        <div style={styles.row}>
          <span style={styles.label}>{t('settings.language')}</span>
          <select
            style={{ ...styles.input, maxWidth: 160 }}
            value={value.language ?? 'zh'}
            onChange={(e) => void setValue('language', e.target.value)}
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
            onChange={(e) => void setValue('mode', e.target.value)}
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
            onChange={(e) => void setValue('reasoningEffort', e.target.value)}
          >
            <option value="lowest">{t('settings.effort.lowest')}</option>
            <option value="session">{t('settings.effort.session')}</option>
          </select>
        </div>

        {/* U13 分组三:上下文 */}
        <div style={styles.groupTitle}>{t('settings.group.context')}</div>
        <div style={styles.row}>
          <span style={styles.label}>{t('settings.includeContext')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.includeContext === false ? 'off' : 'on'}
            onChange={(e) => void setValue('includeContext', e.target.value === 'on')}
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
          onCommit={(v) => void setValue('maxTokens', Number.parseInt(v, 10))}
        />
        <TextField
          label={t('settings.timeout')}
          value={String(value.timeoutSeconds ?? 120)}
          placeholder="120"
          validate={(v) => {
            const n = Number.parseInt(v, 10)
            return Number.isFinite(n) && n >= 10 && n <= 600 ? null : t('settings.validate.timeout')
          }}
          onCommit={(v) => void setValue('timeoutSeconds', Number.parseInt(v, 10))}
        />
        <TextField
          label={t('settings.temperature')}
          labelTitle={t('settings.temperatureTitle')}
          value={String(value.temperature ?? 0.2)}
          placeholder="0.2"
          validate={(v) => {
            const n = Number.parseFloat(v)
            return Number.isFinite(n) && n >= 0 && n <= 2 ? null : t('settings.validate.temperature')
          }}
          onCommit={(v) => void setValue('temperature', Number.parseFloat(v))}
        />

        <div style={styles.row}>
          <span style={styles.label}>{t('settings.autoMaxTokens')}</span>
          <select
            style={{ ...styles.input, maxWidth: 260 }}
            value={value.autoMaxTokens === false ? 'off' : 'on'}
            onChange={(e) => void setValue('autoMaxTokens', e.target.value === 'on')}
          >
            <option value="on">{t('settings.autoMaxTokens.on')}</option>
            <option value="off">{t('settings.autoMaxTokens.off')}</option>
          </select>
        </div>
        {/* U16:撤销最近一次设置修改(内存栈,刷新即清)。 */}
        <div style={styles.row}>
          <button
            className="dsh-po-btn"
            type="button"
            style={{ ...styles.refreshBtn, ...(!canUndo ? { opacity: 0.45, cursor: 'default' } : {}) }}
            disabled={!canUndo}
            title={t('settings.undoTitle')}
            onClick={undoLastChange}
          >
            {t('settings.undo')}
          </button>
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
