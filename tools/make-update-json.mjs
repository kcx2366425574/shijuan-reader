#!/usr/bin/env node
/** 生成静态 update.json。用法见 docs/RELEASE.md */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
function value(name, fallback = '') {
  const index = args.indexOf('--' + name)
  return index === -1 ? fallback : (args[index + 1] || fallback)
}
const version = value('version')
const code = Number(value('code')) || 0
const apk = value('apk')
if (!version || !code || !apk) {
  console.error('用法: node tools/make-update-json.mjs --version 1.0.1 --code 101 --apk URL [--wgt URL] [--notes 文本] [--page URL] [--force] [--out update.json]')
  process.exit(1)
}
const data = {
  versionName: version,
  versionCode: code,
  notes: value('notes', ''),
  apkUrl: apk,
  wgtUrl: value('wgt', ''),
  pageUrl: value('page', ''),
  force: args.includes('--force'),
  publishedAt: new Date().toISOString(),
  size: 0
}
const out = path.resolve(value('out', 'update.json'))
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log('wrote', out)
