import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  __resetOfflineMemory,
  appendOfflineChapter,
  appendOfflineChapters,
  buildCachedUrlSet,
  buildOfflinePayloadWithChapters,
  getOfflineBook,
  getOfflineChapter,
  getOfflineMeta
} from '../src/core/offline.js'
import { createAutoCacheScheduler } from '../src/core/auto-cache.js'

const BASE = {
  bookId: 'book-1',
  sourceId: 'src-1',
  sourceName: '测试书源',
  info: { name: '测试书', author: '作者' },
  bookUrl: 'https://example.com/book/1',
  tocUrl: 'https://example.com/book/1/list',
  chapters: [
    { url: 'https://example.com/1.html', name: '第1章' },
    { url: 'https://example.com/2.html', name: '第2章' },
    { url: 'https://example.com/3.html', name: '第3章' }
  ]
}

function entry(index, content = '正文' + index) {
  return {
    chapter: { url: `https://example.com/${index}.html`, name: `第${index}章` },
    content,
    title: `第${index}章`
  }
}

test('buildCachedUrlSet：按 url 建集合并忽略无效项', () => {
  const set = buildCachedUrlSet([
    { url: 'a' },
    { url: 'a' },
    { url: 'b' },
    {},
    null,
    { url: '' }
  ])
  assert.deepEqual(Array.from(set), ['a', 'b'])
  assert.equal(buildCachedUrlSet(null).size, 0)
})

test('纯函数增量追加：不丢原有章节，按 url 去重，跳过空正文', () => {
  const existing = {
    ...BASE,
    contents: [
      { url: 'https://example.com/1.html', name: '第1章', content: '已缓存1' },
      { url: 'https://example.com/2.html', name: '第2章', content: '已缓存2' }
    ],
    complete: true
  }
  const payload = buildOfflinePayloadWithChapters(existing, {
    ...BASE,
    entries: [entry(1, '新正文1'), entry(1, '重复项'), entry(3, ''), entry(3, '新正文3')]
  })
  assert.ok(payload)
  assert.equal(payload.contents.length, 3, '原有 2 章 + 新增第 3 章')
  assert.equal(payload.contents[0].content, '重复项', '已缓存的同 url 被覆盖')
  assert.equal(payload.contents[1].content, '已缓存2', '未涉及章节保持原样')
  assert.equal(payload.contents[2].url, 'https://example.com/3.html')
  assert.equal(payload.chapters.length, 3, '目录不丢失')
  assert.equal(payload.complete, true, '原有完成标记保留')
  assert.equal(existing.contents.length, 2, '入参不被修改')
  assert.equal(buildOfflinePayloadWithChapters(existing, { ...BASE, entries: [entry(9, '')] }), null)
})

test('纯函数增量追加：离线书不存在时新建记录且 complete 为 false', () => {
  const payload = buildOfflinePayloadWithChapters(null, { ...BASE, entries: [entry(2)] })
  assert.ok(payload)
  assert.equal(payload.bookId, 'book-1')
  assert.equal(payload.chapters.length, 3)
  assert.equal(payload.contents.length, 1)
  assert.equal(payload.complete, false, '只缓存一章不能标记为全书完成')
  assert.equal(payload.info.name, '测试书')
  assert.equal(payload.sourceName, '测试书源')
})

test('appendOfflineChapters：批量写入、去重、重复调用不再写', async () => {
  __resetOfflineMemory()
  const first = await appendOfflineChapters({ ...BASE, entries: [entry(1), entry(2)] })
  assert.ok(first)
  assert.equal(first.contents.length, 2)

  const existing = await getOfflineBook('book-1')
  assert.equal(existing.contents.length, 2)
  assert.ok((await getOfflineChapter('book-1', 'https://example.com/1.html')).content.includes('正文1'))
  assert.equal(getOfflineMeta('book-1').cachedChapters, 2)

  const again = await appendOfflineChapters({ ...BASE, entries: [entry(1), entry(2)] })
  assert.equal(again, null, '全部已缓存时不做写入')
  assert.equal((await getOfflineBook('book-1')).contents.length, 2)

  const third = await appendOfflineChapter(BASE, entry(3))
  assert.ok(third)
  assert.equal(third.contents.length, 3, '追加新章不丢旧章')
  __resetOfflineMemory()
})

