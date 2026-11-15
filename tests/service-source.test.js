import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeSource,
  parseSourceImport,
  exportSource,
  validateSource,
  SOURCE_TEMPLATE
} from '../src/core/source.js'
import {
  buildSearchRequest,
  parseDocument,
  groupSearchResults,
  proxiedUrl,
  extractWafToken
} from '../src/core/service.js'
import { BUILTIN_SOURCES } from '../src/core/builtin-sources.js'

test('内置书源结构完整且通过校验', () => {
  assert.ok(BUILTIN_SOURCES.length >= 5)
  for (const source of BUILTIN_SOURCES) {
    assert.equal(validateSource(source).length, 0, source.name)
    if (!source.direct && !source.singleChapter) assert.ok(source.ruleSearch.bookList, source.name)
    if (!source.singleChapter) assert.ok(source.ruleToc.chapterList, source.name)
    assert.ok(source.ruleContent.content, source.name)
  }
  assert.ok(BUILTIN_SOURCES.some((source) => source.searchMode === 'crawl-index' || source.direct))
  assert.ok(BUILTIN_SOURCES.some((source) => source.singleChapter))
})

test('规范化 Legado 书源字段', () => {
  const source = normalizeSource({
    bookSourceName: '测试源',
    bookSourceUrl: 'https://example.com/',
    bookSourceGroup: '小说,备用',
    bookSourceType: 0,
    charset: 'GBK',
    searchUrl: '/search?q={{key}}',
    ruleSearch: {
      bookList: '.item',
      name: '.title',
      author: '.author',
      bookUrl: '.title@href',
      coverUrl: 'img@src',
      intro: '.intro'
    },
    ruleBookInfo: { name: 'h1', tocUrl: 'a[href$="list"]@href' },
    ruleToc: { chapterList: '#list dd', chapterName: 'a', chapterUrl: 'a@href', reverse: true },
    ruleContent: { content: '#content', replaceRegex: '广告##' }
  })
  assert.equal(source.name, '测试源')
  assert.equal(source.url, 'https://example.com')
  assert.equal(source.group, '小说')
  assert.equal(source.charset, 'gbk')
  assert.equal(source.type, 'html')
  assert.equal(source.tocReverse, true)
  assert.deepEqual(source.replaceRules, ['广告##'])
  assert.equal(source.valid, true)
  assert.ok(source.id.startsWith('user-'))
})

test('WAF 验证页可提取 token', () => {
  const html = `<!doctype html><html><body><script>var token='AAAA-test-token';document.cookie='waf_challenge='+token;</script></body></html>`
  assert.equal(extractWafToken(html), 'AAAA-test-token')
  assert.equal(extractWafToken('普通页面'), '')
})

test('规范化保留正文解码字段', () => {
  const source = normalizeSource({
    bookSourceName: '解码源',
    bookSourceUrl: 'https://example.com',
    searchUrl: '/search?q={{key}}',
    ruleSearch: { bookList: '.item', name: '.title', bookUrl: '.title@href' },
    ruleToc: { chapterList: '.chapter', chapterName: 'a', chapterUrl: 'a@href' },
    ruleContent: { content: '#txt', decode: 'base64-script' }
  })
  assert.equal(source.ruleContent.decode, 'base64-script')
})

test('规范化保留目录分页字段与章节名正则转义', () => {
  const source = normalizeSource({
    bookSourceName: '分页源',
    bookSourceUrl: 'https://example.com',
    searchUrl: '/search?q={{key}}',
    ruleSearch: { bookList: '.item', name: '.title', bookUrl: '.title@href' },
    ruleToc: {
      chapterList: '.chapter',
      chapterName: 'a@text##\s*\[免费\]##',
      chapterUrl: 'a@href',
      nextPage: 'link[rel="next"]@href',
      pageUrl: 'https://example.com/list/{{bookId}}/{{page}}.html',
      totalChapters: '#total',
      maxPages: 20
    },
    ruleContent: { content: '#content' }
  })
  assert.equal(source.ruleToc.nextPage, 'link[rel="next"]@href')
  assert.equal(source.ruleToc.pageUrl, 'https://example.com/list/{{bookId}}/{{page}}.html')
  assert.equal(source.ruleToc.totalChapters, '#total')
  assert.equal(String(source.ruleToc.maxPages), '20')
  assert.equal(source.ruleToc.chapterName, 'a@text##\s*\[免费\]##')
})

test('Legado searchUrl 尾部请求配置可解析', () => {
  const source = normalizeSource({
    bookSourceName: 'POST 源',
    bookSourceUrl: 'https://example.com',
    searchUrl: '/search,{"method":"POST","body":"s={{key}}","charset":"gbk"}',
    ruleSearch: { bookList: '.item' }
  })
  assert.equal(source.searchUrl, '/search')
  assert.equal(source.searchMethod, 'POST')
  assert.equal(source.searchBody, 's={{key}}')
  assert.equal(source.charset, 'gbk')
})

test('JSON 书源可从 bookList 推断', () => {
  const source = normalizeSource({
    bookSourceName: 'JSON 源',
    bookSourceUrl: 'https://api.example.com',
    searchUrl: '/search?q={{key}}',
    ruleSearch: { bookList: '$.results[*]', name: '$.title', bookUrl: '$.url' }
  })
  assert.equal(source.type, 'json')
})

