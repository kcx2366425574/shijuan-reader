import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareVersions,
  parseVersionCodeFromNotes,
  pickReleaseAsset,
  normalizeUpdatePayload
} from '../src/core/update.js'
import {
  detectSearchCandidates,
  detectSearchResults,
  detectBookInfo,
  detectToc,
  detectContent,
  autoDetectSource
} from '../src/core/autodetect.js'
import { parseHTML } from '../src/core/html.js'
import { clearHttpCache, searchSource, dedupeIndexResults } from '../src/core/service.js'

test('在线升级：版本比较与 versionCode', () => {
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1)
  assert.equal(compareVersions('v1.2', '1.1.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), 0)
  assert.equal(parseVersionCodeFromNotes('更新内容\nversionCode: 120'), 120)
  assert.equal(parseVersionCodeFromNotes('版本号：9'), 9)
})

test('在线升级：Release 解析与安装包选择', () => {
  const payload = {
    tag_name: 'v1.2.0',
    body: '### 新版本\nversionCode: 120\n[force]',
    html_url: 'https://github.com/me/app/releases/tag/v1.2.0',
    published_at: '2026-11-01T00:00:00Z',
    assets: [
      { name: 'shijuan-arm64.apk', browser_download_url: 'https://x/app-arm64.apk', size: 100 },
      { name: 'shijuan-universal.apk', browser_download_url: 'https://x/app.apk', size: 200 },
      { name: 'shijuan.wgt', browser_download_url: 'https://x/app.wgt', size: 50 }
    ]
  }
  const result = normalizeUpdatePayload(payload, {
    current: { versionName: '1.1.0', versionCode: 110 },
    source: 'github'
  })
  assert.equal(result.hasUpdate, true)
  assert.equal(result.latest.versionName, '1.2.0')
  assert.equal(result.latest.versionCode, 120)
  assert.equal(result.latest.force, true)
  assert.equal(result.latest.apkUrl, 'https://x/app.apk')
  assert.equal(result.latest.wgtUrl, 'https://x/app.wgt')
  assert.equal(result.latest.size, 200)

  const pick = pickReleaseAsset(payload.assets, '.apk')
  assert.equal(pick.name, 'shijuan-universal.apk')
})

test('在线升级：静态清单与无需更新', () => {
  const result = normalizeUpdatePayload({
    versionName: '1.0.2',
    versionCode: 102,
    apkUrl: 'https://x/app.apk',
    notes: '修复若干问题',
    publishedAt: '2026-11-02'
  }, {
    current: { versionName: '1.0.2', versionCode: 102 },
    source: 'manifest'
  })
  assert.equal(result.hasUpdate, false)
  assert.equal(result.latest.apkUrl, 'https://x/app.apk')
})

test('智能识别：从表单生成搜索候选', () => {
  const doc = parseHTML(`
    <form method="post" action="/search">
      <input type="hidden" name="c" value="book">
      <input type="text" name="s" placeholder="搜索书名">
    </form>
  `)
  const candidates = detectSearchCandidates(doc, 'https://mock.site/')
  assert.ok(candidates.length >= 1)
  assert.equal(candidates[0].method, 'POST')
  assert.equal(candidates[0].searchUrl, 'https://mock.site/search')
  assert.equal(candidates[0].bodyTemplate, 'c=book&s={{key}}')
  assert.equal(candidates[0].priority, 0)
})

test('智能识别：搜索结果、详情、目录与正文', () => {
  const searchDoc = parseHTML(`
    <div class="bookbox">
      <div class="bookimg"><a href="/book/1/"><img src="/1.jpg"></a></div>
      <div class="bookinfo">
        <h4 class="bookname"><a href="/book/1/">神通者</a></h4>
        <div class="author">作者：天蚕土豆</div>
        <div class="cat">分类：玄幻</div>
        <p>世间生灵，体生异骨，可铭刻承载诸多灵妙之法。</p>
      </div>
    </div>
    <div class="bookbox">
      <div class="bookimg"><a href="/book/2/"><img src="/2.jpg"></a></div>
      <div class="bookinfo">
        <h4 class="bookname"><a href="/book/2/">另一本</a></h4>
        <div class="author">作者：某人</div>
        <p>另一段足够长的简介文字。</p>
      </div>
    </div>
  `)
  const search = detectSearchResults(searchDoc, 'https://mock.site/search')
  assert.equal(search.found, true)
  assert.equal(search.results.length, 2)
  assert.ok(search.rules.bookList)
  assert.equal(search.results[0].name, '神通者')
  assert.equal(search.results[0].author, '天蚕土豆')

  const bookDoc = parseHTML(`
    <meta property="og:novel:author" content="天蚕土豆">
    <meta property="og:novel:category" content="玄幻">
    <meta property="og:image" content="https://mock.site/cover.jpg">
    <meta property="og:description" content="简介文字">
    <h1>神通者</h1>
    <div class="listmain"><dl>
      <dd><a href="/book/1/1.html">第1章 开端</a></dd>
      <dd><a href="/book/1/2.html">第2章 继续</a></dd>
      <dd><a href="/book/1/3.html">第3章 结束</a></dd>
    </dl></div>
  `)
  const info = detectBookInfo(bookDoc, 'https://mock.site/book/1/')
  assert.equal(info.info.name, '神通者')
  assert.equal(info.info.author, '天蚕土豆')
  assert.ok(info.rules.name)

  const toc = detectToc(bookDoc, 'https://mock.site/book/1/')
  assert.equal(toc.found, true)
  assert.equal(toc.count, 3)
  assert.ok(toc.rules.chapterList)

  const chapterDoc = parseHTML(`
    <h1>第1章 开端</h1>
    <article id="content">
      <p>第一段正文，长度足够用于自动识别正文容器，故事从这里开始。</p>
      <p>第二段正文，继续增加一些内容，让容器得分更高。</p>
      <p>第三段正文，人物与场景逐渐清晰。</p>
    </article>
  `)
  const content = detectContent(chapterDoc, 'https://mock.site/book/1/1.html', '第1章 开端')
  assert.equal(content.found, true)
  assert.ok(content.length > 30)
  assert.ok(content.rules.content)
})

test('智能识别：完整流程可生成可用书源', async () => {
  const pages = {
    'https://mock.site/': `
      <form method="get" action="/search">
        <input type="text" name="q" placeholder="搜索书名">
      </form>
    `,
    'https://mock.site/search?q=%E7%A5%9E%E9%80%9A%E8%80%85': `
      <div class="bookbox">
        <div class="bookimg"><a href="/book/1/"><img src="/1.jpg"></a></div>
        <div class="bookinfo">
          <h4 class="bookname"><a href="/book/1/">神通者</a></h4>
          <div class="author">作者：天蚕土豆</div>
          <p>一段足够长的简介文字，用来识别搜索结果条目。</p>
        </div>
      </div>
    `,
    'https://mock.site/book/1/': `
      <meta property="og:novel:author" content="天蚕土豆">
      <meta property="og:image" content="https://mock.site/1.jpg">
      <meta property="og:description" content="简介文字">
      <h1>神通者</h1>
      <div class="listmain"><dl>
        <dd><a href="/book/1/1.html">第1章 开端</a></dd>
        <dd><a href="/book/1/2.html">第2章 继续</a></dd>
        <dd><a href="/book/1/3.html">第3章 结束</a></dd>
      </dl></div>
    `,
    'https://mock.site/book/1/1.html': `
      <h1>第1章 开端</h1>
      <article id="content">
        <p>第一段正文，长度足够用于自动识别正文容器，故事从这里开始。</p>
        <p>第二段正文，继续增加一些内容，让容器得分更高。</p>
        <p>第三段正文，人物与场景逐渐清晰。</p>
      </article>
    `
  }
  const fetcher = async (url) => {
    const exact = pages[url]
    const key = exact !== undefined ? url : Object.keys(pages).sort((a, b) => b.length - a.length).find((item) => url.startsWith(item))
    if (!key) throw new Error('unexpected ' + url)
    return {
      text: pages[key],
      charset: 'utf-8',
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url
    }
  }
  const detected = await autoDetectSource({
    url: 'https://mock.site/',
    keyword: '神通者',
    name: '模拟站'
  }, { fetchText: fetcher })
  assert.equal(detected.ok, true)
  assert.equal(detected.source.name, '模拟站')
  assert.equal(detected.source.searchMethod, 'GET')
  assert.ok(detected.source.ruleSearch.bookList)
  assert.ok(detected.source.ruleToc.chapterList)
  assert.ok(detected.source.ruleContent.content)
  assert.equal(detected.report.stages.toc.count, 3)
  assert.ok(detected.report.stages.content.length > 30)
})

test('分类索引搜索：抓取分类页、按书名匹配并缓存', async () => {
  clearHttpCache()
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    const html = `
      <html><body>
        <a class="book" href="/book/1">神通者</a>
        <a class="book" href="/book/2">另一本</a>
      </body></html>
    `
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }
  try {
    const source = {
      id: 'index-test-' + Date.now(),
      name: '索引站',
      url: 'https://index.example',
      type: 'html',
      charset: 'utf-8',
      searchMode: 'crawl-index',
      indexPagePattern: '/sort/{category}/{page}/',
      indexCategories: [1],
      indexPageLimit: 2,
      indexBookUrlPattern: '/book/\\d+$',
      ruleSearch: { bookList: 'a.book', name: '@text', bookUrl: '@href' }
    }
    const result = await searchSource(source, '神通者')
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].name, '神通者')
    assert.equal(result.results[0].bookUrl, 'https://index.example/book/1')
    const callsAfterFirst = calls.length
    const second = await searchSource(source, '神通者')
    assert.equal(second.results.length, 1)
    assert.equal(calls.length, callsAfterFirst, '第二次搜索应使用索引缓存')
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})


test('分类索引结果按书籍身份去重', () => {
  const base = {
    author: '天蚕土豆',
    lastChapter: '第209章 丢失第二席',
    intro: '世间生灵，体生异骨，可铭刻承载诸多灵妙之法。',
    coverUrl: 'https://x/c.jpg'
  }
  const input = [
    { ...base, name: '神通者精校版', bookUrl: 'https://x/3' },
    { ...base, name: '神通者', bookUrl: 'https://x/1' },
    { ...base, name: '神通者天蚕土豆更新', bookUrl: 'https://x/2' },
    { ...base, name: '另一本', author: '另一位', lastChapter: '第1章', intro: '完全不同的简介', bookUrl: 'https://x/4' }
  ]
  const result = dedupeIndexResults(input, '神通者')
  assert.equal(result.length, 2)
  assert.equal(result[0].name, '神通者')
  assert.equal(result[0].bookUrl, 'https://x/1')
})
