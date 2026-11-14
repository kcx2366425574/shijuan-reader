/**
 * 书源智能识别。
 *
 * 用户只提供网站地址和一个示例书名，模块会：
 * 1. 找搜索表单或常见搜索入口，逐个实测；
 * 2. 识别搜索结果条目与书籍详情字段；
 * 3. 识别目录容器/章节名称/章节链接；
 * 4. 识别正文容器；
 * 5. 生成一份可保存的书源规则。
 *
 * 这是启发式识别，不保证所有网站都成功；失败时会保留阶段信息。
 */

import { parseHTML, getAttr, getClassList, textContent, walkElements, elementChildren } from './html.js'
import { selectAll, selectOne } from './selector.js'
import { buildTemplate, resolveUrl, extractChapters, extractChapterContent, autoDetectContentElement, cleanInline } from './rule.js'
import { normalizeSource } from './source.js'
import { fetchText as defaultFetchText } from './service.js'

const BOOK_HREF = /\/book\/\d+|\/novel\/\d+|\/n\/[\w-]+\/?|\/read\/\d+|\/info\/\d+|\/txt\/\d+/i
const CHAPTER_TEXT = /第[0-9零一二三四五六七八九十百千万两]+[章节回卷集篇]|^序章|^楔子|^番外|^尾声|^后记/
const CHAPTER_HREF = /chapter|\/read\/|\/\d+\.html?$|\/n\/[^/]+\/\d+/i
const GENERIC_NAME = /^(详情|阅读|在线阅读|全文阅读|最新章节|查看|开始阅读|加入书架|免费阅读|点击阅读)$/

export class AutoDetectError extends Error {
  constructor(stage, message) {
    super(message)
    this.name = 'AutoDetectError'
    this.stage = stage
  }
}

function escapeCss(value) {
  return String(value || '').replace(/([^\w-])/g, '\\$1')
}

function attrEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1] : ''
}

export function normalizeSiteUrl(input) {
  let text = String(input || '').trim()
  if (!text) throw new AutoDetectError('home', '请输入网站地址')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text.replace(/^\/+/, '')
  const match = text.match(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i)
  if (!match) throw new AutoDetectError('home', '网站地址格式不正确')
  return {
    origin: match[1],
    pageUrl: text
  }
}

/**
 * 生成能选中目标元素的 CSS 选择器。
 * root 为上下文容器；target === root 时返回空（表示直接取容器）。
 */
export function generateSelector(target, root) {
  if (!target || target.type !== 'tag') return ''
  if (target === root) return ''

  const tag = target.name
  const id = getAttr(target, 'id')
  if (id) {
    const sel = '#' + escapeCss(id)
    if (selectOne(root, sel) === target) return sel
  }
  for (const cls of getClassList(target)) {
    const sel = tag + '.' + escapeCss(cls)
    if (selectOne(root, sel) === target) return sel
  }
  const itemprop = getAttr(target, 'itemprop')
  if (itemprop) {
    const sel = tag + '[itemprop="' + attrEscape(itemprop) + '"]'
    if (selectOne(root, sel) === target) return sel
  }

  const parent = target.parent
  if (parent && parent.type === 'tag') {
    let parentSelector = ''
    if (parent !== root) {
      parentSelector = generateSelector(parent, root)
    } else {
      const parentClasses = getClassList(parent)
      if (parentClasses.length) parentSelector = parent.name + '.' + escapeCss(parentClasses[0])
      else if (getAttr(parent, 'id')) parentSelector = '#' + escapeCss(getAttr(parent, 'id'))
    }
    const siblings = elementChildren(parent).filter((child) => child.name === tag)
    const index = siblings.indexOf(target) + 1
    let sel = parentSelector ? parentSelector + ' ' + tag : tag
    if (siblings.length > 1) sel += ':nth-of-type(' + index + ')'
    if (selectOne(root, sel) === target) return sel
    if (siblings.length === 1) {
      sel = parentSelector ? parentSelector + ' ' + tag : tag
      if (selectOne(root, sel) === target) return sel
    }
    return sel
  }
  return tag
}

