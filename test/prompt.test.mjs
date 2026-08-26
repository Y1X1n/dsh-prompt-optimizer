/**
 * prompt.ts 标记解析的单元测试。运行:先 `npm run build`,再 `node test/prompt.test.mjs`。
 */
import assert from 'node:assert/strict'
import { buildSystemPrompt, buildUserPayload, capConversationContext, compactPartialBuffer, estimateTokens, parseOptimizerOutput, parsePartialOptimizerOutput } from '../lib/prompt.js'

// 1. 标准标记:正常分段
{
  const out = parseOptimizerOutput(
    ['<<<ANALYSIS>>>', '目标清晰度 | 模糊 | 明确产出', '<<<OPTIMIZED>>>', '优化后的全文', '<<<END>>>'].join('\n'),
  )
  assert.equal(out.wellFormed, true)
  assert.match(out.analysis, /目标清晰度/)
  assert.equal(out.optimized, '优化后的全文')
  console.log('✓ p1 标准标记')
}

// 2. 空白变体:`<<< ANALYSIS >>>` 也能识别
{
  const out = parseOptimizerOutput(
    ['<<<  ANALYSIS>>>', '分析内容', '<<<OPTIMIZED  >>>', '优化内容', '<<< END>>>'].join('\n'),
  )
  assert.equal(out.wellFormed, true)
  assert.equal(out.analysis, '分析内容')
  assert.equal(out.optimized, '优化内容')
  console.log('✓ p2 空白变体标记')
}

// 3. 完全无标记:全文作为 optimized,wellFormed=false
{
  const out = parseOptimizerOutput('没有遵守格式的输出')
  assert.equal(out.wellFormed, false)
  assert.equal(out.analysis, '')
  assert.equal(out.optimized, '没有遵守格式的输出')
  console.log('✓ p3 无标记降级')
}

// 4. 只有 OPTIMIZED:analysis 为空,optimized 取到结尾(END 缺失容错)
{
  const out = parseOptimizerOutput('<<<OPTIMIZED>>>\n只有优化结果,没有 END')
  assert.equal(out.wellFormed, false)
  assert.equal(out.analysis, '')
  assert.equal(out.optimized, '只有优化结果,没有 END')
  console.log('✓ p4 缺 END 容错')
}

// 5. 标记乱序(ANALYSIS 在 OPTIMIZED 后):analysis 不误吞 optimized 段
{
  const out = parseOptimizerOutput('<<<OPTIMIZED>>>\n正文\n<<<END>>>\n<<<ANALYSIS>>>\n尾巴')
  assert.equal(out.optimized, '正文')
  assert.equal(out.analysis, '')
  console.log('✓ p5 乱序标记')
}

// 6. 流式实况:不做整文兜底,只返回标记已确认的段落
{
  // 还没出现任何标记时,两段都为空(不能把含标记的原文误当优化结果)
  assert.deepEqual(parsePartialOptimizerOutput('<<<ANAL'), { analysis: '', optimized: '' })
  // 只有 ANALYSIS:analysis 增长,optimized 仍为空
  const mid = parsePartialOptimizerOutput('<<<ANALYSIS>>>\n分析到一半')
  assert.equal(mid.analysis, '分析到一半')
  assert.equal(mid.optimized, '')
  // OPTIMIZED 出现后:analysis 定格,optimized 开始增长
  const late = parsePartialOptimizerOutput('<<<ANALYSIS>>>\n分析完\n<<<OPTIMIZED>>>\n优化到一半')
  assert.equal(late.analysis, '分析完')
  assert.equal(late.optimized, '优化到一半')
  console.log('✓ p6 流式实况解析')
}

// 7. token 估算:CJK 约 1 字 1 token,其余约 4 字符 1 token
{
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('你好世界'), 4)
  assert.equal(estimateTokens('abcd'), 1)
  assert.equal(estimateTokens('你好ab'), 3) // 2 CJK + 2 latin(0.5)→ 向上取整 3
  console.log('✓ p7 token 估算')
}

