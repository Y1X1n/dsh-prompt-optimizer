#!/usr/bin/env node
/**
 * ima 开发档案同步:把当前 commit 的摘要追加到 ima「开发档案」笔记。
 * 由 .githooks/post-commit 自动触发;凭证从 ~/.config/ima/ 读取(不入库)。
 * 目标笔记 id 从项目根 .ima-note-id 读取(本地文件,不入库)。
 * 任何失败只告警不阻塞 commit(exit 0)。
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKILL = path.join(process.env.USERPROFILE || process.env.HOME || '', '.zcode', 'skills', 'ima-skill', 'ima_api.cjs')
const NOTE_ID_FILE = path.join(ROOT, '.ima-note-id')

function readNoteId() {
  try {
    return fs.readFileSync(NOTE_ID_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function appendToNote(content) {
  const noteId = readNoteId()
  if (!noteId) return
  execFileSync(process.execPath, [
    SKILL,
    'openapi/note/v1/append_doc',
    JSON.stringify({ note_id: noteId, content_format: 1, content }),
  ], { stdio: 'ignore' })
}

function main() {
  const noteId = readNoteId()
  if (!noteId) {
    console.log('[ima-sync] no .ima-note-id, skip')
    return
  }
  const hash = git(['rev-parse', '--short', 'HEAD'])
  const subject = git(['log', '-1', '--format=%s'])
  const author = git(['log', '-1', '--format=%an'])
  const date = git(['log', '-1', '--format=%ad', '--date=format:%Y-%m-%d %H:%M'])
  const files = git(['show', '--stat', '--format=', '--abbrev=8', 'HEAD'])
    .split('\n').pop().trim()
  const content = [
    '',
    `### ${date} \`${hash}\` ${subject}`,
    `- 作者:${author}`,
    `- 变更:${files}`,
    '',
  ].join('\n')
  appendToNote(content)
  console.log(`[ima-sync] appended commit ${hash} to ima note ${noteId}`)
}

try {
  main()
} catch (error) {
  console.warn('[ima-sync] append failed (commit unaffected):', error && error.message)
}
process.exit(0)
