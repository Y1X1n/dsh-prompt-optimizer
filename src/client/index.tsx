import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// 类型级引入,激活两个目标槽位的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { createOptimizeButton } from './OptimizeButton.js'
import { createResultDock } from './ResultDock.js'
import { createSettingsCard, type OptimizerSettingsValue } from './SettingsCard.js'
import { createOptimizerController } from './controller.js'
import { installLocaleFace, type LocaleFace } from './i18n.js'
// 发布版(rc)里这两个服务没有携带客户端 Context 合并,这里按实际形状补齐。
declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: ConnectionHandle
    /** 由 @deepseek-ai/dsh-client-ui-settings 提供的设置命名空间绑定服务。 */
    settingsScope: {
      bind<T>(spec: { namespace: string }): SettingsScope<T>
    }
  }
}

export const name = 'dsh-prompt-optimizer-client'
// settingsScope 的绑定内部依赖 connection(读写传输)与 remote(失效通知)。
export const inject = ['slots', 'connection', 'remote', 'settingsScope']

/** 本插件交互元素的公共类名(U11:focus-visible 焦点环走这一份注入的样式)。 */
export const BUTTON_CLASS = 'dsh-po-btn'

/**
 * U11:键盘可达性。inline style 表达不了 :focus-visible 伪类,注入一段全局样式
 * 为所有 .dsh-po-btn 元素补焦点环;幂等,重复调用只插一次。
 */
function ensureFocusStyles(): void {
  if (typeof document === 'undefined') return
  const ID = 'dsh-prompt-optimizer-focus-styles'
  if (document.getElementById(ID)) return
  const style = document.createElement('style')
  style.id = ID
  style.textContent =
    '.dsh-po-btn:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring, #4f7cf7);outline-offset:2px;border-radius:4px;}'
    // 设置卡标题栏的 GitHub 仓库链接:hover 提亮 + 淡背景,给可点击性一个视觉反馈。
    + '.dsh-po-repo-link{transition:color 0.15s ease,background-color 0.15s ease;}'
    + '.dsh-po-repo-link:hover{color:var(--dsw-alias-label-primary, inherit);background-color:var(--dsw-alias-fill-secondary, rgba(128,128,128,0.12));}'
  document.head.appendChild(style)
}

export function apply(ctx: ClientContext): void {
  ensureFocusStyles()
  // 可选消费 locale 服务(dsh-client-locale):存在则界面文案跟随 DSH 界面语言,
  // 缺席(老版本/非 web)时保持中文,不影响任何其他功能。
  ctx.inject(['locale'], (lctx) => {
    installLocaleFace((lctx as unknown as { locale?: LocaleFace }).locale ?? null)
  })

  const scope = ctx.settingsScope.bind<OptimizerSettingsValue>({ namespace: 'prompt-optimizer' })
  const controller = createOptimizerController(ctx, {
    // 与 Host 侧「空字符串视为未设置」的口径一致。
    isModelPinned: () => Boolean(scope.getSnapshot().value?.model?.trim()),
    // 与 Host 侧「includeContext 缺省视为开」的口径一致(R28)。
    isContextEnabled: () => scope.getSnapshot().value?.includeContext ?? true,
    // 与 Host 侧「仅 mode==='fast' 为快速」的归一化口径一致。
    isFastMode: () => scope.getSnapshot().value?.mode === 'fast',
    // R21:看门狗 = 设置超时秒数 + 5s 余量(正常时 Host 的超时错误先到达,文案更友好)。
    getWatchdogMs: () => ((scope.getSnapshot().value?.timeoutSeconds ?? 120) + 5) * 1000,
  })

  // 发送栏按钮与结果面板。0.1.2 起 conversation.input.* 槽位是 session scope,
  // 采用与官方 ui-model-selection 一致的双层形态 —— 注入回调内 scope 化注册,
  // 并携带 0.1.2 渲染端使用的 inject(sessionId) 钩子;旧版(0.1.0-rc.x /
  // 0.1.1-rc.x)忽略未知字段、注册时机仅推迟到服务就绪,行为不变。
  ctx.inject(['slots', 'connection', 'remote', 'settingsScope'], (scopeCtx) => {
    scopeCtx.slots.inject('conversation.input.right', () =>
      scopeCtx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'prompt-optimizer',
          order: 30,
          inject: () => ({}),
        },
        createOptimizeButton(controller),
      ),
    )
    scopeCtx.slots.inject('conversation.input.dock', () =>
      scopeCtx.slots.register(
        {
          name: 'conversation.input.dock',
          id: 'prompt-optimizer',
          order: 30,
          inject: () => ({}),
        },
        createResultDock(controller),
      ),
    )
  })

  // 设置 → 插件配置:本插件的配置卡片(keyed 槽位,key = 设置命名空间)。
  // settings.plugin.item 非 session scope,沿用声明式挂载。
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      { name: 'settings.plugin.item', key: 'prompt-optimizer' },
      createSettingsCard(ctx, scope),
    ),
  )
}
