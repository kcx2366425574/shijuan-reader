import test from 'node:test'
import assert from 'node:assert/strict'

import { parseHTML, textContent } from '../src/core/html.js'
import {
  resolveUrl,
  getJsonPath,
  buildTemplate,
  extractValue,
  extractSearchResults,
  extractBookInfo,
  extractChapters,
  extractChapterContent,
  autoDetectContentElement,
  cleanChapterText,
  UnsupportedRuleError
} from '../src/core/rule.js'

test('URL 解析与规整', () => {
  assert.equal(resolveUrl('https://www.85zw.com/s.php?ie=gbk&q=x', '/book/1/'), 'https://www.85zw.com/book/1/')
  assert.equal(resolveUrl('https://www.85zw.com/book/1/', '//img.example.com/a.jpg'), 'https://img.example.com/a.jpg')
  assert.equal(resolveUrl('https://www.85zw.com/book/1/', '../chapter/2.html'), 'https://www.85zw.com/book/chapter/2.html')
  assert.equal(resolveUrl('https://www.85zw.com/book/1/', '?page=2'), 'https://www.85zw.com/book/1/?page=2')
  assert.equal(resolveUrl('https://www.85zw.com/', 'javascript:void(0)'), '')
})

test('JSON 路径：字段、数组、通配与递归', () => {
  const data = {
    results: [
      { title: '书一', authors: [{ name: '甲' }], formats: { 'text/html': 'https://x/1.html' } },
      { title: '书二', authors: [{ name: '乙' }] }
    ],
    meta: { total: 2, nested: { title: '深层标题' } }
  }
  assert.equal(getJsonPath(data, '$.results[0].title'), '书一')
  assert.deepEqual(getJsonPath(data, '$.results[*].title'), ['书一', '书二'])
  assert.equal(getJsonPath(data, "$.results[0].formats['text/html']"), 'https://x/1.html')
  assert.equal(getJsonPath(data, '$.results[0].authors[0].name'), '甲')
  assert.equal(getJsonPath(data, '$.meta..title'), '深层标题')
  assert.equal(getJsonPath(data, '$.meta.total'), 2)
  assert.equal(getJsonPath(data, '$.missing'), null)
})

test('搜索 URL 模板按 GBK 编码关键词', () => {
  assert.equal(
    buildTemplate('/s.php?ie=gbk&q={{key}}', { key: '万相之王' }, 'gbk'),
    '/s.php?ie=gbk&q=%CD%F2%CF%E0%D6%AE%CD%F5'
  )
  assert.equal(buildTemplate('{{baseUrl}}/search?q={{key}}', { key: 'a b', baseUrl: 'https://x.com' }, 'utf-8'), 'https://x.com/search?q=a%20b')
})

test('提取搜索列表（85zw 风格）', () => {
  const doc = parseHTML(`
    <div class="bookbox">
      <div class="bookimg"><a href="/book/19217200136/"><img src="/files/article/image/17/17200/17200s.jpg"></a></div>
      <div class="bookinfo">
        <h4 class="bookname"><a href="/book/19217200136/">万相之王</a></h4>
        <div class="cat">分类：玄幻小说</div>
        <div class="author">作者：天蚕土豆</div>
        <div class="update"><span>最新章节：</span><a href="/book/19217200136/182859694710.html">第1838章 大结局</a></div>
        <p>天地间，有万相。而我李洛，终将成为这万相之王。</p>
      </div>
    </div>
  `)
  const source = {
    id: 's1',
    name: '八五中文网',
    url: 'https://www.85zw.com',
    ruleSearch: {
      bookList: '.bookbox',
      name: 'h4.bookname a',
      author: '.author',
      kind: '.cat',
      lastChapter: '.update a',
      coverUrl: '.bookimg img@src',
      intro: '.bookinfo p',
      bookUrl: 'h4.bookname a@href'
    }
  }
  const results = extractSearchResults(doc, source, { baseUrl: 'https://www.85zw.com/s.php?ie=gbk&q=x' })
  assert.equal(results.length, 1)
  assert.deepEqual(results[0], {
    name: '万相之王',
    author: '天蚕土豆',
    coverUrl: 'https://www.85zw.com/files/article/image/17/17200/17200s.jpg',
    intro: '天地间，有万相。而我李洛，终将成为这万相之王。',
    kind: '玄幻小说',
    lastChapter: '第1838章 大结局',
    bookUrl: 'https://www.85zw.com/book/19217200136/',
    sourceId: 's1',
    sourceName: '八五中文网'
  })
})

