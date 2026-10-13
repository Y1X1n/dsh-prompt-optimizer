/**
 * prompt.ts 标记解析的单元测试。运行:先 `npm run build`,再 `node test/prompt.test.mjs`。
 */
import assert from 'node:assert/strict'
import { buildSystemPrompt, buildUserPayload, capConversationContext, compactPartialBuffer, createThinkFilter, estimateTokens, parseOptimizerOutput, parsePartialOptimizerOutput, stripThinkBlocks } from '../lib/prompt.js'

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

// 3. 完全无标记:全文作为 optimized;full 模式判 false,fast 模式判 true(单段落格式,整段即结果)
{
  const out = parseOptimizerOutput('没有遵守格式的输出')
  assert.equal(out.wellFormed, false)
  assert.equal(out.analysis, '')
  assert.equal(out.optimized, '没有遵守格式的输出')
  const fast = parseOptimizerOutput('没有输出标记但内容干净的优化稿', 'fast')
  assert.equal(fast.wellFormed, true, 'fast 模式无标记不应误报格式退化')
  assert.equal(fast.optimized, '没有输出标记但内容干净的优化稿')
  console.log('✓ p3 无标记降级')
}

// 4. 只有 OPTIMIZED:analysis 为空,optimized 取到结尾(END 缺失容错);
//    fast 模式下这正是其正确格式(只要求 OPTIMIZED),判 wellFormed=true;full 模式判 false
{
  const raw = '<<<OPTIMIZED>>>\n只有优化结果,没有 END'
  const out = parseOptimizerOutput(raw)
  assert.equal(out.wellFormed, false)
  assert.equal(out.analysis, '')
  assert.equal(out.optimized, '只有优化结果,没有 END')
  const fast = parseOptimizerOutput(raw, 'fast')
  assert.equal(fast.wellFormed, true, 'fast 模式仅 OPTIMIZED 标记 = 完全遵守格式')
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

// p14 思考块剥离 + 多组标记取最后一组(生产实测:推理模型把 <think> 当正文输出,
// 且思考里复述 <<<OPTIMIZED>>>…<<<END>>> 字样,旧解析取第一组只捞到碎片/「...」)
{
  const raw = [
    '<think>',
    '用户想要一份周报。我应该输出 <<<OPTIMIZED>>> ... <<<END>>> 这样的标记。',
    '再想想,片段 <<<OPTIMIZED>>> 和 <<<END>>> 之间只有省略号。',
    '</think>',
    '<<<OPTIMIZED>>>',
    '请写一份周报,总结本周的项目进展情况。',
    '<<<END>>>',
  ].join('\n')
  const out = parseOptimizerOutput(raw, 'fast')
  assert.equal(out.optimized, '请写一份周报,总结本周的项目进展情况。')
  assert.equal(out.wellFormed, true)
  // 全模式(带 ANALYSIS)同样正确:ANALYSIS 取 OPTIMIZED 之前的最后一个
  const full = parseOptimizerOutput('<think>思考 <<<ANALYSIS>>> 假分析 <<<OPTIMIZED>>> 假结果 <<<END>>></think>\n<<<ANALYSIS>>>\n真分析\n<<<OPTIMIZED>>>\n真结果\n<<<END>>>', 'full')
  assert.equal(full.analysis, '真分析')
  assert.equal(full.optimized, '真结果')
  assert.equal(full.wellFormed, true)
  // 纯剥离工具:完整块移除;未闭合块丢弃其后全部内容(流在思考中途被截断时,
  // 标记后的正文并不存在,残留思考里的复述标记会污染解析)
  assert.equal(stripThinkBlocks('a<think>x</think>b<think>y</think>c'), 'abc')
  assert.equal(stripThinkBlocks('a<think>未闭合'), 'a', '未闭合思考块应丢弃其后内容')
  console.log('✓ p14 思考块剥离与多组标记取最后')
}

// p15 流式部分解析:思考中不显示,闭合后解析真实段落
{
  const before = parsePartialOptimizerOutput('<think>\n推理中,还没想到 <<<OPTIMIZED>>> 标记')
  assert.deepEqual(before, { analysis: '', optimized: '' }, '思考中不产出预览')
  const during = parsePartialOptimizerOutput('<think>思考</think>\n<<<OPTIMIZED>>>\n写到一半')
  assert.equal(during.optimized, '写到一半')
  assert.equal(during.analysis, '')
  console.log('✓ p15 流式思考中抑制与闭合后解析')
}

// p16 流式思考过滤器:标记被拆在相邻 chunk 也能剥,正常内容不受影响
{
  const f = createThinkFilter()
  let out = ''
  out += f.push('你好<th')          // '<th' 可能是标记开头,扣留
  out += f.push('ink>\n思考内容')   // 判定进入思考,整段丢弃
  out += f.push('</th')             // '</th' 可能是闭合标记前缀,扣留
  out += f.push('ink>\n<<<OPTIMIZED>>>\n')  // 闭合,后续正常下发
  out += f.push('真结果')
  out += f.flush()
  assert.equal(out, '你好\n<<<OPTIMIZED>>>\n真结果', '思考内容被剥除,其余完整保留')
  // 纯正常输出(无思考)逐字不受损
  const g = createThinkFilter()
  let plain = ''
  for (const ch of '普通输出<<<OPTIMIZED>>>内容') plain += g.push(ch)
  plain += g.flush()
  assert.equal(plain, '普通输出<<<OPTIMIZED>>>内容', '无思考时内容无损')
  console.log('✓ p16 流式思考过滤器')
}

// p17 缓冲压缩在思考垃圾存在时锚定最后一组标记
{
  const raw = '<think>思考 <<<OPTIMIZED>>> 碎片 <<<END>>></think>\n<<<OPTIMIZED>>>\n优化输出到一半'
  const comp = compactPartialBuffer(raw)
  assert.equal(parsePartialOptimizerOutput(comp.compacted).optimized, '优化输出到一半')
  assert.equal(comp.analysis, '')
  console.log('✓ p17 压缩锚定最后一组标记')
}

// p18 新输出顺序(0.5.0:优化稿在前、分析在后)的完整解析
{
  const out = parseOptimizerOutput(['<<<OPTIMIZED>>>', '优化后的全文', '<<<ANALYSIS>>>', '目标清晰度 | 模糊 | 明确产出', '<<<END>>>'].join('\n'))
  assert.equal(out.wellFormed, true)
  assert.equal(out.optimized, '优化后的全文')
  assert.match(out.analysis, /目标清晰度/)
  // END 缺失同样可解析
  const noEnd = parseOptimizerOutput('<<<OPTIMIZED>>>\n优化稿\n<<<ANALYSIS>>>\n分析到结尾')
  assert.equal(noEnd.optimized, '优化稿')
  assert.equal(noEnd.analysis, '分析到结尾')
  console.log('✓ p18 新输出顺序完整解析')
}

// p19 新输出顺序的流式解析:优化稿先增长,ANALYSIS 确认后定格,分析随后增长;
// END 之后的杂音不吞进任何段落
{
  const first = parsePartialOptimizerOutput('<<<OPTIMIZED>>>\n优化稿写到一半')
  assert.equal(first.optimized, '优化稿写到一半', '优化稿应先于分析流式可见')
  assert.equal(first.analysis, '')
  const mid = parsePartialOptimizerOutput('<<<OPTIMIZED>>>\n优化稿全文\n<<<ANALYSIS>>>\n分析到一半')
  assert.equal(mid.optimized, '优化稿全文', 'ANALYSIS 确认后优化稿应定格')
  assert.equal(mid.analysis, '分析到一半')
  const end = parsePartialOptimizerOutput('<<<OPTIMIZED>>>\n优化稿全文\n<<<ANALYSIS>>>\n分析全文\n<<<END>>>')
  assert.deepEqual(end, { analysis: '分析全文', optimized: '优化稿全文' })
  // 旧代码对「ANALYSIS 在 OPTIMIZED 后」一概忽略;新顺序下这是合法结构,
  // 但 END 之后的 ANALYSIS 仍是尾部杂音,不得吞进分析段
  const junk = parseOptimizerOutput('<<<OPTIMIZED>>>\n正文\n<<<END>>>\n<<<ANALYSIS>>>\n尾巴')
  assert.equal(junk.optimized, '正文')
  assert.equal(junk.analysis, '')
  console.log('✓ p19 新输出顺序流式解析')
}

// p20 新输出顺序的两段式缓冲压缩:优化稿定格进冻结字段,缓冲收缩为分析段尾部
{
  // 阶段一:OPTIMIZED 确认、分析未开始——前缀裁掉,缓冲 = 标记行 + 优化稿尾部
  const stage1 = compactPartialBuffer('<<<OPTIMIZED>>>\n优化输出到一半')
  assert.ok(stage1.compacted.startsWith('<<<OPTIMIZED>>>'), '缓冲应以 OPTIMIZED 标记行开头')
  assert.equal(parsePartialOptimizerOutput(stage1.compacted).optimized, '优化输出到一半', '压缩后解析语义不变')
  assert.equal(stage1.analysis, '')
  assert.equal(stage1.optimized, '', '分析未开始,无优化稿可冻结')
  // 阶段二:ANALYSIS 确认——优化稿定格,缓冲收缩为分析段标记 + 尾部
  const longPrefix = 'y'.repeat(10_000)
  const stage2 = compactPartialBuffer(`<<<OPTIMIZED>>>\n${longPrefix}\n优化稿全文\n<<<ANALYSIS>>>\n分析到一半`)
  assert.equal(stage2.optimized, `${longPrefix}\n优化稿全文`, '优化稿全文应被冻结')
  assert.ok(stage2.compacted.startsWith('<<<ANALYSIS>>>'), '缓冲应收缩为分析段')
  assert.ok(stage2.compacted.length < 100, '压缩后缓冲只含分析段尾部窗口')
  // 压缩后解析:分析继续增长;优化稿由客户端冻结字段回退(解析结果为空)
  const grown = parsePartialOptimizerOutput(stage2.compacted + ',继续分析')
  assert.equal(grown.analysis, '分析到一半,继续分析')
  assert.equal(grown.optimized, '', '压缩缓冲不再携带优化稿,由冻结字段兜底')
  console.log('✓ p20 新顺序两段式压缩')
}

// p21 回归:OPTIMIZED 段落为空时不得回退到含标记的原文(否则用户会把
//     `<<<OPTIMIZED>>>` 脚手架当成结果替换进输入框,且 wellFormed 还报 true)
{
  const emptyFirst = parseOptimizerOutput('<<<OPTIMIZED>>>\n<<<ANALYSIS>>>\n目标清晰度 | 模糊 | 明确产出\n<<<END>>>', 'full')
  assert.equal(emptyFirst.optimized, '', '空 OPTIMIZED 段必须保持为空')
  assert.equal(emptyFirst.wellFormed, false, '空优化稿应判格式退化,弹出警示')
  assert.equal(emptyFirst.analysis, '目标清晰度 | 模糊 | 明确产出', '分析段照常解析')
  assert.ok(!emptyFirst.optimized.includes('<<<'), '结果中不得残留标记')

  const onlyEnd = parseOptimizerOutput('<<<OPTIMIZED>>>\n<<<END>>>', 'full')
  assert.equal(onlyEnd.optimized, '')
  assert.equal(onlyEnd.wellFormed, false)

  const blank = parseOptimizerOutput('<<<OPTIMIZED>>>\n   \n<<<END>>>', 'full')
  assert.equal(blank.optimized, '', '纯空白段落同样视为空')

  // 无标记时整段仍是结果(唯一允许的兜底),非空即合规
  const markerless = parseOptimizerOutput('直接输出的优化稿', 'fast')
  assert.equal(markerless.optimized, '直接输出的优化稿')
  assert.equal(markerless.wellFormed, true)

  // 完全空输出(如截断到只剩思考块)不得判合规
  const empty = parseOptimizerOutput('<think>被截断的推理', 'fast')
  assert.equal(empty.optimized, '')
  assert.equal(empty.wellFormed, false, '空结果不算合规')

  // 正常输出不受影响
  const ok = parseOptimizerOutput('<<<OPTIMIZED>>>\n正文\n<<<ANALYSIS>>>\n分析\n<<<END>>>', 'full')
  assert.equal(ok.optimized, '正文')
  assert.equal(ok.analysis, '分析')
  assert.equal(ok.wellFormed, true)
  console.log('✓ p21 空 OPTIMIZED 段不回退到原文')
}

// p22 回归:未闭合 <think>(流在思考中途被截断)时,思考里复述的标记不得
//     被当作真实段落——否则推理碎片会被当优化结果交付
{
  const truncated = parseOptimizerOutput('<think>\n我应输出 <<<OPTIMIZED>>>\n思考里的假结果\n<<<END>>>\n再想想...', 'fast')
  assert.equal(truncated.optimized, '', '未闭合思考块里的标记不得当结果')
  assert.equal(truncated.wellFormed, false, '未产出真实结果应判退化')

  // 闭合思考块后的真实段落仍然正确解析
  const closed = parseOptimizerOutput('<think>假 <<<OPTIMIZED>>> 碎片 <<<END>>></think>\n<<<OPTIMIZED>>>\n真结果\n<<<END>>>', 'fast')
  assert.equal(closed.optimized, '真结果')

  // 流式预览同样不受未闭合思考块污染
  assert.deepEqual(parsePartialOptimizerOutput('<think>推理中 <<<OPTIMIZED>>> 假'), { analysis: '', optimized: '' })
  console.log('✓ p22 未闭合思考块不污染解析')
}

// p23 回归:CJK 覆盖假名/谚文/扩展 B/全角标点,否则日韩长草稿的
//     autoMaxTokens 会低估 4 倍而截断
{
  assert.equal(estimateTokens('ひ'.repeat(100)), 100, '平假名应按 1 字 1 token')
  assert.equal(estimateTokens('カ'.repeat(100)), 100, '片假名应按 1 字 1 token')
  assert.equal(estimateTokens('한'.repeat(100)), 100, '谚文音节应按 1 字 1 token')
  assert.equal(estimateTokens('\u{20000}'.repeat(100)), 100, 'CJK 扩展 B 应按 1 字 1 token')
  assert.equal(estimateTokens('、'.repeat(100)), 100, '全角标点应按 1 字 1 token')
  assert.equal(estimateTokens('汉'.repeat(100)), 100, '汉字行为不变')
  assert.equal(estimateTokens('a'.repeat(100)), 25, '拉丁文仍按 4 字符 1 token')
  console.log('✓ p23 token 估算 CJK 覆盖')
}

// p24 回归:标记字样绝不进入用户可见结果。模型只吐一个孤立的 <<<END>>>
//     (截断/格式跑偏)时会落进「无 OPTIMIZED/ANALYSIS」的兜底分支,旧实现
//     直接把它当正文交付——与 p21 同一类缺陷的另一条入口。
{
  const onlyEnd = parseOptimizerOutput('<<<END>>>', 'fast')
  assert.equal(onlyEnd.optimized, '', '孤立 END 不得当正文')
  assert.equal(onlyEnd.wellFormed, false, '无产出应判退化')
  assert.ok(!onlyEnd.optimized.includes('<<<'), '结果中不得残留标记')

  const endThenText = parseOptimizerOutput('<<<END>>>\n残留文字', 'fast')
  assert.equal(endThenText.optimized, '残留文字', '标记被剔除,真实文字保留')

  const padded = parseOptimizerOutput('  <<<END>>>  ', 'fast')
  assert.equal(padded.optimized, '')

  // 无标记的正常输出不受影响
  const clean = parseOptimizerOutput('干净输出', 'fast')
  assert.equal(clean.optimized, '干净输出')
  assert.equal(clean.wellFormed, true)

  // 完整模式:END 之后的杂音仍不归属任何段落,且段落内不含标记
  const mixed = parseOptimizerOutput('<<<OPTIMIZED>>>\n正文\n<<<END>>>\n<<<ANALYSIS>>>\n尾巴', 'full')
  assert.equal(mixed.optimized, '正文')
  assert.equal(mixed.analysis, '')
  assert.ok(!/<<</.test(mixed.optimized) && !/<<</.test(mixed.analysis), '两段都不得含标记字样')
  console.log('✓ p24 标记字样不进入结果')
}

console.log('\nprompt: all passed')