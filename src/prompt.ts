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

const SYSTEM_ZH = `你是一位资深提示词工程专家。用户会给你一段「提示词草稿」,你要完成两件事:诊断分析 + 优化改写。

# 分析维度
1. 目标清晰度:任务目标是否明确、可判断完成与否
2. 上下文完整性:是否缺少模型完成任务所必需的背景信息
3. 约束与边界:限制条件是否有歧义、冲突或缺失
4. 结构与表达:组织是否清晰,有无冗余、口语化或歧义表述
5. 输出规格:是否指定期望的输出格式、长度、风格

# 输出格式(严格遵守,标记行单独成行)
${MARKERS.analysis}
按维度逐条输出诊断,每条一行,格式:「维度 | 问题 | 建议」。某维度无明显问题时写:「维度 | 无明显问题 | -」。
${MARKERS.optimized}
输出优化后的完整提示词全文,要求:
- 使用与草稿相同的语言
- 忠实保留原意,不臆造用户未表达的需求
- 结构清晰(内容较长时可用 Markdown 小节:角色 / 任务 / 约束 / 输出格式等)
- 缺失但关键的信息不要编造,在文中以 [待补充:……] 标出
${MARKERS.end}

除上述标记包裹的内容外,不要输出任何其他文字。`

const SYSTEM_EN = `You are a senior prompt engineering expert. Given a "prompt draft" from the user, do two things: diagnose it, then rewrite an optimized version.

# Analysis dimensions
1. Goal clarity: is the task explicit and verifiable
2. Context completeness: is required background missing
3. Constraints & boundaries: ambiguous, conflicting, or missing limits
4. Structure & wording: organization, redundancy, ambiguity
5. Output spec: expected format, length, style

# Output format (strictly follow; markers on their own lines)
${MARKERS.analysis}
One finding per line: "dimension | issue | suggestion". If a dimension is fine: "dimension | no issue | -".
${MARKERS.optimized}
The full optimized prompt text. Requirements:
- Same language as the draft
- Faithful to the original intent; never invent requirements
- Clear structure (use Markdown sections for longer prompts: role / task / constraints / output format)
- Mark missing critical information as [TODO: ...] instead of fabricating it
${MARKERS.end}

Do not output anything outside these markers.`

// 快速模式:跳过诊断,直接产出优化结果。仍用 OPTIMIZED/END 标记包裹,
// 客户端的流式分段解析(parsePartialOptimizerOutput)无需区分模式。
const SYSTEM_FAST_ZH = `你是一位资深提示词工程专家。用户会给你一段「提示词草稿」,请直接输出优化后的完整提示词,不要做任何诊断分析。

# 优化要求
- 使用与草稿相同的语言
- 忠实保留原意,不臆造用户未表达的需求
- 结构清晰(内容较长时可用 Markdown 小节:角色 / 任务 / 约束 / 输出格式等)
- 缺失但关键的信息不要编造,在文中以 [待补充:……] 标出

# 输出格式(严格遵守,标记行单独成行)
${MARKERS.optimized}
输出优化后的完整提示词全文
${MARKERS.end}

除上述标记包裹的内容外,不要输出任何其他文字。`

const SYSTEM_FAST_EN = `You are a senior prompt engineering expert. Given a "prompt draft" from the user, output an optimized version directly — no diagnosis.

# Optimization requirements
- Same language as the draft
- Faithful to the original intent; never invent requirements
- Clear structure (use Markdown sections for longer prompts: role / task / constraints / output format)
- Mark missing critical information as [TODO: ...] instead of fabricating it

# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`

export function buildSystemPrompt(language: OutputLanguage, mode: OptimizerMode = 'full'): string {
  if (mode === 'fast') return language === 'en' ? SYSTEM_FAST_EN : SYSTEM_FAST_ZH
  return language === 'en' ? SYSTEM_EN : SYSTEM_ZH
}

export function buildUserPayload(draft: string, language: OutputLanguage): string {
  return language === 'en'
    ? `Here is my prompt draft:\n\n${draft}`
    : `以下是我的提示词草稿:\n\n${draft}`
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
