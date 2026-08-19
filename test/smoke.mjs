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
  let route
  let lastOptions = null
  const ctx = new Context()
  ctx.provide('httpServer', {
    register(r) {
      route = r
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
  assert.ok(route, '插件应注册 HTTP 路由')
  return { ctx, handler: route.handler, getOptions: () => lastOptions }
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

console.log('\nsmoke: all passed')