function isSearchBookAnchor(anchor) {
  if (!anchor || anchor.name !== 'a') return false
  const href = getAttr(anchor, 'href') || ''
  if (!BOOK_HREF.test(href)) return false
  const text = cleanInline(textContent(anchor))
  if (!text || text.length >= 80) return false
  if (/\/book\/\d+\/\d+\.html|\/chapter\/|\/read\/\d+|\/n\/[^/]+\/\d+\.html/i.test(href)) return false
  if (CHAPTER_TEXT.test(text)) return false
  return true
}

function countBookAnchors(node) {
  let count = 0
  walkElements(node, (child) => {
    if (isSearchBookAnchor(child)) count++
    return true
  })
  return count
}

function signatureOf(node) {
  if (!node || node.type !== 'tag') return ''
  const classes = getClassList(node).slice().sort()
  const id = getAttr(node, 'id')
  return node.name + (id ? '#' + id : '') + (classes.length ? '.' + classes.join('.') : '')
}

function labelTransform(label) {
  const escaped = label.replace(/\s+/g, '\\s*')
  return `^.*?(?:${escaped})\\s*[:：]\\s*`
}

function findLabeledElement(root, labels, maxLength = 260) {
  let best = null
  let bestLength = Infinity
  const regex = new RegExp('(?:' + labels + ')', 'i')
  walkElements(root, (node) => {
    if (['script', 'style', 'body', 'html'].includes(node.name)) return true
    const text = cleanInline(textContent(node))
    if (!text || text.length > maxLength) return true
    if (!regex.test(text)) return true
    if (text.length < bestLength) {
      best = node
      bestLength = text.length
    }
    return true
  })
  return best
}

function pickLabeledNode(root, labels) {
  let node = findLabeledElement(root, labels)
  if (!node) return null
  const valueRegex = new RegExp('(?:' + labels + ')\s*[:：]\s*(.+)')
  for (let i = 0; i < 2; i++) {
    const text = cleanInline(textContent(node))
    const match = text.match(valueRegex)
    if (match && match[1].trim()) return node
    if (node.parent && node.parent.type === 'tag' && cleanInline(textContent(node.parent)).length <= 300) {
      node = node.parent
    } else {
      break
    }
  }
  return node
}

function findLongestTextElement(root, minLength = 20, tags = ['p', 'div', 'span', 'section', 'td']) {
  let best = null
  let bestLength = 0
  walkElements(root, (node) => {
    if (!tags.includes(node.name)) return true
    const text = cleanInline(textContent(node))
    if (text.length >= minLength && text.length > bestLength) {
      best = node
      bestLength = text.length
    }
    return true
  })
  return best
}

function findImage(root) {
  for (const selector of ['img[itemprop="image"]', '.cover img', '.bookimg img', '#fmimg img', '.book-cover img', 'img']) {
    const image = selectOne(root, selector)
    if (image) return image
  }
  return null
}

function metaRule(doc, names) {
  for (const name of names) {
    const node = selectOne(doc, `meta[property="${attrEscape(name)}"], meta[name="${attrEscape(name)}"]`)
    if (node && getAttr(node, 'content')) {
      return {
        rule: `meta[property="${name}"]@content || meta[name="${name}"]@content`,
        value: getAttr(node, 'content')
      }
    }
  }
  return null
}

