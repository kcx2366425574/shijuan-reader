/**
 * 轻量 CSS 选择器引擎。
 *
 * 支持书源中最常见的写法：
 *   标签 / * / .class / #id / [attr] / [attr=value] / [attr^=value] / [attr$=value]
 *   [attr*=value] / [attr~=value] / [attr|=value]
 *   后代、子元素 (>)、相邻兄弟 (+)、普通兄弟 (~)
 *   :first-child / :last-child / :nth-child() / :first-of-type / :last-of-type
 *   :nth-of-type() / :not() / :contains() / :empty
 */

import {
  ancestors,
  elementChildren,
  getAttr,
  hasClass,
  nextElementSibling,
  previousElementSibling,
  textContent,
  walkElements
} from './html.js'

function unescapeCss(value) {
  return String(value || '').replace(/\\(.)/g, '$1')
}

function splitGroups(selector) {
  const groups = []
  let current = ''
  let bracket = 0
  let paren = 0
  let quote = ''
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (quote) {
      current += ch
      if (ch === '\\') {
        current += selector[i + 1] || ''
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
    if (ch === ',' && bracket === 0 && paren === 0) {
      if (current.trim()) groups.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) groups.push(current.trim())
  return groups
}

function readBalanced(text, start, openChar, closeChar) {
  let depth = 1
  let quote = ''
  let result = ''
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      result += ch
      if (ch === '\\') {
        result += text[i + 1] || ''
        i++
      } else if (ch === quote) {
        quote = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      result += ch
      continue
    }
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return { value: result, end: i }
    }
    result += ch
  }
  return { value: result, end: text.length - 1 }
}

function parseAttrSelector(content) {
  const text = content.trim()
  const match = text.match(/^([^\s~|^$*=\]]+)\s*(?:(~=|\|=|\^=|\$=|\*=|=)\s*([\s\S]*))?$/)
  if (!match) return null
  let value = (match[3] || '').trim()
  if ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'")) {
    value = value.slice(1, -1)
  }
  return {
    name: match[1].toLowerCase(),
    op: match[2] || '',
    value: unescapeCss(value)
  }
}

