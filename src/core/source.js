/**
 * 书源规范化与导入导出。
 *
 * 内部格式尽量贴近 Legado：searchUrl / ruleSearch / ruleBookInfo / ruleToc / ruleContent，
 * 这样大部分 Legado 文本书源可以直接导入；同时增加 charset、searchMethod、searchBody 等字段。
 */

import { normalizeCharset } from './charset.js'

export const SOURCE_GROUPS = ['小说', '文学', '古籍', '出版', '自定义']

const RULE_SEARCH_KEYS = ['bookList', 'name', 'author', 'bookUrl', 'coverUrl', 'intro', 'kind', 'lastChapter', 'wordCount']
const RULE_BOOK_KEYS = ['name', 'author', 'coverUrl', 'intro', 'kind', 'status', 'lastChapter', 'tocUrl', 'wordCount']
const RULE_TOC_KEYS = ['chapterList', 'chapterName', 'chapterUrl', 'reverse', 'isVolume']
const RULE_CONTENT_KEYS = ['content', 'title', 'nextContentUrl', 'replaceRules', 'replaceRegex']

export function hashCode(text) {
  let hash = 2166136261
  const value = String(text || '')
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizeRuleValue(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(normalizeRuleValue).filter(Boolean).join('||')
  let text = String(value).trim()
  // 兼容 Legado 的旧写法 class.foo / id.foo / tag.a
  text = text
    .replace(/^class\.([\w-]+)/, '.$1')
    .replace(/^id\.([\w-]+)/, '#$1')
    .replace(/^tag\.([\w-]+)/, '$1')
  return text
}

function normalizeRules(input, keys) {
  const source = input && typeof input === 'object' ? input : {}
  const result = {}
  for (const key of keys) {
    const value = normalizeRuleValue(source[key])
    if (value) result[key] = value
  }
  return result
}

function collectUnsupportedWarnings(source) {
  const warnings = []
  const scan = (rules, label) => {
    if (!rules || typeof rules !== 'object') return
    for (const [key, value] of Object.entries(rules)) {
      if (typeof value !== 'string') continue
      if (value.indexOf('@js:') !== -1) warnings.push(`${label}.${key} 使用了 JS 规则，暂不支持，可能影响该字段`)
      if (value.indexOf('@XPath:') !== -1 || value.indexOf('@xpath:') !== -1) warnings.push(`${label}.${key} 使用了 XPath 规则，暂不支持`)
    }
  }
  scan(source.ruleSearch, '搜索规则')
  scan(source.ruleBookInfo, '详情规则')
  scan(source.ruleToc, '目录规则')
  scan(source.ruleContent, '正文规则')
  return warnings
}

function normalizeUrlBase(url) {
  let text = String(url || '').trim()
  if (!text) return ''
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text.replace(/^\/+/, '')
  return text.replace(/\/+$/, '')
}

function extractType(raw, ruleSearch) {
  const explicit = String(raw.type || raw.sourceType || '').toLowerCase()
  if (explicit === 'json') return 'json'
  if (explicit === 'html') return 'html'
  const list = ruleSearch.bookList || ''
  if (list.trim().startsWith('$')) return 'json'
  return 'html'
}

/**
 * 将单个书源（Legado 或本应用格式）规范化。
 * @returns {object} 带 warnings / errors 的书源对象
 */
export function normalizeSource(raw, options = {}) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const warnings = []
  const errors = []

  const sourceType = Number(input.bookSourceType)
  if (sourceType === 1 || sourceType === 2 || sourceType === 3) {
    warnings.push('当前仅支持文本小说书源，音频/图片/文件书源已跳过部分规则')
  }

  const ruleSearch = normalizeRules(input.ruleSearch || (input.search && input.search.rules) || {}, RULE_SEARCH_KEYS)
  const ruleBookInfo = normalizeRules(input.ruleBookInfo || {}, RULE_BOOK_KEYS)
  const ruleToc = normalizeRules(input.ruleToc || {}, RULE_TOC_KEYS)
  const ruleContent = normalizeRules(input.ruleContent || {}, RULE_CONTENT_KEYS)

  let replaceRules = input.replaceRules || input.replaceRegex || ruleContent.replaceRules || ruleContent.replaceRegex || []
  if (typeof replaceRules === 'string') replaceRules = [replaceRules]
  if (!Array.isArray(replaceRules)) replaceRules = []
  replaceRules = replaceRules.map(normalizeRuleValue).filter(Boolean)
  delete ruleContent.replaceRules
  delete ruleContent.replaceRegex

  let searchUrl = String(input.searchUrl || (input.search && input.search.url) || '').trim()
  let searchMethod = String(input.searchMethod || (input.search && input.search.method) || '').toUpperCase()
  let searchBody = String(input.searchBody || (input.search && input.search.body) || '').trim()
  if (!searchMethod) searchMethod = searchBody ? 'POST' : 'GET'

  // Legado 允许在 searchUrl 后追加 ,{...} 配置。先拆出 URL，配置内容尽量兼容。
  if (searchUrl.indexOf(',{') !== -1) {
    const index = searchUrl.indexOf(',{')
    const trailing = searchUrl.slice(index + 1)
    searchUrl = searchUrl.slice(0, index)
    try {
      const config = JSON.parse(trailing.replace(/'/g, '"'))
      if (config.method) searchMethod = String(config.method).toUpperCase()
      if (config.body) searchBody = String(config.body)
      if (config.charset) {
        input.charset = config.charset
      }
      if (config.headers && typeof config.headers === 'object') {
        input.headers = Object.assign({}, input.headers, config.headers)
      }
    } catch (e) {
      warnings.push('searchUrl 后附加的请求配置无法解析，已忽略')
    }
  }

  const name = String(input.name || input.bookSourceName || '').trim()
  const url = normalizeUrlBase(input.url || input.bookSourceUrl || '')
  const group = String(input.group || input.bookSourceGroup || '自定义').split(/[,，]/)[0].trim() || '自定义'
  const charset = normalizeCharset(input.charset || 'auto')
  const type = extractType(input, ruleSearch)
  const singleChapter = input.singleChapter === true
  const direct = input.direct === true
  const searchMode = String(input.searchMode || '').trim()
  const tocReverse = input.tocReverse === true || ruleToc.reverse === true || ruleToc.reverse === 'true'
  delete ruleToc.reverse

  const source = {
    id: String(input.id || '').trim(),
    name: name || '未命名书源',
    url,
    group,
    enabled: input.enabled !== false && input.bookSourceEnabled !== false,
    builtin: input.builtin === true,
    type,
    charset,
    headers: input.headers && typeof input.headers === 'object' ? input.headers : {},
    searchUrl,
    searchMethod,
    searchBody,
    searchCharset: normalizeCharset(input.searchCharset || charset),
    ruleSearch,
    ruleBookInfo,
    ruleToc,
    ruleContent,
    replaceRules,
    tocReverse,
    singleChapter,
    direct,
    searchMode,
    indexPages: Array.isArray(input.indexPages) ? input.indexPages : [],
    indexPagePattern: String(input.indexPagePattern || ''),
    indexCategories: Array.isArray(input.indexCategories) ? input.indexCategories : [],
    indexPageLimit: Math.max(1, Math.min(100, Number(input.indexPageLimit) || 1)),
    indexBookUrlPattern: String(input.indexBookUrlPattern || ''),
    searchIndexUrl: String(input.searchIndexUrl || ''),
    followAnyContentPage: input.followAnyContentPage === true,
    updatedAt: Date.now()
  }

  if (!source.id) {
    source.id = 'user-' + hashCode(source.url + '|' + source.name)
  }

  if (!name) errors.push('缺少书源名称')
  if (!url) errors.push('缺少网站地址')
  if (!direct && searchMode !== 'crawl-index') {
    if (!searchUrl) warnings.push('缺少搜索地址，暂时无法搜索（可使用智能识别补充）')
    if (!ruleSearch.bookList) warnings.push('缺少搜索列表规则，暂时无法解析搜索结果')
    if (type === 'json' && !searchUrl) warnings.push('JSON 书源通常需要搜索地址')
  } else if (searchMode === 'crawl-index' && (!ruleSearch.bookList || (!input.indexPagePattern && !input.searchIndexUrl))) {
    warnings.push('分类索引搜索缺少 pagePattern 或搜索规则')
  } else if (direct && (!ruleBookInfo || !ruleToc || !ruleContent)) {
    warnings.push('直链书源缺少详情/目录/正文规则，可能无法解析')
  }

  warnings.push(...collectUnsupportedWarnings(source))
  source.warnings = Array.from(new Set(warnings))
  source.errors = errors
  source.valid = errors.length === 0
  return source
}

/**
 * 解析导入文本，支持单个对象、数组、{ bookSources: [...] }、{ sources: [...] }。
 */
export function parseSourceImport(text) {
  const content = String(text || '').trim()
  if (!content) return { sources: [], errors: ['导入内容为空'] }
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    return { sources: [], errors: ['JSON 格式错误：' + e.message] }
  }
  let list = []
  if (Array.isArray(data)) list = data
  else if (data && Array.isArray(data.bookSources)) list = data.bookSources
  else if (data && Array.isArray(data.sources)) list = data.sources
  else if (data && typeof data === 'object') list = [data]
  else return { sources: [], errors: ['未找到书源数据'] }

  const ids = new Set()
  const sources = []
  const errors = []
  for (let i = 0; i < list.length; i++) {
    if (!list[i] || typeof list[i] !== 'object') {
      errors.push(`第 ${i + 1} 条不是有效的书源对象`)
      continue
    }
    const source = normalizeSource(list[i])
    if (!source.valid) {
      errors.push(`${source.name || '第 ' + (i + 1) + ' 条'}: ${source.errors.join('；')}`)
    }
    let id = source.id
    let suffix = 2
    while (ids.has(id)) {
      id = source.id + '-' + suffix
      suffix++
    }
    source.id = id
    ids.add(id)
    sources.push(source)
  }
  return { sources, errors }
}

export function validateSource(source) {
  const errors = []
  if (!source || !source.name) errors.push('缺少书源名称')
  if (!source || !source.url) errors.push('缺少网站地址')
  if (source && source.direct) return errors
  if (source && source.searchMode === 'crawl-index') {
    if (!source.ruleSearch || !source.ruleSearch.bookList) errors.push('缺少分类索引搜索规则')
    if (!source.indexPagePattern && !source.searchIndexUrl) errors.push('缺少分类页模板')
    return errors
  }
  if (!source || !source.searchUrl) errors.push('缺少搜索地址')
  if (!source || !source.ruleSearch || !source.ruleSearch.bookList) errors.push('缺少搜索列表规则')
  return errors
}

/**
 * 导出为可分享的 Legado 风格 JSON。
 */
export function exportSource(source) {
  return {
    bookSourceName: source.name,
    bookSourceUrl: source.url,
    bookSourceGroup: source.group,
    bookSourceType: 0,
    enabled: source.enabled !== false,
    charset: source.charset,
    searchUrl: source.searchUrl,
    searchMethod: source.searchMethod,
    searchBody: source.searchBody,
    searchCharset: source.searchCharset,
    ruleSearch: source.ruleSearch,
    ruleBookInfo: source.ruleBookInfo,
    ruleToc: source.ruleToc,
    ruleContent: source.ruleContent,
    replaceRules: source.replaceRules,
    tocReverse: source.tocReverse,
    singleChapter: source.singleChapter,
    direct: source.direct === true,
    searchMode: source.searchMode || '',
    indexPages: source.indexPages,
    indexPagePattern: source.indexPagePattern,
    indexCategories: source.indexCategories,
    indexPageLimit: source.indexPageLimit,
    indexBookUrlPattern: source.indexBookUrlPattern,
    searchIndexUrl: source.searchIndexUrl,
    followAnyContentPage: source.followAnyContentPage === true,
    type: source.type
  }
}

export function exportSources(sources) {
  return JSON.stringify((sources || []).map(exportSource), null, 2)
}

export const SOURCE_TEMPLATE = {
  bookSourceName: '示例书源',
  bookSourceUrl: 'https://www.example.com',
  bookSourceGroup: '小说',
  charset: 'utf-8',
  searchUrl: '/search?q={{key}}',
  searchMethod: 'GET',
  ruleSearch: {
    bookList: '.book-list .item',
    name: '.title',
    author: '.author',
    bookUrl: '.title@href',
    coverUrl: 'img@src',
    intro: '.intro',
    kind: '.kind',
    lastChapter: '.latest'
  },
  ruleBookInfo: {
    name: 'h1',
    author: '.author',
    coverUrl: '.cover img@src',
    intro: '.intro',
    kind: '.kind',
    lastChapter: '.latest',
    tocUrl: 'a[href$="list"]@href'
  },
  ruleToc: {
    chapterList: '#list dd',
    chapterName: 'a',
    chapterUrl: 'a@href'
  },
  ruleContent: {
    title: 'h1',
    content: '#content'
  },
  replaceRules: []
}
