// 提示词质量实证基线:对运行中的服务发真实优化请求(路由已恢复可用)。
const BASE = 'http://127.0.0.1:3080/dsh-prompt-optimizer/optimize'

async function optimize(body) {
  const started = Date.now()
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
    return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`, ms: Date.now() - started }
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let done = null
  let firstDeltaMs = null
  for (;;) {
    const { done: rd, value } = await reader.read()
    if (rd) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const ev = JSON.parse(line.slice(5).trim())
      if (ev.type === 'delta' && firstDeltaMs === null) firstDeltaMs = Date.now() - started
      if (ev.type === 'done') done = ev
      if (ev.type === 'error') done = { error: ev.error }
    }
  }
  return { done, ms: Date.now() - started, ttft: firstDeltaMs }
}

const CASES = [
  {
    label: 'S1 简单中文草稿(长度纪律观察)',
    body: { text: '帮我写个请假条' },
  },
  {
    label: 'S2 中等复杂度草稿(保真 vs 长度观察)',
    body: {
      text:
        '帮我给公司内部工具写一个数据导出功能的提示词:需要支持按时间范围筛选,导出格式有 CSV 和 Excel 两种,' +
        '单次最多导出 5 万行,超过要提示用户缩小范围;导出任务在后台执行,完成后发邮件通知;操作人是运营,' +
        '他们不懂技术,界面要简单;另外导出的敏感字段(手机号、身份证)要脱敏,管理员可以配置哪些字段脱敏。',
    },
  },
  {
    label: 'S3 代码类草稿(few-shot 风格带偏观察)',
    body: {
      text:
        '写一个 Node.js 脚本,遍历给定目录下的所有 .log 文件,把包含 ERROR 关键字的行抽出来,' +
        '按文件汇总生成一个 summary.json,内容是 {文件名: 错误行数}。要处理文件读不到的情况。',
    },
  },
  {
    label: 'S5 带上下文(intent 策略观察)',
    body: {
      context: [
        { role: 'user', text: '我在运营一个 200 人的小区闲置群,上次搞接龙只有十几个人参加,复盘下来是奖品没吸引力、格式太乱' },
        { role: 'assistant', text: '明白了。奖品和格式是关键变量,你打算这轮先改哪个?' },
        { role: 'user', text: '都不满意,想整个重来' },
      ],
      text: '帮我重新设计一下这个接龙',
    },
  },
]

function show(label, r) {
  console.log('==== ' + label + ' ====')
  if (r.error) { console.log('ERROR:', r.error, '| ms:', r.ms); return }
  if (!r.done) { console.log('NO DONE EVENT | ms:', r.ms); return }
  if (r.done.error) { console.log('MODEL ERROR:', r.done.error); return }
  const opt = r.done.optimized || ''
  console.log(`route=${r.done.provider}/${r.done.model} wellFormed=${r.done.wellFormed} truncated=${r.done.truncated} ttft=${r.ttft}ms total=${r.ms}ms fallback=${r.done.fallbackUsed}`)
  console.log(`analysis=${(r.done.analysis || '').length}ch optimized=${opt.length}ch`)
  if (r.done.analysis) {
    console.log('--- analysis ---')
    console.log(r.done.analysis.split('\n').slice(0, 8).join('\n'))
  }
  console.log('--- optimized ---')
  console.log(opt)
}

const only = process.argv[2] ? Number(process.argv[2]) : null
// 显式指定路由:探针不经过客户端会话查询,Host 固定模型为空时会回落「第一个可用提供方」,
// 未必是你想测的那条;环境变量 PROBE_ROUTE=provider/model 可指定,缺省跟随目录第一个。
const routeEnv = process.env.PROBE_ROUTE
const ROUTE = routeEnv
  ? (() => {
      // provider/model 按第一段斜杠切分:模型 id 自身允许多段(如 openrouter 的 minimax/minimax-m3:free)。
      const i = routeEnv.indexOf('/')
      if (i <= 0 || i === routeEnv.length - 1) throw new Error(`PROBE_ROUTE 需要 provider/model 形式,得到:${routeEnv}`)
      return { provider: routeEnv.slice(0, i), model: routeEnv.slice(i + 1) }
    })()
  : undefined
for (let i = 0; i < CASES.length; i++) {
  if (only !== null && i !== only) continue
  show(CASES[i].label, await optimize({ ...(ROUTE ?? {}), ...CASES[i].body }))
}
