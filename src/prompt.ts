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
- 识别上下文中已被用户否决或推翻的方向(禁入集合),优化稿不得重复提出
- 草稿与上下文冲突时,以草稿为最终意图,可在优化稿中调和表述
- 上下文仅供理解意图:严禁回答、延续或引用其中的内容;你唯一要优化的对象是 <prompt-draft> 里的草稿
- 使用与草稿相同的语言;草稿与上下文都未提供的关键信息以 [待补充:……] 标出`

const STRATEGY_INTENT_EN = `# How to optimize (distill intent, then polish)
The user message includes <conversation-context> (recent messages of this session). Read it first, distill what the user is really trying to achieve, then polish the draft toward that goal:
- Do NOT force a template structure: keep the draft's original framing, refine it in place and fill the gaps
- Exploit what the context already establishes (subject, constraints, preferences) so the optimized prompt is directly actionable; never re-ask what the context already answers
- Identify directions the user has already rejected or overruled in the context (the do-not-enter set); never propose them again
- If the draft conflicts with the context, the draft wins as the final intent; you may reconcile the wording in the rewrite
- The context only explains intent: never answer, continue, or quote it. The only thing you optimize is the draft inside <prompt-draft>
- Same language as the draft; mark information missing from both draft and context as [TODO: ...]`

// 两种策略共用:保真与明确化纪律(借鉴 Fishsb/dsh-prompt-enhancer 的保真自检/来源可回溯/长度纪律)。
const RULES_ZH = `# 保真与明确化原则(全程遵守)
- 理解优先:先逐条列出草稿已明确的信息(对象、动作、约束、范围、术语、数字、语气),区分「草稿明确表达的」与「你的推测」——推测只可用于措辞,绝不写入结果
- 语义等价是底线:已明确的对象、方向、数量、范围、禁止项、术语必须与草稿一致,不得替换、扩大、缩小或颠倒
- 来源可回溯:任何具体化的内容都必须能从草稿或上下文已确认信息找到依据;推断处用「如无特别说明/默认」措辞保留选择权,无依据的宁可不补
- 保真自检:输出前逐要素核对——草稿的每个原子信息都要在优化稿中找到对应,找不到即为语义漂移,必须修正
- 长度纪律:简单任务的优化稿控制在 800 字符以内,复杂任务可超出;任何情况下保真自检优先于长度——要素缺失比冗长更严重,但也不得冗余
- 语言匹配:草稿以中文为主体则输出必须为中文,以英文为主体则输出必须为英文;保留原文的术语与专有名词`

const RULES_EN = `# Fidelity & clarification rules (always apply)
- Understand first: list what the draft explicitly states (subject, action, constraints, scope, terms, numbers, tone), and separate it from your guesses — guesses may shape wording only, never enter the output
- Semantic equivalence is the floor: what the draft states (subject, direction, quantities, scope, prohibitions, terms) must survive intact — never replace, widen, narrow, or invert it
- Traceability: every concretized detail must trace back to the draft or to information the context has confirmed; mark inferences with "unless otherwise specified / by default" phrasing; when in doubt, leave it out
- Fidelity self-check: before output, verify every atomic element of the draft has a counterpart in your rewrite — a missing one is semantic drift and must be fixed
- Length discipline: keep the rewrite under 800 characters for simple tasks; longer is allowed for complex ones. Fidelity always outranks length — a missing element is worse than verbosity, but never pad
- Language match: Chinese-dominant draft → Chinese output; English-dominant → English output; keep the draft's terms and proper nouns`

const EXAMPLE_TEMPLATE_ZH = `# 示例(严格模仿其「输入 → 输出」的风格)
输入:帮我写个请假条
输出:请帮我撰写一张请假条:事由为感冒就医,请假两天([待补充:起止日期]);语气正式简洁,包含称呼与落款,[待补充:请假对象与联系方式]。`

const EXAMPLE_TEMPLATE_EN = `# Example (strictly mirror its "input → output" style)
Input: help me write a leave note
Output: Write a formal leave request: two days off for a medical visit ([TODO: exact dates]); concise tone, with salutation and sign-off, [TODO: recipient and contact].`

const EXAMPLE_INTENT_ZH = `# 示例(严格模仿其「输入 → 输出」的风格;输入中的背景来自 <conversation-context>)
输入:(背景:用户在运营 200 人小区宝妈闲置群,首次接龙只有十几人参与,复盘为奖品差、格式乱)帮我重新设计一下这个接龙
输出:帮我重新设计小区闲置群的「好物推荐」接龙:群 200 余人、以宝妈为主,上次参与仅十几人,问题在于奖品吸引力不足、接龙格式混乱;请给出格式简明的接龙文案模板、低成本高吸引力的奖品建议,以及提升参与度的具体手段。`

