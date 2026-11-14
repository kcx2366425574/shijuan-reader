/**
 * 内置书源。
 *
 * 这两个源在 2026-11 实测可用：
 * - 八五中文网：GBK 编码，搜索、目录、正文均为服务端直出
 * - 全本小说网：UTF-8，目录页与正文页结构清晰
 *
 * 网站结构可能变化，书源管理页提供“测试”与“智能识别”用于修复。
 * 请仅将本应用用于阅读你有权访问的内容。
 */

export const BUILTIN_SOURCES = [
  {
    id: 'builtin-85zw',
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
  }
]

export function cloneBuiltinSources() {
  return JSON.parse(JSON.stringify(BUILTIN_SOURCES))
}