function anchorSelectorForList(doc, sampleHref, count) {
  const match = String(sampleHref || '').match(/^((?:\/[^/?#]+){1,2}\/)/)
  if (!match) return ''
  const selector = `a[href*="${match[1]}"]`
  if (selectAll(doc, selector).length >= Math.max(1, count)) return selector
  return ''
}

function chooseResultItem(anchor) {
  let best = anchor
  let bestScore = -1
  let node = anchor.parent
  let depth = 0
  while (node && node.type === 'tag' && depth < 4) {
    if (countBookAnchors(node) === 1) {
      const identity = ((getAttr(node, 'id') || '') + ' ' + (getAttr(node, 'class') || '')).toLowerCase()
      let score = identity ? 2 : 0
      if (/book(box|item|info)?|item|result|list\d?|searchresult/.test(identity)) score += 5
      if (/bookname|title|author|cat|update|cover|bookimg|img|pic/.test(identity)) score -= 4
      if (findImage(node)) score += 5
      if (pickLabeledNode(node, '作\s*者')) score += 4
      const text = cleanInline(textContent(node))
      if (text.length >= 30 && text.length <= 800) score += 3
      if (findLongestTextElement(node, 30, ['p'])) score += 2
      if (score > bestScore) {
        bestScore = score
        best = node
      }
    }
    node = node.parent
    depth++
  }
  return best
}

/**
 * 识别搜索结果条目。
 */
export function detectSearchResults(doc, pageUrl) {
  const anchors = selectAll(doc, 'a[href]').filter(isSearchBookAnchor)

  const candidates = []
  for (const anchor of anchors) {
    const item = chooseResultItem(anchor)
    candidates.push({ anchor, item, signature: signatureOf(item) })
  }

  const groups = new Map()
  for (const candidate of candidates) {
    const key = candidate.signature
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(candidate)
  }

  let best = null
  let bestScore = 0
  for (const group of groups.values()) {
    const first = group[0]
    const item = first.item
    const hasImage = !!findImage(item)
    const hasAuthor = !!findLabeledElement(item, '作\\s*者')
    const textLength = cleanInline(textContent(item)).length
    const score = group.length * 20 + (hasImage ? 8 : 0) + (hasAuthor ? 6 : 0) + Math.min(8, Math.floor(textLength / 120))
    if (score > bestScore) {
      bestScore = score
      best = { group, item }
    }
  }

  if (!best || !best.group.length) {
    return { found: false, results: [], rules: {}, bookList: '' }
  }

  const group = best.group
  const item = best.item
  const itemIsAnchor = item === group[0].anchor
  let bookList = ''
  if (!itemIsAnchor) {
    const candidate = generateSelector(item, doc)
    if (candidate && selectAll(doc, candidate).length >= 1) bookList = candidate
  }
  if (!bookList && itemIsAnchor) {
    bookList = anchorSelectorForList(doc, getAttr(item, 'href'), group.length)
  }
  if (!bookList) {
    const classes = getClassList(item)
    if (classes.length) {
      const candidate = item.name + '.' + escapeCss(classes[0])
      if (selectAll(doc, candidate).length) bookList = candidate
    }
  }
  if (!bookList) {
    return { found: false, results: [], rules: {}, bookList: '' }
  }

  const sample = group[0]
  const anchor = sample.anchor
  let nameEl = anchor
  if (GENERIC_NAME.test(cleanInline(textContent(anchor)))) {
    nameEl = selectOne(item, 'h1, h2, h3, h4, h5, .title, .name, .bookname') || anchor
  }
  const nameSelector = generateSelector(nameEl, item) || '@text'
  const anchorSel = generateSelector(anchor, item)
  const urlSelector = anchorSel ? anchorSel + '@href' : '@href'
  const rules = {
    bookList,
    name: nameSelector.indexOf('@') === -1 ? nameSelector + '@text' : nameSelector,
    bookUrl: urlSelector
  }

  const image = findImage(item)
  if (image) {
    const selector = generateSelector(image, item)
    if (selector) rules.coverUrl = selector + '@src'
  }

  const author = findLabeledElement(item, '作\\s*者')
  if (author && author !== nameEl) {
    const selector = generateSelector(author, item)
    if (selector) rules.author = selector + '@text##' + labelTransform('作\\s*者') + '##'
  }
  const kind = findLabeledElement(item, '分\\s*类|类\\s*别|类\\s*型')
  if (kind) {
    const selector = generateSelector(kind, item)
    if (selector) rules.kind = selector + '@text##' + labelTransform('分\\s*类|类\\s*别|类\\s*型') + '##'
  }
  const latest = pickLabeledNode(item, '最新章节')
  if (latest && !GENERIC_NAME.test(cleanInline(textContent(latest)))) {
    const selector = generateSelector(latest, item)
    if (selector) rules.lastChapter = selector + '@text##' + labelTransform('最新章节') + '##'
  }
  const introEl = selectOne(item, '.intro, .description, .summary, p[itemprop="description"]') || findLongestTextElement(item, 30, ['p'])
  if (introEl && introEl !== author && introEl !== kind) {
    const selector = generateSelector(introEl, item)
    if (selector) rules.intro = selector + '@text'
  }

  const results = []
  for (const entry of group) {
    const name = cleanInline(textContent(nameEl === anchor ? entry.anchor : selectOne(entry.item, nameSelector.replace(/@text$/, '')) || entry.anchor))
    const href = getAttr(entry.anchor, 'href')
    if (!name || !href) continue
    results.push({
      name,
      author: author ? cleanInline(textContent(selectOne(entry.item, generateSelector(author, item)) || author)).replace(/^.*?作\s*者\s*[:：]\s*/, '') : '',
      bookUrl: resolveUrl(pageUrl, href),
      coverUrl: image ? resolveUrl(pageUrl, getAttr(selectOne(entry.item, generateSelector(image, item)) || image, 'src')) : ''
    })
  }

  return {
    found: results.length > 0,
    results,
    rules,
    bookList,
    itemSelector: bookList,
    sample: results[0] || null,
    itemCount: group.length
  }
}

function collectHiddenInputs(form) {
  const pairs = []
  for (const input of selectAll(form, 'input[type="hidden"]')) {
    const name = getAttr(input, 'name')
    if (!name) continue
    pairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(getAttr(input, 'value') || ''))
  }
  return pairs
}

function looksSearchForm(form) {
  const text = (getAttr(form, 'action') || '') + ' ' + (getAttr(form, 'id') || '') + ' ' + (getAttr(form, 'class') || '') + ' ' + (getAttr(form, 'name') || '')
  if (/search|sou|find/i.test(text)) return true
  for (const input of selectAll(form, 'input')) {
    const name = (getAttr(input, 'name') || '').toLowerCase()
    const placeholder = getAttr(input, 'placeholder') || ''
    if (/^(q|s|key|keyword|searchkey|wd|query)$/.test(name) || /搜索|书名|作者/.test(placeholder)) return true
  }
  return false
}

/**
 * 从首页表单一类页面提取搜索候选。
 */
export function detectSearchCandidates(doc, pageUrl) {
  const candidates = []
  const forms = selectAll(doc, 'form')
  for (const form of forms) {
    const method = String(getAttr(form, 'method') || 'GET').toUpperCase()
    const action = resolveUrl(pageUrl, getAttr(form, 'action') || pageUrl)
    let field = ''
    for (const input of selectAll(form, 'input')) {
      const type = String(getAttr(input, 'type') || 'text').toLowerCase()
      if (!['text', 'search', ''].includes(type)) continue
      const name = getAttr(input, 'name') || getAttr(input, 'id')
      if (!name) continue
      field = name
      break
    }
    if (!field) continue
    const hidden = collectHiddenInputs(form)
    if (method === 'POST') {
      candidates.push({
        searchUrl: action,
        method: 'POST',
        bodyTemplate: hidden.concat(`${encodeURIComponent(field)}={{key}}`).join('&'),
        charset: 'utf-8',
        priority: looksSearchForm(form) ? 0 : 2
      })
    } else {
      const params = hidden.concat(`${encodeURIComponent(field)}={{key}}`)
      const separator = action.indexOf('?') === -1 ? '?' : '&'
      candidates.push({
        searchUrl: action + separator + params.join('&'),
        method: 'GET',
        bodyTemplate: '',
        charset: 'utf-8',
        priority: looksSearchForm(form) ? 0 : 2
      })
    }
  }

  const origin = normalizeSiteUrl(pageUrl).origin
  const common = [
    { path: '/s.php?ie=gbk&q={{key}}', charset: 'gbk' },
    { path: '/s.php?q={{key}}', charset: 'utf-8' },
    { path: '/search.php?q={{key}}', charset: 'utf-8' },
    { path: '/search.html?q={{key}}', charset: 'utf-8' },
    { path: '/s?q={{key}}', charset: 'utf-8' },
    { path: '/search?q={{key}}', charset: 'utf-8' },
    { path: '/search?keyword={{key}}', charset: 'utf-8' },
    { path: '/index.php?c=book&a=search&keywords={{key}}', charset: 'utf-8' },
    { path: '/search.html', method: 'POST', body: 's={{key}}', charset: 'utf-8' },
    { path: '/search.php', method: 'POST', body: 's={{key}}', charset: 'utf-8' }
  ]
  for (const item of common) {
    candidates.push({
      searchUrl: origin + item.path,
      method: item.method || 'GET',
      bodyTemplate: item.body || '',
      charset: item.charset,
      priority: 1
    })
  }

  const seen = new Set()
  return candidates
    .filter((candidate) => {
      const key = candidate.searchUrl + '|' + candidate.method + '|' + candidate.bodyTemplate
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.priority - b.priority)
}

/**
 * 识别书籍详情。
 */
export function detectBookInfo(doc, pageUrl) {
  const rules = {}
  const info = {}

  const nameMeta = metaRule(doc, ['og:novel:book_name'])
  const h1 = selectOne(doc, 'h1')
  if (h1) {
    rules.name = 'h1'
    info.name = cleanInline(textContent(h1))
  } else if (nameMeta) {
    rules.name = nameMeta.rule
    info.name = cleanInline(nameMeta.value)
  }

  const authorMeta = metaRule(doc, ['og:novel:author'])
  if (authorMeta && authorMeta.value) {
    rules.author = authorMeta.rule
    info.author = cleanInline(authorMeta.value)
  } else {
    const author = findLabeledElement(doc, '作\\s*者')
    if (author) {
      const selector = generateSelector(author, doc)
      if (selector) rules.author = selector + '@text##' + labelTransform('作\\s*者') + '##'
    }
  }

  const coverMeta = metaRule(doc, ['og:image'])
  if (coverMeta && coverMeta.value) {
    rules.coverUrl = coverMeta.rule
    info.coverUrl = coverMeta.value
  } else {
    const image = findImage(doc)
    if (image) {
      const selector = generateSelector(image, doc)
      if (selector) rules.coverUrl = selector + '@src'
    }
  }

  const introEl = selectOne(doc, '#intro, .intro, .description, .book-intro, .summary, [itemprop="description"]')
  if (introEl) {
    const selector = generateSelector(introEl, doc)
    if (selector) rules.intro = selector + '@text'
  } else {
    const introMeta = metaRule(doc, ['og:description', 'description'])
    if (introMeta) rules.intro = introMeta.rule
  }

  const kindMeta = metaRule(doc, ['og:novel:category'])
  if (kindMeta && kindMeta.value) {
    rules.kind = kindMeta.rule
    info.kind = cleanInline(kindMeta.value)
  } else {
    const kind = findLabeledElement(doc, '分\\s*类|类\\s*别|类\\s*型')
    if (kind) {
      const selector = generateSelector(kind, doc)
      if (selector) rules.kind = selector + '@text##' + labelTransform('分\\s*类|类\\s*别|类\\s*型') + '##'
    }
  }

  const statusMeta = metaRule(doc, ['og:novel:status'])
  if (statusMeta && statusMeta.value) {
    rules.status = statusMeta.rule
    info.status = cleanInline(statusMeta.value)
  } else {
    const status = findLabeledElement(doc, '状\\s*态')
    if (status) {
      const selector = generateSelector(status, doc)
      if (selector) rules.status = selector + '@text##' + labelTransform('状\\s*态') + '##'
    }
  }

  const latestMeta = metaRule(doc, ['og:novel:latest_chapter_name'])
  if (latestMeta && latestMeta.value) {
    rules.lastChapter = latestMeta.rule
    info.lastChapter = cleanInline(latestMeta.value)
  } else {
    const latest = pickLabeledNode(doc, '最新章节')
    if (latest) {
      const selector = generateSelector(latest, doc)
      if (selector) rules.lastChapter = selector + '@text##' + labelTransform('最新章节') + '##'
    }
  }

  let tocUrl = ''
  const tocAnchor = selectAll(doc, 'a[href]').find((anchor) => {
    const text = cleanInline(textContent(anchor))
    const href = getAttr(anchor, 'href') || ''
    return /^(全部)?章节(列表|目录)$|^(目录|查看目录)$|章节列表/.test(text) ||
      (/目录|章节/.test(text) && /list|toc|chapter|mulu/i.test(href))
  })
  if (tocAnchor) {
    const selector = generateSelector(tocAnchor, doc)
    if (selector) rules.tocUrl = selector + '@href'
    tocUrl = resolveUrl(pageUrl, getAttr(tocAnchor, 'href'))
  }

  return { rules, info, tocUrl }
}

function chapterAnchors(doc) {
  return selectAll(doc, 'a[href]').filter((anchor) => {
    const href = getAttr(anchor, 'href') || ''
    const text = cleanInline(textContent(anchor))
    if (!href || /^javascript:/i.test(href)) return false
    if (text.length > 80) return false
    return CHAPTER_TEXT.test(text) || CHAPTER_HREF.test(href)
  })
}

/**
 * 识别目录。
 */
export function detectToc(doc, pageUrl) {
  const anchors = chapterAnchors(doc)
  if (anchors.length < 3) {
    return { found: false, rules: {}, chapters: [], count: anchors.length }
  }

  const groupByAncestor = new Map()
  for (const anchor of anchors) {
    let node = anchor.parent
    let depth = 1
    while (node && node.type === 'tag' && depth <= 5) {
      if (!groupByAncestor.has(node)) groupByAncestor.set(node, { anchors: [], depth })
      groupByAncestor.get(node).anchors.push(anchor)
      node = node.parent
      depth++
    }
  }

  let container = null
  let bestScore = 0
  for (const [node, group] of groupByAncestor.entries()) {
    if (group.anchors.length < 3) continue
    let named = 0
    for (const anchor of group.anchors) {
      if (CHAPTER_TEXT.test(cleanInline(textContent(anchor)))) named++
    }
    const score = group.anchors.length * 2 + named * 3 + group.depth
    if (score > bestScore) {
      bestScore = score
      container = node
    }
  }
  if (!container) return { found: false, rules: {}, chapters: [], count: anchors.length }

  const inside = chapterAnchors(container)
  const parentGroups = new Map()
  for (const anchor of inside) {
    const parent = anchor.parent && anchor.parent.type === 'tag' ? anchor.parent : anchor
    const key = signatureOf(parent) || parent.name
    if (!parentGroups.has(key)) parentGroups.set(key, { parent, anchors: [] })
    parentGroups.get(key).anchors.push(anchor)
  }
  let itemParent = null
  let itemAnchors = []
  for (const group of parentGroups.values()) {
    if (group.anchors.length > itemAnchors.length) {
      itemParent = group.parent
      itemAnchors = group.anchors
    }
  }
  if (!itemAnchors.length) return { found: false, rules: {}, chapters: [], count: anchors.length }

  const itemIsAnchor = itemParent.name === 'a' && itemAnchors.includes(itemParent)
  let chapterList = ''
  if (!itemIsAnchor) {
    const containerSelector = generateSelector(container, doc)
    const parentSelector = generateSelector(itemParent, doc)
    const candidates = []
    if (parentSelector && selectAll(doc, parentSelector).length >= 3) candidates.push(parentSelector)
    if (containerSelector) {
      candidates.push(containerSelector + ' ' + itemParent.name)
      candidates.push(containerSelector + ' > ' + itemParent.name)
    }
    if (itemParent.name) candidates.push(itemParent.name)
    for (const candidate of candidates) {
      if (candidate && selectAll(doc, candidate).length >= Math.min(3, itemAnchors.length)) {
        chapterList = candidate
        break
      }
    }
  } else {
    chapterList = anchorSelectorForList(doc, getAttr(itemAnchors[0], 'href'), itemAnchors.length)
  }
  if (!chapterList) return { found: false, rules: {}, chapters: [], count: inside.length }

  const sample = itemAnchors[0]
  const nameEl = cleanInline(textContent(sample)) ? sample : (selectOne(sample, 'span') || sample)
  const anchorSelector = generateSelector(sample, itemIsAnchor ? container : itemParent) || (itemIsAnchor ? '' : 'a')
  const nameSelector = generateSelector(nameEl, itemIsAnchor ? container : itemParent) || anchorSelector
  const rules = itemIsAnchor
    ? { chapterList, chapterName: '@text', chapterUrl: '@href' }
    : {
        chapterList,
        chapterName: nameSelector + '@text',
        chapterUrl: anchorSelector + '@href'
      }

  let chapters = []
  try {
    chapters = extractChapters(doc, { url: pageUrl, ruleToc: rules }, { baseUrl: pageUrl })
  } catch (e) {
    chapters = []
  }
  if (!chapters.length) {
    // 修正：如果选择器已经包含属性，不重复追加
    rules.chapterName = nameSelector.indexOf('@') === -1 ? nameSelector + '@text' : nameSelector
    rules.chapterUrl = anchorSelector && anchorSelector.indexOf('@') === -1 ? anchorSelector + '@href' : anchorSelector
    try {
      chapters = extractChapters(doc, { url: pageUrl, ruleToc: rules }, { baseUrl: pageUrl })
    } catch (e) {
      chapters = []
    }
  }

  return {
    found: chapters.length >= 3,
    rules,
    chapterList,
    chapters: chapters.slice(0, 5),
    count: chapters.length
  }
}

/**
 * 识别正文。
 */
export function detectContent(doc, pageUrl, chapterName) {
  const element = autoDetectContentElement(doc)
  if (!element) return { found: false, rules: {}, length: 0 }
  const selector = generateSelector(element, doc)
  const rules = {}
  if (selector) rules.content = selector
  const h1 = selectOne(doc, 'h1')
  if (h1) rules.title = 'h1'
  try {
    const result = extractChapterContent(doc, { url: pageUrl, ruleContent: rules }, {
      baseUrl: pageUrl,
      chapterName: chapterName || ''
    })
    return {
      found: result.content.length >= 30,
      rules,
      title: result.title,
      length: result.content.length,
      preview: result.content.slice(0, 120)
    }
  } catch (e) {
    return { found: false, rules, length: 0, error: e.message }
  }
}

async function trySearchCandidate(candidate, keyword, baseUrl, fetcher, onProgress) {
  const vars = { key: keyword, baseUrl }
  const url = resolveUrl(baseUrl, buildTemplate(candidate.searchUrl, vars, candidate.charset))
  const body = candidate.bodyTemplate
    ? buildTemplate(candidate.bodyTemplate, vars, candidate.charset)
    : ''
  const page = await fetcher(url, {
    source: { url: baseUrl, charset: 'auto' },
    method: candidate.method,
    body,
    timeout: 12000,
    cache: false,
    stage: 'search'
  })
  const doc = parseHTML(page.text)
  const detected = detectSearchResults(doc, page.url || url)
  return {
    ...detected,
    candidate,
    responseCharset: page.charset,
    requestUrl: url,
    finalUrl: page.url || url
  }
}

export async function autoDetectSource(input, options = {}) {
  const startedAt = Date.now()
  const keyword = String(input.keyword || '').trim()
  if (!keyword) throw new AutoDetectError('home', '请输入一本用于识别的书名')
  const site = normalizeSiteUrl(input.url)
  const name = String(input.name || '').trim() || hostOf(site.origin)
  const fetcher = options.fetchText || defaultFetchText
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const report = { stages: {}, attempts: [] }

  onProgress('home', '正在打开网站首页…')
  const home = await fetcher(site.pageUrl, {
    source: { url: site.origin, charset: 'auto' },
    timeout: 18000,
    cache: false,
    stage: 'home'
  })
  const homeDoc = parseHTML(home.text)
  report.stages.home = {
    charset: home.charset,
    title: cleanInline(textContent(selectOne(homeDoc, 'title') || homeDoc)).slice(0, 80)
  }

  const candidates = detectSearchCandidates(homeDoc, home.url || site.pageUrl)
  let bestSearch = null
  const limit = Math.min(candidates.length, options.maxCandidates || 12)
  for (let i = 0; i < limit; i++) {
    const candidate = candidates[i]
    onProgress('search', `正在测试搜索入口 ${i + 1}/${limit}…`)
    try {
      const result = await trySearchCandidate(candidate, keyword, site.origin, fetcher, onProgress)
      report.attempts.push({
        searchUrl: candidate.searchUrl,
        method: candidate.method,
        count: result.results.length,
        ok: result.results.length > 0
      })
      if (result.results.length && result.rules.bookList) {
        bestSearch = result
        break
      }
    } catch (e) {
      report.attempts.push({
        searchUrl: candidate.searchUrl,
        method: candidate.method,
        count: 0,
        ok: false,
        error: e.message
      })
    }
  }
  if (!bestSearch) {
    throw new AutoDetectError('search', '未能识别搜索入口。可以尝试提供一个更常见的书名，或手动导入书源。')
  }
  report.stages.search = {
    count: bestSearch.results.length,
    sample: bestSearch.sample,
    charset: bestSearch.responseCharset,
    searchUrl: bestSearch.candidate.searchUrl,
    method: bestSearch.candidate.method
  }

  const first = bestSearch.results[0]
  onProgress('book', `正在识别《${first.name}》详情页…`)
  const bookPage = await fetcher(first.bookUrl, {
    source: { url: site.origin, charset: 'auto' },
    timeout: 18000,
    cache: false,
    stage: 'book'
  })
  const bookDoc = parseHTML(bookPage.text)
  const bookInfo = detectBookInfo(bookDoc, bookPage.url || first.bookUrl)
  report.stages.book = {
    name: bookInfo.info.name,
    author: bookInfo.info.author,
    kind: bookInfo.info.kind,
    tocUrl: bookInfo.tocUrl
  }

  let tocDoc = bookDoc
  let tocPageUrl = bookPage.url || first.bookUrl
  let tocPageText = ''
  if (bookInfo.tocUrl && bookInfo.tocUrl !== first.bookUrl) {
    onProgress('toc', '正在识别目录页…')
    try {
      const tocPage = await fetcher(bookInfo.tocUrl, {
        source: { url: site.origin, charset: 'auto' },
        timeout: 18000,
        cache: false,
        stage: 'toc'
      })
      tocDoc = parseHTML(tocPage.text)
      tocPageText = tocPage.text
      tocPageUrl = tocPage.url || bookInfo.tocUrl
    } catch (e) {
      tocDoc = bookDoc
      tocPageUrl = bookPage.url || first.bookUrl
    }
  }
  let toc = detectToc(tocDoc, tocPageUrl)
  if (!toc.found && tocDoc !== bookDoc) {
    toc = detectToc(bookDoc, bookPage.url || first.bookUrl)
    tocPageUrl = bookPage.url || first.bookUrl
  }
  // 一些站点普通目录只展示前几十章，完整目录在另一份页面（如 AMP）中
  if (toc.found && toc.count < 100 && /展开完整列表|load_more|完整目录/i.test(tocPageText)) {
    const ampUrl = tocPageUrl.replace(/\/n\//, '/amp/n/')
    if (ampUrl !== tocPageUrl) {
      try {
        const ampPage = await fetcher(ampUrl, {
          source: { url: site.origin, charset: 'auto' },
          timeout: 18000,
          cache: false,
          stage: 'toc'
        })
        const ampToc = detectToc(parseHTML(ampPage.text), ampPage.url || ampUrl)
        if (ampToc.found && ampToc.count > toc.count) {
          toc = ampToc
          tocPageUrl = ampPage.url || ampUrl
          // 让生成的书源从书籍详情页直接推导到完整目录页
          const ampLink = selectOne(bookDoc, 'link[rel="amphtml"]')
          if (ampLink && getAttr(ampLink, 'href')) {
            bookInfo.rules.tocUrl = 'link[rel="amphtml"]@href##^(.*)$##$1list.html##'
          }
        }
      } catch (e) {
        // 保留普通目录
      }
    }
  }
  if (!toc.found) {
    throw new AutoDetectError('toc', '没有识别到章节目录，网站可能使用了动态加载。')
  }
  report.stages.toc = {
    count: toc.count,
    chapters: toc.chapters,
    url: tocPageUrl
  }

  const firstChapter = toc.chapters[0]
  onProgress('content', `正在验证正文《${firstChapter.name}》…`)
  const chapterPage = await fetcher(firstChapter.url, {
    source: { url: site.origin, charset: 'auto' },
    timeout: 18000,
    cache: false,
    stage: 'content'
  })
  const chapterDoc = parseHTML(chapterPage.text)
  const content = detectContent(chapterDoc, chapterPage.url || firstChapter.url, firstChapter.name)
  if (!content.found) {
    throw new AutoDetectError('content', '识别到目录，但正文提取失败。网站可能添加了反爬或正文由脚本加载。')
  }
  report.stages.content = {
    title: content.title,
    length: content.length,
    preview: content.preview
  }

  const sourceRaw = {
    bookSourceName: name,
    bookSourceUrl: site.origin,
    bookSourceGroup: '智能识别',
    charset: 'auto',
    searchCharset: bestSearch.candidate.charset,
    searchUrl: bestSearch.candidate.searchUrl,
    searchMethod: bestSearch.candidate.method,
    searchBody: bestSearch.candidate.bodyTemplate,
    ruleSearch: bestSearch.rules,
    ruleBookInfo: bookInfo.rules,
    ruleToc: toc.rules,
    ruleContent: content.rules,
    type: 'html'
  }
  const source = normalizeSource(sourceRaw)
  source.builtin = false
  source.enabled = true
  source.detected = true
  source.detectedAt = Date.now()
  source.warnings = Array.from(new Set((source.warnings || []).concat([
    '该规则由智能识别生成，网站改版后可能失效；可在书源页用“体检”检查。'
  ])))

  report.elapsed = Date.now() - startedAt
  onProgress('done', '书源生成完成')
  return {
    ok: true,
    source,
    report,
    sample: first
  }
}

export { defaultFetchText }