// 8. 上下文载荷:无上下文保持旧格式;有上下文带分隔段且草稿置后
{
  const plain = buildUserPayload('我的草稿', 'zh')
  assert.equal(plain, '以下是我的提示词草稿:\n\n我的草稿', '无上下文时必须保持旧格式')

  const ctx = buildUserPayload('我的草稿', 'zh', [
    { role: 'user', text: '帮我写一个爬虫' },
    { role: 'assistant', text: '好的,用什么语言?' },
  ])
  assert.match(ctx, /<conversation-context>/)
  assert.match(ctx, /用户: 帮我写一个爬虫/)
  assert.match(ctx, /助手: 好的,用什么语言\?/)
  assert.match(ctx, /<prompt-draft>\n我的草稿\n<\/prompt-draft>/)
  assert.ok(ctx.indexOf('conversation-context') < ctx.indexOf('prompt-draft'), '上下文必须置于草稿之前')
  assert.match(ctx, /不要回答、延续或引用/, '必须声明上下文仅供参考')

  const en = buildUserPayload('my draft', 'en', [{ role: 'user', text: 'hello' }])
  assert.match(en, /User: hello/)
  assert.match(en, /<prompt-draft>\nmy draft\n<\/prompt-draft>/)

  // 空数组等价于无上下文
  assert.equal(buildUserPayload('我的草稿', 'zh', []), plain)
  console.log('✓ p8 上下文载荷')
}

// 9. 上下文预算收敛:保留最近 N 条、逐条截断、总量封顶
{
  // 只保留最近 8 条
  const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `第${i + 1}条` }))
  const capped = capConversationContext(many)
  assert.equal(capped.length, 8)
  assert.equal(capped[0].text, '第13条', '应从第 13 条开始保留')
  assert.equal(capped.at(-1).text, '第20条')

  // 单条超 600 字符截断
  const long = capConversationContext([{ role: 'user', text: '长'.repeat(1000) }])
  assert.equal(long[0].text.length, 601) // 600 + 省略号
  assert.ok(long[0].text.endsWith('…'))

  // 总量 1600 字符封顶:从最新往回取舍,最新的残缺也要保留
  const bulk = Array.from({ length: 6 }, (_, i) => ({ role: 'user', text: `${i}${'字'.repeat(799)}` })) // 每条 800,截断到 601
  const total = capConversationContext(bulk)
  assert.ok(total.reduce((sum, t) => sum + t.text.length, 0) <= 1600, '总量不得超预算')
  assert.ok(total.at(-1).text.startsWith('5'), '最新一条必须保留')

  // 空文本条目被过滤
  assert.deepEqual(capConversationContext([{ role: 'user', text: '  ' }]), [])
  console.log('✓ p9 上下文预算收敛')
}

// 10. 策略分叉:默认(无上下文)套结构模板;intent(有上下文)提炼目的 + 润色、不套模板
{
  const tpl = buildSystemPrompt('zh')
  assert.match(tpl, /按结构模板组织/, '默认应走结构模板')
  assert.ok(!tpl.includes('提炼用户的真实目的'), '默认不应包含 intent 策略')

  const intent = buildSystemPrompt('zh', 'full', 'intent')
  assert.match(intent, /提炼用户的真实目的/)
  assert.match(intent, /不要套用模板结构/)
  assert.match(intent, /严禁回答、延续或引用/, 'intent 必须保留上下文护栏')
  assert.ok(!intent.includes('按结构模板组织'), 'intent 不应包含模板策略')
  assert.match(intent, /分析维度/, '完整模式保留分析段')

  const fastIntent = buildSystemPrompt('zh', 'fast', 'intent')
  assert.match(fastIntent, /提炼用户的真实目的/)
  assert.ok(!fastIntent.includes('分析维度'), '快速模式不做诊断')
  assert.ok(!fastIntent.includes('ANALYSIS'), '快速模式无 ANALYSIS 标记')

  const en = buildSystemPrompt('en', 'full', 'intent')
  assert.match(en, /distill what the user is really trying to achieve/)
  assert.match(buildSystemPrompt('en'), /structure template/)
  console.log('✓ p10 策略分叉')
}

