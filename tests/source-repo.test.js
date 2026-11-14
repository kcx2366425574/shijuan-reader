import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetMemoryStorage,
  ensureSources,
  loadSources
} from '../src/core/store.js'
import {
  sourceRepoUrls,
  normalizeManifest,
  syncSourceRepo,
  loadSourceRepoState,
  clearSourceRepoState,
  sourceRepoLabel,
  getSourceRepoConfig
} from '../src/core/source-repo.js'

const basicSource = {
  bookSourceName: '仓库新源',
  bookSourceUrl: 'https://repo.example.com',
  searchUrl: '/search?q={{key}}',
  ruleSearch: { bookList: '.item', name: '.title', bookUrl: '.title@href' },
  ruleBookInfo: { name: 'h1' },
  ruleToc: { chapterList: '#list dd', chapterName: 'a', chapterUrl: 'a@href' },
  ruleContent: { content: '#content' }
}

test('仓库地址：GitHub / Gitee / 静态清单', () => {
  assert.ok(sourceRepoUrls({ provider: 'github', repo: 'me/sources', branch: 'main' })[0].includes('cdn.jsdelivr.net/gh/me/sources@main/index.json'))
  assert.ok(sourceRepoUrls({ provider: 'gitee', repo: 'me/sources', branch: 'master' })[0].includes('gitee.com/me/sources/raw/master/index.json'))
  assert.deepEqual(sourceRepoUrls({ manifestUrl: 'https://cdn.example.com/index.json' }), ['https://cdn.example.com/index.json'])
  assert.equal(sourceRepoLabel({ provider: 'github', repo: 'me/sources', branch: 'main' }), 'GitHub · me/sources@main')
})

test('清单标准化：路径、内联与单书源', () => {
  const manifest = normalizeManifest({
    name: '测试源库',
    version: 3,
    engine: 1,
    sources: [
      { id: 'a', name: 'A', path: 'sources/a.json', version: 2 },
      { id: 'b', source: basicSource }
    ]
  }, 'https://cdn.example.com/index.json')
  assert.equal(manifest.name, '测试源库')
  assert.equal(manifest.version, 3)
  assert.equal(manifest.entries.length, 2)
  assert.equal(manifest.entries[0].path, 'sources/a.json')
  assert.ok(manifest.entries[1].inline)

  const single = normalizeManifest(basicSource, 'https://x.com/index.json')
  assert.equal(single.entries.length, 1)
  assert.equal(single.entries[0].inline.bookSourceName, '仓库新源')
})

test('同步仓库：更新内置源、保留启用状态、新增自定义源', async () => {
  __resetMemoryStorage()
  clearSourceRepoState()
  const before = ensureSources()
  const builtin = before.find((source) => source.id === 'builtin-85zw')
  assert.ok(builtin)
  // 停用一个内置源，同步后应保持停用
  const { toggleSource } = await import('../src/core/store.js')
  toggleSource('builtin-85zw', false)

  const manifest = {
    name: '测试源库',
    version: 2,
    engine: 1,
    sources: [
      {
        id: 'builtin-85zw',
        name: '八五中文网',
        source: {
          ...basicSource,
          bookSourceName: '八五中文网（仓库版）',
          bookSourceUrl: 'https://www.85zw.com',
          charset: 'gbk',
          searchUrl: '/s.php?ie=gbk&q={{key}}',
          ruleSearch: { bookList: '.bookbox', name: 'h4.bookname a', bookUrl: 'h4.bookname a@href' }
        }
      },
      { id: 'repo-new', name: '仓库新源', path: 'sources/new.json' }
    ]
  }

  const calls = []
  const fetcher = async (url) => {
    calls.push(url)
    if (url.endsWith('index.json')) {
      return { text: JSON.stringify(manifest), charset: 'utf-8', status: 200, headers: {}, url }
    }
    if (url.endsWith('sources/new.json')) {
      return { text: JSON.stringify(basicSource), charset: 'utf-8', status: 200, headers: {}, url }
    }
    throw new Error('unexpected url ' + url)
  }

  const settings = { sourceRepoManifestUrl: 'https://cdn.example.com/index.json', sourceRepoAutoSync: true }
  const report = await syncSourceRepo(settings, { fetchText: fetcher })
  assert.equal(report.ok, true)
  assert.equal(report.updated, 1)
  assert.equal(report.added, 1)
  assert.equal(report.failed, 0)
  assert.equal(report.version, 2)

  const after = loadSources()
  const updated = after.find((source) => source.id === 'builtin-85zw')
  const added = after.find((source) => source.id === 'repo-new')
  assert.equal(updated.name, '八五中文网（仓库版）')
  assert.equal(updated.enabled, false)
  assert.equal(updated.builtin, true)
  assert.equal(updated.fromRepo, true)
  assert.ok(added)
  assert.equal(added.enabled, true)
  assert.equal(added.fromRepo, true)

  const state = loadSourceRepoState()
  assert.equal(state.version, 2)
  assert.equal(state.report.added, 1)
  assert.ok(calls.some((url) => url.endsWith('sources/new.json')))
})

