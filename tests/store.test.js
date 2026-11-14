import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetMemoryStorage,
  ensureSources,
  loadSources,
  deleteSource,
  restoreBuiltinSources,
  addSources,
  toggleSource,
  loadShelf,
  upsertShelfBook,
  updateBookProgress,
  getContinueReading,
  removeShelfBook,
  loadSettings,
  saveSettings,
  resetSettings,
  addSearchHistory,
  loadSearchHistory,
  clearSearchHistory,
  clearAllLocalData,
  makeBookId
} from '../src/core/store.js'

test('首次启动写入内置书源，删除后不会被自动加回', () => {
  __resetMemoryStorage()
  const sources = ensureSources()
  assert.equal(sources.length, 2)
  assert.ok(sources.every((source) => source.builtin))
  const target = sources[0]

  deleteSource(target.id)
  const afterDelete = loadSources()
  assert.equal(afterDelete.length, 1)
  const again = ensureSources()
  assert.equal(again.length, 1)

  const restored = restoreBuiltinSources()
  assert.equal(restored.length, 2)
  assert.ok(restored.some((source) => source.id === target.id))
})

test('书源启停与增量添加', () => {
  __resetMemoryStorage()
  ensureSources()
  const sources = loadSources()
  const target = sources[0]
  toggleSource(target.id, false)
  assert.equal(loadSources().find((s) => s.id === target.id).enabled, false)

  addSources([{ id: 'custom-1', name: '自定义', url: 'https://x.com', enabled: true }])
  assert.equal(loadSources().length, 3)
})

test('书架：加入、更新信息、保留进度', () => {
  __resetMemoryStorage()
  const book = {
    sourceId: 's1',
    sourceName: '源一',
    name: '万相之王',
    author: '天蚕土豆',
    bookUrl: 'https://a.com/1',
    coverUrl: 'https://a.com/cover.jpg',
    intro: '简介',
    chapterCount: 100
  }
  const added = upsertShelfBook(book)
  assert.equal(added.id, makeBookId('s1', 'https://a.com/1'))
  assert.equal(loadShelf().length, 1)

  updateBookProgress(added.id, {
    chapterIndex: 5,
    chapterName: '第6章',
    chapterUrl: 'https://a.com/6',
    scrollTop: 120,
    percent: 0.06
  })
  const updated = upsertShelfBook({ ...book, intro: '新简介', lastChapter: '第100章' })
  assert.equal(updated.id, added.id)
  assert.equal(updated.intro, '新简介')
  assert.equal(updated.lastChapter, '第100章')
  assert.equal(updated.progress.chapterIndex, 5)
  assert.equal(loadShelf().length, 1)

  const continueBook = getContinueReading()
  assert.equal(continueBook.id, added.id)

  removeShelfBook(added.id)
  assert.equal(loadShelf().length, 0)
  assert.equal(getContinueReading(), null)
})

test('阅读设置默认值、范围约束与重置', () => {
  __resetMemoryStorage()
  const defaults = loadSettings()
  assert.equal(defaults.theme, 'paper')
  assert.equal(defaults.fontSize, 19)

  const saved = saveSettings({ theme: 'night', fontSize: 100, lineHeight: 0.5 })
  assert.equal(saved.theme, 'night')
  assert.equal(saved.fontSize, 32)
  assert.equal(saved.lineHeight, 1.4)

  const reset = resetSettings()
  assert.equal(reset.theme, 'paper')
  assert.equal(reset.fontSize, 19)
})

test('搜索历史去重、置顶与上限', () => {
  __resetMemoryStorage()
  addSearchHistory('三体')
  addSearchHistory('诡秘之主')
  addSearchHistory('三体')
  assert.deepEqual(loadSearchHistory(), ['三体', '诡秘之主'])
  for (let i = 0; i < 20; i++) addSearchHistory('书' + i)
  assert.equal(loadSearchHistory().length, 12)
  clearSearchHistory()
  assert.equal(loadSearchHistory().length, 0)
})

test('清空本地数据', () => {
  __resetMemoryStorage()
  ensureSources()
  upsertShelfBook({ sourceId: 's', bookUrl: 'https://a/1', name: '书' })
  addSearchHistory('关键词')
  clearAllLocalData()
  assert.equal(loadSources().length, 0)
  assert.equal(loadShelf().length, 0)
  assert.equal(loadSearchHistory().length, 0)
})
