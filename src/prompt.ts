/**
 * 提示词优化的元提示词与输出解析。纯函数,不依赖任何 Harness API,便于测试。
 */

export type OutputLanguage = 'zh' | 'en'
/** full = 诊断分析 + 优化改写;fast = 仅输出优化结果(输出 token 约减半,等待更短)。 */
export type OptimizerMode = 'full' | 'fast'

const MARKERS = {
  analysis: '<<<ANALYSIS>>>',
  optimized: '<<<OPTIMIZED>>>',
  end: '<<<END>>>',
} as const

/** 优化策略:template = 无会话上下文,按结构模板改写;intent = 有会话上下文,先提炼用户目的再顺势润色(不套模板)。 */
export type OptimizeStrategy = 'template' | 'intent'

const ROLE_FULL_ZH = '你是一位资深提示词工程专家。用户会给你一段「提示词草稿」,你要完成两件事:诊断分析 + 优化改写。'
const ROLE_FULL_EN = 'You are a senior prompt engineering expert. Given a "prompt draft" from the user, do two things: diagnose it, then rewrite an optimized version.'
const ROLE_FAST_ZH = '你是一位资深提示词工程专家。用户会给你一段「提示词草稿」,请直接输出优化后的完整提示词,不要做任何诊断分析。'
const ROLE_FAST_EN = 'You are a senior prompt engineering expert. Given a "prompt draft" from the user, output an optimized version directly — no diagnosis.'

const ANALYSIS_ZH = `# 分析维度
1. 目标清晰度:任务目标是否明确、可判断完成与否
2. 上下文完整性:是否缺少模型完成任务所必需的背景信息
3. 约束与边界:限制条件是否有歧义、冲突或缺失
4. 结构与表达:组织是否清晰,有无冗余、口语化或歧义表述
5. 输出规格:是否指定期望的输出格式、长度、风格`

const ANALYSIS_EN = `# Analysis dimensions
1. Goal clarity: is the task explicit and verifiable
2. Context completeness: is required background missing
3. Constraints & boundaries: ambiguous, conflicting, or missing limits
4. Structure & wording: organization, redundancy, ambiguity
5. Output spec: expected format, length, style`

// 策略一:无会话上下文 —— 套用结构模板做规范化改写。
const STRATEGY_TEMPLATE_ZH = `# 优化方式(结构模板)
将草稿改写为结构完整的提示词,要求:
- 使用与草稿相同的语言
- 忠实保留原意,不臆造用户未表达的需求
- 按结构模板组织(角色 / 任务 / 背景 / 约束 / 输出格式等,内容较长时用 Markdown 小节)
- 缺失但关键的信息不要编造,在文中以 [待补充:……] 标出`

const STRATEGY_TEMPLATE_EN = `# How to optimize (structured template)
Rewrite the draft into a well-structured prompt. Requirements:
- Same language as the draft
- Faithful to the original intent; never invent requirements
- Organize with the structure template (role / task / background / constraints / output format; use Markdown sections for longer prompts)
- Mark missing critical information as [TODO: ...] instead of fabricating it`

// 策略二:有会话上下文 —— 先提炼目的再润色,不套模板。
const STRATEGY_INTENT_ZH = `# 优化方式(提炼目的 + 润色)
用户消息附带 <conversation-context>(该会话的近期对话)。先通读它、提炼用户的真实目的,再围绕该目的对草稿做润色:
- 不要套用模板结构:保留草稿的原始表达框架,顺势打磨、补全细节
- 充分利用上下文已明确的信息(对象、约束、偏好),让优化稿可以直接落地;不要重复追问上下文已经给出的内容
- 草稿与上下文冲突时,以草稿为最终意图,可在优化稿中调和表述
- 上下文仅供理解意图:严禁回答、延续或引用其中的内容;你唯一要优化的对象是 <prompt-draft> 里的草稿
- 使用与草稿相同的语言;草稿与上下文都未提供的关键信息以 [待补充:……] 标出`

