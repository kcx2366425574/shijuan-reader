/**
 * 编码检测与解码。
 *
 * 很多中文小说站仍使用 GBK。App 端 JS 运行环境不一定有 TextDecoder，
 * 因此这里内置 UTF-8 解码器，并使用生成好的 GBK 双字节表。
 */

import {
  GBK_TABLE,
  GBK_LEAD_START,
  GBK_LEAD_END,
  GBK_TRAIL_START,
  GBK_TRAIL_END,
  GBK_STRIDE
} from './gbk-table.js'

const REPLACEMENT = '�'
const GBK_CHARS = new Map()

export function normalizeCharset(charset) {
  const value = String(charset || '').trim().toLowerCase()
  if (!value || value === 'auto') return 'auto'
  if (value === 'utf8' || value === 'utf-8' || value === 'unicode-1-1-utf-8') return 'utf-8'
  if (value === 'gb2312' || value === 'gbk' || value === 'gb18030' || value === 'x-gbk' || value === 'cp936') return 'gbk'
  if (value === 'big5' || value === 'big5-hkscs') return 'big5'
  if (value === 'utf-16' || value === 'utf-16le') return 'utf-16le'
  if (value === 'utf-16be') return 'utf-16be'
  return value
}

export function toUint8Array(input) {
  if (!input) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (Array.isArray(input)) return Uint8Array.from(input)
  return new Uint8Array(0)
}

export function decodeUTF8(input) {
  const bytes = toUint8Array(input)
  const parts = []
  let i = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3
  }
  while (i < bytes.length) {
    const b0 = bytes[i]
    if (b0 < 0x80) {
      parts.push(String.fromCharCode(b0))
      i++
      continue
    }
    let needed = 0
    let code = 0
    if ((b0 & 0xe0) === 0xc0) {
      needed = 1
      code = b0 & 0x1f
    } else if ((b0 & 0xf0) === 0xe0) {
      needed = 2
      code = b0 & 0x0f
    } else if ((b0 & 0xf8) === 0xf0) {
      needed = 3
      code = b0 & 0x07
    } else {
      parts.push(REPLACEMENT)
      i++
      continue
    }
    if (i + needed >= bytes.length) {
      parts.push(REPLACEMENT)
      break
    }
    let valid = true
    for (let k = 1; k <= needed; k++) {
      const next = bytes[i + k]
      if ((next & 0xc0) !== 0x80) {
        valid = false
        break
      }
      code = (code << 6) | (next & 0x3f)
    }
    if (!valid ||
        (needed === 1 && code < 0x80) ||
        (needed === 2 && code < 0x800) ||
        (needed === 3 && code < 0x10000) ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)) {
      parts.push(REPLACEMENT)
      i++
      continue
    }
    parts.push(String.fromCodePoint(code))
    i += needed + 1
  }
  return parts.join('')
}

export function decodeGBK(input) {
  const bytes = toUint8Array(input)
  const parts = []
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i]
    if (b0 < 0x80) {
      parts.push(String.fromCharCode(b0))
      i++
      continue
    }
    if (b0 === 0x80) {
      parts.push('€')
      i++
      continue
    }
    if (b0 < GBK_LEAD_START || b0 > GBK_LEAD_END) {
      parts.push(REPLACEMENT)
      i++
      continue
    }
    const b1 = bytes[i + 1]
    if (b1 === undefined) {
      parts.push(REPLACEMENT)
      break
    }
    if (b1 < GBK_TRAIL_START || b1 > GBK_TRAIL_END || b1 === 0x7f) {
      parts.push(REPLACEMENT)
      i++
      continue
    }
    const index = (b0 - GBK_LEAD_START) * GBK_STRIDE + (b1 - GBK_TRAIL_START)
    const ch = GBK_TABLE[index]
    parts.push(ch && ch !== REPLACEMENT ? ch : REPLACEMENT)
    i += 2
  }
  return parts.join('')
}

