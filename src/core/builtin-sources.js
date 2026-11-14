/**
 * 内置书源。
 *
 * 当前内置 5 个经联网验证的源，覆盖 GBK/UTF-8 网页、JSON API、
 * 分类索引搜索与正文分页。网站结构可能变化，书源页的“高级工具”
 * 提供体检与智能识别用于维护。
 * 请仅将本应用用于阅读你有权访问的内容。
 */

export const BUILTIN_CONFIG_VERSION = 2

export const BUILTIN_SOURCES = [
  {
    id: 'builtin-85zw',
    description: '玄幻、都市等常见小说，目录与正文完整。',
    name: '八五中文网',
    url: 'https://www.85zw.com',
    group: '小说',
    enabled: true,
    builtin: true,
    type: 'html',
    charset: 'gbk',
    searchUrl: '/s.php?ie=gbk&q={{key}}',
    searchMethod: 'GET',
    searchBody: '',
    searchCharset: 'gbk',
    ruleSearch: {
      bookList: '.bookbox',
      name: 'h4.bookname a',
      author: '.author',
      bookUrl: 'h4.bookname a@href',
      coverUrl: '.bookimg img@src',
      intro: '.bookinfo p',
      kind: '.cat',
      lastChapter: '.update a'
    },
    ruleBookInfo: {
      name: 'h1',
      author: 'meta[property="og:novel:author"]@content',
      coverUrl: 'meta[property="og:image"]@content',
      intro: 'meta[property="og:description"]@content',
      kind: 'meta[property="og:novel:category"]@content',
      status: 'meta[property="og:novel:status"]@content',
      lastChapter: 'meta[property="og:novel:latest_chapter_name"]@content'
    },
    ruleToc: {
      chapterList: '.listmain dd',
      chapterName: 'a',
      chapterUrl: 'a@href'
    },
    ruleContent: {
      title: 'h1',
      content: '#content'
    },
    replaceRules: [],
    tocReverse: false,
    singleChapter: false
  },
  {
    id: 'builtin-quanben',
    description: '完本小说较多，使用 AMP 完整目录，适合作为备用源。',
    name: '全本小说网',
    url: 'https://www.quanben.io',
    group: '小说',
    enabled: true,
    builtin: true,
    type: 'html',
    charset: 'utf-8',
    searchUrl: '/index.php?c=book&a=search&keywords={{key}}',
    searchMethod: 'GET',
    searchBody: '',
    searchCharset: 'utf-8',
    ruleSearch: {
      bookList: '.box .list2',
      name: 'h3 a',
      author: 'p span[itemprop="author"]',
      bookUrl: 'h3 a@href',
      coverUrl: 'img@src',
      intro: 'p[itemprop="description"]',
      kind: 'p span[itemprop="category"]'
    },
    ruleBookInfo: {
      name: 'h3 span[itemprop="name"]',
      author: '.list2 p span[itemprop="author"]',
      coverUrl: '.list2 img@src',
      intro: '.description',
      kind: '.list2 p span[itemprop="category"]',
      status: '.list2 p:last-child span',
      // 普通目录页只展示 47 章，AMP 目录页才有完整章节
      tocUrl: 'a[href$="list.html"]@href##^/n/([^/]+)/list\\.html$##https://www.quanben.io/amp/n/$1/list.html##'
    },
    ruleToc: {
      chapterList: '.list3 li',
      chapterName: 'a span || a',
      chapterUrl: 'a@href'
    },
    ruleContent: {
      title: 'h1',
      content: '.articlebody || #content'
    },
    replaceRules: [],
    tocReverse: false,
    singleChapter: false
  },
  {
    id: 'builtin-yoboi',
    description: '收录较多，首次搜索稍慢，适合备用。',
    name: '笔趣阁分类索引',
    url: 'https://www.yoboi.com',
    group: '小说',
    enabled: true,
    builtin: true,
    direct: false,
    searchMode: 'crawl-index',
    indexPagePattern: '/sort/{category}/{page}/',
    indexCategories: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    indexPageLimit: 8,
    indexBookUrlPattern: '/xiaoshuo/\\d+\\.html$',
    type: 'html',
    charset: 'utf-8',
    searchUrl: '',
    searchMethod: 'GET',
    searchBody: '',
    searchCharset: 'utf-8',
    ruleSearch: {
      bookList: 'a[href^="/xiaoshuo/"]',
      name: '@text',
      bookUrl: '@href'
    },
    ruleBookInfo: {
      name: 'meta[property="og:novel:book_name"]@content##在线阅读$##',
      author: 'meta[property="og:novel:author"]@content',
      coverUrl: 'meta[property="og:image"]@content',
      intro: 'meta[property="og:description"]@content',
      kind: 'meta[property="og:novel:category"]@content',
      status: 'meta[property="og:novel:status"]@content',
      lastChapter: 'meta[property="og:novel:latest_chapter_name"]@content'
    },
    ruleToc: {
      chapterList: 'div.info-chapters a',
      chapterName: '@text',
      chapterUrl: '@href'
    },
    ruleContent: {
      title: '.reader-main h1##\\s*（\\d+ / \\d+）$##',
      content: 'article#article',
      nextContentUrl: '#next_url@href'
    },
    replaceRules: [],
    tocReverse: false,
    singleChapter: false
  },
  {
    id: 'builtin-biqvge99',
    description: '搜索速度较快，目录与正文完整。',
    name: '顶点小说网',
    url: 'https://www.biqvge99.cc',
    group: '小说',
    enabled: true,
    builtin: true,
    type: 'html',
    charset: 'auto',
    searchUrl: '/s.php?q={{key}}',
    searchMethod: 'GET',
    searchBody: '',
    searchCharset: 'utf-8',
    ruleSearch: {
      bookList: 'div.bookbox',
      name: 'h4.bookname a',
      author: 'div.author',
      bookUrl: 'h4.bookname a@href',
      coverUrl: 'div.bookimg img@src',
      intro: 'div.bookinfo p',
      kind: 'div.cat',
      lastChapter: 'div.update'
    },
    ruleBookInfo: {
      name: 'h1',
      author: 'meta[property="og:novel:author"]@content',
      coverUrl: 'meta[property="og:image"]@content',
      intro: '.intro',
      kind: 'meta[property="og:novel:category"]@content',
      status: 'meta[property="og:novel:status"]@content',
      lastChapter: 'meta[property="og:novel:latest_chapter_name"]@content'
    },
    ruleToc: {
      chapterList: '.listmain dd',
      chapterName: 'a',
      chapterUrl: 'a@href'
    },
    ruleContent: {
      title: 'h1',
      content: '#content'
    },
    replaceRules: [],
    tocReverse: false,
    singleChapter: false
  },
  {
    id: 'builtin-gutenberg',
    description: '公版经典与英文原著，通过古登堡计划搜索，单本全文阅读。',
    name: '古登堡计划',
    url: 'https://gutendex.com',
    group: '公版',
    enabled: true,
    builtin: true,
    type: 'json',
    charset: 'utf-8',
    searchUrl: '/books/?search={{key}}',
    searchMethod: 'GET',
    searchBody: '',
    searchCharset: 'utf-8',
    ruleSearch: {
      bookList: '$.results[*]',
      name: '$.title',
      author: '$.authors[0].name',
      bookUrl: '$.formats["text/plain; charset=utf-8"] || $.formats["text/plain"] || $.formats["text/html"]',
      coverUrl: '$.formats["image/jpeg"]',
      intro: '$.subjects[0]',
      kind: '$.bookshelves[0] || $.languages[0]'
    },
    ruleBookInfo: {},
    ruleToc: {},
    ruleContent: {
      content: '@text'
    },
    replaceRules: [],
    tocReverse: false,
    singleChapter: true
  }
]

export function cloneBuiltinSources() {
  return JSON.parse(JSON.stringify(BUILTIN_SOURCES))
}