test('提取书籍详情与目录 URL 回退', () => {
  const doc = parseHTML(`
    <meta property="og:novel:author" content="天蚕土豆">
    <meta property="og:novel:category" content="玄幻小说">
    <meta property="og:novel:status" content="完结">
    <meta property="og:novel:latest_chapter_name" content="第1838章 大结局">
    <meta property="og:image" content="https://img.example.com/cover.jpg">
    <meta property="og:description" content="天地间，有万相。">
    <h1>万相之王</h1>
    <div class="listmain">
      <dl>
        <dt>最新章节</dt>
        <dd><a href="/book/1/9.html">第9章</a></dd>
        <dd><a href="/book/1/10.html">第10章</a></dd>
        <dt>正文</dt>
        <dd><a href="/book/1/1.html">第1章</a></dd>
        <dd><a href="/book/1/2.html">第2章</a></dd>
        <dd><a href="/book/1/3.html">第3章</a></dd>
        <dd><a href="/book/1/4.html">第4章</a></dd>
        <dd><a href="/book/1/5.html">第5章</a></dd>
        <dd><a href="/book/1/6.html">第6章</a></dd>
        <dd><a href="/book/1/7.html">第7章</a></dd>
        <dd><a href="/book/1/8.html">第8章</a></dd>
        <dd><a href="/book/1/9.html">第9章</a></dd>
        <dd><a href="/book/1/10.html">第10章</a></dd>
      </dl>
    </div>
  `)
  const source = {
    url: 'https://www.85zw.com',
    ruleBookInfo: {
      name: 'h1',
      author: 'meta[property="og:novel:author"]@content',
      kind: 'meta[property="og:novel:category"]@content',
      status: 'meta[property="og:novel:status"]@content',
      lastChapter: 'meta[property="og:novel:latest_chapter_name"]@content',
      coverUrl: 'meta[property="og:image"]@content',
      intro: 'meta[property="og:description"]@content'
    }
  }
  const info = extractBookInfo(doc, source, { bookUrl: 'https://www.85zw.com/book/1/' })
  assert.equal(info.name, '万相之王')
  assert.equal(info.author, '天蚕土豆')
  assert.equal(info.kind, '玄幻小说')
  assert.equal(info.status, '完结')
  assert.equal(info.lastChapter, '第1838章 大结局')
  assert.equal(info.coverUrl, 'https://img.example.com/cover.jpg')
  assert.equal(info.intro, '天地间，有万相。')
  assert.equal(info.tocUrl, 'https://www.85zw.com/book/1/')
})

test('目录去重保留最后一次出现，修复“最新章节+正文”顺序', () => {
  const doc = parseHTML(`
    <div class="listmain"><dl>
      <dd><a href="/book/1/9.html">第9章</a></dd>
      <dd><a href="/book/1/10.html">第10章</a></dd>
      <dd><a href="/book/1/1.html">第1章</a></dd>
      <dd><a href="/book/1/2.html">第2章</a></dd>
      <dd><a href="/book/1/3.html">第3章</a></dd>
      <dd><a href="/book/1/4.html">第4章</a></dd>
      <dd><a href="/book/1/5.html">第5章</a></dd>
      <dd><a href="/book/1/6.html">第6章</a></dd>
      <dd><a href="/book/1/7.html">第7章</a></dd>
      <dd><a href="/book/1/8.html">第8章</a></dd>
      <dd><a href="/book/1/9.html">第9章</a></dd>
      <dd><a href="/book/1/10.html">第10章</a></dd>
    </dl></div>
  `)
  const source = {
    url: 'https://www.85zw.com',
    ruleToc: { chapterList: '.listmain dd', chapterName: 'a', chapterUrl: 'a@href' }
  }
  const chapters = extractChapters(doc, source, { baseUrl: 'https://www.85zw.com/book/1/' })
  assert.equal(chapters.length, 10)
  assert.deepEqual(chapters.map((c) => c.name), ['第1章', '第2章', '第3章', '第4章', '第5章', '第6章', '第7章', '第8章', '第9章', '第10章'])
  assert.equal(chapters[0].url, 'https://www.85zw.com/book/1/1.html')
})

test('提取目录（全本网风格，名称在 span 内）', () => {
  const doc = parseHTML(`
    <ul class="list3">
      <li><a href="/n/doupocangqiong/1.html"><span>第1章 陨落的天才</span></a></li>
      <li><a href="/n/doupocangqiong/2.html"><span>第2章 斗气大陆</span></a></li>
      <li><a href="/n/doupocangqiong/3.html"><span>第3章 客人</span></a></li>
    </ul>
  `)
  const source = {
    url: 'https://www.quanben.io',
    ruleToc: { chapterList: '.list3 li', chapterName: 'a span', chapterUrl: 'a@href' }
  }
  const chapters = extractChapters(doc, source, { baseUrl: 'https://www.quanben.io/n/doupocangqiong/list.html' })
  assert.equal(chapters.length, 3)
  assert.equal(chapters[1].name, '第2章 斗气大陆')
  assert.equal(chapters[1].url, 'https://www.quanben.io/n/doupocangqiong/2.html')
})