test('解析数组、包装对象与错误输入', () => {
  const arrayResult = parseSourceImport(JSON.stringify([
    { bookSourceName: 'A', bookSourceUrl: 'https://a.com', searchUrl: '/s?q={{key}}', ruleSearch: { bookList: '.x' } },
    { bookSourceName: 'B', bookSourceUrl: 'https://b.com', searchUrl: '/s?q={{key}}', ruleSearch: { bookList: '.y' } }
  ]))
  assert.equal(arrayResult.sources.length, 2)
  assert.equal(arrayResult.errors.length, 0)

  const wrapped = parseSourceImport(JSON.stringify({
    bookSources: [{ bookSourceName: 'C', bookSourceUrl: 'https://c.com', searchUrl: '/s?q={{key}}', ruleSearch: { bookList: '.z' } }]
  }))
  assert.equal(wrapped.sources.length, 1)

  const single = parseSourceImport(JSON.stringify({ bookSourceName: 'D', bookSourceUrl: 'https://d.com' }))
  assert.equal(single.sources.length, 1)
  assert.ok(single.sources[0].warnings.length > 0)

  const bad = parseSourceImport('{bad json')
  assert.equal(bad.sources.length, 0)
  assert.ok(bad.errors.length > 0)
})

test('重复导入自动生成不同 id', () => {
  const text = JSON.stringify([
    { bookSourceName: '同名', bookSourceUrl: 'https://same.com', searchUrl: '/s?q={{key}}', ruleSearch: { bookList: '.x' } },
    { bookSourceName: '同名', bookSourceUrl: 'https://same.com', searchUrl: '/s?q={{key}}', ruleSearch: { bookList: '.x' } }
  ])
  const { sources } = parseSourceImport(text)
  assert.equal(sources.length, 2)
  assert.notEqual(sources[0].id, sources[1].id)
})

test('导出为 Legado 风格字段', () => {
  const source = normalizeSource(SOURCE_TEMPLATE)
  const exported = exportSource(source)
  assert.equal(exported.bookSourceName, '示例书源')
  assert.equal(exported.bookSourceUrl, 'https://www.example.com')
  assert.equal(exported.ruleSearch.bookList, '.book-list .item')
  assert.equal(typeof exported.ruleContent.content, 'string')
})

test('搜索请求按书源编码构造', () => {
  const source = BUILTIN_SOURCES[0]
  const request = buildSearchRequest(source, '万相之王')
  assert.equal(request.method, 'POST')
  assert.equal(request.url, 'https://www.85zw.com/s.php?ie=gbk')
  assert.equal(request.body, 'q=%E4%B8%87%E7%9B%B8%E4%B9%8B%E7%8E%8B')
})

test('响应文档自动识别 HTML 与 JSON', () => {
  const html = parseDocument('<html><body><h1>标题</h1></body></html>', { type: 'html' }, 'text/html')
  assert.equal(html.isJson, false)
  assert.ok(html.doc)

  const json = parseDocument('{"code":0,"data":[]}', { type: 'html' }, 'application/json')
  assert.equal(json.isJson, true)
  assert.equal(json.jsonRoot.code, 0)

  const jsonp = parseDocument('cb({"code":0});', {}, 'text/javascript')
  assert.equal(jsonp.isJson, true)
  assert.equal(jsonp.jsonRoot.code, 0)
})

test('多源搜索结果按书名作者聚合', () => {
  const groups = groupSearchResults([
    {
      source: { id: 's1', name: '源一' },
      results: [
        { name: '万相之王', author: '天蚕土豆', sourceId: 's1', sourceName: '源一', bookUrl: 'https://a/1', intro: '简介', coverUrl: 'https://a/1.jpg' },
        { name: '另一本', author: '甲', sourceId: 's1', sourceName: '源一', bookUrl: 'https://a/2' }
      ]
    },
    {
      source: { id: 's2', name: '源二' },
      results: [
        { name: '《万相之王》', author: '天蚕土豆', sourceId: 's2', sourceName: '源二', bookUrl: 'https://b/1' }
      ]
    }
  ])
  assert.equal(groups.length, 2)
  const target = groups.find((g) => g.name.indexOf('万相之王') !== -1)
  assert.equal(target.offers.length, 2)
  assert.equal(target.coverUrl, 'https://a/1.jpg')
})

test('Node 环境下图片代理地址保持原样', () => {
  assert.equal(proxiedUrl('https://img.example.com/a.jpg', 'https://x.com'), 'https://img.example.com/a.jpg')
})

test('聚合结果按搜索相关性排序', () => {
  const groups = groupSearchResults([
    {
      source: { id: 's1', name: '源一' },
      results: [
        { name: '寿衣店的营业员', author: '三魂同体', bookUrl: 'https://a/1', sourceId: 's1', sourceName: '源一' },
        { name: '人体诡话系列', author: '朱十三', bookUrl: 'https://a/2', sourceId: 's1', sourceName: '源一' },
        { name: '三体', author: '刘慈欣', bookUrl: 'https://a/3', sourceId: 's1', sourceName: '源一' }
      ]
    }
  ], '三体')
  assert.equal(groups[0].name, '三体')
  assert.ok(['寿衣店的营业员', '人体诡话系列'].includes(groups[1].name))
})
