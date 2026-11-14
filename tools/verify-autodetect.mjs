/**
 * 智能识别联网验证。
 * 用法：node tools/verify-autodetect.mjs [网址] [书名]
 */

import { autoDetectSource } from '../src/core/autodetect.js'
import { searchSource, openBook, getChapterContent } from '../src/core/service.js'

const sites = process.argv[2]
  ? [{ name: '自定义站点', url: process.argv[2] }]
  : [
      { name: '八五中文网', url: 'https://www.85zw.com' },
      { name: '全本小说网', url: 'https://www.quanben.io' }
    ]
const keyword = process.argv[3] || '万相之王'
let failed = 0

for (const site of sites) {
  console.log('\n========================================')
  console.log(`智能识别：${site.name} ${site.url} / ${keyword}`)
  try {
    const result = await autoDetectSource({
      url: site.url,
      keyword,
      name: site.name
    }, {
      onProgress(stage, message) {
        console.log(`  [${stage}] ${message}`)
      }
    })
    console.log('✓ 生成书源：', result.source.name)
    console.log('  searchUrl:', result.source.searchUrl)
    console.log('  charset:', result.source.charset, 'searchCharset:', result.source.searchCharset)
    console.log('  ruleSearch:', JSON.stringify(result.source.ruleSearch))
    console.log('  ruleBookInfo:', JSON.stringify(result.source.ruleBookInfo))
    console.log('  ruleToc:', JSON.stringify(result.source.ruleToc))
    console.log('  ruleContent:', JSON.stringify(result.source.ruleContent))
    console.log('  报告:', JSON.stringify(result.report.stages, null, 2).slice(0, 1600))

    const search = await searchSource(result.source, keyword)
    console.log(`✓ 用生成规则搜索：${search.results.length} 条`)
    if (!search.results.length) throw new Error('生成规则搜索为空')
    const book = await openBook(result.source, search.results[0].bookUrl, search.results[0])
    console.log(`✓ 详情/目录：${book.info.name} / ${book.chapters.length} 章`)
    if (book.chapters.length < 3) throw new Error('目录章节过少')
    const chapter = await getChapterContent(result.source, book.chapters[0], { bookUrl: book.bookUrl })
    console.log(`✓ 正文：${chapter.title} / ${chapter.content.length} 字`)
    console.log('  ' + chapter.content.slice(0, 100).replace(/\n/g, ' / '))
    if (chapter.content.length < 100) throw new Error('正文长度异常')
  } catch (e) {
    failed++
    console.error('✗ 失败：', e.stage ? `[${e.stage}] ` : '', e.message)
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'))
  }
}

if (failed) {
  console.error(`\n${failed} 个站点识别失败`)
  process.exit(1)
}
console.log('\n智能识别全部通过')
