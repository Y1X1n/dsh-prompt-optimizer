/* 推广 PPT 生成:dsh-prompt-optimizer(交给博主做视频演示用)
 * 深色系(贴合产品截图),16:9,12 页。运行:node build-promo.cjs
 */
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const GLOBAL = execSync('npm root -g').toString().trim()
const pptxgen = require(path.join(GLOBAL, 'pptxgenjs'))

const SHOTS = 'E:/dsh-plugins/dsh-prompt-optimizer/docs/screenshots'
const OUT = 'E:/dsh-plugins/dsh-prompt-optimizer/docs/promotion/dsh-prompt-optimizer-推广.pptx'

// 配色(贴合 DeepSeek 深色 UI)
const BG = '16181D'        // 页面底
const CARD = '202226'      // 卡片底
const ACCENT = '4D6BFE'    // DeepSeek 蓝
const TXT = 'FFFFFF'
const MUT = '9AA3AF'
const OK = '3FB950'
const WARN = 'D4A72C'
const FONT = 'Microsoft YaHei'
const MONO = 'Consolas'

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9' // 10 x 5.625 in
pres.author = 'Y1X1n'
pres.title = 'dsh-prompt-optimizer 推广演示'

const W = 10, H = 5.625
const shadow = () => ({ type: 'outer', color: '000000', blur: 8, offset: 3, angle: 135, opacity: 0.35 })

function base(slide) {
  slide.background = { color: BG }
}
/** 截图:统一细蓝边 + 阴影,16:9(1440x900)按宽算高 */
function shot(slide, file, x, y, w, opts = {}) {
  const h = w * 900 / 1440
  slide.addShape(pres.shapes.RECTANGLE, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: ACCENT }, line: { color: ACCENT, width: 0 } })
  slide.addImage({ path: path.join(SHOTS, file), x, y, w, h, shadow: shadow() })
  return h
}
function chip(slide, text, x, y, color, w) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.32, fill: { color: CARD }, line: { color, width: 1 }, rectRadius: 0.16 })
  slide.addText(text, { x, y, w, h: 0.32, align: 'center', valign: 'middle', fontSize: 11, color: TXT, fontFace: FONT, margin: 0 })
}
function footer(slide, page) {
  slide.addText('dsh-prompt-optimizer · ' + page, { x: 0.5, y: H - 0.42, w: 4, h: 0.3, fontSize: 9, color: MUT, fontFace: FONT, margin: 0 })
  slide.addText('github.com/Y1X1n/dsh-prompt-optimizer', { x: W - 4.5, y: H - 0.42, w: 4, h: 0.3, align: 'right', fontSize: 9, color: MUT, fontFace: FONT, margin: 0 })
}