test('引擎版本更高时给出警告', async () => {
  __resetMemoryStorage()
  ensureSources()
  clearSourceRepoState()
  const manifest = {
    name: '未来源库',
    version: 9,
    engine: 99,
    sources: [{ id: 'repo-future', source: basicSource }]
  }
  const fetcher = async (url) => ({ text: JSON.stringify(manifest), charset: 'utf-8', status: 200, headers: {}, url })
  const report = await syncSourceRepo({ sourceRepoManifestUrl: 'https://cdn.example.com/index.json' }, { fetchText: fetcher })
  assert.equal(report.ok, true)
  assert.ok(report.warning.includes('引擎'))
})

test('未配置仓库时给出明确错误', async () => {
  __resetMemoryStorage()
  await assert.rejects(
    () => syncSourceRepo({}, { fetchText: async () => ({ text: '{}' }) }),
    /尚未配置书源仓库/
  )
})

test('配置合并：settings 覆盖默认值', () => {
  const config = getSourceRepoConfig({
    sourceRepoProvider: 'gitee',
    sourceRepoRepo: 'me/repo',
    sourceRepoBranch: 'master',
    sourceRepoAutoSync: false
  })
  assert.equal(config.provider, 'gitee')
  assert.equal(config.repo, 'me/repo')
  assert.equal(config.branch, 'master')
  assert.equal(config.autoSync, false)
})

test('同步优化：未变化条目跳过、引擎不兼容不覆盖、下架标记', async () => {
  __resetMemoryStorage()
  ensureSources()
  clearSourceRepoState()
  const v1 = {
    name: '优化源库',
    version: 1,
    engine: 1,
    sources: [
      { id: 'repo-a', name: 'A', version: 1, source: { ...basicSource, bookSourceName: 'A 源', bookSourceUrl: 'https://a.example.com' } },
      { id: 'repo-b', name: 'B', version: 1, source: { ...basicSource, bookSourceName: 'B 源', bookSourceUrl: 'https://b.example.com' } }
    ]
  }
  const manifestFetcher = (manifest) => async (url) => ({
    text: JSON.stringify(url.endsWith('index.json') ? manifest : basicSource),
    charset: 'utf-8',
    status: 200,
    headers: {},
    url
  })
  const first = await syncSourceRepo({ sourceRepoManifestUrl: 'https://cdn.example.com/index.json' }, { fetchText: manifestFetcher(v1) })
  assert.equal(first.added, 2)
  assert.equal(first.skipped, 0)

  const second = await syncSourceRepo({ sourceRepoManifestUrl: 'https://cdn.example.com/index.json' }, {
    fetchText: async (url) => {
      if (!url.endsWith('index.json')) throw new Error('未变化条目不应重新拉取')
      return { text: JSON.stringify(v1), charset: 'utf-8', status: 200, headers: {}, url }
    }
  })
  assert.equal(second.skipped, 2)
  assert.equal(second.added, 0)
  assert.equal(second.updated, 0)

  // 引擎版本更高：保留现有书源
  const incompatible = { ...v1, version: 2, engine: 99, sources: [{ id: 'repo-a', name: 'A', version: 2, source: { ...basicSource, bookSourceName: '不应覆盖', bookSourceUrl: 'https://a.example.com' } }] }
  const engineReport = await syncSourceRepo({ sourceRepoManifestUrl: 'https://cdn.example.com/index.json' }, { fetchText: manifestFetcher(incompatible) })
  assert.equal(engineReport.skippedEngine, true)
  assert.equal(loadSources().find((source) => source.id === 'repo-a').name, 'A 源')

  // 下架：清单移除 repo-b
  const v2 = { ...v1, version: 3, sources: [v1.sources[0]] }
  const retireReport = await syncSourceRepo({ sourceRepoManifestUrl: 'https://cdn.example.com/index.json' }, { fetchText: manifestFetcher(v2) })
  assert.equal(retireReport.retired, 1)
  const retired = loadSources().find((source) => source.id === 'repo-b')
  assert.equal(retired.retired, true)
  assert.equal(retired.enabled, false)
})
