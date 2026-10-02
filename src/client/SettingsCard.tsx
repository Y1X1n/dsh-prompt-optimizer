import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { OptimizerModelFailure, OptimizerModelGroup } from './host-faces.js'
import { sessionCatalog } from './host-faces.js'
import type { OptimizerSettingsValue, SettingsFace } from './settings-face.js'
import { useT } from './i18n.js'

/**
 * 设置卡(0.2.0 原生风格):注册为 `settings.plugins.tab` 的标签页,平铺行布局
 * 与官方设置页同构 —— 行标题 14px、描述 12px 次级色、行间 0.5px 分隔线,
 * 枚举项用官方 SegmentedControl 同款分段控件、布尔项用同款开关(样式取自
 * dsh-client-ui-primitives 的对应 CSS,手写注入以保持跨版本零依赖)。
 */

const STYLES_ID = 'dsh-prompt-optimizer-settings-styles'

/**
 * 注入设置卡的行/控件样式(幂等)。取值对齐官方 ui-settings-general 行样式与
 * ui-primitives 的 SegmentedControl/Switch:分段控件 = 浅底轨道 + 选中白胶囊,
 * 开关 = 36×20 胶囊 + 16px 圆形滑块,全部走 --dsw-* 令牌,明暗主题自动跟随。
 */
function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const style = document.createElement('style')
  style.id = STYLES_ID
  style.textContent = `
.dsh-po-sec{display:flex;flex-direction:column;width:100%;color:var(--dsw-alias-label-primary)}
.dsh-po-group{margin:14px 0 2px;padding:0;font-size:12px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:14px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dsh-po-row:last-child{border-bottom:none}
.dsh-po-rowText{min-width:0}
.dsh-po-rowTitle{font-size:14px;line-height:20px}
.dsh-po-rowDesc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-hint{padding:10px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
/* 分段控件(官方 SegmentedControl 同款):浅底轨道 + 选中白胶囊滑动指示。 */
.dsh-po-seg{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14));flex:none}
.dsh-po-segIndicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px*(var(--dsh-segment-count) - 1))/var(--dsh-segment-count));height:calc(100% - 8px);border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,0.12));transform:translateX(calc(var(--dsh-segment-index)*(100% + 2px)));transition:transform 160ms ease;pointer-events:none}
.dsh-po-segTab{box-sizing:border-box;position:relative;z-index:1;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color 120ms ease}
.dsh-po-segTab:hover:not(:disabled),.dsh-po-segTab[aria-selected='true']{color:var(--dsw-alias-label-primary,inherit)}
.dsh-po-segTab:disabled{cursor:default;opacity:0.4}
/* 开关(官方 Switch 同款):36×20 胶囊轨道 + 16px 圆形滑块。 */
.dsh-po-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3,rgba(128,128,128,0.4));cursor:pointer}
.dsh-po-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary,#4f7cf7)}
.dsh-po-switch:disabled{cursor:default;opacity:0.5}
.dsh-po-switchThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform 120ms ease}
.dsh-po-switch[aria-checked='false'] .dsh-po-switchThumb{background:var(--dsw-alias-switch-thumb,#fff)}
.dsh-po-switch[aria-checked='true'] .dsh-po-switchThumb{transform:translateX(16px)}
/* 行内控件:select / input / 次级按钮。 */
.dsh-po-select{flex:none;max-width:280px;padding:5px 28px 5px 10px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:var(--dsw-alias-bg-layer-1,transparent) no-repeat right 10px center/10px;appearance:none;color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-po-input{flex:none;width:150px;padding:5px 10px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit)}
.dsh-po-input:focus-visible,.dsh-po-select:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7cf7));outline-offset:1px}
.dsh-po-btn2{flex:none;padding:5px 14px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:transparent;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;white-space:nowrap;transition:background-color 120ms ease}
.dsh-po-btn2:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14))}
.dsh-po-btn2:disabled{opacity:0.45;cursor:default}
.dsh-po-fieldError{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5534b)}
/* 选中行控件的表单错误态(文本输入校验失败)。 */
.dsh-po-input[data-invalid='true']{border-color:var(--dsw-alias-state-error-primary,#e5534b)}
`
  document.head.appendChild(style)
}

