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

function makeReq(body, method = 'POST', headers) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  req.method = method
  req.headers = headers ?? {}
  return req
}

/** 调用插件注册的 handler 并收集响应。raw 为字符串时按原样发送(用于畸形 JSON 用例);headers 供来源围栏用例透传。 */
async function call(handler, body, method, headers) {
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
      ? Object.assign(Readable.from([body]), { method: method ?? 'POST', headers: headers ?? {} })
      : makeReq(body, method, headers)
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

// 1b. 会话标注:客户端携带的 sessionId 原样标注到 llm 调用(opencode 等提供方
//     要求会话头,适配器按 GenerateOptions.sessionId 注入 x-opencode-session);
//     未携带时回落合成 id——opencode-go 的会话头要求在任何调用路径上都得满足
{
  const { handler, getOptions } = await setup()
  await call(handler, { text: '带会话', provider: 'p', model: 'm', sessionId: 'session-abc' })
  assert.equal(getOptions().sessionId, 'session-abc', '应把客户端会话 id 标注到 llm 调用')
  await call(handler, { text: '无会话', provider: 'p', model: 'm' })
  assert.equal(getOptions().sessionId, 'prompt-optimizer-one-shot', '客户端未带会话 id 时标注合成 id 兜底')
  await call(handler, { text: '空白会话', provider: 'p', model: 'm', sessionId: '   ' })
  assert.equal(getOptions().sessionId, 'prompt-optimizer-one-shot', '空白会话 id 视为未携带')
  console.log('✓ 1b 会话 id 标注到 llm 调用(缺席回落合成 id)')
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

// 7b. 推理模型 <think> 块:思考内容不进 SSE 增量,done 取思考后真实标记段
{
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '<think>\n推理:应输出 <<<OPTIMIZED>>> ... <<<END>>>' }
        yield { type: 'text-delta', index: 0, text: '再想想 <<<OPTIMIZED>>> 碎片 <<<END>>>' }
        yield { type: 'text-delta', index: 0, text: '</think>' }
        yield { type: 'text-delta', index: 0, text: '<<<ANALYSIS>>>\n简要分析\n' }
        yield { type: 'text-delta', index: 0, text: '<<<OPTIMIZED>>>\n真正的优化结果\n<<<END>>>\n' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  })
  const res = await call(handler, { text: 'x' })
  const done = doneOf(res)
  assert.doesNotMatch(res.body, /推理:应输出/, '思考内容不得进入 SSE 增量')
  assert.doesNotMatch(res.body, /再想想/, '思考里的标记复述不得进入增量')
  assert.equal(sseEvents(res).filter((e) => e.type === 'delta' && /思考|碎片/.test(e.text)).length, 0, '增量里无思考片段')
  assert.equal(done.optimized, '真正的优化结果', 'done 取思考后的真实标记段')
  assert.equal(done.analysis, '简要分析')
  assert.equal(done.wellFormed, true)
  console.log('✓ 7b 推理思考块剥离')
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

// 9. 快速模式:系统提示词不含分析段要求,解析仍走标记通道;无标记输出判 wellFormed=true
{
  const { handler, getOptions } = await setup({ config: { mode: 'fast' } })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  const data = doneOf(res)
  assert.ok(!getOptions().system.includes('ANALYSIS'), 'fast 模式不应要求 ANALYSIS 段')
  assert.ok(getOptions().system.includes('OPTIMIZED'), 'fast 模式仍用 OPTIMIZED 标记')
  assert.match(data.optimized, /资深代码评审/)
  assert.equal(data.wellFormed, true, '带标记输出在 fast 模式下 wellFormed')
  // 无标记输出(free 模型常见):fast 模式单段落,整段即结果,不应误报格式退化
  const markerless = await setup({
    config: { mode: 'fast' },
    llmOverrides: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '直接输出的优化稿,没有任何标记。\n' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  })
  const res2 = await call(markerless.handler, { text: 'x', provider: 'p', model: 'm' })
  const data2 = doneOf(res2)
  assert.equal(data2.wellFormed, true, 'fast 模式无标记不应误报 wellFormed=false')
  assert.match(data2.optimized, /直接输出的优化稿/)
  console.log('✓ 9 快速模式提示词')
}

// 9b. 默认快速模式(0.5.0 起):提示词只要 OPTIMIZED 单段,等待约减半;
//     显式配置 full 才带 ANALYSIS
{
  const { handler, getOptions } = await setup()
  await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.ok(getOptions().system.includes('OPTIMIZED'))
  assert.ok(!getOptions().system.includes('ANALYSIS'), '默认 fast 模式不应要求 ANALYSIS 段')
  const full = await setup({ config: { mode: 'full' } })
  await call(full.handler, { text: 'x', provider: 'p', model: 'm' })
  assert.ok(full.getOptions().system.includes('ANALYSIS'), '显式 full 模式应要求 ANALYSIS 段')
  console.log('✓ 9b 默认快速模式提示词')
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

// 10d. 回归:适配器把高档排在前面时,不得把「最低档」钳成最高档(旧实现取
//      efforts[0],顺序一换就反向);不透明 id(读不出强度)回退会话值不乱发
{
  // 高档在前:必须仍选到 low,而不是排首位的 xhigh
  const highFirst = await setup({
    llmOverrides: {
      resolveModelInfo: async () => ({
        provider: 'p', id: 'm', name: 'M',
        reasoning: { efforts: [{ id: 'xhigh', name: 'XHigh' }, { id: 'high', name: 'High' }, { id: 'medium', name: 'Medium' }, { id: 'low', name: 'Low' }] },
      }),
    },
  })
  await call(highFirst.handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(highFirst.getOptions().reasoningEffort, 'low', '高档在前时仍应选最低档,而非排首位的 xhigh')

  // 'xhigh' 不得被 /high/ 误判成普通高档而越过 low
  const xhighOnly = await setup({
    llmOverrides: {
      resolveModelInfo: async () => ({
        provider: 'p', id: 'm', name: 'M',
        reasoning: { efforts: [{ id: 'xhigh', name: 'Extra High' }, { id: 'low', name: 'Low' }] },
      }),
    },
  })
  await call(xhighOnly.handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(xhighOnly.getOptions().reasoningEffort, 'low')

  // 「关闭推理」档应被视为比 low 更低
  const withNone = await setup({
    llmOverrides: {
      resolveModelInfo: async () => ({
        provider: 'p', id: 'm', name: 'M',
        reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'none', name: 'Off' }] },
      }),
    },
  })
  await call(withNone.handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal(withNone.getOptions().reasoningEffort, 'none', 'none/off 档应优先于 low')

  // 不透明 id:读不出强度时回退会话值(不冒险乱发)
  const opaque = await setup({
    llmOverrides: {
      resolveModelInfo: async () => ({
        provider: 'p', id: 'm', name: 'M',
        reasoning: { efforts: [{ id: 'tier-a', name: 'Tier A' }, { id: 'tier-b', name: 'Tier B' }] },
      }),
    },
  })
  await call(opaque.handler, { text: 'x', provider: 'p', model: 'm', reasoningEffort: 'tier-b' })
  assert.equal(opaque.getOptions().reasoningEffort, 'tier-b', '不透明 id 应回退会话值,而非盲取首位')
  console.log('✓ 10d 最低档按强度序数选取(不依赖展示顺序)')
}

// 11. 回归:旧版设置文档残留的非法枚举值(mode: custom 等)不得让 schema 校验抛错
// ——那会导致整个命名空间注册失败、设置页卡片消失。宽松接收 + 使用处归一化。
{
  const resolved = plugin.Config({ language: 'fr', mode: 'custom', reasoningEffort: 'weird', maxTokens: 8192, timeoutSeconds: 120 })
  // 0.4.0 起字段带 .volatile():校验产物是 Volatile 引用 cell(0.2.0 宿主原位更新,
  // 读取经 .get() 展开);0.1.x 宿主无此包装,直取普通值。
  const plain = (v) => (v && typeof v.get === 'function' ? v.get() : v)
  assert.equal(plain(resolved.mode), 'custom', 'schema 应宽松接收未知枚举值')
  const { handler, getOptions } = await setup({ config: { language: 'fr', mode: 'custom', reasoningEffort: 'weird' } })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  doneOf(res)
  assert.ok(getOptions().system.includes('ANALYSIS'), '未知 mode 应按完整模式处理')
  assert.match(getOptions().system, /资深提示词工程专家/, '未知 language 应按中文处理')
  console.log('✓ 11 旧版非法枚举值归一化')
}

// 12. 模型连接测试:成功返回 ok + 实际路由 + 耗时;探活调用 32 token 封顶,
//     并标注合成会话 id(opencode 等提供方要求会话头,适配器按 sessionId 注入)
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
  assert.equal(getOptions().sessionId, 'prompt-optimizer-connectivity-test', '探活应标注合成会话 id')
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
  // O12:回退原因随 done 下发,供客户端徽章 tooltip 展示
  assert.match(String(data.fallbackReason), /provider down/)
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

// 16. 输出上限跟随输入长度:长草稿自动抬升 maxTokens,32768 封顶;可关;
//     系数随模式(完整 ×2 / 快速 ×1.5,0.5.0 起默认快速)
{
  const longDraft = '一'.repeat(5000) // ≈5000 token
  const full = await setup({ config: { mode: 'full' } })
  await call(full.handler, { text: longDraft, provider: 'p', model: 'm' })
  assert.equal(full.getOptions().maxTokens, 10000, '完整模式长输入应抬升输出上限(×2)')
  const a = await setup()
  await call(a.handler, { text: longDraft, provider: 'p', model: 'm' })
  assert.equal(a.getOptions().maxTokens, 8192, '默认快速模式 ×1.5 = 7500,不低于配置值 8192')
  const huge = await setup()
  await call(huge.handler, { text: '一'.repeat(24000), provider: 'p', model: 'm' })
  assert.equal(huge.getOptions().maxTokens, 32768, '超大输入应 32768 封顶(快速 ×1.5 = 36000 → 触顶)')
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
    previous: '上一轮结果',
  })
  doneOf(res)
  const sent = getOptions().messages[0].content[0].text
  assert.ok(!sent.includes('conversation-context'), '关闭后不得出现上下文段')
  assert.ok(!sent.includes('previous-optimized'), '关闭后不得出现记忆链段')
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

// 19. 来源围栏:跨站 Origin 拒绝;无 Origin(CLI)与同源 Origin 放行
{
  const { handler } = await setup()
  // 恶意网页跨站 text/plain POST(免预检):Origin 与 Host 不符 → 403,不触达 llm
  const csrf = await call(handler, { text: 'x' }, 'POST', { origin: 'https://evil.example', host: '127.0.0.1:3080' })
  assert.equal(csrf.status, 403, '跨站 Origin 必须被拒绝')
  assert.match(csrf.body, /已拒绝跨站请求/)
  // DNS rebinding:Origin 与 Host 一致但 Host 不是回环/本机地址 → 403
  const rebind = await call(handler, { text: 'x' }, 'POST', {
    origin: 'http://evil.example:3080',
    host: 'evil.example:3080',
  })
  assert.equal(rebind.status, 403, '伪造 Host(rebinding)必须被拒绝')
  // 正常调用方:CLI 不带 Origin → 放行
  const cli = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(cli.status, 200, '无 Origin 的命令行调用应放行')
  // 正常调用方:同源页面(Origin == Host == 回环)→ 放行
  const same = await call(handler, { text: 'x', provider: 'p', model: 'm' }, 'POST', {
    origin: 'http://127.0.0.1:3080',
    host: '127.0.0.1:3080',
  })
  assert.equal(same.status, 200, '同源调用应放行')
  // 探活路由同样受围栏保护
  const { testHandler } = await setup()
  const testCsrf = await call(testHandler, {}, 'POST', { origin: 'https://evil.example', host: '127.0.0.1:3080' })
  assert.equal(testCsrf.status, 403, 'test-model 同样拒绝跨站请求')
  console.log('✓ 19 来源围栏(CSRF / rebinding)')
}

// 20. 回归:非对象 JSON 体(尤其 `null`)必须被拒绝并应答——旧实现在
//     `if (!body) return` 处把它当成「已应答」直接返回,请求永久挂起
{
  const { handler, testHandler } = await setup()
  for (const [label, raw] of [['null', 'null'], ['数字', '42'], ['字符串', '"x"'], ['数组', '[]']]) {
    const a = await call(handler, raw)
    assert.equal(a.status, 400, `optimize 收到 JSON ${label} 应 400`)
    assert.ok(a.writableEnded, `optimize 收到 JSON ${label} 必须结束响应`)
    assert.equal(JSON.parse(a.body).ok, false)
    const b = await call(testHandler, raw)
    assert.equal(b.status, 400, `test-model 收到 JSON ${label} 应 400`)
    assert.ok(b.writableEnded, `test-model 收到 JSON ${label} 必须结束响应`)
  }
  console.log('✓ 20 非对象 JSON 体被拒绝(不再挂起)')
}

// 21. 回归:SSE 阶段出错时不得因二次 writeHead 抛 ERR_HTTP_HEADERS_SENT
//     逃出路由(响应头已发出后 writeJson 必须静默跳过)
{
  const { handler } = await setup()
  const res = {
    status: 0, headers: {}, body: '', writableEnded: false, destroyed: false, headersSent: false,
    on() {},
    writeHead(status, headers) {
      if (res.headersSent) {
        const e = new Error('ERR_HTTP_HEADERS_SENT: Cannot write headers after they are sent to the client')
        e.code = 'ERR_HTTP_HEADERS_SENT'
        throw e
      }
      res.headersSent = true
      res.status = status
      res.headers = headers ?? {}
      return res
    },
    write(chunk) {
      // 模拟客户端中途断连:SSE 阶段写失败。
      if (res.headersSent && res.body.includes('"type":"delta"')) throw new Error('socket blew up mid-stream')
      res.body += chunk
      return true
    },
    end(payload) {
      if (payload) res.body += payload
      res.writableEnded = true
    },
  }
  const req = makeReq({ text: 'x', provider: 'p', model: 'm' })
  let escaped = null
  try {
    await handler(req, res)
  } catch (error) {
    escaped = error
  }
  assert.equal(escaped, null, `异常不得逃出路由(实际:${escaped?.code ?? escaped?.message})`)
  assert.equal(res.status, 200, 'SSE 阶段已发出的状态码保持不变')
  console.log('✓ 21 SSE 阶段错误不逃出路由')
}

// 22. 并发防线:在途优化达到上限时第 N+1 个请求收到 429;排空后恢复;
//     计数不泄漏(提前 return 的路径也要释放)
{
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        await gate
        yield { type: 'text-delta', index: 0, text: '<<<OPTIMIZED>>>\n并发结果\n<<<END>>>\n' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  })
  const inflight = [1, 2, 3].map(() => call(handler, { text: 'x', provider: 'p', model: 'm' }))
  await new Promise((r) => setTimeout(r, 30))
  const overflow = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(overflow.status, 429, '超出并发上限应 429')
  assert.match(JSON.parse(overflow.body).error, /上限/)
  release()
  await Promise.all(inflight)
  // 排空后应恢复正常(计数无泄漏);同时校验提前 return 的 400 路径也释放计数
  const afterDrain = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(afterDrain.status, 200, '排空后应恢复,计数不得泄漏')
  const badBody = await call(handler, 'null')
  assert.equal(badBody.status, 400)
  const stillOk = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(stillOk.status, 200, '400 路径也必须释放并发计数')
  console.log('✓ 22 并发上限 429 与计数释放')
}

