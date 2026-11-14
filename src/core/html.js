/**
 * 轻量 HTML 解析器（零依赖，可在 uni-app App 端运行）。
 *
 * 目标不是实现完整浏览器解析，而是为书源规则提供一个稳定、容错的 DOM：
 * - 支持常见畸形 HTML（未闭合的 p/li/dd、乱序闭合标签）
 * - 支持注释、DOCTYPE、自闭合标签、script/style 原始文本
 * - 属性名统一小写，属性值解码实体
 * - textContent 会为 br 和块级元素补换行，便于正文提取
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr'
])

const RAW_TEXT_TAGS = new Set(['script', 'style'])
const RCDATA_TAGS = new Set(['textarea', 'title'])

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'div', 'dl', 'dd', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'html', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
])

// 开始某个标签时，需要自动闭合的“同组”标签
const AUTO_CLOSE_MAP = {
  p: ['p'],
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  tr: ['tr'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  option: ['option'],
  thead: ['tbody', 'tfoot'],
  tbody: ['tbody', 'tfoot'],
  tfoot: ['tbody']
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍',
  copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', bull: '•',
  times: '×', divide: '÷', plusmn: '±', deg: '°',
  laquo: '«', raquo: '»', frac12: '½', frac14: '¼',
  frac34: '¾', yen: '¥', euro: '€', pound: '£',
  cent: '¢', sect: '§', para: '¶', dagger: '†',
  Dagger: '‡', permil: '‰', prime: '′', Prime: '″',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', crarr: '↵', le: '≤', ge: '≥', ne: '≠',
  infin: '∞', sum: '∑', prod: '∏', radic: '√',
  asymp: '≈', equiv: '≡', hearts: '♥', spades: '♠',
  clubs: '♣', diams: '♦', star: '☆', starf: '★',
  check: '✓', cross: '✗', square: '□', blank: '␣'
}

export function decodeEntities(input) {
  if (!input || input.indexOf('&') === -1) return input || ''
  return String(input).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m
      try {
        return String.fromCodePoint(code)
      } catch (e) {
        return m
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : m
  })
}

function escapeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function createElement(name) {
  return {
    type: 'tag',
    name,
    attrs: Object.create(null),
    children: [],
    parent: null
  }
}

function appendChild(parent, node) {
  node.parent = parent
  parent.children.push(node)
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
}

function isTagStart(html, i) {
  const ch = html[i + 1]
  if (!ch) return false
  return /[a-zA-Z]/.test(ch) || ch === '/'
}

/**
 * 解析 HTML，返回根节点。
 * @param {string} html
 * @returns {{type:'root', children:Array}}
 */
export function parseHTML(html) {
  const source = String(html == null ? '' : html)
  const root = { type: 'root', name: '#document', attrs: Object.create(null), children: [], parent: null }
  const stack = [root]
  let i = 0
  let textStart = 0
  const len = source.length

  function current() {
    return stack[stack.length - 1]
  }

  function pushText(text, raw) {
    if (!text) return
    const value = raw ? text : decodeEntities(text)
    if (!value) return
    appendChild(current(), { type: 'text', text: value, parent: null })
  }

  function flushText(end) {
    if (end > textStart) pushText(source.slice(textStart, end), false)
  }

  function autoClose(name) {
    const group = AUTO_CLOSE_MAP[name]
    if (group) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (group.indexOf(stack[k].name) !== -1) {
          stack.length = k
          return
        }
      }
    }
    // 开始块级元素时，闭合尚未结束的 <p>
    if (BLOCK_TAGS.has(name) && name !== 'p') {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === 'p') {
          stack.length = k
          break
        }
        if (BLOCK_TAGS.has(stack[k].name)) break
      }
    }
  }

  while (i < len) {
    const lt = source.indexOf('<', i)
    if (lt === -1) break
    if (lt > i) {
      // 普通文本会在遇到标签时统一 flush
    }
    i = lt

    // 注释
    if (source.startsWith('<!--', i)) {
      flushText(i)
      const end = source.indexOf('-->', i + 4)
      i = end === -1 ? len : end + 3
      textStart = i
      continue
    }

    // DOCTYPE / 处理指令 / CDATA
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      flushText(i)
      const end = source.indexOf('>', i + 2)
      i = end === -1 ? len : end + 1
      textStart = i
      continue
    }

    // 结束标签
    if (source[i + 1] === '/') {
      flushText(i)
      const end = source.indexOf('>', i + 2)
      if (end === -1) {
        i = len
        break
      }
      const name = source.slice(i + 2, end).trim().split(/\s+/)[0].toLowerCase()
      if (name) {
        for (let k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) {
            stack.length = k
            break
          }
        }
      }
      i = end + 1
      textStart = i
      continue
    }

    // 非标签的 '<'
    if (!isTagStart(source, i)) {
      i += 1
      continue
    }

    // 开始标签：解析标签名与属性
    flushText(i)
    let p = i + 1
    let name = ''
    while (p < len) {
      const ch = source[p]
      if (isWhitespace(ch) || ch === '>' || ch === '/') break
      name += ch
      p++
    }
    name = name.toLowerCase()
    if (!name) {
      i += 1
      continue
    }

    const attrs = Object.create(null)
    let selfClosing = false
    let closed = false

    while (p < len) {
      while (p < len && isWhitespace(source[p])) p++
      if (p >= len) break
      if (source[p] === '>') {
        p++
        closed = true
        break
      }
      if (source[p] === '/' && source[p + 1] === '>') {
        selfClosing = true
        p += 2
        closed = true
        break
      }
      if (source[p] === '/') {
        p++
        continue
      }

      let attrName = ''
      while (p < len) {
        const ch = source[p]
        if (isWhitespace(ch) || ch === '=' || ch === '>' || ch === '/') break
        attrName += ch
        p++
      }
      if (!attrName) {
        p++
        continue
      }
      attrName = attrName.toLowerCase()

      while (p < len && isWhitespace(source[p])) p++
      let attrValue = ''
      if (source[p] === '=') {
        p++
        while (p < len && isWhitespace(source[p])) p++
        const quote = source[p]
        if (quote === '"' || quote === "'") {
          p++
          const start = p
          while (p < len && source[p] !== quote) p++
          attrValue = source.slice(start, p)
          if (p < len) p++
        } else {
          const start = p
          while (p < len && !isWhitespace(source[p]) && source[p] !== '>') p++
          attrValue = source.slice(start, p)
        }
      }
      attrs[attrName] = decodeEntities(attrValue)
    }

    if (!closed) {
      // 标签没有闭合，剩余内容不再解析
      i = len
      break
    }

    const node = createElement(name)
    node.attrs = attrs
    autoClose(name)
    appendChild(current(), node)

    const isVoid = VOID_TAGS.has(name) || selfClosing
    if (isVoid) {
      i = p
      textStart = i
      continue
    }

    if (RAW_TEXT_TAGS.has(name) || RCDATA_TAGS.has(name)) {
      const closeRe = new RegExp('</' + name + '\\s*>', 'ig')
      closeRe.lastIndex = p
      const match = closeRe.exec(source)
      const end = match ? match.index : len
      const raw = source.slice(p, end)
      if (raw) {
        appendChild(node, {
          type: 'text',
          text: RCDATA_TAGS.has(name) ? decodeEntities(raw) : raw,
          parent: null
        })
      }
      i = match ? match.index + match[0].length : len
      textStart = i
      continue
    }

    stack.push(node)
    i = p
    textStart = i
  }

  flushText(len)
  // 清理 parent 引用，避免循环引用影响序列化/调试
  return root
}