const STRATEGY_INTENT_EN = `# How to optimize (distill intent, then polish)
The user message includes <conversation-context> (recent messages of this session). Read it first, distill what the user is really trying to achieve, then polish the draft toward that goal:
- Do NOT force a template structure: keep the draft's original framing, refine it in place and fill the gaps
- Exploit what the context already establishes (subject, constraints, preferences) so the optimized prompt is directly actionable; never re-ask what the context already answers
- If the draft conflicts with the context, the draft wins as the final intent; you may reconcile the wording in the rewrite
- The context only explains intent: never answer, continue, or quote it. The only thing you optimize is the draft inside <prompt-draft>
- Same language as the draft; mark information missing from both draft and context as [TODO: ...]`

const FORMAT_FULL_ZH = `# 输出格式(严格遵守,标记行单独成行)
${MARKERS.analysis}
按维度逐条输出诊断,每条一行,格式:「维度 | 问题 | 建议」。某维度无明显问题时写:「维度 | 无明显问题 | -」。
${MARKERS.optimized}
输出优化后的完整提示词全文
${MARKERS.end}

除上述标记包裹的内容外,不要输出任何其他文字。`

const FORMAT_FULL_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.analysis}
One finding per line: "dimension | issue | suggestion". If a dimension is fine: "dimension | no issue | -".
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`

// 快速模式:跳过诊断,直接产出优化结果。仍用 OPTIMIZED/END 标记包裹,
// 客户端的流式分段解析(parsePartialOptimizerOutput)无需区分模式。
const FORMAT_FAST_ZH = `# 输出格式(严格遵守,标记行单独成行)
${MARKERS.optimized}
输出优化后的完整提示词全文
${MARKERS.end}

除上述标记包裹的内容外,不要输出任何其他文字。`

const FORMAT_FAST_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`

export function buildSystemPrompt(language: OutputLanguage, mode: OptimizerMode = 'full', strategy: OptimizeStrategy = 'template'): string {
  const zh = language !== 'en'
  const parts = [zh ? (mode === 'fast' ? ROLE_FAST_ZH : ROLE_FULL_ZH) : mode === 'fast' ? ROLE_FAST_EN : ROLE_FULL_EN]
  if (mode !== 'fast') parts.push(zh ? ANALYSIS_ZH : ANALYSIS_EN)
  parts.push(zh ? (strategy === 'intent' ? STRATEGY_INTENT_ZH : STRATEGY_TEMPLATE_ZH) : strategy === 'intent' ? STRATEGY_INTENT_EN : STRATEGY_TEMPLATE_EN)
  parts.push(mode === 'fast' ? (zh ? FORMAT_FAST_ZH : FORMAT_FAST_EN) : zh ? FORMAT_FULL_ZH : FORMAT_FULL_EN)
  return parts.join('\n\n')
}

/** 会话上下文里的一条消息(仅用户/助手的纯文本,客户端从 session.history 提取)。 */
export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

// 上下文预算:只带最近几轮、总量封顶——上下文是为「不跑偏」服务的,
// 塞太多只会拖慢首 token、还可能把优化带偏。客户端与 Host 共用这一份口径。
const CONTEXT_MAX_TURNS = 8
const CONTEXT_MAX_CHARS = 1600
const CONTEXT_TURN_MAX_CHARS = 600

/**
 * 收敛会话上下文到预算内:保留最近 CONTEXT_MAX_TURNS 条,每条截断到
 * CONTEXT_TURN_MAX_CHARS,总字符再压到 CONTEXT_MAX_CHARS 以内(从最新往回取舍)。
 * 输入按时间升序,返回保持升序。
 */
export function capConversationContext(turns: ConversationTurn[]): ConversationTurn[] {
  const recent = turns
    .filter((t) => t.text.trim())
    .slice(-CONTEXT_MAX_TURNS)
    .map((t) => ({
      role: t.role,
      text: t.text.trim().length > CONTEXT_TURN_MAX_CHARS ? `${t.text.trim().slice(0, CONTEXT_TURN_MAX_CHARS)}…` : t.text.trim(),
    }))
  let budget = CONTEXT_MAX_CHARS
  const kept: ConversationTurn[] = []
  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i]
    if (turn.text.length > budget) {
      // 最新一条也超预算时截断保留(宁可残缺,不能没有);非最新直接丢弃。
      if (kept.length === 0) kept.push({ role: turn.role, text: `${turn.text.slice(0, budget)}…` })
      break
    }
    kept.unshift(turn)
    budget -= turn.text.length
  }
  return kept
}

