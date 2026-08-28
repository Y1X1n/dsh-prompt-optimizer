// 提示词质量实证基线:对运行中的 0.3.8 服务发真实优化请求,采集输出与耗时。
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

function show(label, r) {
  console.log('==== ' + label + ' ====')
  if (r.error) { console.log('ERROR:', r.error, '| ms:', r.ms); return }
  if (!r.done) { console.log('NO DONE EVENT | ms:', r.ms); return }
  if (r.done.error) { console.log('MODEL ERROR:', r.done.error); return }
  const opt = r.done.optimized || ''
  console.log(`provider=${r.done.provider}/${r.done.model} wellFormed=${r.done.wellFormed} truncated=${r.done.truncated} ttft=${r.ttft}ms total=${r.ms}ms`)
  console.log(`analysis=${(r.done.analysis || '').length}ch optimized=${opt.length}ch`)
  console.log('--- analysis head ---')
  console.log((r.done.analysis || '(empty)').split('\n').slice(0, 6).join('\n'))
  console.log('--- optimized full ---')
  console.log(opt)
}

const CASES = JSON.parse(process.argv[2])
for (const c of CASES) {
  show(c.label, await optimize(c.body))
}
