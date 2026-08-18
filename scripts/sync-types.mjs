/**
 * 同步客户端类型包。
 *
 * DeepSeek Harness 的 monorepo 只发布了部分 npm 包(其余 `publishConfig: restricted`),
 * 而客户端各包的 .d.ts 相互引用,直接 npm install 会因传递依赖 404 失败。
 * 本脚本绕开 npm 的依赖树解析:
 *   1. 对已发布的包:`npm pack` 下载 tarball,直接解压进 node_modules(仅取类型所需文件)。
 *   2. 对未发布的包(如 dsh-type-meta):扫描所有 .d.ts 里的 `@deepseek-ai/*` 引用,
 *      为缺失者生成最小占位包(skipLibCheck 下仅要求模块可解析)。
 *
 * 用法:npm run sync:types(在 npm install 之后执行;typecheck 依赖它)
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const TAR = 'tar' // Windows 10+ 自带 bsdtar

const root = resolve(import.meta.dirname, '..')
const nmDir = join(root, 'node_modules', '@deepseek-ai')

/** 已发布、需要真实类型的包(钉版本,与 dsh CLI 0.1.0-rc.7 的内置包一致)。 */
const PACKAGES = {
  'dsh-client-runtime': '0.1.0-rc.7',
  'dsh-client-connection': '0.1.0-rc.7',
  'dsh-client-ui-slots': '0.1.0-rc.7',
  'dsh-client-ui-conversation': '0.1.0-rc.7',
  'dsh-client-ui-settings-plugins': '0.1.0-rc.7',
  'dsh-host-apiproxy': '0.1.0-rc.7',
  'dsh-attachment': '0.1.0-rc.7',
  'dsh-brand': '0.1.0-rc.7',
  'dsh-client-locale': '0.1.0-rc.7',
  'dsh-client-ui-primitives': '0.1.0-rc.7',
  'dsh-commands': '0.1.0-rc.7',
  'dsh-llm-retry': '0.1.0-rc.7',
  'dsh-session': '0.1.0-rc.7',
  'dsh-session-projection': '0.1.0-rc.7',
  'dsh-token-meter': '0.1.0-rc.7',
  'dsh-tool-todo': '0.1.0-rc.7',
  'dsh-tools': '0.1.0-rc.7',
}

mkdirSync(nmDir, { recursive: true })

// 1. 解压已发布包
const tmp = join(tmpdir(), `dsh-type-sync-${process.pid}`)
mkdirSync(tmp, { recursive: true })
try {
  for (const [shortName, version] of Object.entries(PACKAGES)) {
    const target = join(nmDir, shortName)
    if (existsSync(target)) continue
    const full = `@deepseek-ai/${shortName}@${version}`
    process.stdout.write(`pack ${full} ... `)
    const out = execSync(`npm pack "${full}" --pack-destination "${tmp}"`, { stdio: ['ignore', 'pipe', 'inherit'] })
    const tgzName = out.toString().trim().split('\n').pop()
    // tar 参数全部用相对路径:Windows 盘符会被 tar 误认为远程主机(C:)。
    mkdirSync(join(tmp, shortName), { recursive: true })
    execFileSync(TAR, ['xzf', tgzName, '-C', shortName], { cwd: tmp })
    const from = join(tmp, shortName, 'package')
    if (!existsSync(from)) throw new Error(`unexpected tarball layout for ${full}`)
    mkdirSync(target, { recursive: true })
    for (const entry of ['package.json', 'lib']) {
      const src = join(from, entry)
      if (!existsSync(src)) continue
      cpSync(src, join(target, entry), { recursive: true })
    }
    console.log('ok')
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// 2. 扫描引用,为未发布的包生成占位
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (entry.name.endsWith('.d.ts')) yield p
  }
}

const SPEC_RE = /@deepseek-ai\/[a-z0-9-]+(?:\/[a-z0-9./_-]+)?/gi
const specifiers = new Set()
const scanDirs = [nmDir, join(root, 'src')].filter(existsSync)
for (const dir of scanDirs) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf-8')
    for (const match of text.matchAll(SPEC_RE)) specifiers.add(match[0].replace(/\\/g, '/'))
  }
}

let stubbed = 0
for (const spec of specifiers) {
  const rest = spec.slice('@deepseek-ai/'.length)
  const [shortName, ...sub] = rest.split('/')
  const pkgDir = join(nmDir, shortName)
  if (!existsSync(pkgDir)) {
    // 占位包:无 exports 字段,子路径按裸文件解析。
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: `@deepseek-ai/${shortName}`,
      version: '0.0.0-stub',
      type: 'module',
      main: 'index.js',
      types: 'index.d.ts',
    }, null, 2))
    writeFileSync(join(pkgDir, 'index.js'), 'export {}\n')
    writeFileSync(join(pkgDir, 'index.d.ts'), '/** 上游未发布,占位以通过模块解析(skipLibCheck)。 */\nexport {}\n')
    stubbed++
    console.log(`stub @deepseek-ai/${shortName}`)
  }
  if (sub.length > 0) {
    // 子路径导入(如 pkg/types):确保对应的 .d.ts 文件存在。
    const subPath = sub.join('/')
    const candidates = [
      join(nmDir, shortName, `${subPath}.d.ts`),
      join(nmDir, shortName, subPath, 'index.d.ts'),
    ]
    if (!candidates.some(existsSync)) {
      const file = candidates[0]
      mkdirSync(resolve(file, '..'), { recursive: true })
      writeFileSync(file, '/** 上游未发布,占位以通过模块解析(skipLibCheck)。 */\nexport {}\n')
    }
  }
}

console.log(`[sync:types] done (${stubbed} stub packages)`)