test('没有目录规则时自动识别章节', () => {
  const doc = parseHTML(`
    <div class="nav"><a href="/">首页</a><a href="/sort/1/">玄幻</a></div>
    <div class="listmain"><dl>
      <dd><a href="/book/1/1.html">第1章 开端</a></dd>
      <dd><a href="/book/1/2.html">第2章 继续</a></dd>
      <dd><a href="/book/1/3.html">第3章 结束</a></dd>
    </dl></div>
  `)
  const source = { url: 'https://x.com', ruleToc: {} }
  const chapters = extractChapters(doc, source, { baseUrl: 'https://x.com/book/1/' })
  assert.equal(chapters.length, 3)
  assert.equal(chapters[0].name, '第1章 开端')
})

test('正文提取、标题去重、广告清理与下一页', () => {
  const doc = parseHTML(`
    <h1>第1章 陨落的天才</h1>
    <div id="content">
      <p>第1章 陨落的天才</p>
      <p>“斗之力，三段！”</p>
      <p>少年面无表情，唇角有着一抹自嘲。</p>
      <p>请收藏本站：https://www.example.com</p>
      <p>少年面无表情，唇角有着一抹自嘲。</p>
    </div>
    <a class="next" href="/book/1/1_2.html">下一页</a>
  `)
  const source = {
    url: 'https://x.com',
    ruleContent: {
      title: 'h1',
      content: '#content',
      nextContentUrl: 'a.next@href'
    }
  }
  const result = extractChapterContent(doc, source, {
    baseUrl: 'https://x.com/book/1/1.html',
    chapterName: '第1章 陨落的天才'
  })
  assert.equal(result.title, '第1章 陨落的天才')
  assert.equal(result.content, '“斗之力，三段！”\n少年面无表情，唇角有着一抹自嘲。')
  assert.equal(result.nextContentUrl, 'https://x.com/book/1/1_2.html')
})

test('没有正文规则时自动识别正文容器', () => {
  const doc = parseHTML(`
    <div class="nav"><a href="/">首页</a><a href="/x">导航</a></div>
    <div class="showtxt">
      <p>这是第一段正文，长度足够用于自动识别。</p>
      <p>这是第二段正文，继续增加一些内容，让容器得分更高。</p>
      <p>这是第三段正文，故事正在继续展开，人物和场景逐渐清晰。</p>
    </div>
    <div class="footer">版权信息</div>
  `)
  const el = autoDetectContentElement(doc)
  assert.ok(el)
  assert.equal(textContent(el).indexOf('这是第一段正文') !== -1, true)
})

test('规则备选与正则清洗', () => {
  const doc = parseHTML('<div class="a"></div><div class="b">作者：天蚕土豆</div>')
  assert.equal(extractValue(doc, '.a@text || .b@text##^作者[:：]\\s*##'), '天蚕土豆')
  assert.equal(extractValue(doc, '.b@text##作者[:：]##'), '天蚕土豆')
})

test('JSON 书源搜索与章节', () => {
  const json = {
    data: [
      { name: '书一', author: '甲', url: '/book/1', cover: '/1.jpg' },
      { name: '书二', author: '乙', url: '/book/2', cover: '/2.jpg' }
    ],
    chapters: [
      { title: '第1章', link: '/read/1' },
      { title: '第2章', link: '/read/2' }
    ]
  }
  const source = {
    id: 'json1',
    name: 'JSON站',
    url: 'https://api.example.com',
    type: 'json',
    ruleSearch: {
      bookList: '$.data[*]',
      name: '$.name',
      author: '$.author',
      bookUrl: '$.url',
      coverUrl: '$.cover'
    },
    ruleToc: {
      chapterList: '$.chapters[*]',
      chapterName: '$.title',
      chapterUrl: '$.link'
    }
  }
  const results = extractSearchResults(null, source, { baseUrl: 'https://api.example.com/search', jsonRoot: json })
  assert.equal(results.length, 2)
  assert.equal(results[0].bookUrl, 'https://api.example.com/book/1')
  assert.equal(results[0].coverUrl, 'https://api.example.com/1.jpg')

  const chapters = extractChapters(null, source, { baseUrl: 'https://api.example.com', jsonRoot: json })
  assert.equal(chapters.length, 2)
  assert.equal(chapters[0].url, 'https://api.example.com/read/1')
})

test('JS 规则明确报不支持', () => {
  const doc = parseHTML('<h1>标题</h1>')
  assert.throws(() => extractValue(doc, '@js:result', {}), UnsupportedRuleError)
})

test('cleanChapterText 过滤广告与连续重复行', () => {
  const text = '第一章\n正文一\n正文一\n一秒记住【笔趣阁】\n正文二\n\n请收藏本站：https://x.com\n正文三'
  assert.equal(cleanChapterText(text, { title: '第一章' }), '正文一\n正文二\n正文三')
})
