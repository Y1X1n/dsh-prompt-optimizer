/**
 * Host 半冒烟测试:真实 cordis Context + mock 的 llm/httpServer 服务,
 * 直接驱动插件注册的 HTTP handler,覆盖成功、错误与边界路径。
 *
 * 运行:先 `npm run build`,再 `node test/smoke.mjs`。
 */
import { Readable } from 'node:stream'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/index.js'

const CANNED = [
  '<<<ANALYSIS>>>',
  '目标清晰度 | 目标模糊 | 明确产出物',
  '输出规格 | 缺少格式要求 | 指定 Markdown 输出',
  '<<<OPTIMIZED>>>',
  '你是一名资深代码评审。请审查以下 PR……',
  '<<<END>>>',
].join('\n')

function makeReq(body, method = 'POST') {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  req.method = method
  return req
}

/** 调用插件注册的 handler 并收集响应。raw 为字符串时按原样发送(用于畸形 JSON 用例)。 */
async function call(handler, body, method) {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writableEnded: false,
    destroyed: false,
    on() {},
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
      return res
    },
    write(chunk) {
      res.body += chunk
      return true
    },
    end(payload) {
      if (payload) res.body += payload
      res.writableEnded = true
    },
  }
  const req =
    typeof body === 'string'
      ? Object.assign(Readable.from([body]), { method: method ?? 'POST' })
      : makeReq(body, method)
  await handler(req, res)
  return res
}

/** 解析 SSE 响应体中的全部事件帧。 */
function sseEvents(res) {
  return res.body
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      return line ? JSON.parse(line.slice(5).trim()) : null
    })
    .filter(Boolean)
}

/** 成功响应(200 + SSE)中的 done 事件,等价于改版前的 JSON body。 */
function doneOf(res) {
  assert.equal(res.status, 200)
  assert.match(String(res.headers['content-type']), /text\/event-stream/)
  const done = sseEvents(res).find((e) => e.type === 'done')
  assert.ok(done, '应收到 done 事件')
  return done
}

