/**
 * 书源规则引擎（兼容 Legado 书源的常用子集）。
 *
 * 规则形式：
 *   h1@text                 取第一个 h1 的文本
 *   .book img@src           取图片地址
 *   #content@html           取内部 HTML
 *   a@href || b@href        备选规则
 *   h1@text##\\s+##         正则清洗（##正则##替换）
 *   $.data.books[*]         JSON 路径（JSON 书源）
 */

import {
  ancestors,
  getAttr,
  innerHTML,
  normalizeText,
  parseHTML,
  textContent,
  walkElements
} from './html.js'
import { selectAll, selectOne } from './selector.js'
import { percentEncode, normalizeCharset } from './charset.js'

export class UnsupportedRuleError extends Error {
  constructor(rule, field) {
    super(`不支持的书源规则${field ? '（' + field + '）' : ''}: ${rule}`)
    this.name = 'UnsupportedRuleError'
    this.rule = rule
    this.field = field
  }
}

export class EmptyContentError extends Error {
  constructor(message) {
    super(message || '本章正文较短或为空，可继续下一章')
    this.name = 'EmptyContentError'
  }
}

const AD_LINE_PATTERNS = [
  /^一秒记住/,
  /^请记住本站/,
  /^请收藏本站/,
  /^最新网址/,
  /^本站网址/,
  /^手机版阅读网址/,
  /^手机阅读/,
  /^加入书签$/,
  /^上一章$/,
  /^下一章$/,
  /^返回目录$/,
  /^目录$/,
  /^本章未完/,
  /^点击下一页/,
  /^正在手打中/,
  /^笔趣阁手机版/,
  /^https?:\/\/\S+$/i,
  /^www\.[^\s]+$/i
]

const AD_CONTAINS_PATTERNS = [
  '一秒记住',
  '请收藏本站',
  '最新章节！',
  '无弹窗',
  '更新快',
  '笔趣阁手机版',
  '手机版阅读网址',
  '本章未完，请点击下一页'
]

function splitTopLevel(text, separator) {
  const result = []
  let current = ''
  let bracket = 0
  let paren = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      current += ch
      if (ch === '\\') {
        current += text[i + 1] || ''
        i++
      } else if (ch === quote) {
        quote = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '[') bracket++
    else if (ch === ']') bracket = Math.max(0, bracket - 1)
    else if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    if (bracket === 0 && paren === 0 && text.startsWith(separator, i)) {
      result.push(current)
      current = ''
      i += separator.length - 1
      continue
    }
    current += ch
  }
  result.push(current)
  return result
}

function parseRegexTransform(pattern, replacement) {
  let body = pattern
  let flags = 'g'
  if (body.length > 2 && body[0] === '/') {
    const lastSlash = body.lastIndexOf('/')
    if (lastSlash > 0) {
      flags = body.slice(lastSlash + 1).replace(/[^gimsuy]/g, '') || 'g'
      body = body.slice(1, lastSlash)
    }
  }
  if (flags.indexOf('g') === -1) flags += 'g'
  return { body, replacement: replacement == null ? '' : replacement, flags }
}

/**
 * 拆分规则中的正则清洗段。
 */
export function parseRule(rule) {
  let text = String(rule == null ? '' : rule).trim()
  if (!text) return { base: '', transforms: [], json: false, unsupported: '' }

  let json = false
  if (text.startsWith('@css:')) text = text.slice(5).trim()
  if (text.startsWith('@json:')) {
    json = true
    text = text.slice(6).trim()
  }
  if (text.startsWith('@XPath:') || text.startsWith('@xpath:') || text.startsWith('//')) {
    return { base: '', transforms: [], json: false, unsupported: 'xpath' }
  }
  if (text.startsWith('@js:')) {
    return { base: '', transforms: [], json: false, unsupported: 'js' }
  }

  const parts = text.split('##')
  const base = parts[0].trim()
  const transforms = []
  for (let i = 1; i < parts.length; i += 2) {
    const pattern = parts[i]
    const replacement = i + 1 < parts.length ? parts[i + 1] : ''
    if (!pattern) continue
    const parsed = parseRegexTransform(pattern, replacement)
    if (parsed.body) transforms.push(parsed)
  }
  return { base, transforms, json, unsupported: '' }
}

function splitSelectorAttr(base) {
  const text = String(base || '')
  if (!text) return { selector: '', attr: 'text' }
  if (text[0] === '@') return { selector: '', attr: text.slice(1) || 'text' }

  let bracket = 0
  let paren = 0
  let quote = ''
  let lastAt = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[') bracket++
    else if (ch === ']') bracket = Math.max(0, bracket - 1)
    else if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    else if (ch === '@' && bracket === 0 && paren === 0) lastAt = i
  }
  if (lastAt === -1) return { selector: text.trim(), attr: 'text' }
  return {
    selector: text.slice(0, lastAt).trim(),
    attr: (text.slice(lastAt + 1).trim() || 'text').toLowerCase()
  }
}

