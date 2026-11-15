/**
 * 书架更新：重新抓取书籍详情与目录，汇总最新章节变化。
 */

import { openBook } from './service.js'

export function summarizeRefresh(book, opened) {
  const original = book || {}
  const info = (opened && opened.info) || {}
  const chapters = Array.isArray(opened && opened.chapters) ? opened.chapters : []
  const latest = chapters.length ? chapters[chapters.length - 1] : null
  const lastChapter = (latest && latest.name) || info.lastChapter || original.lastChapter || ''
  const chapterCount = chapters.length || Number(original.chapterCount) || 0
  const previousCount = Number(original.chapterCount) || 0
  const previousChapter = String(original.lastChapter || '')
  const grew = previousCount > 0 ? Math.max(0, chapterCount - previousCount) : 0
  const changedSameCount = previousCount > 0 && grew === 0 &&
    previousChapter && lastChapter && previousChapter !== lastChapter
  return {
    info,
    chapters,
    lastChapter,
    chapterCount,
    tocUrl: (opened && opened.tocUrl) || original.tocUrl || '',
    newChapterCount: grew,
    hasNew: grew > 0 || changedSameCount
  }
}

export async function refreshBookInfo(source, book, options = {}) {
  const opened = await openBook(source, book.bookUrl, book, options)
  const summary = summarizeRefresh(book, opened)
  return {
    ...summary,
    bookUrl: opened.bookUrl || book.bookUrl,
    charset: opened.charset
  }
}