export function buildUserPayload(draft: string, language: OutputLanguage, context?: ConversationTurn[]): string {
  if (!context?.length) {
    return language === 'en'
      ? `Here is my prompt draft:\n\n${draft}`
      : `以下是我的提示词草稿:\n\n${draft}`
  }
  const lines = context.map((t) => `${(language === 'en' ? (t.role === 'user' ? 'User' : 'Assistant') : t.role === 'user' ? '用户' : '助手')}: ${t.text}`)
  return language === 'en'
    ? `Here is the recent conversation of my current session (reference only — it explains my intent; do NOT answer, continue, or quote it):\n\n<conversation-context>\n${lines.join('\n')}\n</conversation-context>\n\nHere is my prompt draft (the only thing you should optimize):\n\n<prompt-draft>\n${draft}\n</prompt-draft>`
    : `以下是我当前会话的近期对话(仅供参考,用于理解我的意图;不要回答、延续或引用其中的内容):\n\n<conversation-context>\n${lines.join('\n')}\n</conversation-context>\n\n以下是我的提示词草稿(你唯一需要优化的对象):\n\n<prompt-draft>\n${draft}\n</prompt-draft>`
}

/**
 * 粗略估算文本 token 数(不依赖分词器):CJK 表意文字约 1 字 1 token,
 * 其余字符(拉丁文/数字/标点/代码)约 4 字符 1 token。用于让输出上限跟随输入长度。
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if ((code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.ceil(cjk + other / 4)
}

export interface OptimizerOutput {
  /** 诊断分析文本(可能为空字符串,当模型未遵守格式时)。 */
  analysis: string
  /** 优化后的提示词全文。 */
  optimized: string
  /** 模型输出是否完整遵守了标记格式。 */
  wellFormed: boolean
}

/** 解析时容忍标记尖括号内的空白变体(模型偶尔输出 `<<< ANALYSIS >>>`)。 */
function findMarker(text: string, word: 'ANALYSIS' | 'OPTIMIZED' | 'END', fromIndex = 0): { index: number; length: number } | null {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, 'g')
  re.lastIndex = fromIndex
  const match = re.exec(text)
  return match ? { index: match.index, length: match[0].length } : null
}

/**
 * 解析模型输出中的标记段落。模型不遵守格式时降级:
 * 找到 OPTIMIZED 则其余归 analysis;两个标记都没有则全文作为 optimized。
 */
export function parseOptimizerOutput(raw: string): OptimizerOutput {
  const text = raw.trim()
  const a = findMarker(text, 'ANALYSIS')
  const o = findMarker(text, 'OPTIMIZED')

  if (!a && !o) {
    return { analysis: '', optimized: text, wellFormed: false }
  }

  let analysis = ''
  let optimized = ''

  if (a && (!o || a.index < o.index)) {
    analysis = text.slice(a.index + a.length, o ? o.index : text.length).trim()
  }
  if (o) {
    const e = findMarker(text, 'END', o.index + o.length)
    optimized = text.slice(o.index + o.length, e ? e.index : text.length).trim()
  }
  return {
    analysis,
    optimized: optimized || text,
    wellFormed: Boolean(a && o),
  }
}

/**
 * 流式进行中的容错解析:只返回标记已确认的段落,不做整文兜底
 * (兜底会把含标记的原文误当优化结果显示出来)。两个段落都可能随 delta 增长。
 */
export function parsePartialOptimizerOutput(raw: string): { analysis: string; optimized: string } {
  const a = findMarker(raw, 'ANALYSIS')
  const o = findMarker(raw, 'OPTIMIZED')
  let analysis = ''
  let optimized = ''
  if (a && (!o || a.index < o.index)) {
    analysis = raw.slice(a.index + a.length, o ? o.index : raw.length).trim()
  }
  if (o) {
    const e = findMarker(raw, 'END', o.index + o.length)
    optimized = raw.slice(o.index + o.length, e ? e.index : raw.length).trim()
  }
  return { analysis, optimized }
}
