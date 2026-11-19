import test from 'node:test'
import assert from 'node:assert/strict'

import { BUILTIN_SOURCES, BUILTIN_CONFIG_VERSION } from '../src/core/builtin-sources.js'

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
  assert.equal(sources.length, BUILTIN_SOURCES.length)
  assert.ok(sources.every((source) => source.builtin))
  const target = sources[0]

  deleteSource(target.id)
  const afterDelete = loadSources()
  assert.equal(afterDelete.length, BUILTIN_SOURCES.length - 1)
  const again = ensureSources()
  assert.equal(again.length, BUILTIN_SOURCES.length - 1)

  const restored = restoreBuiltinSources()
  assert.equal(restored.length, BUILTIN_SOURCES.length)
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
  assert.equal(loadSources().length, BUILTIN_SOURCES.length + 1)
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
  assert.equal(defaults.catalogReverse, false)

  const saved = saveSettings({ theme: 'night', fontSize: 100, lineHeight: 0.5, catalogReverse: true })
  assert.equal(saved.theme, 'night')
  assert.equal(saved.fontSize, 32)
  assert.equal(saved.lineHeight, 1.4)
  assert.equal(saved.catalogReverse, true)
  assert.equal(loadSettings().catalogReverse, true, '目录排序偏好应持久化')

  const reset = resetSettings()
  assert.equal(reset.theme, 'paper')
  assert.equal(reset.fontSize, 19)
  assert.equal(reset.catalogReverse, false)
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

test('书源按地址与名称去重', () => {
  __resetMemoryStorage()
  ensureSources()
  const before = loadSources().length
  addSources([
    { id: 'dup-1', name: '重复源', url: 'https://dup.example.com', enabled: true },
    { id: 'dup-2', name: '重复源', url: 'https://dup.example.com/', enabled: false }
  ])
  const sources = loadSources()
  assert.equal(sources.length, before + 1)
  const dup = sources.filter((source) => source.url.indexOf('dup.example.com') !== -1)
  assert.equal(dup.length, 1)
  assert.equal(dup[0].id, 'dup-1')
})

test('存量用户 storedVersion=7 升级后能补齐 jurewx 分页规则并保留启用状态', async () => {
  // 用独立的 store 模块实例 + uni storage mock 模拟老版本用户的本地数据，
  // 避免污染本文件其它用例使用的内存 storage。
  const storage = new Map()
  const previousUni = globalThis.uni
  globalThis.uni = {
    getStorageSync: (key) => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    request: () => {}
  }
  try {
    const freshStore = await import('../src/core/store.js?upgrade-regression=' + Date.now())
    const oldBuiltins = BUILTIN_SOURCES.map((source) => {
      const copy = JSON.parse(JSON.stringify(source))
      copy.builtinConfigVersion = 7
      if (copy.id === 'builtin-jurewx') {
        delete copy.ruleContent.nextContentUrl // 存量用户本地那份旧规则
        copy.enabled = true                    // 模拟用户已启用该源
      }
      return copy
    })
    storage.set(freshStore.KEYS.SEEDED, true)
    storage.set(freshStore.KEYS.BUILTIN_VERSION, 7)
    storage.set(freshStore.KEYS.SOURCES, oldBuiltins)

    const sources = freshStore.ensureSources()
    const upgraded = sources.find((item) => item.id === 'builtin-jurewx')
    assert.ok(upgraded, '聚热文学应保留在书源列表中')
    assert.ok(upgraded.ruleContent.nextContentUrl, '存量用户应拿到新的正文分页规则')
    assert.equal(upgraded.enabled, true, '用户已启用状态不得丢失')
    assert.equal(upgraded.builtinConfigVersion, BUILTIN_CONFIG_VERSION)
    assert.equal(
      freshStore.loadSources().find((item) => item.id === 'builtin-jurewx').ruleContent.nextContentUrl,
      upgraded.ruleContent.nextContentUrl,
      '升级结果应已持久化'
    )
    assert.equal(freshStore.KEYS.BUILTIN_VERSION, 'shijuan.builtinVersion.v1')
    assert.equal(Number(storage.get(freshStore.KEYS.BUILTIN_VERSION)), BUILTIN_CONFIG_VERSION)
  } finally {
    globalThis.uni = previousUni
  }
})