function applyTransforms(value, transforms) {
  let result = value == null ? '' : String(value)
  for (const transform of transforms) {
    try {
      result = result.replace(new RegExp(transform.body, transform.flags), transform.replacement)
    } catch (e) {
      // 忽略无效正则，保证单个坏规则不影响整页
    }
  }
  return result
}

function cleanInline(value) {
  return String(value == null ? '' : value)
    .replace(/ /g, ' ')
    .replace(/[​\-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlText(html) {
  if (!html || html.indexOf('<') === -1) return html || ''
  return textContent(parseHTML(html))
}

function directText(node) {
  if (!node || !node.children) return ''
  return normalizeText(node.children.filter((child) => child.type === 'text').map((child) => child.text).join(''))
}

function imageFromNode(node) {
  if (!node) return ''
  const lazy = ['data-src', 'data-original', 'data-lazy-src', 'data-url', 'src']
  for (const attr of lazy) {
    const value = getAttr(node, attr)
    if (value && !/^data:image\/(gif|svg)/i.test(value)) return value
  }
  return ''
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

/**
 * 解析 JSONPath 子集。
 */
export function getJsonPath(root, path) {
  let text = String(path == null ? '' : path).trim()
  if (text.startsWith('@json:')) text = text.slice(6).trim()
  if (!text) return root
  if (text[0] === '$') text = text.slice(1)
  else if (text[0] !== '.' && text[0] !== '[') text = '.' + text

  const tokens = []
  let i = 0
  while (i < text.length) {
    if (text.startsWith('..', i)) {
      i += 2
      let key = ''
      while (i < text.length && text[i] !== '.' && text[i] !== '[') {
        key += text[i]
        i++
      }
      tokens.push({ type: 'recursive', key: key || '*' })
      continue
    }
    if (text[i] === '.') {
      i++
      let key = ''
      while (i < text.length && text[i] !== '.' && text[i] !== '[') {
        key += text[i]
        i++
      }
      if (key) tokens.push({ type: 'key', key })
      continue
    }
    if (text[i] === '[') {
      const end = text.indexOf(']', i + 1)
      if (end === -1) break
      let inner = text.slice(i + 1, end).trim()
      if (inner === '*') {
        tokens.push({ type: 'wildcard' })
      } else if (/^\d+$/.test(inner)) {
        tokens.push({ type: 'index', index: parseInt(inner, 10) })
      } else if ((inner[0] === '"' && inner[inner.length - 1] === '"') ||
                 (inner[0] === "'" && inner[inner.length - 1] === "'")) {
        tokens.push({ type: 'key', key: inner.slice(1, -1) })
      } else {
        tokens.push({ type: 'key', key: inner })
      }
      i = end + 1
      continue
    }
    // 非法字符直接跳过
    i++
  }

  let current = [root]
  for (const token of tokens) {
    const next = []
    for (const value of current) {
      if (value === undefined || value === null) continue
      if (token.type === 'key') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, token.key)) {
              next.push(item[token.key])
            }
          }
        } else if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, token.key)) {
          next.push(value[token.key])
        }
      } else if (token.type === 'index') {
        if (Array.isArray(value) && token.index < value.length) next.push(value[token.index])
      } else if (token.type === 'wildcard') {
        if (Array.isArray(value)) next.push(...value)
        else if (value && typeof value === 'object') next.push(...Object.values(value))
      } else if (token.type === 'recursive') {
        collectRecursive(value, token.key, next)
      }
    }
    current = next
  }
  if (current.length === 0) return null
  return current.length === 1 ? current[0] : current
}

function collectRecursive(value, key, out) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectRecursive(item, key, out)
    return
  }
  if (key === '*') {
    for (const item of Object.values(value)) {
      if (item !== undefined) out.push(item)
      collectRecursive(item, key, out)
    }
    return
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === key) out.push(v)
    collectRecursive(v, key, out)
  }
}

function jsonScalar(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) {
    const first = value.find((item) => item !== undefined && item !== null && String(item).trim() !== '')
    return jsonScalar(first)
  }
  if (typeof value === 'object') return ''
  return String(value)
}

function jsonFallback(item, keys) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      const value = jsonScalar(item[key])
      if (value) return value
    }
  }
  return ''
}

function normalizeUrl(baseUrl, value, allowEmpty) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return allowEmpty ? '' : ''
  return resolveUrl(baseUrl, text)
}

export function decodeRouteValue(value) {
  let text = String(value == null ? '' : value)
  // uni-app 页面参数可能保留一次或多次 URL 编码，绝对地址需还原后再解析
  for (let i = 0; i < 2 && /^https?%(?:25)?3A/i.test(text); i += 1) {
    try {
      text = decodeURIComponent(text)
    } catch (e) {
      break
    }
  }
  return text
}

