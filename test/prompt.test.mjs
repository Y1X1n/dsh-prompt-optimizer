/**
 * prompt.ts 标记解析的单元测试。运行:先 `npm run build`,再 `node test/prompt.test.mjs`。
 */
import assert from 'node:assert/strict'
import { estimateTokens, parseOptimizerOutput, parsePartialOptimizerOutput } from '../lib/prompt.js'

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

console.log('\nprompt: all passed')