function readCompound(source) {
  let i = 0
  let compound = ''
  let bracket = 0
  let paren = 0
  let quote = ''
  while (i < source.length) {
    const ch = source[i]
    if (quote) {
      compound += ch
      if (ch === '\\') {
        compound += source[i + 1] || ''
        i++
      } else if (ch === quote) {
        quote = ''
      }
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      compound += ch
      i++
      continue
    }
    if (ch === '[') bracket++
    else if (ch === ']') bracket = Math.max(0, bracket - 1)
    else if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    if (bracket === 0 && paren === 0) {
      if (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~' || ch === ',') break
    }
    compound += ch
    i++
  }
  return { compound, end: i }
}

function parseCompound(text) {
  const result = {
    tag: '',
    id: '',
    classes: [],
    attrs: [],
    pseudos: []
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '*') {
      result.tag = '*'
      i++
      continue
    }
    if (ch === '.') {
      let j = i + 1
      let value = ''
      while (j < text.length && !/[\s.#\[\]:>+~,]/.test(text[j])) {
        if (text[j] === '\\') {
          value += text[j + 1] || ''
          j += 2
        } else {
          value += text[j]
          j++
        }
      }
      result.classes.push(value)
      i = j
      continue
    }
    if (ch === '#') {
      let j = i + 1
      let value = ''
      while (j < text.length && !/[\s.#\[\]:>+~,]/.test(text[j])) {
        if (text[j] === '\\') {
          value += text[j + 1] || ''
          j += 2
        } else {
          value += text[j]
          j++
        }
      }
      result.id = value
      i = j
      continue
    }
    if (ch === '[') {
      const parsed = readBalanced(text, i + 1, '[', ']')
      const attr = parseAttrSelector(parsed.value)
      if (attr) result.attrs.push(attr)
      i = parsed.end + 1
      continue
    }
    if (ch === ':') {
      let j = i + 1
      let name = ''
      while (j < text.length && /[a-zA-Z-]/.test(text[j])) {
        name += text[j]
        j++
      }
      let args = ''
      if (text[j] === '(') {
        const parsed = readBalanced(text, j + 1, '(', ')')
        args = parsed.value
        j = parsed.end + 1
      }
      result.pseudos.push({ name: name.toLowerCase(), args: args.trim() })
      i = j
      continue
    }
    // 标签名
    let j = i
    let tag = ''
    while (j < text.length && !/[\s.#\[\]:>+~,]/.test(text[j])) {
      if (text[j] === '\\') {
        tag += text[j + 1] || ''
        j += 2
      } else {
        tag += text[j]
        j++
      }
    }
    if (tag) result.tag = tag.toLowerCase()
    i = j > i ? j : i + 1
  }
  return result
}

function parseComplex(selector) {
  const parts = []
  let i = 0
  let pendingCombinator = ''
  while (i < selector.length) {
    while (i < selector.length && /\s/.test(selector[i])) i++
    if (i >= selector.length) break
    if (selector[i] === '>' || selector[i] === '+' || selector[i] === '~') {
      pendingCombinator = selector[i]
      i++
      continue
    }
    const { compound, end } = readCompound(selector.slice(i))
    if (!compound) {
      i++
      continue
    }
    parts.push({
      combinator: parts.length === 0 ? '' : (pendingCombinator || ' '),
      compound: parseCompound(compound)
    })
    pendingCombinator = ''
    i += end
    let sawSpace = false
    while (i < selector.length && /\s/.test(selector[i])) {
      sawSpace = true
      i++
    }
    if (i < selector.length && (selector[i] === '>' || selector[i] === '+' || selector[i] === '~')) {
      pendingCombinator = selector[i]
      i++
      continue
    }
    if (sawSpace && i < selector.length) pendingCombinator = ' '
  }
  return parts
}

function parseSelector(selector) {
  return splitGroups(selector).map(parseComplex).filter((parts) => parts.length > 0)
}

function nthMatches(index, args) {
  const text = String(args || '').replace(/\s+/g, '').toLowerCase()
  if (text === 'odd') return index % 2 === 1
  if (text === 'even') return index % 2 === 0
  if (/^[+-]?\d+$/.test(text)) return index === parseInt(text, 10)
  const match = text.match(/^([+-]?\d*)n([+-]\d+)?$/)
  if (!match) return false
  let a
  if (match[1] === '' || match[1] === '+') a = 1
  else if (match[1] === '-') a = -1
  else a = parseInt(match[1], 10)
  const b = match[2] ? parseInt(match[2], 10) : 0
  if (a === 0) return index === b
  const diff = index - b
  return diff % a === 0 && diff / a >= 0
}

function elementIndexOfType(node) {
  if (!node.parent) return 0
  const siblings = elementChildren(node.parent).filter((child) => child.name === node.name)
  return siblings.indexOf(node) + 1
}

function matchPseudo(node, pseudo) {
  const name = pseudo.name
  const args = pseudo.args
  if (name === 'first-child') return !previousElementSibling(node)
  if (name === 'last-child') return !nextElementSibling(node)
  if (name === 'only-child') return !previousElementSibling(node) && !nextElementSibling(node)
  if (name === 'nth-child') {
    if (!node.parent) return false
    const siblings = elementChildren(node.parent)
    return nthMatches(siblings.indexOf(node) + 1, args)
  }
  if (name === 'nth-last-child') {
    if (!node.parent) return false
    const siblings = elementChildren(node.parent)
    return nthMatches(siblings.length - siblings.indexOf(node), args)
  }
  if (name === 'first-of-type') return elementIndexOfType(node) === 1
  if (name === 'last-of-type') {
    if (!node.parent) return false
    const siblings = elementChildren(node.parent).filter((child) => child.name === node.name)
    return siblings.indexOf(node) === siblings.length - 1
  }
  if (name === 'nth-of-type') return nthMatches(elementIndexOfType(node), args)
  if (name === 'nth-last-of-type') {
    if (!node.parent) return false
    const siblings = elementChildren(node.parent).filter((child) => child.name === node.name)
    return nthMatches(siblings.length - siblings.indexOf(node), args)
  }
  if (name === 'not') {
    return !matchSelectorGroups(node, parseSelector(args))
  }
  if (name === 'contains') {
    let needle = args
    if ((needle[0] === '"' && needle[needle.length - 1] === '"') ||
        (needle[0] === "'" && needle[needle.length - 1] === "'")) {
      needle = needle.slice(1, -1)
    }
    return textContent(node).indexOf(unescapeCss(needle)) !== -1
  }
  if (name === 'empty') {
    if (node.children.some((child) => child.type === 'tag')) return false
    return !node.children.some((child) => child.type === 'text' && child.text.trim())
  }
  // 未知伪类不匹配，避免误选整页
  return false
}

function matchAttr(node, attr) {
  const exists = Object.prototype.hasOwnProperty.call(node.attrs, attr.name)
  if (!attr.op) return exists
  const actual = getAttr(node, attr.name)
  const value = attr.value
  if (attr.op === '=') return actual === value
  if (attr.op === '~=') return actual.split(/\s+/).indexOf(value) !== -1
  if (attr.op === '|=') return actual === value || actual.startsWith(value + '-')
  if (attr.op === '^=') return actual.startsWith(value)
  if (attr.op === '$=') return actual.endsWith(value)
  if (attr.op === '*=') return actual.indexOf(value) !== -1
  return false
}

function matchCompound(node, compound) {
  if (!node || node.type !== 'tag') return false
  if (compound.tag && compound.tag !== '*' && node.name !== compound.tag) return false
  if (compound.id && getAttr(node, 'id') !== compound.id) return false
  for (const cls of compound.classes) {
    if (!hasClass(node, cls)) return false
  }
  for (const attr of compound.attrs) {
    if (!matchAttr(node, attr)) return false
  }
  for (const pseudo of compound.pseudos) {
    if (!matchPseudo(node, pseudo)) return false
  }
  return true
}

function matchComplex(node, parts, index) {
  if (!matchCompound(node, parts[index].compound)) return false
  if (index === 0) return true
  const combinator = parts[index].combinator
  if (combinator === '>') {
    return node.parent && node.parent.type === 'tag' && matchComplex(node.parent, parts, index - 1)
  }
  if (combinator === '+') {
    const prev = previousElementSibling(node)
    return !!prev && matchComplex(prev, parts, index - 1)
  }
  if (combinator === '~') {
    let prev = previousElementSibling(node)
    while (prev) {
      if (matchComplex(prev, parts, index - 1)) return true
      prev = previousElementSibling(prev)
    }
    return false
  }
  // 后代
  const parents = ancestors(node)
  for (const parent of parents) {
    if (matchComplex(parent, parts, index - 1)) return true
  }
  return false
}

function matchSelectorGroups(node, groups) {
  for (const parts of groups) {
    if (matchComplex(node, parts, parts.length - 1)) return true
  }
  return false
}

/**
 * 选取所有匹配元素（文档顺序）。
 */
export function selectAll(root, selector) {
  if (!root || !selector) return []
  const groups = parseSelector(selector)
  if (!groups.length) return []
  const result = []
  walkElements(root, (node) => {
    if (matchSelectorGroups(node, groups)) result.push(node)
  })
  return result
}

export function selectOne(root, selector) {
  if (!root || !selector) return null
  const groups = parseSelector(selector)
  if (!groups.length) return null
  function visit(parent) {
    for (const child of parent.children || []) {
      if (child.type !== 'tag') continue
      if (matchSelectorGroups(child, groups)) return child
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(root)
}

/**
 * 判断单个节点是否匹配选择器。
 */
export function matchesSelector(node, selector) {
  if (!node || !selector) return false
  return matchSelectorGroups(node, parseSelector(selector))
}

export { parseSelector }