export function resolveUrl(baseUrl, relative) {
  let rel = String(relative == null ? '' : relative).trim()
  if (!rel) return ''
  if (/^(data|mailto|tel|javascript):/i.test(rel)) {
    return /^javascript:/i.test(rel) ? '' : rel
  }
  const base = String(baseUrl || '').trim()
  const baseMatch = base.match(/^([a-z][a-z0-9+.-]*:)?\/\/([^/?#]+)/i)
  const protocolMatch = base.match(/^([a-z][a-z0-9+.-]*:)/i)
  const protocol = protocolMatch ? protocolMatch[1] : 'https:'

  if (rel.startsWith('//')) return protocol + rel
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rel)) return rel
  if (!baseMatch) {
    // 没有可用的 base，尽量原样返回
    return rel
  }
  const origin = protocol + '//' + baseMatch[2]
  if (rel.startsWith('/')) return origin + rel
  if (rel.startsWith('?')) return base.replace(/[?#].*$/, '') + rel
  if (rel.startsWith('#')) return base.replace(/#.*$/, '') + rel

  let basePath = base.replace(/[?#].*$/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/]+$/i.test(basePath)) {
    basePath += '/'
  }
  basePath = basePath.replace(/[^/]*$/, '')
  let combined = basePath + rel
  const prefixMatch = combined.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i)
  if (!prefixMatch) return combined.replace(/ /g, '%20')
  const path = normalizePath(prefixMatch[2])
  return prefixMatch[1] + path.replace(/ /g, '%20')
}

function normalizePath(path) {
  const suffixIndex = path.search(/[?#]/)
  const suffix = suffixIndex === -1 ? '' : path.slice(suffixIndex)
  const body = suffixIndex === -1 ? path : path.slice(0, suffixIndex)
  const parts = body.split('/')
  const result = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '..') {
      if (result.length > 1) result.pop()
    } else if (part !== '.' && part !== '') {
      result.push(part)
    } else if (i === parts.length - 1 && part === '') {
      result.push('')
    }
  }
  return '/' + result.join('/')
}

export function buildTemplate(template, vars, charset) {
  const values = vars || {}
  return String(template == null ? '' : template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    if (key === 'key') return percentEncode(values.key || '', charset)
    if (key === 'keyRaw') return String(values.key || '')
    if (key === 'baseUrl') return String(values.baseUrl || '')
    if (key === 'page') return String(values.page || '1')
    if (key === 'bookUrl') return percentEncode(values.bookUrl || '', charset)
    if (Object.prototype.hasOwnProperty.call(values, key)) return String(values[key])
    return match
  })
}

function extractJsonValue(root, path, jsonItem) {
  const target = jsonItem !== undefined && jsonItem !== null ? jsonItem : root
  let value = getJsonPath(target, path)
  if ((value === null || value === undefined) && jsonItem !== undefined) {
    // 某些字段规则写的是整文档路径，回退到根节点再试一次
    value = getJsonPath(root, path)
  }
  return jsonScalar(value)
}

function extractSingle(doc, rule, options) {
  const parsed = parseRule(rule)
  if (parsed.unsupported) {
    throw new UnsupportedRuleError(rule, options.field)
  }
  if (!parsed.base) return ''

  const sourceType = options.sourceType || ''
  const isJsonRule = parsed.json || parsed.base[0] === '$' || sourceType === 'json'
  if (isJsonRule && options.jsonRoot !== undefined) {
    let value = extractJsonValue(options.jsonRoot, parsed.base, options.jsonItem)
    value = applyTransforms(value, parsed.transforms)
    if (options.isUrl) return normalizeUrl(options.baseUrl, value)
    if (options.preserveText) return String(value == null ? '' : value).replace(/ /g, ' ').trim()
    return cleanInline(value)
  }

  const { selector, attr } = splitSelectorAttr(parsed.base)
  const contextNode = options.item || doc
  let value = ''

  if (!selector) {
    const node = options.item || doc
    value = readNodeValue(node, attr)
  } else {
    const node = selectOne(contextNode, selector)
    if (node) value = readNodeValue(node, attr)
  }

  value = applyTransforms(value, parsed.transforms)
  if (options.isUrl) return normalizeUrl(options.baseUrl, value)
  if (options.preserveText) return String(value == null ? '' : value).replace(/ /g, ' ').trim()
  return cleanInline(value)
}

function readNodeValue(node, attr) {
  if (!node) return ''
  if (!attr || attr === 'text') return textContent(node)
  if (attr === 'html' || attr === 'innerhtml') return innerHTML(node)
  if (attr === 'outerhtml') return innerHTML(node)
  if (attr === 'textnodes' || attr === 'owntext') return directText(node)
  if (attr === 'src' || attr === 'imagesrc') {
    return imageFromNode(node) || getAttr(node, 'src')
  }
  return getAttr(node, attr)
}

/**
 * 提取单个字符串值。
 */
export function extractValue(doc, rule, options = {}) {
  const text = String(rule == null ? '' : rule).trim()
  if (!text) return ''
  const alternatives = splitTopLevel(text, '||')
  for (const alternative of alternatives) {
    const value = extractSingle(doc, alternative.trim(), options)
    if (value !== '' && value !== null && value !== undefined) return value
  }
  return ''
}

/**
 * 提取列表（书源中的 bookList / chapterList）。
 */
export function extractList(doc, rule, options = {}) {
  const text = String(rule == null ? '' : rule).trim()
  if (!text) return []
  const alternatives = splitTopLevel(text, '||')
  for (const alternative of alternatives) {
    const parsed = parseRule(alternative.trim())
    if (parsed.unsupported || !parsed.base) continue
    const isJsonRule = parsed.json || parsed.base[0] === '$' || options.sourceType === 'json'
    if (isJsonRule && options.jsonRoot !== undefined) {
      const value = getJsonPath(options.jsonRoot, parsed.base)
      if (value === null || value === undefined) continue
      const list = Array.isArray(value) ? value : [value]
      if (list.length) return list
      continue
    }
    const { selector } = splitSelectorAttr(parsed.base)
    if (!selector) continue
    const list = selectAll(options.item || doc, selector)
    if (list.length) return list
  }
  return []
}

function stripPrefix(value, patterns) {
  let text = cleanInline(value)
  for (const pattern of patterns) text = text.replace(pattern, '')
  return text.trim()
}

export function cleanBookField(value, type) {
  let text = cleanInline(value)
  if (!text) return ''
  if (type === 'name') {
    text = text.replace(/^《|》$/g, '').replace(/最新章节列表$/, '').trim()
    return text.slice(0, 100)
  }
  if (type === 'author') {
    text = stripPrefix(text, [/^作\s*者\s*[:：]\s*/, /^著\s*者\s*[:：]\s*/, /\s*著$/])
    return text.slice(0, 60)
  }
  if (type === 'kind') {
    text = stripPrefix(text, [/^(分\s*类|类\s*别|类\s*型)\s*[:：]\s*/])
    return text.slice(0, 40)
  }
  if (type === 'status') {
    text = stripPrefix(text, [/^状\s*态\s*[:：]\s*/])
    return text.slice(0, 20)
  }
  if (type === 'lastChapter') {
    text = stripPrefix(text, [/^最新章节\s*[:：]\s*/, /^最新\s*[:：]\s*/])
    return text.slice(0, 120)
  }
  if (type === 'intro') {
    text = text.replace(/^简\s*介\s*[:：]\s*/, '').trim()
    return text.slice(0, 2000)
  }
  return text
}

function fieldOptions(baseUrl, field, extra) {
  return Object.assign({
    baseUrl,
    isUrl: ['bookUrl', 'coverUrl', 'tocUrl', 'chapterUrl', 'nextContentUrl', 'nextPage'].indexOf(field) !== -1,
    field
  }, extra || {})
}

/**
 * 从搜索结果页提取书籍列表。
 */
export function extractSearchResults(doc, source, context = {}) {
  const rules = source.ruleSearch || {}
  const baseUrl = context.baseUrl || source.url || ''
  const jsonRoot = context.jsonRoot
  const sourceType = source.type === 'json' ? 'json' : 'html'
  const list = extractList(doc, rules.bookList, {
    baseUrl,
    sourceType,
    jsonRoot
  })
  const results = []
  const seen = new Set()

  for (const item of list) {
    const isJsonItem = sourceType === 'json' || (item && typeof item === 'object' && item.type !== 'tag')
    const opts = isJsonItem
      ? { baseUrl, sourceType: 'json', jsonRoot, jsonItem: item, field: '' }
      : { baseUrl, sourceType: 'html', item }

    const name = cleanBookField(
      extractValue(doc, rules.name, { ...opts, field: 'name' }) ||
      (isJsonItem ? jsonFallback(item, ['name', 'title', 'bookName']) : textContent(item)),
      'name'
    )
    let bookUrl = extractValue(doc, rules.bookUrl, fieldOptions(baseUrl, 'bookUrl', opts))
    if (!bookUrl && isJsonItem) {
      bookUrl = normalizeUrl(baseUrl, jsonFallback(item, ['bookUrl', 'url', 'link', 'href']))
    }
    if (!bookUrl && !isJsonItem) {
      const anchor = selectOne(item, 'a[href]')
      if (anchor) bookUrl = normalizeUrl(baseUrl, getAttr(anchor, 'href'))
    }
    if (!name || !bookUrl) continue
    if (seen.has(bookUrl)) continue
    seen.add(bookUrl)

    const author = cleanBookField(
      extractValue(doc, rules.author, { ...opts, field: 'author' }) ||
      (isJsonItem ? jsonFallback(item, ['author', 'authors', 'writer']) : guessLabelText(item, '作者')),
      'author'
    )
    const kind = cleanBookField(
      extractValue(doc, rules.kind, { ...opts, field: 'kind' }) ||
      (isJsonItem ? jsonFallback(item, ['kind', 'category', 'tags']) : guessLabelText(item, '分类|类型')),
      'kind'
    )
    const lastChapter = cleanBookField(
      extractValue(doc, rules.lastChapter, { ...opts, field: 'lastChapter' }) ||
      (isJsonItem ? jsonFallback(item, ['lastChapter', 'latestChapter']) : guessLabelText(item, '最新章节')),
      'lastChapter'
    )
    let coverUrl = extractValue(doc, rules.coverUrl, fieldOptions(baseUrl, 'coverUrl', opts))
    if (!coverUrl && isJsonItem) {
      coverUrl = normalizeUrl(baseUrl, jsonFallback(item, ['coverUrl', 'cover', 'img', 'image']))
    }
    if (!coverUrl && !isJsonItem) {
      const img = selectOne(item, 'img')
      if (img) coverUrl = normalizeUrl(baseUrl, imageFromNode(img))
    }
    const intro = cleanBookField(
      extractValue(doc, rules.intro, { ...opts, field: 'intro' }) ||
      (isJsonItem ? jsonFallback(item, ['intro', 'description', 'desc']) : guessIntro(item)),
      'intro'
    )

    results.push({
      name,
      author,
      coverUrl,
      intro,
      kind,
      lastChapter,
      bookUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url || ''
    })
    if (results.length >= 100) break
  }
  return results
}

function guessLabelText(item, labels) {
  if (!item || item.type !== 'tag') return ''
  const regex = new RegExp('(' + labels + ')\\s*[:：]\\s*([^\\n]{0,60})')
  const text = textContent(item)
  const match = text.match(regex)
  return match ? match[2].trim() : ''
}

function guessIntro(item) {
  if (!item || item.type !== 'tag') return ''
  let best = ''
  walkElements(item, (node) => {
    if (node.name !== 'p') return true
    const text = cleanInline(textContent(node))
    if (text.length > best.length && text.length >= 20) best = text
    return true
  })
  return best
}

/**
 * 提取书籍详情。
 */
export function extractBookInfo(doc, source, context = {}) {
  const rules = source.ruleBookInfo || {}
  const baseUrl = context.baseUrl || source.url || ''
  const fallback = context.fallback || {}
  const jsonRoot = context.jsonRoot
  const sourceType = source.type === 'json' ? 'json' : 'html'
  const extra = { sourceType, jsonRoot }

  const name = cleanBookField(extractValue(doc, rules.name, { ...fieldOptions(baseUrl, 'name', extra), jsonRoot }) || fallback.name, 'name')
  const author = cleanBookField(extractValue(doc, rules.author, { ...fieldOptions(baseUrl, 'author', extra), jsonRoot }) || fallback.author || guessPageLabel(doc, '作者'), 'author')
  const kind = cleanBookField(extractValue(doc, rules.kind, { ...fieldOptions(baseUrl, 'kind', extra), jsonRoot }) || fallback.kind || guessPageLabel(doc, '分类|类别|类型'), 'kind')
  const status = cleanBookField(extractValue(doc, rules.status, { ...fieldOptions(baseUrl, 'status', extra), jsonRoot }) || guessPageLabel(doc, '状态'), 'status')
  const lastChapter = cleanBookField(extractValue(doc, rules.lastChapter, { ...fieldOptions(baseUrl, 'lastChapter', extra), jsonRoot }) || fallback.lastChapter || guessPageLabel(doc, '最新章节'), 'lastChapter')
  let coverUrl = extractValue(doc, rules.coverUrl, { ...fieldOptions(baseUrl, 'coverUrl', extra), jsonRoot }) || fallback.coverUrl
  if (!coverUrl) {
    const meta = selectOne(doc, 'meta[property="og:image"], meta[name="og:image"]')
    if (meta) coverUrl = normalizeUrl(baseUrl, getAttr(meta, 'content'))
  }
  if (!coverUrl && sourceType !== 'json') {
    const img = selectOne(doc, '#fmimg img, .cover img, .bookimg img, .book-cover img')
    if (img) coverUrl = normalizeUrl(baseUrl, imageFromNode(img))
  }
  const intro = cleanBookField(extractValue(doc, rules.intro, { ...fieldOptions(baseUrl, 'intro', extra), jsonRoot }) || fallback.intro || guessPageIntro(doc), 'intro')
  let tocUrl = extractValue(doc, rules.tocUrl, { ...fieldOptions(baseUrl, 'tocUrl', extra), jsonRoot })
  if (!tocUrl && sourceType !== 'json') {
    tocUrl = guessTocUrl(doc, baseUrl)
  }
  if (!tocUrl) tocUrl = context.bookUrl || baseUrl

  return {
    name: name || fallback.name || '',
    author,
    coverUrl,
    intro,
    kind,
    status,
    lastChapter,
    tocUrl,
    wordCount: cleanInline(extractValue(doc, rules.wordCount, { ...fieldOptions(baseUrl, 'wordCount', extra), jsonRoot }))
  }
}

function guessPageLabel(doc, labels) {
  const regex = new RegExp('(' + labels + ')\\s*[:：]\\s*([^\\n]{0,60})')
  const match = textContent(doc).match(regex)
  return match ? match[2].trim() : ''
}

function guessPageIntro(doc) {
  const meta = selectOne(doc, 'meta[property="og:description"], meta[name="description"]')
  if (meta) return getAttr(meta, 'content')
  for (const selector of ['#intro', '.intro', '.description', '.book-intro', '.bookinfo p']) {
    const node = selectOne(doc, selector)
    if (node) {
      const text = cleanInline(textContent(node))
      if (text.length > 20) return text
    }
  }
  return ''
}

function guessTocUrl(doc, baseUrl) {
  const anchors = selectAll(doc, 'a[href]')
  for (const anchor of anchors) {
    const text = cleanInline(textContent(anchor))
    if (/^(全部)?章节(列表|目录)$|^(目录|查看目录|章节目录)$/.test(text)) {
      const href = getAttr(anchor, 'href')
      if (href && !/^javascript:/i.test(href)) return normalizeUrl(baseUrl, href)
    }
  }
  return ''
}

export function extractNextPageUrl(doc, rule, baseUrl) {
  const value = String(rule == null ? '' : rule).trim()
  if (!value) return ''
  return extractValue(doc, value, { baseUrl, field: 'nextPage', isUrl: true }) || ''
}

/**
 * 从目录页提取章节。默认按 URL 去重并保留最后一次出现的位置，
 * 以兼容“最新章节 + 正文目录”重复出现的站点。
 */
export function extractChapters(doc, source, context = {}) {
  const rules = source.ruleToc || {}
  const baseUrl = context.baseUrl || source.url || ''
  const jsonRoot = context.jsonRoot
  const sourceType = source.type === 'json' ? 'json' : 'html'
  const isJsonSource = sourceType === 'json'
  let list = extractList(doc, rules.chapterList, { baseUrl, sourceType, jsonRoot })

  if (!list.length && sourceType !== 'json') {
    list = autoDetectChapterElements(doc)
  }

  const chapters = []
  for (const item of list) {
    const isJsonItem = sourceType === 'json' || (item && typeof item === 'object' && item.type !== 'tag')
    const opts = isJsonItem
      ? { baseUrl, sourceType: 'json', jsonRoot, jsonItem: item }
      : { baseUrl, sourceType: 'html', item }
    const defaultName = isJsonSource ? '$.name' : '@text'
    const defaultUrl = isJsonSource ? '$.url' : 'a@href'
    let name = cleanInline(extractValue(doc, rules.chapterName || defaultName, { ...opts, field: 'chapterName' }))
    let url = extractValue(doc, rules.chapterUrl || defaultUrl, { ...opts, field: 'chapterUrl', isUrl: true })
    if (isJsonItem) {
      if (!name) name = cleanInline(jsonFallback(item, ['name', 'title', 'chapterName']))
      if (!url) url = normalizeUrl(baseUrl, jsonFallback(item, ['url', 'link', 'chapterUrl', 'href']))
    }
    if (!url && !isJsonItem) {
      const anchor = item.name === 'a' ? item : selectOne(item, 'a[href]')
      if (anchor) {
        url = normalizeUrl(baseUrl, getAttr(anchor, 'href'))
        if (!name) name = cleanInline(textContent(anchor))
      }
    }
    if (!name || !url) continue
    if (/^(上一章|下一章|返回目录|目录|加入书签|投推荐票|返回列表)$/.test(name)) continue
    chapters.push({ name: name.slice(0, 200), url })
    if (chapters.length >= 5000) break
  }

  // 同一 URL 保留最后一次，兼容“最新章节区 + 正文目录”的重复结构
  const seen = new Set()
  const deduped = []
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (seen.has(chapters[i].url)) continue
    seen.add(chapters[i].url)
    deduped.push(chapters[i])
  }
  deduped.reverse()

  const reverse = source.tocReverse === true || rules.reverse === true
  if (reverse) deduped.reverse()
  return deduped
}

function autoDetectChapterElements(doc) {
  const groups = new Map()
  const anchors = selectAll(doc, 'a[href]')
  for (const anchor of anchors) {
    const href = getAttr(anchor, 'href')
    if (!href || /^javascript:/i.test(href)) continue
    const text = cleanInline(textContent(anchor))
    if (!text || text.length > 80) continue
    const chapterLike = /第[0-9零一二三四五六七八九十百千万两]+[章节回卷集篇]|^序章|^楔子|^番外|^尾声|^后记/.test(text)
    const hrefLike = /chapter|read|\/\d+\.html?$/i.test(href)
    if (!chapterLike && !hrefLike) continue

    // 同时登记父级到更上层容器，兼容 <dd><a>、<li><a><span> 等结构
    let container = anchor.parent
    let depth = 1
    while (container && container.type === 'tag' && depth <= 4) {
      if (!groups.has(container)) groups.set(container, { anchors: [], depth })
      groups.get(container).anchors.push(anchor)
      container = container.parent
      depth++
    }
  }
  let best = []
  let bestScore = 0
  let bestDepth = 0
  for (const group of groups.values()) {
    const list = group.anchors
    if (list.length < 3) continue
    let chapterNames = 0
    for (const anchor of list) {
      if (/第[0-9零一二三四五六七八九十百千万两]+[章节回卷集篇]|^序章|^楔子|^番外|^尾声|^后记/.test(textContent(anchor))) chapterNames++
    }
    const score = list.length * 2 + chapterNames * 3
    // 分数相同时选择更深（更贴近章节列表）的容器
    if (score > bestScore || (score === bestScore && group.depth > bestDepth)) {
      bestScore = score
      bestDepth = group.depth
      best = list
    }
  }
  return best
}

/**
 * 自动寻找正文容器（用于没有正文规则或规则失效的书源）。
 */
export function autoDetectContentElement(doc) {
  const hints = ['content', 'chaptercontent', 'chapter-content', 'read-content', 'article-content', 'showtxt', 'txt', 'article', 'main']
  const candidates = []
  const seen = new Set()
  const selectors = [
    '#content', '#chaptercontent', '#chapterContent', '#txt', '#nr', '#article',
    '.content', '.showtxt', '.read-content', '.article-content', '.chapter-content',
    '.txt', 'article', 'section.content', 'main'
  ]
  for (const selector of selectors) {
    const node = selectOne(doc, selector)
    if (node) {
      candidates.push(node)
      seen.add(node)
    }
  }
  walkElements(doc, (node) => {
    if (!['div', 'article', 'section', 'td', 'main'].includes(node.name)) return true
    if (seen.has(node)) return false
    candidates.push(node)
    return true
  })

  let best = null
  let bestScore = 0
  const scores = new Map()
  for (const node of candidates) {
    const score = scoreContentElement(node, hints)
    scores.set(node, score)
    if (score > bestScore) {
      bestScore = score
      best = node
    }
  }
  // 避免选中包住正文的整个 main/body：若内部有分数接近的候选，优先内部容器
  if (best) {
    let refined = null
    let refinedScore = 0
    for (const node of candidates) {
      if (node === best) continue
      if (!ancestors(node).includes(best)) continue
      const score = scores.get(node) || 0
      if (score >= bestScore * 0.72 && score > refinedScore) {
        refined = node
        refinedScore = score
      }
    }
    if (refined) {
      best = refined
      bestScore = refinedScore
    }
  }
  return bestScore >= 100 ? best : null
}

function scoreContentElement(node, hints) {
  const text = normalizeText(textContent(node))
  if (text.length < 30) return 0
  const identity = ((getAttr(node, 'id') || '') + ' ' + (getAttr(node, 'class') || '')).toLowerCase()
  if (/nav|menu|header|footer|comment|list|side|ad-|advert|recommend|related|toolbar|breadcrumb/.test(identity)) return 0
  let linkTextLength = 0
  walkElements(node, (child) => {
    if (child.name !== 'a') return true
    linkTextLength += cleanInline(textContent(child)).length
    return true
  })
  let paragraphs = 0
  walkElements(node, (child) => {
    if (child.name === 'p' || child.name === 'br') paragraphs++
    return true
  })
  let score = text.length + paragraphs * 8 - linkTextLength * 3
  if (hints.some((hint) => identity.indexOf(hint) !== -1)) score += 2000
  if (node.name === 'body' || node.name === 'html') score -= 3000
  return score
}

function applyReplaceRules(text, rules) {
  let result = String(text == null ? '' : text)
  if (!rules) return result
  const list = Array.isArray(rules) ? rules : [rules]
  for (const rule of list) {
    if (!rule) continue
    if (typeof rule === 'string') {
      const parsed = parseRegexTransform(rule.split('##')[0], rule.split('##').slice(1).join('##'))
      try {
        result = result.replace(new RegExp(parsed.body, parsed.flags), parsed.replacement)
      } catch (e) {
        // 忽略
      }
    } else if (rule.pattern) {
      const parsed = parseRegexTransform(rule.pattern, rule.replacement || '')
      try {
        result = result.replace(new RegExp(parsed.body, rule.flags || parsed.flags), rule.replacement || '')
      } catch (e) {
        // 忽略
      }
    }
  }
  return result
}

function chapterTitleSuffix(text) {
  const match = String(text || '').match(/^第[0-9零一二三四五六七八九十百千万两]+[章节回卷集篇]\s*(.*)$/)
  return match ? match[1].replace(/[\s:：.、,，]/g, '') : ''
}

function sameChapterTitle(line, title) {
  if (!title) return false
  if (line === title) return true
  const lineSuffix = chapterTitleSuffix(line)
  const titleSuffix = chapterTitleSuffix(title)
  return !!lineSuffix && !!titleSuffix && lineSuffix === titleSuffix
}

function stripInlineAds(line) {
  let out = line
  out = out.replace(/一秒记住[^。！？\n]*/g, '')
  out = out.replace(/(?:请收藏本站|请记住本站|最新网址|本站网址|手机版阅读网址|笔趣阁手机版)\s*[:：]?\s*\S*/g, '')
  out = out.replace(/本章未完[，,]?\s*请点击下一页[^\n]*/g, '')
  out = out.replace(/^最新章节！\s*/, '')
  return out.trim()
}

export function cleanChapterText(input, options = {}) {
  const title = cleanInline(options.title || '')
  let text = String(input == null ? '' : input)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[​\-‍﻿]/g, '')

  const lines = text.split('\n')
  const result = []
  let previous = ''
  for (let raw of lines) {
    let line = raw.replace(/[ \t\f\v]+/g, ' ').trim()
    if (!line) continue
    if (sameChapterTitle(line, title)) continue
    if (AD_LINE_PATTERNS.some((pattern) => pattern.test(line))) continue
    line = stripInlineAds(line)
    if (!line) continue
    if (AD_CONTAINS_PATTERNS.some((needle) => line.indexOf(needle) !== -1)) continue
    if (line.length <= 2 && /^[\s\W]+$/.test(line)) continue
    if (line === previous) continue
    result.push(line)
    previous = line
  }
  return result.join('\n').trim()
}

/**
 * 提取章节正文。
 */
export function extractChapterContent(doc, source, context = {}) {
  const rules = source.ruleContent || {}
  const baseUrl = context.baseUrl || source.url || ''
  const jsonRoot = context.jsonRoot
  const sourceType = source.type === 'json' ? 'json' : 'html'
  const chapterName = cleanInline(context.chapterName || '')

  let title = cleanInline(extractValue(doc, rules.title, {
    baseUrl,
    sourceType,
    jsonRoot,
    field: 'title'
  })) || chapterName
  if (!title && sourceType !== 'json') {
    const h1 = selectOne(doc, 'h1')
    if (h1) title = cleanInline(textContent(h1))
  }

  let content = ''
  if (rules.content) {
    content = extractValue(doc, rules.content, {
      baseUrl,
      sourceType,
      jsonRoot,
      field: 'content',
      preserveText: true
    })
    if (content && /<[a-z][\s\S]*>/i.test(content)) {
      content = decodeHtmlText(content)
    }
  }
  if (!content && sourceType !== 'json') {
    const auto = autoDetectContentElement(doc)
    if (auto) content = textContent(auto)
  }
  if (!content && !rules.content && sourceType === 'json') {
    // JSON 源没有正文规则时，尝试常见字段
    for (const path of ['$.content', '$.data.content', '$.chapter.content', '$.txt']) {
      const value = extractValue(doc, path, { jsonRoot, sourceType: 'json', field: 'content' })
      if (value) {
        content = value
        break
      }
    }
  }

  content = applyReplaceRules(content, source.replaceRules)
  content = applyReplaceRules(content, rules.replaceRules)
  content = cleanChapterText(content, { title })

  // 番外/诗歌/插图章正文可能很短，8 字以上即按正常章节放行。
  if (!content || content.length < 8) {
    throw new EmptyContentError()
  }

  let nextContentUrl = ''
  if (rules.nextContentUrl) {
    nextContentUrl = extractValue(doc, rules.nextContentUrl, {
      baseUrl,
      sourceType,
      jsonRoot,
      isUrl: true,
      field: 'nextContentUrl'
    })
  }

  return { title, content, nextContentUrl }
}

export { applyReplaceRules, cleanInline, splitTopLevel }
