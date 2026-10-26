/**
 * 上游契约守卫:把「插件依赖的客户端契约」钉在 sync-types 基线上。
 *
 * 背景:本插件跨 0.1.x / 0.2.x 多代宿主,只依赖少数稳定面(两个 composer 槽位、
 * 设置标签页槽位、输入框标准 props、`ctx.llm` 等)。这些面一旦在下一轮上游
 * 版本里被删除或改签名,typecheck 未必报错(很多面是本地结构类型),但运行期
 * 会崩或静默失效。本测试在 CI 里对**已安装的钉版类型包**做字符串级断言:
 *
 *  - 已安装版本必须与 `scripts/sync-types.mjs` 的钉版一致(防止旧 node_modules
 *    让 typecheck/test 悄悄跑在旧基线上——v0.6.1 修过一次同类问题);
 *  - 插件注册的三个槽位必须仍被声明,`settings.plugin.item` 必须仍不存在
 *    (0.1.x legacy 槽位已移除,插件靠独立 inject 守卫跳过它);
 *  - composer 槽位的标准 props(`useInput` / `inputActions`)必须仍有声明。
 *
 * 跑在 `sync:types` 之后(CI 顺序:npm ci → sync:types → typecheck → test)。
 * 缺包时:CI 直接失败,本地跳过——与本仓库 slot-guard 的取舍保持一致。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, root), 'utf8'))
const readText = (rel) => readFileSync(new URL(rel, root), 'utf8')
const pkg = readJson('package.json')

/** 解析 `scripts/sync-types.mjs` 里的 PACKAGES 钉版表。 */
function syncPins() {
  const text = readText('scripts/sync-types.mjs')
  const block = /const PACKAGES = \{([\s\S]*?)\n\}/.exec(text)
  assert.ok(block, 'sync-types.mjs 里找不到 PACKAGES 钉版表')
  const pins = {}
  for (const match of block[1].matchAll(/'([a-z0-9-]+)':\s*'([0-9][^']*)'/g)) pins[match[1]] = match[2]
  assert.ok(Object.keys(pins).length >= 19, `sync-types PACKAGES 解析异常(${Object.keys(pins).length} 项)`)
  return pins
}

const pins = syncPins()
const pinned = pins['dsh-client-ui-slots']
assert.ok(pinned, 'sync-types PACKAGES 缺少 dsh-client-ui-slots 钉版')
assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-ui-slots'], pinned, 'devDeps 与 sync-types 钉版必须一致')
assert.equal(pkg.devDependencies['@deepseek-ai/dsh-llm'], pinned, 'dsh-llm devDep 必须与类型基线同版本')

/** 本测试依赖的钉版包;缺席说明没跑 sync:types 或依赖装错。 */
const REQUIRED = ['dsh-client-ui-slots', 'dsh-client-ui-conversation', 'dsh-client-ui-settings', 'dsh-client-ui-settings-plugins']
const missing = REQUIRED.filter((name) => !existsSync(new URL(`node_modules/@deepseek-ai/${name}/package.json`, root)))
if (missing.length > 0) {
  const message = `上游契约守卫需要先跑 sync:types(缺少 ${missing.join(', ')})`
  if (process.env.CI === 'true' || process.env.CI === '1') {
    console.error(`upstream-contract: FAIL — ${message}`)
    process.exit(1)
  }
  console.log(`upstream-contract: SKIP(${message})`)
  process.exit(0)
}

// u1. 已安装钉版包版本必须与基线一致(防止旧 node_modules 残留)
for (const name of REQUIRED) {
  const installed = readJson(`node_modules/@deepseek-ai/${name}/package.json`)
  assert.equal(installed.version, pins[name], `${name} 已安装版本 ${installed.version} ≠ 钉版 ${pins[name]}`)
}
assert.equal(readJson('node_modules/@deepseek-ai/dsh-llm/package.json').version, pkg.devDependencies['@deepseek-ai/dsh-llm'], 'dsh-llm 已安装版本必须等于 devDep 钉版')
console.log(`✓ u1 钉版包已安装且版本一致(${REQUIRED.length} 个 + dsh-llm ${pinned})`)

// u2. 插件注册的两个 composer 槽位仍被声明为 list/session
const conversationSlots = readText('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts')
for (const slot of ['conversation.input.right', 'conversation.input.dock']) {
  const declared = new RegExp(`['"]${slot.replaceAll('.', '\\.')}['"]\\s*:\\s*\\{[\\s\\S]{0,160}?kind:\\s*['"]list['"][\\s\\S]{0,80}?scope:\\s*['"]session['"]`).test(conversationSlots)
  assert.ok(declared, `${slot} 必须仍声明为 kind:'list' / scope:'session'`)
}
console.log('✓ u2 conversation.input.right / conversation.input.dock 契约不变')

// u3. composer 槽位标准 props(useInput / inputActions)仍有声明
for (const prop of ['useInput', 'inputActions']) {
  assert.match(conversationSlots, new RegExp(`\\b${prop}\\b`), `composer 标准 props 缺少 ${prop}`)
}
assert.match(conversationSlots, /sessionId/, 'composer 标准 props 缺少 sessionId')
console.log('✓ u3 composer 标准 props(useInput/inputActions/sessionId)仍在')

// u4. 设置页标签槽位仍被声明(类型 + 运行时)
const settingsSlots = readText('node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts')
assert.match(settingsSlots, /['"]settings\.plugins\.tab['"]/, 'settings.plugins.tab 必须仍被类型声明')
const settingsPluginsRuntime = readText('node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js')
assert.match(settingsPluginsRuntime, /settings\.plugins\.tab/, 'settings.plugins.tab 必须仍出现在运行时 bundle')
console.log('✓ u4 settings.plugins.tab 类型与运行时声明均在')

// u5. 0.1.x legacy 槽位仍是死的;插件靠独立 inject 守卫,不应有人把它当成可用面
for (const rel of [
  'node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js',
  'node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts',
]) {
  assert.doesNotMatch(readText(rel), /settings\.plugin\.item/, `${rel} 不应再声明/实现 settings.plugin.item`)
}
console.log('✓ u5 settings.plugin.item 仍不存在(legacy 守卫前提成立)')

console.log('upstream-contract: all passed')
