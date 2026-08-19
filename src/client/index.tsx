import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// 类型级引入,激活两个目标槽位的 SlotMap 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { createOptimizeButton } from './OptimizeButton.js'
import { createResultDock } from './ResultDock.js'
import { createSettingsCard, type OptimizerSettingsValue } from './SettingsCard.js'
import { createOptimizerController } from './controller.js'
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

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<OptimizerSettingsValue>({ namespace: 'prompt-optimizer' })
  const controller = createOptimizerController(ctx, {
    // 与 Host 侧「空字符串视为未设置」的口径一致。
    isModelPinned: () => Boolean(scope.getSnapshot().value?.model?.trim()),
    // 与 Host 侧「includeContext 缺省视为开」的口径一致。
    isContextEnabled: () => scope.getSnapshot().value?.includeContext !== false,
  })

  // 发送栏工具行右区:发送按钮旁的「优化」入口(带 ✨ 图标)。
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      { name: 'conversation.input.right', id: 'prompt-optimizer', order: 30 },
      createOptimizeButton(controller),
    ),
  )

  // 输入卡上方整行的结果面板(conversation.input.dock,与 TodoDock/QueueDock 同族)。
  // 注意:不能用 conversation.composer.dock——它是环境读数槽位,且在 hero(新会话)
  // 界面不渲染,会导致面板完全不出现。
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'prompt-optimizer', order: 30 },
      createResultDock(controller),
    ),
  )

  // 设置 → 插件配置:本插件的配置卡片(keyed 槽位,key = 设置命名空间)。
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      { name: 'settings.plugin.item', key: 'prompt-optimizer' },
      createSettingsCard(ctx, scope),
    ),
  )
}
