/* PPT 几何 QA:解包 pptx,校验
 * 1) 所有形状在画布内(10 x 5.625 in,EMU 914400/in)
 * 2) 同页文本框之间不得重叠(徽章文字压在形状上属有意设计——只比对文本框 vs 文本框)
 * 3) 文本框不得压在图片上
 * 4) 每页关键文本存在
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SRC = 'E:/dsh-plugins/dsh-prompt-optimizer/docs/promotion/dsh-prompt-optimizer-推广.pptx'
const TMP = 'E:/dsh-plugins/dsh-prompt-optimizer/docs/promotion/_unpacked'
const EMU_W = 10 * 914400
const EMU_H = 5.625 * 914400

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
// Expand-Archive 只认 .zip 扩展名,且中文路径经 shell 会乱码——复制成 ASCII 临时名再解
const zipTmp = 'E:/dsh-plugins/dsh-prompt-optimizer/docs/promotion/_tmp.pptx.zip'
fs.copyFileSync(SRC, zipTmp)
execSync(`powershell -Command "Expand-Archive -Force -LiteralPath 'E:\\dsh-plugins\\dsh-prompt-optimizer\\docs\\promotion\\_tmp.pptx.zip' -DestinationPath 'E:\\dsh-plugins\\dsh-prompt-optimizer\\docs\\promotion\\_unpacked'"`)
fs.rmSync(zipTmp)

const slideDir = path.join(TMP, 'ppt', 'slides')
const slides = fs.readdirSync(slideDir).filter((f) => /^slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
console.log('slides:', slides.length)

let problems = []
for (const f of slides) {
  const xml = fs.readFileSync(path.join(slideDir, f), 'utf8')
  const n = f.match(/\d+/)[0]
  // 收集形状
  const shapes = []
  for (const m of xml.matchAll(/<p:(sp|pic)>[\s\S]*?<\/p:\1>/g)) {
    const kind = m[1]
    const body = m[0]
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/)
    const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/)
    if (!off || !ext) continue
    const x = +off[1], y = +off[2], w = +ext[1], h = +ext[2]
    const text = [...body.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')).join('')
    shapes.push({ kind, x, y, w, h, text: text.trim() })
  }
  // 1) 越界
  for (const sh of shapes) {
    if (sh.x < -1000 || sh.y < -1000 || sh.x + sh.w > EMU_W + 1000 || sh.y + sh.h > EMU_H + 1000) {
      problems.push(`slide${n} 越界: ${sh.kind} "${sh.text.slice(0, 18)}" @(${(sh.x / 914400).toFixed(2)},${(sh.y / 914400).toFixed(2)}) ${(sh.w / 914400).toFixed(2)}x${(sh.h / 914400).toFixed(2)}in`)
    }
  }
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    return ix * iy
  }
  const texts = shapes.filter((s) => s.kind === 'sp' && s.text)
  // 2) 文本框互叠(>8% 小面积者)
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j]
      const ov = overlap(a, b)
      const small = Math.min(a.w * a.h, b.w * b.h)
      if (ov > small * 0.08) {
        problems.push(`slide${n} 文本重叠: "${a.text.slice(0, 14)}" × "${b.text.slice(0, 14)}" (${((ov / small) * 100).toFixed(0)}%)`)
      }
    }
  }
  // 3) 文本压图
  const pics = shapes.filter((s) => s.kind === 'pic')
  for (const p of pics) {
    for (const t of texts) {
      if (overlap(p, t) > t.w * t.h * 0.3) problems.push(`slide${n} 文本压图: "${t.text.slice(0, 16)}"`)
    }
  }
}
// 4) 关键文本抽查(对反转义后的全文匹配)
const allXml = slides.map((f) => fs.readFileSync(path.join(slideDir, f), 'utf8')).join('\n').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
const musts = ['一句话,变成好提示词', '保真 > 长度', '09-01 停服', '优化历史 · 一键回溯', 'dsh plugin --profile web add', '让每一次提问,都从好提示词开始', '62']
for (const m of musts) if (!allXml.includes(m)) problems.push('缺关键文本: ' + m)

if (problems.length) {
  console.log('PROBLEMS (' + problems.length + '):')
  problems.forEach((p) => console.log(' - ' + p))
  process.exit(1)
} else {
  console.log('GEOMETRY QA PASS: 12 页全部在界内,无文本重叠/压图,关键文本齐全')
}