export function getAttr(node, name) {
  if (!node || node.type !== 'tag') return ''
  const key = String(name).toLowerCase()
  if (Object.prototype.hasOwnProperty.call(node.attrs, key)) return node.attrs[key]
  return ''
}

export function getClassList(node) {
  const cls = getAttr(node, 'class')
  return cls ? cls.split(/\s+/).filter(Boolean) : []
}

export function hasClass(node, className) {
  return getClassList(node).indexOf(className) !== -1
}

export function elementChildren(node) {
  if (!node || !node.children) return []
  return node.children.filter((child) => child.type === 'tag')
}

export function previousElementSibling(node) {
  if (!node || !node.parent) return null
  const siblings = node.parent.children
  const index = siblings.indexOf(node)
  for (let k = index - 1; k >= 0; k--) {
    if (siblings[k].type === 'tag') return siblings[k]
  }
  return null
}

export function nextElementSibling(node) {
  if (!node || !node.parent) return null
  const siblings = node.parent.children
  const index = siblings.indexOf(node)
  for (let k = index + 1; k < siblings.length; k++) {
    if (siblings[k].type === 'tag') return siblings[k]
  }
  return null
}

/**
 * 深度遍历所有元素。
 */
export function walkElements(node, visitor) {
  if (!node || !node.children) return
  for (const child of node.children) {
    if (child.type !== 'tag') continue
    const stop = visitor(child)
    if (stop === false) continue
    walkElements(child, visitor)
  }
}

/**
 * 提取节点文本。br 与块级元素会转换为换行。
 */
export function textContent(node) {
  if (!node) return ''
  const parts = []
  collectText(node, parts)
  return normalizeText(parts.join(''))
}

function collectText(node, out) {
  if (!node) return
  if (node.type === 'text') {
    out.push(node.text)
    return
  }
  if (node.type !== 'tag' && node.type !== 'root') return
  if (node.type === 'tag' && RAW_TEXT_TAGS.has(node.name)) return
  if (node.type === 'tag' && node.name === 'br') {
    out.push('\n')
    return
  }
  const block = node.type === 'tag' && BLOCK_TAGS.has(node.name)
  if (block) out.push('\n')
  for (const child of node.children || []) collectText(child, out)
  if (block) out.push('\n')
}

export function normalizeText(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 获取节点内部 HTML。
 */
export function innerHTML(node) {
  if (!node || !node.children) return ''
  return node.children.map(serializeNode).join('')
}

export function outerHTML(node) {
  return serializeNode(node)
}

function serializeNode(node) {
  if (!node) return ''
  if (node.type === 'text') {
    const parent = node.parent
    if (parent && parent.type === 'tag' && RAW_TEXT_TAGS.has(parent.name)) return node.text
    return escapeText(node.text)
  }
  if (node.type !== 'tag') return ''
  let out = '<' + node.name
  for (const key of Object.keys(node.attrs || {})) {
    const value = node.attrs[key]
    out += value === '' ? ' ' + key : ' ' + key + '="' + escapeAttr(value) + '"'
  }
  if (VOID_TAGS.has(node.name)) return out + '>'
  out += '>'
  for (const child of node.children || []) out += serializeNode(child)
  out += '</' + node.name + '>'
  return out
}

/**
 * 找出节点所在的祖先链（不含自身），由近到远。
 */
export function ancestors(node) {
  const result = []
  let current = node ? node.parent : null
  while (current && current.type === 'tag') {
    result.push(current)
    current = current.parent
  }
  return result
}
