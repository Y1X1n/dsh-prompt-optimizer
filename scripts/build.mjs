import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

// 元提示词与输出解析:独立产物,供单元测试(以及潜在的第三方复用)直接引用。
await build({
  entryPoints: ['src/prompt.ts'],
  outfile: 'lib/prompt.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external',
  logLevel: 'info',
})

// Host 半:ESM;@deepseek-ai/* 与 node 内建模块保持外部,由 profile 的 node_modules 解析。
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external',
  logLevel: 'info',
})

// Client 半:loader 的 lazy-CJS factory 形态(对齐官方包的产物结构)。
// react 与 @deepseek-ai/* 是页面运行时外部模块,不打包进 bundle。
const banner = [
  'window.__ModuleLoader__.load({',
  '\tid: "dsh-prompt-optimizer",',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
].join('\n')
const footer = ['\t\treturn module.exports;', '\t}', '});'].join('\n')

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/*', '@deepseek-ai/*'],
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
})

console.log('[build] lib/index.js + lib/client.js + lib/prompt.js done')