test('appendOfflineChapters：并发调用串行化，不丢失章节', async () => {
  __resetOfflineMemory()
  await Promise.all([
    appendOfflineChapter(BASE, entry(1)),
    appendOfflineChapter(BASE, entry(2)),
    appendOfflineChapter(BASE, entry(3))
  ])
  const book = await getOfflineBook('book-1')
  assert.equal(book.contents.length, 3, '并发写入后三章都在')
  __resetOfflineMemory()
})

test('appendOfflineChapters：缺少 bookId / 章节 url 时安全返回 null', async () => {
  __resetOfflineMemory()
  assert.equal(await appendOfflineChapters({ ...BASE, bookId: '', entries: [entry(1)] }), null)
  assert.equal(await appendOfflineChapters({ ...BASE, entries: [] }), null)
  assert.equal(await appendOfflineChapters({ ...BASE, entries: [{ chapter: {}, content: 'x' }] }), null)
  assert.equal(await getOfflineBook('book-1'), null)
  __resetOfflineMemory()
})

test('createAutoCacheScheduler：1.2 秒窗口内多次 schedule 只提交一次', async () => {
  const batches = []
  const scheduler = createAutoCacheScheduler((entries) => {
    batches.push(entries)
    return entries.length
  }, 25)
  scheduler.schedule(entry(1))
  scheduler.schedule(entry(2))
  scheduler.schedule(entry(1, '覆盖正文'))
  assert.equal(scheduler.pendingCount, 2, '同 url 去重')
  await new Promise((resolve) => setTimeout(resolve, 70))
  assert.equal(batches.length, 1, '防抖窗口结束后只提交一次')
  assert.equal(batches[0].length, 2)
  assert.ok(batches[0].some((item) => item.content === '覆盖正文'))
  assert.equal(scheduler.pendingCount, 0)
})

test('页面接线：两处目录标记、reader 在线加载后安排自动缓存', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const reader = readFileSync(resolve(root, 'src/pages/reader/reader.vue'), 'utf8')
  const book = readFileSync(resolve(root, 'src/pages/book/book.vue'), 'utf8')

  for (const [name, source] of [['reader.vue', reader], ['book.vue', book]]) {
    assert.ok(source.includes('v-if="cachedUrls.has(chapter.url)"'), name + ' 目录行应有已缓存标记')
    assert.ok(source.includes('class="catalog-cached"'), name + ' 应有标记样式')
    assert.ok(source.includes('buildCachedUrlSet'), name + ' 应从离线 contents 建 Set')
  }
  const getContentAt = reader.indexOf('await getChapterContent(')
  const scheduleAt = reader.indexOf('scheduleAutoCache(chapter, result)', getContentAt)
  assert.ok(getContentAt > 0 && scheduleAt > getContentAt, '在线取正文成功后才安排自动缓存')
  assert.ok(reader.includes('autoCache.schedule('), '自动缓存应走防抖调度器')
  assert.ok(reader.includes('appendOfflineChapters('), '防抖提交应走批量追加 API')
  assert.ok(reader.includes('flushAutoCache()'), '离开页面时应冲刷待提交章节')
})

test('createAutoCacheScheduler：flush 立即提交并透传结果，dispose 清除待提交项', async () => {
  let called = 0
  const scheduler = createAutoCacheScheduler(() => {
    called++
    return 'done'
  }, 10000)
  scheduler.schedule(entry(1))
  assert.equal(await scheduler.flush(), 'done')
  assert.equal(called, 1)
  await scheduler.flush()
  assert.equal(called, 1, '没有待提交项时不调用回调')

  scheduler.schedule(entry(2))
  scheduler.dispose()
  assert.equal(scheduler.pendingCount, 0)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(called, 1, 'dispose 后定时器不再触发')
})
