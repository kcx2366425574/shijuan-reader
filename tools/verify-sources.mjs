/**
 * 内置书源联网验证：搜索 → 详情 → 目录 → 正文。
 * 用法：npm run verify
 */

import { BUILTIN_SOURCES } from '../src/core/builtin-sources.js'
import { searchSource, openBook, getChapterContent } from '../src/core/service.js'

const directBookUrl = 'https://www.yoboi.com/xiaoshuo/563355.html'
let failed = 0

for (const source of BUILTIN_SOURCES) {
  console.log('\n========================================')
  console.log(`书源：${source.name}  ${source.url}${source.direct ? '  [直链]' : ''}`)
  const started = Date.now()
  try {
    let first
    if (source.direct) {
      first = { name: '直链测试', author: '', bookUrl: directBookUrl, coverUrl: '', intro: '' }
      console.log('  直链书籍：', directBookUrl)
    } else {
      const keyword = source.id === 'builtin-gutenberg' ? 'Alice' : '万相之王'
      const search = await searchSource(source, keyword)
      console.log(`✓ 搜索「${keyword}」：${search.results.length} 条，${search.elapsed}ms，编码 ${search.charset}`)
      if (!search.results.length) throw new Error('没有搜索结果')
      first = search.results[0]
      console.log(`  首条：${first.name} / ${first.author || '未知作者'} / ${first.bookUrl}`)
      console.log(`  封面：${first.coverUrl || '（无）'}`)
    }

    const book = await openBook(source, first.bookUrl, first)
    console.log(`✓ 详情：${book.info.name} / ${book.info.author || '未知作者'} / ${book.chapters.length} 章`)
    console.log(`  分类：${book.info.kind || '（无）'}  状态：${book.info.status || '（无）'}`)
    console.log(`  简介：${(book.info.intro || '').slice(0, 80)}`)
    console.log(`  目录：${book.tocUrl}`)
    console.log(`  首章：${book.chapters[0].name}  ${book.chapters[0].url}`)
    console.log(`  末章：${book.chapters[book.chapters.length - 1].name}`)

    const chapter = await getChapterContent(source, book.chapters[source.direct ? 1 : 0] || book.chapters[0], { bookUrl: book.bookUrl })
    console.log(`✓ 正文：${chapter.title} / ${chapter.content.length} 字`)
    console.log('  ' + chapter.content.slice(0, 120).replace(/\n/g, ' / '))
    if (chapter.content.length < 100) throw new Error('正文长度异常')
    console.log(`总耗时：${Date.now() - started}ms`)
  } catch (e) {
    failed++
    console.error(`✗ 失败：${e.message}`)
    if (e.stage) console.error(`  阶段：${e.stage}`)
  }
}

if (failed) {
  console.error(`\n${failed} 个书源验证失败`)
  process.exit(1)
}
console.log('\n全部书源验证通过')
