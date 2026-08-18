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

/** 调用插件注册的 handler 并收集响应。 */
async function call(handler, body, method) {
  const res = {
    status: 0,
    body: '',
    writableEnded: false,
    on() {},
    writeHead(status) {
      res.status = status
      return res
    },
    end(payload) {
      res.body = payload ?? ''
      res.writableEnded = true
    },
  }
  await handler(makeReq(body, method), res)
  return res
}

async function setup({ config = {}, llmOverrides = {} } = {}) {
  let route
  const ctx = new Context()
  ctx.provide('httpServer', {
    register(r) {
      route = r
      return () => {}
    },
  })
  ctx.provide('llm', {
    async *stream() {
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
  return { ctx, handler: route.handler }
}

// 1. 正常路径:分析 + 优化结果按标记解析
{
  const { handler } = await setup()
  const res = await call(handler, { text: '帮我看看这段代码', provider: 'session-p', model: 'session-m' })
  assert.equal(res.status, 200)
  const data = JSON.parse(res.body)
  assert.equal(data.ok, true)
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
  const data = JSON.parse(res.body)
  assert.equal(data.provider, 'cfg-p')
  assert.equal(data.model, 'cfg-m')
  console.log('✓ 2 设置固定模型优先')
}

// 2b. 回归:配置字段为空字符串时必须视为未设置(而不是错落到首个路由)
{
  const { handler } = await setup({ config: { model: '' } })
  const res = await call(handler, { text: 'x', provider: 'session-p', model: 'session-m' })
  const data = JSON.parse(res.body)
  assert.equal(data.provider, 'session-p')
  assert.equal(data.model, 'session-m')
  console.log('✓ 2b 空字符串配置视为未设置')
}

// 2c. 回归:固定值缺少 '/' 分隔时视为未配置,回落到会话选择
{
  const { handler } = await setup({ config: { model: 'cfg-p-only' } })
  const res = await call(handler, { text: 'x', provider: 'session-p', model: 'session-m' })
  const data = JSON.parse(res.body)
  assert.equal(data.provider, 'session-p')
  assert.equal(data.model, 'session-m')
  console.log('✓ 2c 畸形固定值回落会话')
}

// 3. 会话与设置都没给模型时,回退到第一个可用路由
{
  const { handler } = await setup()
  const res = await call(handler, { text: 'x' })
  const data = JSON.parse(res.body)
  assert.equal(data.ok, true)
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

// 6. 模型终态错误 → 502
{
  const { handler } = await setup({
    llmOverrides: {
      async *stream() {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'API key is invalid' } } }
      },
    },
  })
  const res = await call(handler, { text: 'x', provider: 'p', model: 'm' })
  assert.equal(res.status, 502)
  assert.match(JSON.parse(res.body).error, /API key is invalid/)
  console.log('✓ 6 模型错误透传 → 502')
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
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.ok, true)
  assert.equal(data.truncated, true)
  assert.match(data.optimized, /截断/)
  console.log('✓ 7 max-tokens 截断标记')
}

console.log('\nsmoke: all passed')