function buildGbkMap() {
  if (GBK_CHARS.size) return GBK_CHARS
  for (let i = 0; i < GBK_TABLE.length; i++) {
    const ch = GBK_TABLE[i]
    if (!ch || ch === REPLACEMENT) continue
    if (GBK_CHARS.has(ch)) continue
    const lead = Math.floor(i / GBK_STRIDE) + GBK_LEAD_START
    const trail = (i % GBK_STRIDE) + GBK_TRAIL_START
    if (trail === 0x7f || trail > 0xfe) continue
    GBK_CHARS.set(ch, [lead, trail])
  }
  return GBK_CHARS
}

/**
 * 将字符串编码为 GBK 字节。无法表示的字符用 '?' 代替。
 */
export function encodeGBK(input) {
  const text = String(input == null ? '' : input)
  const map = buildGbkMap()
  const bytes = []
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code < 0x80) {
      bytes.push(code)
      continue
    }
    const pair = map.get(ch)
    if (pair) {
      bytes.push(pair[0], pair[1])
    } else {
      bytes.push(0x3f)
    }
  }
  return Uint8Array.from(bytes)
}

const URL_SAFE = /[A-Za-z0-9\-_.!~*'()]/

/**
 * 按目标编码做 URL 组件百分号编码。
 */
export function percentEncode(input, charset) {
  const text = String(input == null ? '' : input)
  if (normalizeCharset(charset) !== 'gbk') {
    return encodeURIComponent(text)
  }
  const bytes = encodeGBK(text)
  let out = ''
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte)
    out += URL_SAFE.test(ch) ? ch : '%' + byte.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

function latin1(bytes, maxLength) {
  const len = Math.min(bytes.length, maxLength || bytes.length)
  let out = ''
  for (let i = 0; i < len; i++) out += String.fromCharCode(bytes[i])
  return out
}

export function detectCharset(input, contentType, override) {
  const forced = normalizeCharset(override)
  if (forced && forced !== 'auto') return forced

  const bytes = toUint8Array(input)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'

  const header = String(contentType || '')
  const headerMatch = header.match(/charset\s*=\s*["']?\s*([\w-]+)/i)
  if (headerMatch) {
    const detected = normalizeCharset(headerMatch[1])
    if (detected !== 'auto') return detected
  }

  const head = latin1(bytes, 4096)
  const xmlMatch = head.match(/<\?xml[^>]+encoding\s*=\s*["']([\w-]+)["']/i)
  if (xmlMatch) {
    const detected = normalizeCharset(xmlMatch[1])
    if (detected !== 'auto') return detected
  }
  const metaMatch = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)
  if (metaMatch) {
    const detected = normalizeCharset(metaMatch[1])
    if (detected !== 'auto') return detected
  }
  const contentMatch = head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i)
  if (contentMatch) {
    const detected = normalizeCharset(contentMatch[1])
    if (detected !== 'auto') return detected
  }
  return 'utf-8'
}

export function decodeBytes(input, charset) {
  const bytes = toUint8Array(input)
  const normalized = normalizeCharset(charset)
  if (normalized === 'gbk') return decodeGBK(bytes)
  if (normalized === 'utf-8' || normalized === 'auto') return decodeUTF8(bytes)
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder(normalized).decode(bytes)
    } catch (e) {
      // 浏览器不支持的编码退回 UTF-8
    }
  }
  return decodeUTF8(bytes)
}

/**
 * 一步完成编码检测与解码。
 */
export function decodeResponse(input, contentType, override) {
  const charset = detectCharset(input, contentType, override)
  return {
    charset,
    text: decodeBytes(input, charset)
  }
}

/**
 * 按字符集对文本做百分号编码，用于搜索词。
 */
export function encodeForCharset(text, charset) {
  return percentEncode(text, normalizeCharset(charset))
}

/**
 * 解码标准 Base64 为字节；无法识别的字符直接跳过。
 */
export function decodeBase64(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Int16Array(128).fill(-1)
  for (let i = 0; i < alphabet.length; i += 1) lookup[alphabet.charCodeAt(i)] = i
  const text = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '')
  const bytes = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    if (ch === 61) break
    const value = ch < 128 ? lookup[ch] : -1
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

export function decodeBase64UTF8(input) {
  return decodeUTF8(decodeBase64(input))
}