async function setup({ config = {}, llmOverrides = {} } = {}) {
  const routes = {}
  let lastOptions = null
  const ctx = new Context()
  ctx.provide('httpServer', {
    register(r) {
      routes[r.path] = r
      return () => {}
    },
  })
  ctx.provide('llm', {
    async *stream(options) {
      lastOptions = options
      for (const line of CANNED.split('\n')) {
        yield { type: 'text-delta', index: 0, text: line + '\n' }
      }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
    listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek 官方' }],
    listModels: async () => [{ provider: 'deepseek-official', id: 'deepseek-chat', name: 'DeepSeek Chat' }],
    ...llmOverrides,
  })
  await ctx.plugin(plugin, config)
  assert.ok(routes['/dsh-prompt-optimizer/optimize'], '插件应注册优化路由')
  assert.ok(routes['/dsh-prompt-optimizer/test-model'], '插件应注册测试路由')
  return {
    ctx,
    handler: routes['/dsh-prompt-optimizer/optimize'].handler,
    testHandler: routes['/dsh-prompt-optimizer/test-model'].handler,
    getOptions: () => lastOptions,
  }
}

// 1. 正常路径:分析 + 优化结果按标记解析
{
  const { handler } = await setup()
  const res = await call(handler, { text: '帮我看看这段代码', provider: 'session-p', model: 'session-m' })
  const data = doneOf(res)
  assert.ok(sseEvents(res).some((e) => e.type === 'delta'), '应先推送 delta 事件')
  assert.match(data.analysis, /目标清晰度/)
  assert.match(data.optimized, /资深代码评审/)
  assert.ok(!data.optimized.includes('ANALYSIS'), 'optimized 不应包含标记内容')
  assert.equal(data.provider, 'session-p')
  assert.equal(data.model, 'session-m')
  console.log('✓ 1 正常路径')
}

// 2. 设置里固定模型('provider/model')覆盖会话模型
{
  const { handler } = await setup({ config: { model: 'cfg-p/cfg-m' } })
  const res = await call(handler, { text: 'x', provider: 'session-p', model: 'session-m' })
  const data = doneOf(res)
  assert.equal(data.provider, 'cfg-p')
  assert.equal(data.model, 'cfg-m')
  console.log('✓ 2 设置固定模型优先')
}

// 2b. 回归:配置字段为空字符串时必须视为未设置(而不是错落到首个路由)
{
  const { handler } = await setup({ config: { model: '' } })
  const res = await call(handler, { text: 'x', provider: 'session-p', model: 'session-m' })
  const data = doneOf(res)
  assert.equal(data.provider, 'session-p')
  assert.equal(data.model, 'session-m')
  console.log('✓ 2b 空字符串配置视为未设置')
}

// 2c. 回归:固定值缺少 '/' 分隔时视为未配置,回落到会话选择
{
  const { handler } = await setup({ config: { model: 'cfg-p-only' } })
  const res = await call(handler, { text: 'x', provider: 'session-p', model: 'session-m' })
  const data = doneOf(res)
  assert.equal(data.provider, 'session-p')
  assert.equal(data.model, 'session-m')
  console.log('✓ 2c 畸形固定值回落会话')
}

// 3. 会话与设置都没给模型时,回退到第一个可用路由
{
  const { handler } = await setup()
  const res = await call(handler, { text: 'x' })
  const data = doneOf(res)
  assert.equal(data.provider, 'deepseek-official')
  assert.equal(data.model, 'deepseek-chat')
  console.log('✓ 3 回退到首个可用路由')
}

// 4. 完全无可用模型 → 409
{
  const { handler } = await setup({
    llmOverrides: { listProviders: () => [], listModels: async () => [] },
  })
  const res = await call(handler, { text: 'x' })
  assert.equal(res.status, 409)
  assert.equal(JSON.parse(res.body).ok, false)
  console.log('✓ 4 无模型 → 409')
}

// 5. 空文本 → 400;GET → 405
{
  const { handler } = await setup()
  const a = await call(handler, { text: '   ' })
  assert.equal(a.status, 400)
  const b = await call(handler, undefined, 'GET')
  assert.equal(b.status, 405)
  console.log('✓ 5 参数与方法校验')
}

// 5b. 畸形 JSON → 400;超大请求体 → 413(不再是笼统的 502)
{
  const { handler } = await setup()
  const bad = await call(handler, '{not json')
  assert.equal(bad.status, 400)
  assert.match(JSON.parse(bad.body).error, /JSON/)
  const big = await call(handler, JSON.stringify({ text: 'x'.repeat(300 * 1024) }))
  assert.equal(big.status, 413)
  console.log('✓ 5b 畸形 JSON → 400,超大请求体 → 413')
}

// 6. 模型终态错误 → SSE error 事件(进入流式阶段后无法再改状态码)
{
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'API key is invalid' } } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(res.status, 200)
  const err = sseEvents(res).find((e) => e.type === 'error')
  assert.ok(err, '应收到 error 事件')
  assert.match(err.error, /API key is invalid/)
  console.log('✓ 6 模型错误 → SSE error 事件')
}

// 7. max-tokens 截断:正常返回内容并带 truncated 标记
{
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '<<<OPTIMIZED>>>\n写到一半被截断的' }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  const data = doneOf(res)
  assert.equal(data.truncated, true)
  assert.match(data.optimized, /截断/)
  console.log('✓ 7 max-tokens 截断标记')
}