/* ---------- S1 封面 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('✨', { x: 0, y: 0.9, w: W, h: 1.0, align: 'center', fontSize: 66, margin: 0 })
  s.addText('一句话,变成好提示词', { x: 0.5, y: 1.95, w: W - 1, h: 0.9, align: 'center', fontSize: 40, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  s.addText('dsh-prompt-optimizer — DeepSeek Harness 一键提示词优化插件', { x: 0.5, y: 2.95, w: W - 1, h: 0.5, align: 'center', fontSize: 16, color: MUT, fontFace: FONT, margin: 0 })
  chip(s, '开源 MIT', 3.55, 3.7, ACCENT, 1.3)
  chip(s, '本地运行 · 零订阅', 4.95, 3.7, OK, 1.9)
  chip(s, 'v0.3.12', 6.95, 3.7, WARN, 1.0)
  s.addText('流式上屏 · 双策略 · 保真纪律 · 会话上下文感知', { x: 0.5, y: 4.45, w: W - 1, h: 0.4, align: 'center', fontSize: 13, color: MUT, fontFace: FONT, margin: 0 })
}

/* ---------- S2 痛点 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('写提示词的三个真实痛点', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 30, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const cards = [
    ['01', '随手一写,AI 跑偏', '「帮我写个方案」式的草稿缺少结构与约束,AI 输出全靠猜。'],
    ['02', '反复手改,时间黑洞', '补背景、列要求、调格式……每次对话都要手动重写一遍。'],
    ['03', '好提示词用完即丢', '好不容易调教出来的写法,下个会话又从零开始。'],
  ]
  cards.forEach((c, i) => {
    const x = 0.5 + i * 3.1
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.55, w: 2.9, h: 3.2, fill: { color: CARD }, line: { color: '3A3F47', width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.55, w: 2.9, h: 0.08, fill: { color: ACCENT } })
    s.addText(c[0], { x: x + 0.25, y: 1.85, w: 2.4, h: 0.7, fontSize: 40, bold: true, color: ACCENT, fontFace: MONO, margin: 0 })
    s.addText(c[1], { x: x + 0.25, y: 2.75, w: 2.4, h: 0.6, fontSize: 17, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(c[2], { x: x + 0.25, y: 3.45, w: 2.4, h: 1.1, fontSize: 12.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  footer(s, '02')
}

/* ---------- S3 方案:发送栏旁的 ✨ ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('方案:发送栏旁,多一个 ✨ 按钮', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 30, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const lines = [
    ['就在你打字的地方', '发送栏工具行右侧,模型选择旁;不用切换任何窗口。'],
    ['一键触发', '点击 ✨,当前草稿立即送优化;结果面板悬于输入框上方,不遮挡输入。'],
    ['流式上屏', '诊断与优化结果逐字 streaming,边生成边看,不干等。'],
  ]
  lines.forEach((l, i) => {
    const y = 1.5 + i * 1.0
    s.addShape(pres.shapes.OVAL, { x: 0.55, y: y + 0.05, w: 0.42, h: 0.42, fill: { color: ACCENT } })
    s.addText(String(i + 1), { x: 0.55, y: y + 0.05, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 16, bold: true, color: 'FFFFFF', fontFace: FONT, margin: 0 })
    s.addText(l[0], { x: 1.15, y, w: 3.1, h: 0.4, fontSize: 16, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(l[1], { x: 1.15, y: y + 0.42, w: 3.1, h: 0.55, fontSize: 11.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  shot(s, 'composer-idle.png', 4.55, 1.5, 5.0)
  s.addText('实拍:发送栏空闲态(空输入时按钮禁用)', { x: 4.55, y: 1.5 + 5.0 * 0.625 + 0.08, w: 5.0, h: 0.3, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  footer(s, '03')
}

/* ---------- S4 实拍:完成态面板 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('一次优化,面板里发生了什么', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const h = shot(s, 'optimize-panel.png', 0.55, 1.15, 5.8)
  const notes = [
    ['五维诊断', '目标 / 上下文 / 约束 / 结构 / 输出规格,逐条给出建议'],
    ['结构化优化稿', '待补充信息以 [待补充:…] 标出,绝不编造'],
    ['徽章透明', '实际路由 · 是否回退 · 用时,一眼看清'],
    ['一键落地', '替换输入框(可撤回)/ 复制 / 重新优化'],
  ]
  notes.forEach((n, i) => {
    const y = 1.15 + i * 0.95
    s.addShape(pres.shapes.RECTANGLE, { x: 7.1, y, w: 0.07, h: 0.78, fill: { color: ACCENT } })
    s.addText(n[0], { x: 7.3, y, w: 2.3, h: 0.35, fontSize: 14, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(n[1], { x: 7.3, y: y + 0.34, w: 2.25, h: 0.55, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  s.addText('实拍 v0.3.11 · openrouter/minimax-m3:free · 用时 14.0s', { x: 0.55, y: 1.15 + h + 0.05, w: 5.8, h: 0.28, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  footer(s, '04')
}

/* ---------- S5 双策略与保真 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('它不是模板复读机:双策略 + 保真纪律', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  // 左:双策略
  const strat = [
    ['空会话 → 结构模板', '按 角色 / 任务 / 背景 / 约束 / 输出格式 规范化改写。'],
    ['有上下文 → 提炼意图', '通读会话近期对话,顺势润色:不重复追问、已否决方向不再提。'],
  ]
  strat.forEach((t, i) => {
    const x = 0.5 + i * 4.6
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.4, w: 4.4, h: 1.35, fill: { color: CARD }, line: { color: '3A3F47', width: 1 } })
    s.addText(t[0], { x: x + 0.25, y: 1.6, w: 3.9, h: 0.4, fontSize: 15.5, bold: true, color: ACCENT, fontFace: FONT, margin: 0 })
    s.addText(t[1], { x: x + 0.25, y: 2.05, w: 3.9, h: 0.6, fontSize: 12, color: MUT, fontFace: FONT, margin: 0 })
  })
  // 下:保真纪律四条
  s.addText('保真纪律(每一步都守住你的原意)', { x: 0.5, y: 3.0, w: 9, h: 0.45, fontSize: 17, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const rules = [
    ['语义等价底线', '不替换、不扩大、不缩小、不颠倒'],
    ['来源可回溯', '推断处以「默认」措辞标注'],
    ['不编造', '缺信息 → [待补充:…],宁缺毋滥'],
    ['保真 > 长度', '逐要素自检,要素缺失比冗长更严重'],
  ]
  rules.forEach((r, i) => {
    const x = 0.5 + i * 2.3
    s.addShape(pres.shapes.RECTANGLE, { x, y: 3.5, w: 2.1, h: 1.35, fill: { color: CARD }, line: { color: OK, width: 1 } })
    s.addText('✓', { x: x + 0.15, y: 3.62, w: 0.4, h: 0.35, fontSize: 16, bold: true, color: OK, fontFace: FONT, margin: 0 })
    s.addText(r[0], { x: x + 0.15, y: 3.98, w: 1.85, h: 0.35, fontSize: 12.5, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(r[1], { x: x + 0.15, y: 4.33, w: 1.85, h: 0.45, fontSize: 10, color: MUT, fontFace: FONT, margin: 0 })
  })
  footer(s, '05')
}

/* ---------- S6 可靠性 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('为「最坏时刻」做的设计', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const h = shot(s, 'panel-error.png', 4.35, 1.35, 5.15)
  s.addText('实拍:上游 404 完整透传,一键重试', { x: 4.35, y: 1.35 + h + 0.06, w: 5.15, h: 0.3, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  const feats = [
    ['错误全透传', '上游模型报错原文可见,不吞不糊'],
    ['Esc 取消不丢内容', '已生成的部分定格保留,可续跑'],
    ['超时看门狗', 'Host 挂死不再无限转圈'],
    ['自动回退链', '主路由失败换备用,原因悬停可见'],
    ['来源围栏', '跨站伪造请求 403,本机服务更安心'],
  ]
  feats.forEach((f, i) => {
    const y = 1.35 + i * 0.72
    s.addShape(pres.shapes.OVAL, { x: 0.55, y: y + 0.03, w: 0.3, h: 0.3, fill: { color: OK } })
    s.addText('✓', { x: 0.55, y: y + 0.03, w: 0.3, h: 0.3, align: 'center', valign: 'middle', fontSize: 12, bold: true, color: '16181D', fontFace: FONT, margin: 0 })
    s.addText(f[0], { x: 1.0, y, w: 3.1, h: 0.34, fontSize: 14, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(f[1], { x: 1.0, y: y + 0.33, w: 3.15, h: 0.35, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  footer(s, '06')
}

/* ---------- S7 设置 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('可调,但不烦:三组设置', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const h = shot(s, 'settings-expanded.png', 4.35, 1.35, 5.15)
  s.addText('实拍:展开态(模型 / 调用参数 / 上下文)', { x: 4.35, y: 1.35 + h + 0.06, w: 5.15, h: 0.3, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  const items = [
    ['默认零配置', '跟随当前会话模型;换模型立即生效'],
    ['三组分区', '模型 / 调用参数 / 上下文,折叠收纳'],
    ['折叠摘要', '收起时标题栏显示「模型 · 模式」'],
    ['可撤销', '「撤销上一次修改」一键还原'],
    ['连通性测试', '一键探活,显示实际路由与耗时'],
  ]
  items.forEach((it, i) => {
    const y = 1.35 + i * 0.72
    s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y, w: 0.07, h: 0.6, fill: { color: WARN } })
    s.addText(it[0], { x: 0.8, y, w: 3.2, h: 0.32, fontSize: 13.5, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(it[1], { x: 0.8, y: y + 0.31, w: 3.3, h: 0.33, fontSize: 10.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  footer(s, '07')
}

/* ---------- S8 数字卡 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('不是 demo,是可长期依赖的工具', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const stats = [
    ['62', '项自动化测试\n(smoke / prompt / controller)'],
    ['5', '维诊断\n逐条给出改进建议'],
    ['2', '种策略\n模板规范化 / 意图润色'],
    ['0', '订阅费\n复用你已配置的模型'],
  ]
  stats.forEach((st, i) => {
    const x = 0.5 + i * 2.3
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.6, w: 2.1, h: 2.3, fill: { color: CARD }, line: { color: '3A3F47', width: 1 } })
    s.addText(st[0], { x, y: 1.85, w: 2.1, h: 0.9, align: 'center', fontSize: 60, bold: true, color: ACCENT, fontFace: MONO, margin: 0 })
    s.addText(st[1], { x: x + 0.1, y: 2.85, w: 1.9, h: 0.9, align: 'center', fontSize: 11.5, color: MUT, fontFace: FONT, margin: 0 })
  })
  s.addText('兼容 dsh 0.1.0-rc.8 ~ 0.1.1-rc.2 · 纯本地运行 · 不持有任何 API Key · MIT 开源', { x: 0.5, y: 4.35, w: 9, h: 0.4, align: 'center', fontSize: 13, color: MUT, fontFace: FONT, margin: 0 })
  footer(s, '08')
}

/* ---------- S9 竞品对比 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('同类产品怎么选?', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const header = { fill: { color: ACCENT }, color: 'FFFFFF', bold: true, fontFace: FONT, fontSize: 12, align: 'center', valign: 'middle' }
  const cell = { fontFace: FONT, fontSize: 11, color: TXT, valign: 'middle', align: 'center' }
  const cellL = { ...cell, align: 'left' }
  const dim = { ...cell, color: MUT }
  const rows = [
    [
      { text: '', options: header },
      { text: '本插件', options: header },
      { text: 'dsh-prompt-enhancer', options: header },
      { text: 'linshenkx/prompt-optimizer', options: { ...header, fontSize: 10.5 } },
      { text: 'PromptPerfect', options: header },
    ],
    [
      { text: '形态', options: { ...dim, align: 'left' } },
      { text: 'DSH 插件', options: cell },
      { text: 'DSH 插件', options: cell },
      { text: 'Web/Chrome/桌面', options: cell },
      { text: 'SaaS 网页', options: cell },
    ],
    [
      { text: '输入框旁一键', options: { ...dim, align: 'left' } },
      { text: '✓', options: { ...cell, color: OK, bold: true } },
      { text: '✓', options: { ...cell, color: OK, bold: true } },
      { text: '—', options: dim },
      { text: '—', options: dim },
    ],
    [
      { text: '复用会话当前模型', options: { ...dim, align: 'left' } },
      { text: '✓', options: { ...cell, color: OK, bold: true } },
      { text: '✓', options: { ...cell, color: OK, bold: true } },
      { text: '自配 Key', options: dim },
      { text: '订阅付费', options: dim },
    ],
    [
      { text: '会话上下文感知', options: { ...dim, align: 'left' } },
      { text: '✓ 提炼意图', options: { ...cell, color: OK, bold: true } },
      { text: '—', options: dim },
      { text: '—', options: dim },
      { text: '—', options: dim },
    ],
    [
      { text: '成本 / 状态', options: { ...dim, align: 'left' } },
      { text: '免费 · 活跃', options: { ...cell, color: OK } },
      { text: '免费 · 活跃', options: { ...cell, color: OK } },
      { text: '开源 2k★', options: { ...cell, color: OK } },
      { text: '09-01 停服', options: { ...cell, color: 'E5534B', bold: true } },
    ],
  ]
  s.addTable(rows, {
    x: 0.5, y: 1.35, w: 9.0, colW: [2.0, 1.75, 1.85, 1.85, 1.55],
    border: { pt: 1, color: '3A3F47' }, fill: { color: CARD }, rowH: 0.52,
  })
  s.addText('定位差异:本插件 = 「在对话里顺手优化」;linshenkx = 独立优化工作台;PromptPerfect 停服印证本地化价值。', { x: 0.5, y: 4.75, w: 9, h: 0.4, fontSize: 12, color: MUT, fontFace: FONT, margin: 0 })
  footer(s, '09')
}

/* ---------- S10 迭代路线 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('路线图:从同类产品身上借什么', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 28, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const road = [
    ['优化历史 · 一键回溯', '借鉴 linshenkx 的版本管理:最近几次优化结果可点选恢复,改稿不再怕丢。', 'NEXT'],
    ['风格预设', '借鉴提示词框架库:精简 / 结构化 / 角色扮演一键切换,同一草稿多种产出。', 'NEXT'],
    ['本地免费替代窗口', 'PromptPerfect 2026-09 停服,本地化、零订阅的优化工具正是承接时机。', 'NOW'],
    ['与语音输入错位互补', 'enhancer 的语音是「输入增强」,本插件专注「提示词质量」——可共存推荐。', 'NOW'],
  ]
  road.forEach((r, i) => {
    const x = 0.5 + (i % 2) * 4.65
    const y = 1.45 + Math.floor(i / 2) * 1.75
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.45, h: 1.55, fill: { color: CARD }, line: { color: '3A3F47', width: 1 } })
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: 1.55, fill: { color: r[2] === 'NOW' ? OK : ACCENT } })
    s.addText(r[0], { x: x + 0.25, y: y + 0.14, w: 3.0, h: 0.38, fontSize: 15, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    chip(s, r[2], x + 3.55, y + 0.17, r[2] === 'NOW' ? OK : ACCENT, 0.72)
    s.addText(r[1], { x: x + 0.25, y: y + 0.58, w: 3.95, h: 0.85, fontSize: 11, color: MUT, fontFace: FONT, margin: 0 })
  })
  footer(s, '10')
}

/* ---------- S11 安装 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('三步装好', { x: 0.5, y: 0.45, w: 9, h: 0.7, fontSize: 30, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  const steps = [
    ['1', '下载并安装插件', '始终指向最新版'],
    ['2', '重启 dsh web', '插件集合变更需重启生效'],
    ['3', '硬刷新浏览器', '看到 ✨ 就绪,开写'],
  ]
  steps.forEach((st, i) => {
    const x = 0.5 + i * 3.1
    s.addShape(pres.shapes.OVAL, { x: x + 1.2, y: 1.35, w: 0.6, h: 0.6, fill: { color: ACCENT } })
    s.addText(st[0], { x: x + 1.2, y: 1.35, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontSize: 22, bold: true, color: 'FFFFFF', fontFace: FONT, margin: 0 })
    s.addText(st[1], { x, y: 2.1, w: 3.0, h: 0.4, align: 'center', fontSize: 16, bold: true, color: TXT, fontFace: FONT, margin: 0 })
    s.addText(st[2], { x, y: 2.5, w: 3.0, h: 0.35, align: 'center', fontSize: 11, color: MUT, fontFace: FONT, margin: 0 })
  })
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 3.25, w: 8.6, h: 1.05, fill: { color: '0D0F12' }, line: { color: '3A3F47', width: 1 } })
  s.addText([
    { text: '# 免构建安装(Release 最新版)', options: { color: MUT, breakLine: true } },
    { text: 'dsh plugin --profile web add ./dsh-prompt-optimizer.tgz', options: { color: '7EC3E8' } },
  ], { x: 0.95, y: 3.4, w: 8.1, h: 0.8, fontSize: 13, fontFace: MONO, margin: 0 })
  s.addText('下载地址见仓库 Release 页(固定文件名始终指向最新)', { x: 0.7, y: 4.45, w: 8.6, h: 0.35, align: 'center', fontSize: 11.5, color: MUT, fontFace: FONT, margin: 0 })
  footer(s, '11')
}

/* ---------- S12 尾页 ---------- */
{
  const s = pres.addSlide()
  base(s)
  s.addText('✨', { x: 0, y: 1.15, w: W, h: 1.0, align: 'center', fontSize: 60, margin: 0 })
  s.addText('让每一次提问,都从好提示词开始', { x: 0.5, y: 2.25, w: W - 1, h: 0.8, align: 'center', fontSize: 34, bold: true, color: TXT, fontFace: FONT, margin: 0 })
  s.addText('github.com/Y1X1n/dsh-prompt-optimizer', { x: 0.5, y: 3.25, w: W - 1, h: 0.5, align: 'center', fontSize: 18, color: ACCENT, fontFace: MONO, margin: 0 })
  s.addText('MIT 开源 · 欢迎 Star / Issue / PR', { x: 0.5, y: 3.85, w: W - 1, h: 0.4, align: 'center', fontSize: 13, color: MUT, fontFace: FONT, margin: 0 })
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
pres.writeFile({ fileName: OUT }).then(() => console.log('written:', OUT))
