import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetOfflineMemory,
  clearOfflineBooks,
  getOfflineBook,
  getOfflineChapter,
  getOfflineMeta,
  getOfflineStats,
  loadOfflineIndex,
  removeOfflineBook,
  saveOfflineBook
} from '../src/core/offline.js'
import { downloadBook, __resetDownloads, cancelBookDownload } from '../src/core/download.js'

const source = { id: 's1', name: '测试源', url: 'https://example.com' }
const book = {
  id: 'book-1',
  name: '神通者',
  author: '天蚕土豆',
  bookUrl: 'https://example.com/book/1/',
  tocUrl: 'https://example.com/book/1/'
}
const chapters = [
  { name: '第1章', url: 'https://example.com/book/1/1.html' },
  { name: '第2章', url: 'https://example.com/book/1/2.html' },
  { name: '第3章', url: 'https://example.com/book/1/3.html' }
]

test('离线存储：保存、读取章节、统计与删除', async () => {
  __resetOfflineMemory()
  await clearOfflineBooks()
  await saveOfflineBook({
    bookId: book.id,
    sourceId: source.id,
    sourceName: source.name,
    info: book,
    bookUrl: book.bookUrl,
    tocUrl: book.tocUrl,
    chapters,
    contents: [
      { url: chapters[0].url, title: chapters[0].name, content: '第一章正文' },
      { url: chapters[1].url, title: chapters[1].name, content: '第二章正文' }
    ],
    complete: false,
    chapterCount: 3,
    cachedChapters: 2
  })
  const meta = getOfflineMeta(book.id)
  assert.equal(meta.cachedChapters, 2)
  assert.equal(meta.complete, false)
  assert.equal(getOfflineStats().count, 1)
  assert.equal(loadOfflineIndex().length, 1)

  const stored = await getOfflineBook(book.id)
  assert.equal(stored.info.name, '神通者')
  assert.equal(stored.contents.length, 2)
  const chapter = await getOfflineChapter(book.id, chapters[1].url)
  assert.equal(chapter.content, '第二章正文')
  assert.equal(await getOfflineChapter(book.id, chapters[2].url), null)

  await removeOfflineBook(book.id)
  assert.equal(getOfflineMeta(book.id), null)
  assert.equal(await getOfflineBook(book.id), null)
  assert.equal(getOfflineStats().count, 0)
})

test('整本下载：逐章抓取、完成状态与缓存正文', async () => {
  __resetOfflineMemory()
  await clearOfflineBooks()
  __resetDownloads()
  const fetched = []
  const result = await downloadBook(source, book, chapters, {
    concurrency: 2,
    saveEvery: 100,
    fetchChapter: async (src, chapter) => {
      fetched.push(chapter.url)
      return { title: chapter.name + ' 标题', content: chapter.name + ' 正文内容' }
    }
  })
  assert.equal(result.status, 'done')
  assert.equal(result.done, 3)
  assert.equal(result.percent, 100)
  assert.equal(fetched.length, 3)

  const meta = getOfflineMeta(book.id)
  assert.equal(meta.complete, true)
  assert.equal(meta.cachedChapters, 3)
  const chapter = await getOfflineChapter(book.id, chapters[2].url)
  assert.equal(chapter.title, '第3章 标题')
  assert.equal(chapter.content, '第3章 正文内容')
})

test('整本下载：断点续传跳过已缓存章节', async () => {
  __resetOfflineMemory()
  await clearOfflineBooks()
  __resetDownloads()
  await saveOfflineBook({
    bookId: book.id,
    sourceId: source.id,
    sourceName: source.name,
    info: book,
    bookUrl: book.bookUrl,
    tocUrl: book.tocUrl,
    chapters,
    contents: [{ url: chapters[0].url, title: chapters[0].name, content: '已缓存' }],
    complete: false,
    chapterCount: 3,
    cachedChapters: 1
  })
  const fetched = []
  const result = await downloadBook(source, book, chapters, {
    concurrency: 2,
    saveEvery: 100,
    fetchChapter: async (src, chapter) => {
      fetched.push(chapter.url)
      return { title: chapter.name, content: '正文' }
    }
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(fetched.sort(), [chapters[1].url, chapters[2].url].sort())
  const meta = getOfflineMeta(book.id)
  assert.equal(meta.cachedChapters, 3)
  assert.equal(meta.complete, true)
})

test('整本下载：取消后保留已下载章节', async () => {
  __resetOfflineMemory()
  await clearOfflineBooks()
  __resetDownloads()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const promise = downloadBook(source, book, chapters, {
    concurrency: 1,
    saveEvery: 100,
    fetchChapter: async (src, chapter) => {
      if (chapter.url === chapters[0].url) {
        await gate
      }
      return { title: chapter.name, content: '正文' }
    }
  })
  assert.equal(cancelBookDownload(book.id), true)
  release()
  const result = await promise
  assert.equal(result.status, 'cancelled')
  const meta = getOfflineMeta(book.id)
  assert.ok(meta)
  assert.equal(meta.complete, false)
})


test('整本下载：支持从当前章节开始缓存', async () => {
  __resetOfflineMemory()
  await clearOfflineBooks()
  __resetDownloads()
  const fetched = []
  const result = await downloadBook(source, book, chapters, {
    concurrency: 1,
    saveEvery: 100,
    startIndex: 1,
    fetchChapter: async (src, chapter) => {
      fetched.push(chapter.url)
      return { title: chapter.name, content: '正文' }
    }
  })
  assert.deepEqual(fetched.sort(), [chapters[1].url, chapters[2].url].sort())
  assert.equal(result.total, 2)
  assert.equal(result.done, 2)
  assert.equal(result.status, 'partial')
  const meta = getOfflineMeta(book.id)
  assert.equal(meta.cachedChapters, 2)
  assert.equal(meta.chapterCount, 3)
  assert.equal(meta.complete, false)
  assert.ok(meta)
})
