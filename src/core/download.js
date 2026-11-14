/**
 * 整本离线下载。
 *
 * 复用书源解析服务逐章抓取，支持断点续传（已缓存章节跳过）、
 * 并发、失败重试与取消。下载结果由 offline.js 持久化。
 */

import { getChapterContent } from './service.js'
import { getOfflineBook, saveOfflineBook } from './offline.js'

const active = new Map()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function snapshot(state) {
  return {
    bookId: state.bookId,
    status: state.status,
    done: state.done,
    total: state.total,
    failed: state.failed,
    percent: state.total ? Math.round((state.done / state.total) * 100) : 0,
    current: state.current,
    cancelled: state.cancelled
  }
}

export function getDownloadState(bookId) {
  const state = active.get(bookId)
  return state ? snapshot(state) : null
}

export function cancelBookDownload(bookId) {
  const state = active.get(bookId)
  if (!state) return false
  state.cancelled = true
  return true
}

/**
 * @param source 书源
 * @param book {id, name, author, bookUrl, tocUrl, ...}
 * @param chapters 完整目录
 * @param options {concurrency, fetchChapter, onProgress, saveEvery, startIndex, endIndex}
 *        startIndex/endIndex 可只下载指定章节区间（如从当前章到结尾）
 */
export function downloadBook(source, book, chapters, options = {}) {
  const bookId = book && book.id
  if (!bookId) return Promise.reject(new Error('缺少书籍 ID'))
  if (active.has(bookId)) return active.get(bookId).promise

  const fetchChapter = options.fetchChapter || getChapterContent
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 3))
  const saveEvery = Math.max(1, Number(options.saveEvery) || 25)
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const state = {
    bookId,
    status: 'downloading',
    done: 0,
    total: chapters.length,
    failed: 0,
    current: '',
    cancelled: false,
    promise: null
  }

  const report = () => {
    if (onProgress) onProgress(snapshot(state))
  }

  async function run() {
    const existing = await getOfflineBook(bookId)
    const contents = existing && Array.isArray(existing.contents) ? existing.contents.slice() : []
    const byUrl = new Map(contents.map((item) => [item.url, item]))
    const startIndex = Math.max(0, Math.min(chapters.length - 1, Number(options.startIndex) || 0))
    const endIndex = Math.max(startIndex, Math.min(chapters.length - 1, Number.isFinite(Number(options.endIndex)) ? Number(options.endIndex) : chapters.length - 1))
    const rangeChapters = chapters.slice(startIndex, endIndex + 1)
    const targets = rangeChapters.filter((chapter) => !byUrl.has(chapter.url))
    state.done = rangeChapters.filter((chapter) => byUrl.has(chapter.url)).length
    state.total = rangeChapters.length
    state.status = 'downloading'
    report()

    let cursor = 0
    let sinceSave = 0

    async function persist(complete) {
      const ordered = chapters
        .map((chapter) => byUrl.get(chapter.url))
        .filter(Boolean)
      try {
        await saveOfflineBook({
          bookId,
          sourceId: source.id,
          sourceName: source.name,
          info: book,
          bookUrl: book.bookUrl,
          tocUrl: book.tocUrl,
          chapters,
          contents: ordered,
          complete,
          chapterCount: chapters.length,
          cachedChapters: ordered.length
        })
      } catch (e) {
        // 保存失败不中断下载，最终会再次尝试
      }
    }

    async function fetchOne(chapter) {
      let lastError = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (state.cancelled) return null
        try {
          return await fetchChapter(source, chapter, { bookUrl: book.bookUrl })
        } catch (e) {
          lastError = e
          if (attempt < 2) await sleep(400 * (attempt + 1))
        }
      }
      throw lastError || new Error('章节下载失败')
    }

    async function worker() {
      while (cursor < targets.length) {
        const index = cursor++
        if (state.cancelled) return
        const chapter = targets[index]
        state.current = chapter.name
        try {
          const result = await fetchOne(chapter)
          if (!result) continue
          const content = {
            url: chapter.url,
            title: result.title || chapter.name,
            content: result.content || ''
          }
          if (content.content) {
            byUrl.set(chapter.url, content)
            state.done++
          } else {
            state.failed++
          }
        } catch (e) {
          state.failed++
        }
        sinceSave++
        report()
        if (sinceSave >= saveEvery) {
          sinceSave = 0
          await persist(false)
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, targets.length)) }, () => worker()))

    const allCached = chapters.every((chapter) => byUrl.has(chapter.url))
    const complete = !state.cancelled && state.failed === 0 && allCached
    state.status = state.cancelled ? 'cancelled' : complete ? 'done' : 'partial'
    await persist(complete)
    report()
    active.delete(bookId)
    return snapshot(state)
  }

  state.promise = run().catch((e) => {
    state.status = 'error'
    report()
    active.delete(bookId)
    throw e
  })
  active.set(bookId, state)
  return state.promise
}

export function __resetDownloads() {
  active.clear()
}