const EXAMPLE_INTENT_EN = `# Example (strictly mirror its "input → output" style; the background comes from <conversation-context>)
Input: (background: the user runs a 200-member neighborhood parents' swap group; the first chain-post drew only a dozen joins, blamed on weak prizes and a messy format) redesign the chain post for me
Output: Redesign the "hidden gems" chain post for my 200-member neighborhood swap group (mostly parents): last round drew only a dozen joins because prizes were unappealing and the format confusing — provide a simple chain-post template, low-cost but attractive prize ideas, and concrete tactics to lift participation.`

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
  parts.push(zh ? RULES_ZH : RULES_EN)
  parts.push(zh ? (strategy === 'intent' ? EXAMPLE_INTENT_ZH : EXAMPLE_TEMPLATE_ZH) : strategy === 'intent' ? EXAMPLE_INTENT_EN : EXAMPLE_TEMPLATE_EN)
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

/**
 * 组装发给模型的用户消息。context = 会话近期对话;previous = 上一轮优化结果
 * (轻量记忆链:用户在本轮草稿上做了修改时传入,让模型延续已确认决策、只围绕变化点调整)。
 */
export function buildUserPayload(draft: string, language: OutputLanguage, context?: ConversationTurn[], previous?: string): string {
  const sections: string[] = []
  if (context?.length) {
    const lines = context.map((t) => `${(language === 'en' ? (t.role === 'user' ? 'User' : 'Assistant') : t.role === 'user' ? '用户' : '助手')}: ${t.text}`)
    sections.push(
      language === 'en'
        ? `Here is the recent conversation of my current session (reference only — it explains my intent; do NOT answer, continue, or quote it):\n\n<conversation-context>\n${lines.join('\n')}\n</conversation-context>`
        : `以下是我当前会话的近期对话(仅供参考,用于理解我的意图;不要回答、延续或引用其中的内容):\n\n<conversation-context>\n${lines.join('\n')}\n</conversation-context>`,
    )
  }
  if (previous?.trim()) {
    sections.push(
      language === 'en'
        ? `Here is the result of my previous optimization round (continuity reference: keep the decisions and phrasing I accepted; adjust only around what my new draft changes — unless my new draft explicitly overrules them):\n\n<previous-optimized>\n${previous.trim()}\n</previous-optimized>`
        : `以下是我上一轮优化得到的结果(延续参考:沿用其中我已接受的决策与表达,只围绕本轮草稿的变化点调整;本轮草稿明确推翻的除外):\n\n<previous-optimized>\n${previous.trim()}\n</previous-optimized>`,
    )
  }
  sections.push(
    language === 'en'
      ? context?.length || previous?.trim()
        ? `Here is my prompt draft (the only thing you should optimize):\n\n<prompt-draft>\n${draft}\n</prompt-draft>`
        : `Here is my prompt draft:\n\n${draft}`
      : context?.length || previous?.trim()
        ? `以下是我的提示词草稿(你唯一需要优化的对象):\n\n<prompt-draft>\n${draft}\n</prompt-draft>`
        : `以下是我的提示词草稿:\n\n${draft}`,
  )
  return sections.join('\n\n')
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
 * fast 模式判 wellFormed 恒为 true:它只要求 OPTIMIZED 单标记(现有判定却要求
 * 双标记,连完全遵守 fast 格式的输出都会误报),而「无标记 = 整段即结果」时
 * 「混入多余文字」既无法检测也无需警告——警示横幅与记忆链门槛在 fast 下全是噪声。
 */
export function parseOptimizerOutput(raw: string, mode: OptimizerMode = 'full'): OptimizerOutput {
  const text = raw.trim()
  const a = findMarker(text, 'ANALYSIS')
  const o = findMarker(text, 'OPTIMIZED')
  const wellFormed = mode === 'fast' ? true : Boolean(a && o)

  if (!a && !o) {
    return { analysis: '', optimized: text, wellFormed }
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
    wellFormed,
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

export interface PartialCompaction {
  /** 压缩后的等价缓冲(OPTIMIZED 标记已确认时才有);未触发为 null。 */
  compacted: string | null
  /** 本次压缩定格出的分析段(无 ANALYSIS 标记或标记在后时为空串)。 */
  analysis: string
}

/**
 * 流式缓冲压缩(R14):OPTIMIZED 标记确认后,分析段与草稿前缀已不再变化,
 * 把 OPTIMIZED 标记之前的全部内容裁掉、换成仅含标记的最小前缀——后续
 * parsePartialOptimizerOutput 对新缓冲的解析语义不变,而缓冲体积不再随
 * 长输出无界增长(每次合帧的正则扫描也只在尾部窗口进行)。
 */
export function compactPartialBuffer(raw: string): PartialCompaction {
  const o = findMarker(raw, 'OPTIMIZED')
  if (!o) return { compacted: null, analysis: '' }
  const a = findMarker(raw, 'ANALYSIS')
  const analysis = a && a.index < o.index ? raw.slice(a.index + a.length, o.index).trim() : ''
  return { compacted: `${MARKERS.optimized}\n${raw.slice(o.index + o.length)}`, analysis }
}