// 8. 超时:模型挂死时中止流并推送 error 事件(慢用例,约 10s)
{
  const { handler } = await setup({
    config: { timeoutSeconds: 10 },
    llmOverrides: {
      stream(options) {
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'text-delta', index: 0, text: '<<<ANALYSIS>>>\n卡在分析阶段' }
            await new Promise((_, reject) => {
              options.signal.addEventListener('abort', () => reject(new Error('aborted')))
            })
          },
        }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  const err = sseEvents(res).find((e) => e.type === 'error')
  assert.ok(err, '超时后应收到 error 事件')
  assert.match(err.error, /超时/)
  console.log('✓ 8 超时中止并通知(慢)')
}

// 9. 快速模式:系统提示词不含分析段要求,解析仍走标记通道
{
  const { handler, getOptions } = await setup({ config: { mode: 'fast' } })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  const data = doneOf(res)
  assert.ok(!getOptions().system.includes('ANALYSIS'), 'fast 模式不应要求 ANALYSIS 段')
  assert.ok(getOptions().system.includes('OPTIMIZED'), 'fast 模式仍用 OPTIMIZED 标记')
  assert.match(data.optimized, /资深代码评审/)
  console.log('✓ 9 快速模式提示词')
}

// 9b. 默认完整模式:提示词要求 ANALYSIS + OPTIMIZED 双段
{
  const { handler, getOptions } = await setup()
  await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.ok(getOptions().system.includes('ANALYSIS'))
  assert.ok(getOptions().system.includes('OPTIMIZED'))
  console.log('✓ 9b 默认完整模式提示词')
}

// 10. 推理强度默认钳最低档(不显式配置时):钳到 resolveModel 暴露的最低 effort,覆盖会话值
{
  const { handler, getOptions } = await setup({
    llmOverrides: {
      resolveModelInfo: async () => ({
        provider: 'p',
        id: 'm',
        name: 'M',
        reasoning: {
          efforts: [
            { id: 'high', name: 'High' },
            { id: 'low', name: 'Low' },
          ],
        },
      }),
    },
  })
  await call(handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(getOptions().reasoningEffort, 'low', '默认应钳到最低档而非会话的 high')
  console.log('✓ 10 推理强度默认钳最低档')
}

// 10b. 显式配置「跟随会话」:会话的 reasoningEffort 原样透传;模型不暴露推理时不乱发
{
  const { handler, getOptions } = await setup({
    config: { reasoningEffort: 'session' },
    llmOverrides: { resolveModelInfo: async () => ({ provider: 'p', id: 'm', name: 'M' }) },
  })
  await call(handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(getOptions().reasoningEffort, 'high')
  console.log('✓ 10b 显式跟随会话透传')
}

// 10c. 「最低档」但模型不支持推理:回退会话值,不冒险构造无效 effort
{
  const { handler, getOptions } = await setup({
    config: { reasoningEffort: 'lowest' },
    llmOverrides: { resolveModelInfo: async () => ({ provider: 'p', id: 'm', name: 'M' }) },
  })
  await call(handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(getOptions().reasoningEffort, 'high')
  console.log('✓ 10c 不支持推理时回退会话值')
}

// 11. 回归:旧版设置文档残留的非法枚举值(mode: custom 等)不得让 schema 校验抛错
// ——那会导致整个命名空间注册失败、设置页卡片消失。宽松接收 + 使用处归一化。
{
  const resolved = plugin.Config({ language: 'fr', mode: 'custom', reasoningEffort: 'weird', maxTokens: 8192, timeoutSeconds: 120 })
  assert.equal(resolved.mode, 'custom', 'schema 应宽松接收未知枚举值')
  const { handler, getOptions } = await setup({ config: { language: 'fr', mode: 'custom', reasoningEffort: 'weird' } })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  doneOf(res)
  assert.ok(getOptions().system.includes('ANALYSIS'), '未知 mode 应按完整模式处理')
  assert.match(getOptions().system, /资深提示词工程专家/, '未知 language 应按中文处理')
  console.log('✓ 11 旧版非法枚举值归一化')
}

// 12. 模型连接测试:成功返回 ok + 实际路由 + 耗时;探活调用 32 token 封顶
{
  const { testHandler, getOptions } = await setup()
  const res = await call(testHandler, {})
  assert.equal(res.status, 200)
  const data = JSON.parse(res.body)
  assert.equal(data.ok, true)
  assert.equal(data.provider, 'deepseek-official')
  assert.equal(data.model, 'deepseek-chat')
  assert.equal(typeof data.latencyMs, 'number')
  assert.equal(getOptions().maxTokens, 32, '探活调用应 32 token 封顶')
  console.log('✓ 12 连接测试成功路径')
}

// 12b. 连接测试:模型失败 → 200 + ok:false(路由可达,结果在载荷里)
{
  const { testHandler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'bad key' } } }
      },
    },
  })
  const res = await call(testHandler, { provider: 'p', model: 'm' })
  const data = JSON.parse(res.body)
  assert.equal(data.ok, false)
  assert.match(data.error, /bad key/)
  console.log('✓ 12b 连接测试失败透传')
}