/** 设置项的可写值:字面量类型字段(如 language: 'zh'|'en')同时接受任意 string,与下拉/分段 onChange 对齐(校验交给 Host 侧归一化)。 */
type WritableValue<K extends keyof OptimizerSettingsValue> =
  OptimizerSettingsValue[K] | (Extract<OptimizerSettingsValue[K], string> extends never ? never : string)

interface RowProps {
  title: string
  desc?: string
  /** 控件区(行右侧)。 */
  children: ReactNode
}

/** 官方样式的设置行:左侧标题+描述,右侧控件,行间细分隔线。 */
function Row({ title, desc, children }: RowProps) {
  return (
    <div className="dsh-po-row">
      <div className="dsh-po-rowText">
        <div className="dsh-po-rowTitle">{title}</div>
        {desc && <div className="dsh-po-rowDesc">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

/** 分段控件:官方 SegmentedControl 同款(浅底轨道 + 选中白胶囊滑动指示)。 */
function Segmented<T extends string>(props: {
  value: T
  options: readonly { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
  label: string
}) {
  const selected = props.options.findIndex((o) => o.value === props.value)
  return (
    <span
      className="dsh-po-seg"
      role="tablist"
      aria-label={props.label}
      style={{ '--dsh-segment-count': props.options.length, '--dsh-segment-index': selected < 0 ? 0 : selected } as CSSProperties}
    >
      <span className="dsh-po-segIndicator" aria-hidden="true" />
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="dsh-po-segTab dsh-po-btn"
          aria-selected={option.value === props.value}
          title={option.title}
          onClick={() => {
            if (option.value !== props.value) props.onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}

/** 开关:官方 Switch 同款(胶囊轨道 + 圆形滑块,aria-checked 驱动外观)。 */
function Toggle(props: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      className="dsh-po-switch dsh-po-btn"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="dsh-po-switchThumb" />
    </button>
  )
}

/**
 * 文本输入:本地暂存,失焦或回车时校验并写入(U14:非法输入保留原样、红框提示,
 * 不静默擦除)。走官方 Input 的边框/圆角令牌。
 */
function TextField(props: {
  label: string
  /** 标题 hover 提示(说明该项的设计意图/默认值依据)。 */
  labelTitle?: string
  value: string
  placeholder?: string
  width?: number
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
      setError(problem)
      return
    }
    setError(null)
    props.onCommit(text)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
      <input
        className="dsh-po-input dsh-po-btn"
        data-invalid={error ? 'true' : undefined}
        style={props.width ? { width: props.width } : undefined}
        value={text}
        placeholder={props.placeholder}
        aria-label={props.label}
        title={props.labelTitle}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {error && <span className="dsh-po-fieldError">{error}</span>}
    </div>
  )
}

/** 模型选择下拉(含目录加载失败的重试按钮位)。 */
function ModelSelect(props: {
  label: string
  value: string
  groups: OptimizerModelGroup[] | null
  catalogState: 'loading' | 'ready' | 'error'
  catalogHint: string | null
  noneLabel: string
  onChange: (value: string) => void
  onRefresh: () => void
  refreshTitle: string
  refreshLabel: string
}) {
  if (props.groups === null) {
    return (
      <span className="dsh-po-status" style={{ flex: 'none', maxWidth: 300, textAlign: 'right' }}>
        {props.catalogState === 'error' ? '—' : '…'}
        {props.catalogHint ? `(${props.catalogHint})` : ''}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
      <select
        className="dsh-po-select dsh-po-btn"
        style={{ backgroundImage: catalogChevron() }}
        value={props.value}
        aria-label={props.label}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{props.noneLabel}</option>
        {props.groups.map((g) => (
          <optgroup key={g.id} label={g.name}>
            {g.models.map((m) => (
              <option key={`${g.id}/${m.id}`} value={`${g.id}/${m.id}`}>
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button className="dsh-po-btn2 dsh-po-btn" type="button" title={props.refreshTitle} onClick={props.onRefresh}>
        {props.refreshLabel}
      </button>
    </span>
  )
}

/** select 自定义箭头(数据 URI,颜色跟随 currentColor 不可行,取中性灰)。 */
function catalogChevron(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%23888" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'")}")`
}

/**
 * 设置卡:0.1.x 注册进 `settings.plugin.item`、0.2.0 注册为
 * `settings.plugins.tab`(插件页的一个标签),读写走统一的 SettingsFace
 * (0.1.x settingsScope / 0.2.0 configForms,见 settings-face.ts)。
 */
export function createSettingsCard(ctx: ClientContext, face: SettingsFace) {
  ensureStyles()
  return function PromptOptimizerSettingsCard() {
    const snap = useSyncExternalStore(
      (callback) => face.subscribe(callback),
      () => face.getSnapshot(),
    )
    const t = useT()
    const value = snap.value ?? {}
    const writable = snap.writable !== false

    // U16:撤销栈。face.set 直接持久化、没有 undo;这里在卡片层保存最近 N 次
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
      void face.set(key, v as OptimizerSettingsValue[K])
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
            void face.set(k, target)
          }
        }
      } finally {
        applyingUndo.current = false
      }
    }

    // 模型下拉需要目录:挂载时经连接层 RPC(session/modelCatalog)拉取一次,
    // 失败或后续新增 provider 时可手动刷新。个别提供方失败不影响其余分组。
    const [groups, setGroups] = useState<OptimizerModelGroup[] | null>(null)
    const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
    const [catalogHint, setCatalogHint] = useState<string | null>(null)
    const loadCatalog = async () => {
      setCatalogState('loading')
      setCatalogHint(null)
      try {
        const result = await sessionCatalog(ctx.connection)
        if (result.ok) {
          setGroups(result.value.groups)
          setCatalogState('ready')
          const failures = result.value.failures ?? []
          if (failures.length) {
            setCatalogHint(failures.map((f: OptimizerModelFailure) => `${f.name || f.id}: ${f.message}`).join('; '))
          }
        } else {
          const message = typeof result.error === 'string' ? result.error : result.error?.message
          setCatalogHint(message ?? null)
          setCatalogState('error')
        }
      } catch (cause) {
        setCatalogHint(cause instanceof Error ? cause.message : String(cause))
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

    return (
      <section className="dsh-po-sec">
        {snap.status === 'loading' && <div className="dsh-po-hint">{t('settings.loading')}</div>}
        {snap.status === 'unavailable' && <div className="dsh-po-hint">{t('settings.unavailable')}</div>}
        {!writable && snap.status === 'ready' && <div className="dsh-po-hint">{t('settings.memoryOnly')}</div>}

        <div className="dsh-po-group">{t('settings.group.model')}</div>
        <Row title={t('settings.model')} desc={t('settings.model.desc')}>
          <ModelSelect
            label={t('settings.model')}
            value={value.model ?? ''}
            groups={groups}
            catalogState={catalogState}
            catalogHint={catalogHint}
            noneLabel={t('settings.model.follow')}
            onChange={(v) => setValue('model', v)}
            onRefresh={() => void loadCatalog()}
            refreshTitle={t('settings.refreshTitle')}
            refreshLabel={t('settings.refresh')}
          />
        </Row>
        {groups !== null && (
          <Row title={t('settings.fallbackModel')} desc={t('settings.fallbackModel.desc')}>
            <select
              className="dsh-po-select dsh-po-btn"
              style={{ backgroundImage: catalogChevron() }}
              value={value.fallbackModel ?? ''}
              aria-label={t('settings.fallbackModel')}
              onChange={(e) => setValue('fallbackModel', e.target.value)}
            >
              <option value="">{t('settings.fallbackModel.none')}</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.models.map((m) => (
                    <option key={`${g.id}/${m.id}`} value={`${g.id}/${m.id}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Row>
        )}
        <Row title={t('settings.test')} desc={t('settings.test.desc')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            {test.message && (
              <span className="dsh-po-status" style={{ maxWidth: 280, color: test.status === 'fail' ? 'var(--dsw-alias-state-error-primary,#e5534b)' : undefined }}>
                {test.message}
              </span>
            )}
            <button
              className="dsh-po-btn2 dsh-po-btn"
              type="button"
              disabled={test.status === 'testing'}
              onClick={() => void runTest()}
            >
              {test.status === 'testing' ? t('settings.test.running') : t('settings.test.run')}
            </button>
          </span>
        </Row>

        <div className="dsh-po-group">{t('settings.group.params')}</div>
        <Row title={t('settings.language')} desc={t('settings.language.desc')}>
          <Segmented
            label={t('settings.language')}
            value={value.language ?? 'zh'}
            options={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(v) => setValue('language', v as WritableValue<'language'>)}
          />
        </Row>
        <Row title={t('settings.mode')} desc={t('settings.mode.desc')}>
          <Segmented
            label={t('settings.mode')}
            value={value.mode ?? 'full'}
            options={[
              { value: 'full', label: t('settings.mode.full.short'), title: t('settings.mode.full') },
              { value: 'fast', label: t('settings.mode.fast.short'), title: t('settings.mode.fast') },
            ]}
            onChange={(v) => setValue('mode', v as WritableValue<'mode'>)}
          />
        </Row>
        <Row title={t('settings.effort')} desc={t('settings.effort.desc')}>
          <Segmented
            label={t('settings.effort')}
            value={value.reasoningEffort ?? 'lowest'}
            options={[
              { value: 'lowest', label: t('settings.effort.lowest.short'), title: t('settings.effort.lowest') },
              { value: 'session', label: t('settings.effort.session.short'), title: t('settings.effort.session') },
            ]}
            onChange={(v) => setValue('reasoningEffort', v as WritableValue<'reasoningEffort'>)}
          />
        </Row>
        <Row title={t('settings.maxTokens')} desc={t('settings.maxTokens.desc')}>
          <TextField
            label={t('settings.maxTokens')}
            value={String(value.maxTokens ?? 8192)}
            placeholder="8192"
            validate={(v) => {
              const n = Number.parseInt(v, 10)
              return Number.isFinite(n) && n >= 1024 && n <= 32768 ? null : t('settings.validate.maxTokens')
            }}
            onCommit={(v) => setValue('maxTokens', Number.parseInt(v, 10))}
          />
        </Row>
        <Row title={t('settings.timeout')} desc={t('settings.timeout.desc')}>
          <TextField
            label={t('settings.timeout')}
            value={String(value.timeoutSeconds ?? 120)}
            placeholder="120"
            validate={(v) => {
              const n = Number.parseInt(v, 10)
              return Number.isFinite(n) && n >= 10 && n <= 600 ? null : t('settings.validate.timeout')
            }}
            onCommit={(v) => setValue('timeoutSeconds', Number.parseInt(v, 10))}
          />
        </Row>
        <Row title={t('settings.temperature')} desc={t('settings.temperature.desc')} >
          <TextField
            label={t('settings.temperature')}
            labelTitle={t('settings.temperatureTitle')}
            value={String(value.temperature ?? 0.2)}
            placeholder="0.2"
            width={100}
            validate={(v) => {
              const n = Number.parseFloat(v)
              return Number.isFinite(n) && n >= 0 && n <= 2 ? null : t('settings.validate.temperature')
            }}
            onCommit={(v) => setValue('temperature', Number.parseFloat(v))}
          />
        </Row>

        <div className="dsh-po-group">{t('settings.group.context')}</div>
        <Row title={t('settings.includeContext')} desc={t('settings.includeContext.desc')}>
          <Toggle
            label={t('settings.includeContext')}
            checked={value.includeContext !== false}
            onChange={(next) => setValue('includeContext', next)}
          />
        </Row>
        <Row title={t('settings.autoMaxTokens')} desc={t('settings.autoMaxTokens.desc')}>
          <Toggle
            label={t('settings.autoMaxTokens')}
            checked={value.autoMaxTokens !== false}
            onChange={(next) => setValue('autoMaxTokens', next)}
          />
        </Row>

        {/* U16:撤销最近一次设置修改(内存栈,刷新即清)。 */}
        <div className="dsh-po-row" style={{ paddingBottom: 4 }}>
          <button
            className="dsh-po-btn2 dsh-po-btn"
            type="button"
            disabled={!canUndo}
            title={t('settings.undoTitle')}
            onClick={undoLastChange}
          >
            {t('settings.undo')}
          </button>
        </div>
      </section>
    )
  }
}
