/**
 * 设置读写的跨版本统一面。
 *
 * 0.2.0 移除了 `settingsScope` 服务与 `settings.plugin.item` 槽位:设置改为
 * 宿主按插件 Config schema 自动生成的表单(SettingsForms),客户端经
 * `configForms`(dsh-client-ui-settings 提供)按 **组合行 entry id** 读写,
 * 快照形状 { status, value, writable } 与旧 settingsScope 一致。
 *
 * 本模块把两条后端折进同一个快照面,组件与 controller 都只面向这里:
 *  - attachLegacy:0.1.x 的 `ctx.settingsScope.bind({ namespace })`;
 *  - attachForms:0.2.0 的 `ctx.configForms.get(entryId)`。
 * 两个服务都是可选注入:谁先到谁生效(configForms 优先),缺席时保持
 * loading(设置卡显示加载中,其他功能不受影响)。
 */

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

/** 设置快照的最小依赖面(两条后端共同的形状)。 */
export interface SettingsSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value?: OptimizerSettingsValue
  writable?: boolean
}

/** 单字段写入;两条后端的返回(Promise<void>/Promise<boolean>)都向上折为 void。 */
export type SettingsSetter = (key: string, value: unknown) => Promise<unknown>

/** 统一设置面:订阅 + 快照 + 写入。 */
export interface SettingsFace {
  subscribe(fn: () => void): () => void
  getSnapshot(): SettingsSnapshot
  set: SettingsSetter
}

/** 旧版 settingsScope 的最小结构面(0.1.x,服务 0.2.0 起移除)。 */
export interface LegacySettingsScopeLike {
  subscribe(fn: () => void): () => void
  getSnapshot(): { status?: string; value?: OptimizerSettingsValue; writable?: boolean }
  set(key: string, value: unknown): Promise<unknown>
}

/** 0.2.0 configForms 表单控制器的最小结构面。 */
export interface ConfigFormLike {
  subscribe(fn: () => void): () => void
  getSnapshot(): { status?: string; value?: OptimizerSettingsValue; writable?: boolean }
  set(field: string, value: unknown): Promise<unknown>
}

/** 0.2.0 configForms 服务的最小结构面。 */
export interface ConfigFormsLike {
  get(entryId: string): ConfigFormLike
}

interface Backend {
  readonly via: 'legacy' | 'forms'
  subscribeRaw(fn: () => void): () => void
  getSnapshot(): { status?: string; value?: OptimizerSettingsValue; writable?: boolean }
  set(key: string, value: unknown): Promise<unknown>
}

/**
 * 创建统一设置面。face 维护自己的监听集合;后端到达时建立**单条**后端订阅,
 * 把后端变更统一转发给全部监听者——组件可以先订阅、后端后到达(两个服务都是
 * 可选注入,到达顺序不定),不影响通知链。
 */
export function createSettingsFace(): {
  face: SettingsFace
  attachLegacy(scope: LegacySettingsScopeLike): void
  attachForms(forms: ConfigFormsLike, entryId: string): void
} {
  let backend: Backend | null = null
  let offBackend: (() => void) | null = null
  const listeners = new Set<() => void>()
  // 后端缺席时的固定 loading 快照:引用稳定,useSyncExternalStore 不会反复重渲染。
  let loadingSnapshot: SettingsSnapshot | null = null
  // 归一化快照缓存:useSyncExternalStore 要求 getSnapshot 在状态未变时返回同一
  // 引用(React #185 无限重渲染的成因),这里只在后端通知时重建。
  let cachedSnapshot: SettingsSnapshot | null = null

  const notify = () => {
    cachedSnapshot = null
    for (const listener of listeners) listener()
  }

  function use(next: Backend): void {
    // configForms(0.2.0)优先:已经在用时忽略后来的 legacy 绑定。
    if (backend?.via === 'forms' && next.via === 'legacy') return
    if (backend === next) return
    offBackend?.()
    backend = next
    offBackend = next.subscribeRaw(notify)
    // 后端到达或切换:快照来源改变,统一通知一次(notify 会先失效缓存)。
    notify()
  }

  const face: SettingsFace = {
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getSnapshot(): SettingsSnapshot {
      if (!backend) {
        loadingSnapshot ??= { status: 'loading' }
        return loadingSnapshot
      }
      cachedSnapshot ??= (() => {
        const snap = backend.getSnapshot()
        const status: SettingsSnapshot['status'] =
          snap.status === 'ready' || snap.status === 'unavailable' ? snap.status : 'loading'
        return { status, value: snap.value, writable: snap.writable }
      })()
      return cachedSnapshot
    },
    set(key: string, value: unknown) {
      return backend ? backend.set(key, value) : Promise.reject(new Error('设置服务尚未就绪'))
    },
  }

  return {
    face,
    attachLegacy(scope: LegacySettingsScopeLike): void {
      use({
        via: 'legacy',
        subscribeRaw: (fn) => scope.subscribe(fn),
        getSnapshot: () => scope.getSnapshot(),
        set: (key, value) => scope.set(key, value),
      })
    },
    attachForms(forms: ConfigFormsLike, entryId: string): void {
      const form = forms.get(entryId)
      use({
        via: 'forms',
        subscribeRaw: (fn) => form.subscribe(fn),
        getSnapshot: () => form.getSnapshot(),
        set: (field, value) => form.set(field, value),
      })
    },
  }
}
