/**
 * Client controller 纯逻辑测试:SSE 帧解析、合帧节流、状态流转、撤回、会话模型查询跳过。
 * 不依赖 DOM(controller 只用 fetch/AbortController/TextDecoder,Node ≥18 即可跑)。
 *
 * 运行:先 `npm run build`,再 `node test/controller.test.mjs`。
 */
import assert from 'node:assert/strict'
import { createOptimizerController } from '../lib/controller.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const enc = new TextEncoder()

/** 构造最小可用的 ClientContext mock;sessions.models 调用次数可通过 returned.stats 观察。 */
function makeCtx() {
  const stats = { modelsCalls: 0 }
  const ctx = {
    connection: {
      api: {
        sessions: {
          models: async () => {
            stats.modelsCalls += 1
            return { result: { ok: true, value: { current: { provider: 'sess-p', model: 'sess-m' } } } }
          },
        },
      },
    },
  }
  return { ctx, stats }
}

/** 把事件对象列表编码成 SSE Response。 */
function sseResponse(events) {
  const stream = new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
      c.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** 替换全局 fetch 跑一个用例;impl 收到 (body, signal)。 */
async function withFetch(impl, fn) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ body, signal: init.signal })
    return impl(body, init.signal)
  }
  try {
    await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

const DONE = {
  type: 'done',
  analysis: '分析内容',
  optimized: '优化后的提示词',
  wellFormed: true,
  truncated: false,
  provider: 'p',
  model: 'm',
  fallbackUsed: false,
}

// c1. 完整流式:delta → done,状态与结果字段正确
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => sseResponse([{ type: 'delta', text: '<<<ANALYSIS>>>\n分析内容\n' }, DONE]),
    async () => {
      await c.optimize('  草稿  ', 's1')
      const s = c.getSnapshot()
      assert.equal(s.status, 'done')
      assert.equal(s.result.optimized, '优化后的提示词')
      assert.equal(s.result.provider, 'p')
      assert.equal(s.live, null, 'done 后 live 应清空')
      assert.equal(s.last.text, '草稿', 'last 应存 trim 后的草稿')
      assert.equal(s.last.sessionId, 's1')
    },
  )
  console.log('✓ c1 完整流式 → done')
}

// c2. 合帧节流:delta 后 live 不立即更新,约 50ms 后合帧落一次
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  let sc
  const stream = new ReadableStream({ start(ctrl) { sc = ctrl } })
  await withFetch(
    () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    async () => {
      const pending = c.optimize('草稿', 's1')
      await sleep(0) // 让 optimize 推进到 fetch
      sc.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'delta', text: '<<<OPTIMIZED>>>\n第一段' })}\n\n`))
      assert.equal(c.getSnapshot().live?.optimized ?? '', '', 'delta 后不应同步落帧')
      await sleep(80)
      assert.equal(c.getSnapshot().live.optimized, '第一段', '合帧后 live 应可见')
      sc.enqueue(enc.encode(`data: ${JSON.stringify(DONE)}\n\n`))
      sc.close()
      await pending
      assert.equal(c.getSnapshot().status, 'done')
      assert.equal(c.getSnapshot().live, null)
    },
  )
  console.log('✓ c2 合帧节流')
}

// c3. SSE error 事件 → status error
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => sseResponse([{ type: 'error', error: '模型调用失败(AUTH): bad key' }]),
    async () => {
      await c.optimize('草稿', 's1')
      assert.equal(c.getSnapshot().status, 'error')
      assert.match(c.getSnapshot().error, /bad key/)
    },
  )
  console.log('✓ c3 error 事件')
}

// c4. 预校验失败(非 SSE,JSON 409)→ status error
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => new Response(JSON.stringify({ ok: false, error: '未找到可用模型' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
    async () => {
      await c.optimize('草稿', 's1')
      assert.equal(c.getSnapshot().status, 'error')
      assert.match(c.getSnapshot().error, /未找到可用模型/)
    },
  )
  console.log('✓ c4 预校验 JSON 错误')
}

// c5. 流结束但无终态事件 → 连接中断
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => sseResponse([{ type: 'delta', text: '半截' }]),
    async () => {
      await c.optimize('草稿', 's1')
      assert.equal(c.getSnapshot().status, 'error')
      assert.match(c.getSnapshot().error, /连接中断/)
    },
  )
  console.log('✓ c5 连接中断检测')
}

// c6. 设置固定模型时跳过会话模型查询 RPC
{
  const { ctx, stats } = makeCtx()
  const c = createOptimizerController(ctx, { isModelPinned: () => true })
  await withFetch(
    () => sseResponse([DONE]),
    async (calls) => {
      await c.optimize('草稿', 's1')
      assert.equal(stats.modelsCalls, 0, '固定模型时不应查询会话模型')
      assert.equal(calls[0].body.provider, undefined, 'body 不带会话模型,交给 Host 固定值')
      assert.equal(c.getSnapshot().status, 'done')
    },
  )
  console.log('✓ c6 固定模型跳过 RPC')
}

// c7. 撤回状态流转:markApplied → clearApplied → close 复位
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => sseResponse([DONE]),
    async () => {
      await c.optimize('草稿', 's1')
      c.markApplied({ backup: '原文', text: '优化后的提示词' })
      assert.deepEqual(c.getSnapshot().applied, { backup: '原文', text: '优化后的提示词' })
      c.clearApplied()
      assert.equal(c.getSnapshot().applied, null)
      c.markApplied({ backup: '原文', text: '优化后的提示词' })
      c.close()
      assert.equal(c.getSnapshot().applied, null, 'close 应复位 applied')
      assert.equal(c.getSnapshot().open, false)
      assert.equal(c.getSnapshot().status, 'idle')
    },
  )
  console.log('✓ c7 撤回状态流转')
}

// c8. retry 复用 last(同一份草稿重新发起)
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    () => sseResponse([DONE]),
    async (calls) => {
      await c.optimize('我的草稿', 's1')
      c.retry()
      await sleep(10)
      assert.equal(calls.length, 2)
      assert.equal(calls[1].body.text, '我的草稿')
    },
  )
  console.log('✓ c8 retry 复用 last')
}

// c9. 进行中的请求被 close 中止:状态复位,不残留 loading
{
  const { ctx } = makeCtx()
  const c = createOptimizerController(ctx)
  await withFetch(
    (_body, signal) =>
      new Response(
        new ReadableStream({
          start(ctrl) {
            signal.addEventListener('abort', () => ctrl.close())
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    async () => {
      const pending = c.optimize('草稿', 's1')
      await sleep(0)
      assert.equal(c.getSnapshot().status, 'loading')
      c.close()
      await pending
      assert.equal(c.getSnapshot().status, 'idle', 'close 后不得残留 loading')
      assert.equal(c.getSnapshot().open, false)
    },
  )
  console.log('✓ c9 close 中止进行中请求')
}

console.log('\ncontroller: all passed')
