import { useSyncExternalStore } from 'react'

/**
 * 界面文案的 zh/en 字典,跟随 DSH 界面语言(dsh-client-locale 服务)。
 * 服务缺席(非 web 环境/老版本)时回落中文;组件经 useT() 取文案,
 * 语言切换会触发重渲染(locale face 的 revision 会 bump)。
 */

/** locale 服务的最小依赖面(与 dsh-client-locale 的 LocaleFace 形状一致)。 */
export interface LocaleFace {
  subscribe(fn: () => void): () => void
  getSnapshot(): { active: string }
}

let face: LocaleFace | null = null

/** 由 client 入口在运行时安装(可选消费,缺席保持 null)。 */
export function installLocaleFace(next: LocaleFace | null): void {
  face = next
}

const dict = {
  zh: {
    'button.optimize': '优化',
    'button.optimizing': '优化中…',
    'button.title': '分析并优化当前输入的提示词',
    'button.titleEmpty': '先在输入框输入提示词',
    'panel.aria': '提示词优化',
    'panel.title': '提示词优化',
    'panel.closeTitle': '关闭 (Esc)',
    'panel.close': '关闭',
    'panel.stage.waiting': '等待模型响应',
    'panel.stage.analyzing': '正在分析诊断',
    'panel.stage.writing': '正在输出优化稿',
    'panel.escCancel': 'Esc 取消',
    'panel.analysis': '分析诊断',
    'panel.optimized': '优化结果',
    'panel.error': '出错了',
    'panel.cancelled': '已取消优化,以下为已生成的部分内容。',
    'panel.retry': '重试',
    'panel.replace': '替换输入框',
    'panel.copy': '复制',
    'panel.copied': '已复制 ✓',
    'panel.reoptimize': '重新优化',
    'panel.reoptimizeTitle': '重新运行优化:若草稿相对上一轮结果有改动,会携带上轮结果续改;否则全新生成',
    'panel.undo': '撤回',
    'panel.applied': '已替换到输入框 ✓',
    'panel.appliedShort': '已替换 ✓',
    'panel.undoneShort': '已撤回 ✓',
    'panel.fallback': '已回退',
    'panel.duration': '用时',
    'panel.truncated': '输出达到 Token 上限被截断。可在 设置 → 插件配置 → 提示词优化 中调高「最大输出 Token」。',
    'panel.notWellFormed': '模型未完全遵守输出格式,以上内容可能混入多余文字,替换前请扫一眼。',
    'settings.desc': '发送栏「优化」按钮(✨ 图标)的行为配置',
    'settings.loading': '设置加载中…',
    'settings.unavailable': '当前连接不可写设置(远程页面为内存模式),改动仅在本次会话生效。',
    'settings.memoryOnly': '当前为内存模式:设置不会持久化。',
    'settings.undo': '撤销上一次修改',
    'settings.undoTitle': '恢复这次修改前的全部设置(仅本次页面会话内可撤销)',
    'settings.group.model': '模型',
    'settings.group.params': '调用参数',
    'settings.group.context': '上下文',
    'settings.summary.model': '模型',
    'settings.summary.mode': '模式',
    'settings.model': '优化用模型',
    'settings.model.follow': '跟随当前会话(默认)',
    'settings.catalog.loading': '模型目录加载中…',
    'settings.catalog.error': '模型目录加载失败,点右侧按钮重试。',
    'settings.refresh': '↻ 刷新',
    'settings.refreshTitle': '重新拉取模型目录(新增提供方/模型后使用)',
    'settings.fallbackModel': '回退模型',
    'settings.fallbackModel.none': '无(默认)',
    'settings.test': '模型连通性',
    'settings.test.run': '测试连接',
    'settings.test.running': '测试中…',
    'settings.test.ok': '连接正常:{provider} / {model}({latencyMs}ms)',
    'settings.language': '输出语言',
    'settings.mode': '优化模式',
    'settings.mode.full': '完整(分析诊断 + 优化)',
    'settings.mode.fast': '快速(仅优化,等待约减半)',
    'settings.mode.full.short': '完整',
    'settings.mode.fast.short': '快速',
    'settings.effort': '推理强度',
    'settings.effort.lowest': '降到最低档(默认,推理模型更快)',
    'settings.effort.session': '跟随当前会话',
    'settings.maxTokens': '最大输出 Token',
    'settings.timeout': '超时时间(秒)',
    'settings.temperature': '采样温度',
    'settings.temperatureTitle': '优化是格式化任务,低温输出更稳定;默认 0.2,一般无需调整',
    'settings.autoMaxTokens': '输出上限自适应',
    'settings.autoMaxTokens.on': '开:长草稿自动提高输出上限(默认)',
    'settings.autoMaxTokens.off': '关:固定用上面的最大输出 Token',
    'settings.includeContext': '携带上下文',
    'settings.includeContext.on': '开:参考最近对话,优化方向更贴合(默认)',
    'settings.includeContext.off': '关:仅看草稿本身',
    'settings.validate.maxTokens': '请输入 1024–32768 之间的数字',
    'settings.validate.timeout': '请输入 10–600 之间的数字',
    'settings.validate.temperature': '请输入 0–2 之间的数字',
    'settings.repoTitle': '在 GitHub 上查看源码 / 反馈问题',
  },
  en: {
    'button.optimize': 'Optimize',
    'button.optimizing': 'Optimizing…',
    'button.title': 'Analyze and optimize the prompt in the input box',
    'button.titleEmpty': 'Type a prompt in the input box first',
    'panel.aria': 'Prompt optimizer',
    'panel.title': 'Prompt Optimizer',
    'panel.closeTitle': 'Close (Esc)',
    'panel.close': 'Close',
    'panel.stage.waiting': 'Waiting for the model',
    'panel.stage.analyzing': 'Analyzing',
    'panel.stage.writing': 'Writing the optimized prompt',
    'panel.escCancel': 'Esc to cancel',
    'panel.analysis': 'Analysis',
    'panel.optimized': 'Optimized Prompt',
    'panel.error': 'Something went wrong',
    'panel.cancelled': 'Optimization cancelled; below is the partial output generated so far.',
    'panel.retry': 'Retry',
    'panel.replace': 'Replace Input',
    'panel.copy': 'Copy',
    'panel.copied': 'Copied ✓',
    'panel.reoptimize': 'Re-optimize',
    'panel.reoptimizeTitle': 'Re-runs optimization: carries the previous result only if the draft changed since then; otherwise regenerates fresh',
    'panel.undo': 'Undo',
    'panel.applied': 'Replaced into the input box ✓',
    'panel.appliedShort': 'Applied ✓',
    'panel.undoneShort': 'Undone ✓',
    'panel.fallback': 'fallback',
    'panel.duration': 'took',
    'panel.truncated': 'Output hit the token cap and was truncated. Raise "Max output tokens" under Settings → Plugins → Prompt Optimizer.',
    'panel.notWellFormed': 'The model did not fully follow the output format; the content above may contain extra text — review before replacing.',
    'settings.desc': 'Behavior of the composer ✨ Optimize button',
    'settings.loading': 'Loading settings…',
    'settings.unavailable': 'This connection cannot write settings (remote page is in-memory); changes apply to this session only.',
    'settings.memoryOnly': 'In-memory mode: settings will not persist.',
    'settings.undo': 'Undo last change',
    'settings.undoTitle': 'Restore all settings to before this change (undo is session-only)',
    'settings.group.model': 'Model',
    'settings.group.params': 'Generation parameters',
    'settings.group.context': 'Context',
    'settings.summary.model': 'Model',
    'settings.summary.mode': 'Mode',
    'settings.model': 'Optimizer model',
    'settings.model.follow': 'Follow current session (default)',
    'settings.catalog.loading': 'Loading model catalog…',
    'settings.catalog.error': 'Failed to load the model catalog — use the button to retry.',
    'settings.refresh': '↻ Refresh',
    'settings.refreshTitle': 'Reload the model catalog (after adding providers/models)',
    'settings.fallbackModel': 'Fallback model',
    'settings.fallbackModel.none': 'None (default)',
    'settings.test': 'Connectivity',
    'settings.test.run': 'Test connection',
    'settings.test.running': 'Testing…',
    'settings.test.ok': 'Connected: {provider} / {model} ({latencyMs}ms)',
    'settings.language': 'Output language',
    'settings.mode': 'Mode',
    'settings.mode.full': 'Full (analysis + rewrite)',
    'settings.mode.fast': 'Fast (rewrite only, ~half the wait)',
    'settings.mode.full.short': 'Full',
    'settings.mode.fast.short': 'Fast',
    'settings.effort': 'Reasoning effort',
    'settings.effort.lowest': 'Clamp to lowest tier (default, faster on reasoning models)',
    'settings.effort.session': 'Follow current session',
    'settings.maxTokens': 'Max output tokens',
    'settings.timeout': 'Timeout (seconds)',
    'settings.temperature': 'Temperature',
    'settings.temperatureTitle': 'Optimization is a formatting task — low temperature gives stabler output; default 0.2, usually no need to change',
    'settings.autoMaxTokens': 'Adaptive output cap',
    'settings.autoMaxTokens.on': 'On: long drafts raise the output cap (default)',
    'settings.autoMaxTokens.off': 'Off: always use the max output tokens above',
    'settings.includeContext': 'Include context',
    'settings.includeContext.on': 'On: read recent conversation for a better-aligned rewrite (default)',
    'settings.includeContext.off': 'Off: only look at the draft itself',
    'settings.validate.maxTokens': 'Enter a number between 1024 and 32768',
    'settings.validate.timeout': 'Enter a number between 10 and 600',
    'settings.validate.temperature': 'Enter a number between 0 and 2',
    'settings.repoTitle': 'View source / report issues on GitHub',
  },
} as const

export type MessageKey = keyof (typeof dict)['zh']

/** 非 hook 版取值(语言在函数调用时读取;不触发重渲染,组件请用 useT)。 */
export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  const active = face?.getSnapshot().active === 'en' ? 'en' : 'zh'
  return interpolate(dict[active][key] ?? dict.zh[key], params)
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] !== undefined ? String(params[name]) : m))
}

/** 组件用:跟随界面语言,语言切换自动重渲染。 */
export function useT(): (key: MessageKey, params?: Record<string, string | number>) => string {
  const active = useSyncExternalStore(
    (callback) => face?.subscribe(callback) ?? (() => {}),
    () => (face?.getSnapshot().active === 'en' ? 'en' : 'zh'),
  )
  return (key, params) => interpolate(dict[active][key] ?? dict.zh[key], params)
}
