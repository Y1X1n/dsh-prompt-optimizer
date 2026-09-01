for (let i = 1; i <= 4; i++) {
  try {
    const o = require('child_process').execSync('git -C E:/dsh-plugins/dsh-prompt-optimizer push origin main', { timeout: 60000 }).toString()
    console.log('PUSH OK on attempt', i, ':', o.trim())
    process.exit(0)
  } catch (e) {
    console.log('attempt', i, 'failed:', String(e.stderr || e.message).slice(0, 90))
    if (i < 4) {
      const end = Date.now() + 30000
      while (Date.now() < end) {}
    }
  }
}
console.log('STILL FAILING — commit 715c1ed 留在本地,网络恢复后 push 即可')
process.exit(1)