// 11. 保真纪律与示例:两种策略都含保真自检/来源可回溯/长度纪律;禁入集合仅 intent
{
  const tpl = buildSystemPrompt('zh', 'full', 'template')
  const intent = buildSystemPrompt('zh', 'full', 'intent')
  for (const sys of [tpl, intent]) {
    assert.match(sys, /保真自检/, '应含保真自检')
    assert.match(sys, /来源可回溯/, '应含来源可回溯')
    assert.match(sys, /长度纪律/, '应含长度纪律')
    assert.match(sys, /# 示例/, '应含 few-shot 示例')
  }
  assert.match(intent, /禁入集合/, 'intent 应含禁入集合')
  assert.ok(!tpl.includes('禁入集合'), 'template 不应含禁入集合')
  // 快速模式同样携带纪律与示例
  const fast = buildSystemPrompt('zh', 'fast', 'template')
  assert.match(fast, /保真自检/)
  assert.match(fast, /# 示例/)
  console.log('✓ p11 保真纪律与示例')
}

// 12. 记忆链载荷:previous 段在上下文之后、草稿之前;无 previous 时不出现
{
  const withPrev = buildUserPayload('新草稿', 'zh', undefined, '上一轮的优化结果')
  assert.match(withPrev, /<previous-optimized>\n上一轮的优化结果\n<\/previous-optimized>/)
  assert.ok(withPrev.indexOf('previous-optimized') < withPrev.indexOf('<prompt-draft>'), 'previous 必须置于草稿之前')
  assert.match(withPrev, /只围绕本轮草稿的变化点调整/)

  const noPrev = buildUserPayload('草稿', 'zh')
  assert.ok(!noPrev.includes('previous-optimized'))
  assert.equal(noPrev, '以下是我的提示词草稿:\n\n草稿', '无上下文无 previous 时保持旧格式')

  // previous 与上下文共存:context → previous → draft 的顺序
  const both = buildUserPayload('草稿', 'zh', [{ role: 'user', text: '前文' }], '上轮结果')
  assert.ok(both.indexOf('conversation-context') < both.indexOf('previous-optimized'))
  assert.ok(both.indexOf('previous-optimized') < both.indexOf('<prompt-draft>'))
  console.log('✓ p12 记忆链载荷')
}

// 13. R14 流式缓冲压缩:OPTIMIZED 确认后裁掉前缀,解析语义不变
{
  // 无 OPTIMIZED 标记:不压缩
  const none = compactPartialBuffer('<<<ANALYSIS>>>\n分析到一半')
  assert.equal(none.compacted, null)
  assert.equal(none.analysis, '')

  // 有标记:前缀(含草稿/分析段)全部裁掉,定格出分析段
  const longPrefix = 'x'.repeat(10_000)
  const raw = `${longPrefix}\n<<<ANALYSIS>>>\n五维诊断全文\n<<<OPTIMIZED>>>\n优化输出到一半`
  const comp = compactPartialBuffer(raw)
  assert.ok(comp.compacted.length < 100, '压缩后缓冲只剩最小前缀 + 尾部窗口')
  assert.equal(comp.analysis, '五维诊断全文')

  // 压缩后继续追加 delta,parsePartialOptimizerOutput 语义与不压缩时一致
  const grown = parsePartialOptimizerOutput(comp.compacted + ',继续输出')
  assert.equal(grown.optimized, '优化输出到一半,继续输出')
  const noCompact = parsePartialOptimizerOutput(raw + ',继续输出')
  assert.deepEqual(grown, { analysis: '', optimized: noCompact.optimized }, '压缩前后 optimized 解析等价')

  // 压缩可重复作用(解析语义等价,非严格字节幂等):再次压缩后 optimized 不丢字
  const again = compactPartialBuffer(comp.compacted)
  assert.equal(parsePartialOptimizerOutput(again.compacted).optimized, '优化输出到一半')
  assert.equal(again.analysis, '')
  console.log('✓ p13 流式缓冲压缩')
}

console.log('\nprompt: all passed')