// 23. 回归:载体服务只挂载一次。webServer 与 httpServer 若同时存在(哪怕是
//     两个不同对象),两个 inject 回调都会触发;按对象身份比较会漏挡,把两条
//     路由注册两遍。这里同时验证三种服务组合下都恰好挂载一次。
{
  const registrations = async (provide) => {
    const web = []
    const http = []
    const ctx = new Context()
    if (provide.web) {
      ctx.provide('webServer', {
        register(r) {
          web.push(r.path)
          return () => {}
        },
      })
    }
    if (provide.http) {
      ctx.provide('httpServer', {
        register(r) {
          http.push(r.path)
          return () => {}
        },
      })
    }
    ctx.provide('llm', {
      async *stream() {
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
      listProviders: () => [{ id: 'p' }],
      listModels: async () => [{ id: 'm' }],
    })
    await ctx.plugin(plugin, {})
    return { web, http, total: web.length + http.length }
  }

  const both = await registrations({ web: true, http: true })
  assert.equal(both.total, 2, '两个服务同时存在时,两条路由只能挂载一次')
  assert.deepEqual([...both.web, ...both.http].sort(), [
    '/dsh-prompt-optimizer/optimize',
    '/dsh-prompt-optimizer/test-model',
  ])
  const onlyWeb = await registrations({ web: true })
  assert.equal(onlyWeb.total, 2, '只有 webServer 时应挂载一次')
  const onlyHttp = await registrations({ http: true })
  assert.equal(onlyHttp.total, 2, '只有 httpServer 时应挂载一次')
  console.log('✓ 23 载体服务只挂载一次')
}

console.log('\nsmoke: all passed')