// 13. 回退模型链:主路由零产出失败 → 自动换备用路由,done 带 fallbackUsed
{
  const { handler } = await setup({
    config: { fallbackModel: 'good-p/good-m' },
    llmOverrides: {
      async *stream(options) {
        if (options.provider === 'bad-p') {
          yield { type: 'finish', reason: { kind: 'error', failure: { code: 'DOWN', message: 'provider down' } } }
          return
        }
        yield { type: 'text-delta', index: 0, text: '<<<OPTIMIZED>>>\n回退路由产出\n<<<END>>>\n' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'bad-p', model: 'bad-m' })
  const data = doneOf(res)
  assert.equal(data.provider, 'good-p')
  assert.equal(data.model, 'good-m')
  assert.equal(data.fallbackUsed, true)
  assert.match(data.optimized, /回退路由产出/)
  console.log('✓ 13 主路由失败自动回退')
}

// 13b. 已向客户端推送过 delta 后失败 → 不回退(避免双模型拼接),直接 error 事件
{
  let calls = 0
  const { handler } = await setup({
    config: { fallbackModel: 'good-p/good-m' },
    llmOverrides: {
      async *stream(options) {
        calls++
        if (options.provider === 'bad-p') {
          yield { type: 'text-delta', index: 0, text: '<<<ANALYSIS>>>\n半截输出' }
          yield { type: 'finish', reason: { kind: 'error', failure: { code: 'X', message: 'mid-stream boom' } } }
          return
        }
        yield { type: 'text-delta', index: 0, text: '<<<OPTIMIZED>>>\n不应走到这\n<<<END>>>\n' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'bad-p', model: 'bad-m' })
  const events = sseEvents(res)
  assert.ok(!events.some((e) => e.type === 'done'), '不应有 done')
  assert.match(events.find((e) => e.type === 'error')?.error ?? '', /mid-stream boom/)
  assert.equal(calls, 1, '已产出内容后不得回退重试')
  console.log('✓ 13b 半截失败后不回退')
}

// 14. 采样温度:默认 0.2(格式化任务求稳),可被配置覆盖
{
  const a = await setup()
  await call(a.handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(a.getOptions().temperature, 0.2)
  const b = await setup({ config: { temperature: 0.7 } })
  await call(b.handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(b.getOptions().temperature, 0.7)
  console.log('✓ 14 温度默认 0.2 且可配')
}

// 15. finish 为 tool-calls(优化调用不带工具)→ 明确报错而非当成功展示
{
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '给我调个工具' }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  const err = sseEvents(res).find((e) => e.type === 'error')
  assert.ok(err, '应收到 error 事件')
  assert.match(err.error, /工具调用/)
  console.log('✓ 15 tool-calls finish 防御')
}

// 16. 输出上限跟随输入长度:长草稿自动抬升 maxTokens,32768 封顶;可关
{
  const longDraft = '一'.repeat(5000) // ≈5000 token,完整模式 ×2 = 10000 > 默认 8192
  const a = await setup()
  await call(a.handler, { text: longDraft, provider: 'p', model: 'm' })
  assert.equal(a.getOptions().maxTokens, 10000, '长输入应抬升输出上限')
  const huge = await setup()
  await call(huge.handler, { text: '一'.repeat(20000), provider: 'p', model: 'm' })
  assert.equal(huge.getOptions().maxTokens, 32768, '超大输入应 32768 封顶')
  const off = await setup({ config: { autoMaxTokens: false } })
  await call(off.handler, { text: longDraft, provider: 'p', model: 'm' })
  assert.equal(off.getOptions().maxTokens, 8192, '关闭自适应后保持配置值')
  console.log('✓ 16 输出上限跟随输入长度')
}

// 17. 会话上下文:随请求携带时进入模型消息(上下文在前、草稿在后);坏条目被过滤
{
  const { handler, getOptions } = await setup()
  const res = await call(handler, {
    text: '我的草稿',
    provider: 'p',
    model: 'm',
    context: [
      { role: 'user', text: '帮我写个爬虫' },
      { role: 'assistant', text: '用什么语言?' },
      { role: 'hacker', text: '坏条目' }, // 非法 role 应被丢弃
      { role: 'user', text: '   ' }, // 空文本应被丢弃
      'not-an-object',
    ],
  })
  doneOf(res)
  const sent = getOptions().messages[0].content[0].text
  assert.match(sent, /<conversation-context>/)
  assert.match(sent, /用户: 帮我写个爬虫/)
  assert.match(sent, /助手: 用什么语言\?/)
  assert.ok(!sent.includes('坏条目'), '非法条目不得进入提示词')
  assert.ok(sent.indexOf('conversation-context') < sent.indexOf('<prompt-draft>'), '上下文必须置于草稿之前')
  assert.match(getOptions().system, /提炼用户的真实目的/, '有上下文应走 intent 策略(提炼目的 + 润色)')
  console.log('✓ 17 上下文进入模型消息')
}

// 17b. 设置关闭「携带上下文」:即使请求带了 context 也忽略(Host 侧硬开关)
{
  const { handler, getOptions } = await setup({ config: { includeContext: false } })
  const res = await call(handler, {
    text: '我的草稿',
    provider: 'p',
    model: 'm',
    context: [{ role: 'user', text: '帮我写个爬虫' }],
  })
  doneOf(res)
  const sent = getOptions().messages[0].content[0].text
  assert.ok(!sent.includes('conversation-context'), '关闭后不得出现上下文段')
  assert.equal(sent, '以下是我的提示词草稿:\n\n我的草稿', '关闭后应保持无上下文格式')
  assert.match(getOptions().system, /按结构模板组织/, '无上下文应走 template 策略(结构模板)')
  console.log('✓ 17b 关闭后忽略上下文')
}

// 18. 轻量记忆链:previous 进入模型消息(上下文之后、草稿之前);超长截断
{
  const { handler, getOptions } = await setup()
  const res = await call(handler, {
    text: '改过的草稿',
    provider: 'p',
    model: 'm',
    context: [{ role: 'user', text: '前文' }],
    previous: '上一轮的优化结果',
  })
  doneOf(res)
  const sent = getOptions().messages[0].content[0].text
  assert.match(sent, /<previous-optimized>\n上一轮的优化结果\n<\/previous-optimized>/)
  assert.ok(sent.indexOf('previous-optimized') < sent.indexOf('<prompt-draft>'), 'previous 必须置于草稿之前')

  const big = await setup()
  await call(big.handler, { text: 'x', provider: 'p', model: 'm', previous: '长'.repeat(3000) })
  const sentBig = big.getOptions().messages[0].content[0].text
  assert.ok(sentBig.length < 3000, 'previous 应被截断到 1500 字符级')
  console.log('✓ 18 记忆链进入模型消息')
}

console.log('\nsmoke: all passed')