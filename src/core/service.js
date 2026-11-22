/**
 * 书源请求服务：负责网络请求、编码、文档解析，并把结果交给规则引擎。
 *
 * 同一套代码运行在：
 * - uni-app App（uni.request 直连）
 * - H5 开发服务器（自动走 /__proxy，绕开浏览器 CORS）
 * - Node 验证脚本（使用 fetch）
 */

import { decodeBase64UTF8, decodeResponse } from './charset.js'
import { parseHTML, textContent } from './html.js'
import {
  buildTemplate,
  extractBookInfo,
  extractChapterContent,
  extractChapters,
  extractNextPageUrl,
  extractSearchResults,
  extractValue,
  applyReplaceRules,
  cleanChapterText,
  resolveUrl
} from './rule.js'

export const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HAS_UNI = typeof uni !== 'undefined' && uni && typeof uni.request === 'function'

function isH5Runtime() {
  if (typeof uni !== 'undefined' && uni.getSystemInfoSync) {
    try {
      const info = uni.getSystemInfoSync()
      if (info && info.uniPlatform) return info.uniPlatform === 'web'
    } catch (e) {
      // ignore
    }
  }
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function isH5DevRuntime() {
  if (!isH5Runtime()) return false
  if (typeof location === 'undefined') return false
  const host = String(location.hostname || '')
  return host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

const USE_DEV_PROXY = isH5DevRuntime()

export class RequestError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'RequestError'
    this.stage = options.stage || ''
    this.status = options.status || 0
    this.url = options.url || ''
    this.sourceName = options.sourceName || ''
  }
}

export function proxiedUrl(url, referer) {
  const target = String(url || '')
  if (!USE_DEV_PROXY || !/^https?:\/\//i.test(target)) return target
  return '/__proxy?url=' + encodeURIComponent(target) + '&referer=' + encodeURIComponent(referer || target)
}

function getHeader(headers, name) {
  if (!headers) return ''
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return ''
}

function normalizeHeadersObject(headers) {
  const result = {}
  for (const key of Object.keys(headers || {})) {
    result[key.toLowerCase()] = headers[key]
  }
  return result
}

function defaultHeaders(source, referer) {
  const h5 = isH5Runtime()
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
  // 浏览器禁止脚本设置 User-Agent / Referer；开发代理会在服务端补齐
  if (!h5) {
    headers['User-Agent'] = DEFAULT_UA
    if (referer) headers.Referer = referer
  }
  if (source && source.headers && typeof source.headers === 'object') {
    Object.assign(headers, source.headers)
  }
  if (h5) {
    delete headers['User-Agent']
    delete headers['user-agent']
    delete headers.Referer
    delete headers.referer
  }
  return headers
}

function abortAfter(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  }
}

async function requestBytes(url, options = {}) {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new RequestError('无效的请求地址：' + target, { url: target, stage: options.stage })
  }
  const method = String(options.method || 'GET').toUpperCase()
  const body = options.body == null ? '' : String(options.body)
  const headers = options.headers || {}
  const timeout = Math.max(3000, Number(options.timeout) || 25000)
  const requestUrl = proxiedUrl(target, options.referer || options.sourceUrl || target)

  if (HAS_UNI) {
    return new Promise((resolve, reject) => {
      uni.request({
        url: requestUrl,
        method,
        header: headers,
        data: (method === 'GET' || method === 'HEAD') ? undefined : body,
        timeout,
        responseType: 'arraybuffer',
        success(res) {
          const status = res.statusCode || 0
          let bytes = new Uint8Array(0)
          if (res.data instanceof ArrayBuffer) {
            bytes = new Uint8Array(res.data)
          } else if (ArrayBuffer.isView(res.data)) {
            bytes = new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength)
          } else if (typeof res.data === 'string') {
            if (typeof TextEncoder !== 'undefined') {
              bytes = new TextEncoder().encode(res.data)
            } else {
              bytes = Uint8Array.from(Array.from(res.data).map((ch) => ch.charCodeAt(0) & 0xff))
            }
          }
          resolve({
            status,
            headers: res.header || res.headers || {},
            bytes,
            url: target
          })
        },
        fail(err) {
          const message = err && err.errMsg ? err.errMsg : '网络请求失败'
          reject(new RequestError(friendlyNetworkError(message), {
            url: target,
            stage: options.stage,
            sourceName: options.sourceName
          }))
        }
      })
    })
  }

  const controller = abortAfter(timeout)
  try {
    const response = await fetch(target, {
      method,
      headers,
      body: (method === 'GET' || method === 'HEAD') ? undefined : body,
      redirect: 'follow',
      signal: controller.signal
    })
    const buffer = await response.arrayBuffer()
    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    return {
      status: response.status,
      headers: responseHeaders,
      bytes: new Uint8Array(buffer),
      url: response.url || target
    }
  } catch (e) {
    const message = e && e.name === 'AbortError' ? '请求超时' : (e && e.message) || '网络请求失败'
    throw new RequestError(message, {
      url: target,
      stage: options.stage,
      sourceName: options.sourceName
    })
  } finally {
    controller.clear()
  }
}

function headerObject(raw) {
  const headers = {}
  String(raw || '').split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(':')
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
  })
  return headers
}

function hasNativeXhr() {
  return typeof plus !== 'undefined' && plus && plus.net && typeof plus.net.XMLHttpRequest === 'function'
}

/**
 * App 端用 WebView 网络栈取文本。
 *
 * uni.request 在部分站点（如百度云加速后的 85zw）会被识别为无 SNI 的请求，
 * 服务端直接返回 HTTP 400；plus.net.XMLHttpRequest 走 Chromium 网络栈，
 * 可正常带 SNI、Cookie，并按响应头/页面 meta 解码 GBK。
 */
function nativeRequestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const method = String(options.method || 'GET').toUpperCase()
    const body = options.body == null ? '' : String(options.body)
    const timeout = Math.max(3000, Number(options.timeout) || 25000)
    let xhr
    try {
      xhr = new plus.net.XMLHttpRequest()
    } catch (e) {
      reject(new RequestError('网络组件初始化失败', {
        url, stage: options.stage, sourceName: options.sourceName
      }))
      return
    }
    const fail = (message) => reject(new RequestError(message, {
      url, stage: options.stage, sourceName: options.sourceName
    }))
    try {
      xhr.open(method, url, true)
      if (options.charset && options.charset !== 'auto') {
        xhr.overrideMimeType('text/html; charset=' + options.charset)
      }
      const headers = options.headers || {}
      Object.keys(headers).forEach((key) => {
        try {
          xhr.setRequestHeader(key, String(headers[key]))
        } catch (e) {
          // 个别请求头在 WebView 中不可设置，忽略即可
        }
      })
      xhr.timeout = timeout
      xhr.onload = () => {
        const status = Number(xhr.status) || 0
        const responseHeaders = headerObject(xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '')
        const contentType = getHeader(responseHeaders, 'content-type')
        resolve({
          status,
          headers: responseHeaders,
          text: typeof xhr.responseText === 'string' ? xhr.responseText : '',
          charset: charsetFromContentType(contentType) || options.charset || '',
          url: xhr.responseURL || url
        })
      }
      xhr.onerror = () => fail('网络请求失败')
      xhr.ontimeout = () => fail('请求超时，请检查网络或稍后重试')
      xhr.onabort = () => fail('请求已取消')
      xhr.send(method === 'GET' || method === 'HEAD' ? null : body)
    } catch (e) {
      fail((e && e.message) || '网络请求失败')
    }
  })
}

function charsetFromContentType(contentType) {
  const match = String(contentType || '').match(/charset\s*=\s*["']?([\w-]+)/i)
  return match ? match[1].toLowerCase() : ''
}

function friendlyNetworkError(message) {
  const text = String(message || '')
  if (/timeout|timed out/i.test(text)) return '请求超时，请检查网络或稍后重试'
  if (/abort/i.test(text)) return '请求已取消'
  if (/domain|dns|resolve|host/i.test(text)) return '域名解析失败，请检查网络'
  if (/SSL|TLS|certificate/i.test(text)) return 'HTTPS 证书校验失败'
  if (/CORS|cross-origin/i.test(text)) return '浏览器跨域限制，请在 App 中使用或配置代理'
  return '网络请求失败：' + text
}

const responseCache = new Map()
const CACHE_TTL = 2 * 60 * 1000
const MAX_CACHE = 60

export function clearHttpCache() {
  responseCache.clear()
  wafTokenCache.clear()
  indexSearchCache.clear()
}

function cachedGet(key) {
  const item = responseCache.get(key)
  if (!item) return null
  if (Date.now() > item.expire) {
    responseCache.delete(key)
    return null
  }
  return item.value
}

function putCache(key, value) {
  if (responseCache.size >= MAX_CACHE) {
    const first = responseCache.keys().next().value
    responseCache.delete(first)
  }
  responseCache.set(key, { value, expire: Date.now() + CACHE_TTL })
}

function looksBlocked(text) {
  const sample = String(text || '')
  if (sample.length > 20000) return false
  const strong = /Just a moment|cf-browser-verification|Enable JavaScript and cookies|Access denied|人机验证|安全验证|访问验证|请开启JavaScript|滑动验证/i
  if (strong.test(sample)) return true
  if (sample.length < 4000 && /加载中……|加载中\.\.\./.test(sample)) return true
  return false
}

/* ------------------------------------------------------------------ *
 * WAF 挑战处理（旧式 waf_challenge + 新版 waf_v2）
 *
 * 站点实际返回的 503 挑战形如：
 *   document.cookie='waf_challenge=<token>; max-age=300; path=/; ...'
 * 旧实现只匹配 waf_challenge='<token>'，无法识别上面的真实格式，
 * 导致 503 后不重试、整本缓存全失败。这里统一解析并支持自动求解。
 * ------------------------------------------------------------------ */

const WAF_MAX_RETRIES = 2
const WAF_CACHE_TTL = 4 * 60 * 1000
const WAF_SOLVE_TIMEOUT = 4000
const WAF_MAX_NONCE = 2000000

const wafTokenCache = new Map()

function wafHostKey(url) {
  const match = String(url || '').match(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i)
  return match ? match[1].toLowerCase() : ''
}

function utf8Bytes(text) {
  const value = String(text == null ? '' : text)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value)
  const bytes = []
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        i++
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return Uint8Array.from(bytes)
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, '0')
}

// MD5 摘要按小端序输出每个 32 位字，SHA-1/SHA-256 按大端序。
function hex32le(value) {
  const word = value >>> 0
  const byte = (n) => (n & 0xff).toString(16).padStart(2, '0')
  return byte(word) + byte(word >>> 8) + byte(word >>> 16) + byte(word >>> 24)
}

const MD5_K = (() => {
  const table = new Uint32Array(64)
  for (let i = 0; i < 64; i++) table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
  return table
})()
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
]

function md5Hex(input) {
  const bytes = utf8Bytes(input)
  const bitLength = bytes.length * 8
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, bitLength >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const words = new Uint32Array(16)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true)
    let a = a0; let b = b0; let c = c0; let d = d0
    for (let i = 0; i < 64; i++) {
      let f = 0
      let g = 0
      if (i < 16) {
        f = (b & c) | (~b & d); g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c); g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d; g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d); g = (7 * i) % 16
      }
      const sum = (a + f + MD5_K[i] + words[g]) >>> 0
      a = d; d = c; c = b
      b = (b + ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i])))) >>> 0
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  return hex32le(a0) + hex32le(b0) + hex32le(c0) + hex32le(d0)
}

const SHA256_K = [
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
  3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
  3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
  2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
  666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
  2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
  430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
  1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298
]

function rotr32(value, bits) {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(input) {
  const bytes = utf8Bytes(input)
  const bitLength = bytes.length * 8
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 4294967296), false)
  view.setUint32(padded.length - 4, bitLength >>> 0, false)
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(words[i - 15], 7) ^ rotr32(words[i - 15], 18) ^ (words[i - 15] >>> 3)
      const s1 = rotr32(words[i - 2], 17) ^ rotr32(words[i - 2], 19) ^ (words[i - 2] >>> 10)
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0
    }
    let a = h[0]; let b = h[1]; let c = h[2]; let d = h[3]
    let e = h[4]; let f = h[5]; let g = h[6]; let hh = h[7]
    for (let i = 0; i < 64; i++) {
      const bigSigma1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const choose = (e & f) ^ (~e & g)
      const t1 = (hh + bigSigma1 + choose + SHA256_K[i] + words[i]) >>> 0
      const bigSigma0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (bigSigma0 + majority) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  return h.map(hex32).join('')
}

function sha1Hex(input) {
  const bytes = utf8Bytes(input)
  const bitLength = bytes.length * 8
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 4294967296), false)
  view.setUint32(padded.length - 4, bitLength >>> 0, false)
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const words = new Uint32Array(80)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 80; i++) {
      words[i] = rotr32(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 31)
    }
    let a = h[0]; let b = h[1]; let c = h[2]; let d = h[3]; let e = h[4]
    for (let i = 0; i < 80; i++) {
      let f = 0
      let k = 0
      if (i < 20) {
        f = (b & c) | (~b & d); k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d; k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d; k = 0xca62c1d6
      }
      const temp = (rotr32(a, 27) + f + e + k + words[i]) >>> 0
      e = d; d = c; c = rotr32(b, 2); b = a; a = temp
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0
  }
  return h.map(hex32).join('')
}

function hashHex(algorithm, text) {
  if (algorithm === 'md5') return md5Hex(text)
  if (algorithm === 'sha1') return sha1Hex(text)
  return sha256Hex(text)
}

/**
 * 兼容旧式挑战页：var token='xxx' / waf_challenge='xxx' /
 * document.cookie='waf_challenge=xxx; max-age=300; ...'
 */
function isPlausibleWafToken(value) {
  return /^[A-Za-z0-9_+=/-]{8,}$/.test(String(value || ''))
}

export function extractWafToken(text) {
  const sample = String(text || '')
  const direct = sample.match(/var\s+token\s*=\s*['"]([^'"]+)['"]/i)
  if (direct && isPlausibleWafToken(direct[1])) return direct[1]
  // 真实挑战页把 token 直接写进 document.cookie 字符串，须先于普通赋值匹配，
  // 否则会误命中后面的 document.cookie.indexOf('waf_challenge=') 判断。
  const patterns = [
    /document\.cookie\s*=\s*['"][^'"]*\bwaf_challenge=([^;'"\s]+)/i,
    /['"]\s*waf_challenge\s*=\s*([^;'"\s]+)/i,
    /\bwaf_challenge\s*=\s*['"]([^'"]+)['"]/i,
    /\bwaf_challenge\s*=\s*([A-Za-z0-9_.\-]{8,})/i
  ]
  for (const pattern of patterns) {
    const match = sample.match(pattern)
    if (match && isPlausibleWafToken(match[1]) && !/^(token|t|s)$/i.test(match[1])) return match[1]
  }
  // document.cookie='waf_challenge='+t 形式：回溯 t 的定义
  const concat = sample.match(/waf_challenge\s*=\s*['"]\s*\+\s*([A-Za-z_$][\w$]*)/i)
  if (concat) {
    const value = sample.match(new RegExp('(?:var|let|const)\\s+' + concat[1] + "\\s*=\\s*['\"]([^'\"]+)['\"]", 'i'))
    if (value && isPlausibleWafToken(value[1])) return value[1]
  }
  return ''
}

/** 解析 503 挑战页，返回挑战类型与求解所需参数。 */
export function parseWafChallenge(text) {
  const sample = String(text || '')
  if (!sample || sample.length > 50000) return null
  const isV2 = /\bwaf_v2\b/i.test(sample)
  const legacyToken = extractWafToken(sample)
  if (!isV2 && !legacyToken) return null
  const challenge = {
    type: isV2 ? 'v2' : 'legacy',
    token: legacyToken,
    seed: '',
    count: 0,
    difficulty: 0,
    algorithm: 'sha256',
    cookieName: 'waf_v2',
    mode: 'chain',
    embedded: ''
  }
  if (!isV2) return challenge

  const embedded = sample.match(/document\.cookie\s*=\s*['"][^'"]*\bwaf_v2=([^;'"\s]+)/i)
  if (embedded) challenge.embedded = embedded[1]
  const cookieName = sample.match(/document\.cookie\s*=\s*['"]([A-Za-z_][\w-]*)=/i)
  if (cookieName && /waf/i.test(cookieName[1])) challenge.cookieName = cookieName[1]

  const cString = sample.match(/(?:var|let|const)?\s*\bc\s*=\s*['"]([^'"]+)['"]/i)
  const cNumber = sample.match(/(?:var|let|const)?\s*\bc\s*=\s*(\d{1,7})\b/i) || sample.match(/[?&]c=(\d{1,7})\b/i)
  if (cNumber) challenge.count = Number(cNumber[1])
  if (cString) challenge.seed = cString[1]

  const seedNames = ['seed', 'challenge', 'salt', 'token', 'nonce', 'ch', 't', 's', 'v']
  for (const name of seedNames) {
    const found = sample.match(new RegExp('(?:var|let|const)?\\s*\\b' + name + "\\s*=\\s*['\"]([^'\"]{1,})['\"]", 'i'))
    if (found && found[1] !== challenge.seed) {
      challenge.seed = found[1]
      break
    }
  }
  const difficulty = sample.match(/\b(?:difficulty|diff|zeros|bits|d)\s*[:=]\s*['"]?(\d{1,3})['"]?/i)
  if (difficulty) challenge.difficulty = Math.min(Number(difficulty[1]), 8)
  if (!challenge.difficulty) {
    const target = sample.match(/['"](0{2,8})['"]/)
    if (target) challenge.difficulty = target[1].length
  }
  if (challenge.difficulty > 0) challenge.mode = 'cash'
  if (/md5/i.test(sample)) challenge.algorithm = 'md5'
  else if (/\bsha[-_ ]?1\b/i.test(sample)) challenge.algorithm = 'sha1'
  if (!challenge.seed && !challenge.count && !challenge.difficulty && !challenge.embedded) return null
  return challenge
}

async function solveHashcash(seed, challenge) {
  const target = '0'.repeat(challenge.difficulty)
  const started = Date.now()
  for (let nonce = 0; nonce < WAF_MAX_NONCE; nonce++) {
    const hash = hashHex(challenge.algorithm, seed + nonce)
    if (hash.slice(0, target.length) === target) return hash + '.' + nonce
    if ((nonce & 4095) === 0) {
      if (Date.now() - started > WAF_SOLVE_TIMEOUT) return ''
      await Promise.resolve()
    }
  }
  return ''
}

/**
 * 求解 WAF 挑战并返回待写入的 cookie 列表。
 * 不依赖 Web Crypto，纯标准 JS，可在 App 的 WebView / plus 环境同步运行。
 */
export async function solveWafChallenge(text, options = {}) {
  const challenge = parseWafChallenge(text)
  if (!challenge) return null
  if (challenge.type === 'legacy') {
    if (!challenge.token) return null
    return { name: 'waf_challenge', value: challenge.token, cookies: ['waf_challenge=' + challenge.token] }
  }
  let value = challenge.embedded
  if (!value) {
    const seed = challenge.seed || String(options.url || '')
    if (!seed) return null
    if (challenge.mode === 'cash') {
      value = await solveHashcash(seed, challenge)
    } else {
      const count = Math.min(Math.max(challenge.count || 1, 1), 4096)
      value = seed
      for (let i = 0; i < count; i++) value = hashHex(challenge.algorithm, value)
    }
  }
  if (!value) return null
  return { name: challenge.cookieName, value, cookies: [challenge.cookieName + '=' + value] }
}

function mergeCookieHeader(current, cookies) {
  const map = new Map()
  String(current || '').split(';').forEach((part) => {
    const index = part.indexOf('=')
    if (index > 0) map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  })
  for (const cookie of cookies || []) {
    const index = cookie.indexOf('=')
    if (index > 0) map.set(cookie.slice(0, index).trim(), cookie.slice(index + 1).trim())
  }
  return Array.from(map, ([key, value]) => key + '=' + value).join('; ')
}

function getWafCookieHeader(host) {
  const item = wafTokenCache.get(host)
  if (!item) return ''
  if (Date.now() > item.expire) {
    wafTokenCache.delete(host)
    return ''
  }
  return item.cookies
}

function rememberWafCookies(host, cookies) {
  if (!host) return
  const header = mergeCookieHeader(getWafCookieHeader(host), cookies)
  wafTokenCache.set(host, { cookies: header, expire: Date.now() + WAF_CACHE_TTL })
}

function setWafCookies(baseUrl, cookies) {
  if (!hasNativeXhr()) return false
  if (typeof plus === 'undefined' || !plus.navigator || typeof plus.navigator.setCookie !== 'function') return false
  let written = false
  for (const cookie of cookies || []) {
    try {
      plus.navigator.setCookie(baseUrl, cookie + '; path=/')
      written = true
    } catch (e) {
      // 个别 WebView 禁止写 cookie，忽略并依赖显式 Cookie 请求头
    }
  }
  return written
}

function decodeScriptedContent(html, source, title) {
  const sample = String(html || '')
  const chunks = []
  const pattern = /document\.(?:writeln|write)\(\s*[\w$.]+\.[\w$]+\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\)/g
  let match
  while ((match = pattern.exec(sample))) {
    try {
      chunks.push(decodeBase64UTF8(match[1]))
    } catch (e) {
      // 忽略无法解码的片段
    }
  }
  if (!chunks.length) return ''
  let text = textContent(parseHTML(chunks.join('\n')))
  text = applyReplaceRules(text, source.replaceRules)
  text = applyReplaceRules(text, source.ruleContent && source.ruleContent.replaceRules)
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length > 2 && /^作\s*者\s*[:：]/.test(lines[1])) lines.splice(0, 2)
  return cleanChapterText(lines.join('\n'), { title })
}

/**
 * 请求并按编码解码为文本。
 */
export async function fetchText(url, options = {}) {
  const source = options.source || {}
  const method = String(options.method || 'GET').toUpperCase()
  const body = options.body == null ? '' : String(options.body)
  const referer = options.referer || source.url || ''
  const headers = Object.assign(
    defaultHeaders(source, referer),
    options.headers || {}
  )
  if (method !== 'GET' && method !== 'HEAD' && body && !getHeader(headers, 'content-type')) {
    headers['Content-Type'] = body.trim().startsWith('{')
      ? 'application/json; charset=utf-8'
      : 'application/x-www-form-urlencoded'
  }

  const cacheKey = method + '|' + url + '|' + body
  if (method === 'GET' && options.cache !== false) {
    const hit = cachedGet(cacheKey)
    if (hit) return hit
  }

  const useNative = hasNativeXhr() && !isH5Runtime()
  const wafHost = wafHostKey(url)
  let wafCookieHeader = useNative ? '' : getWafCookieHeader(wafHost)
  const requestOnce = async (extraHeaders = {}) => {
    const requestHeaders = Object.assign({}, headers, extraHeaders)
    const response = useNative
      ? await nativeRequestText(url, {
        method,
        body,
        headers: requestHeaders,
        timeout: options.timeout,
        stage: options.stage,
        sourceName: source.name,
        charset: options.charset || 'auto'
      })
      : await requestBytes(url, {
        method,
        body,
        headers: requestHeaders,
        timeout: options.timeout,
        stage: options.stage,
        sourceName: source.name,
        sourceUrl: source.url,
        referer
      })
    const contentType = getHeader(response.headers, 'content-type')
    const decoded = useNative
      ? { text: response.text || '', charset: response.charset || '' }
      : decodeResponse(response.bytes, contentType, source.charset || 'auto')
    return { response, contentType, text: decoded.text, charset: decoded.charset }
  }

  let response = null
  let contentType = ''
  let text = ''
  let charset = ''
  let wafRetries = 0
  for (;;) {
    const extra = wafCookieHeader ? { Cookie: wafCookieHeader } : {}
    const attempt = await requestOnce(extra)
    response = attempt.response
    contentType = attempt.contentType
    text = attempt.text
    charset = attempt.charset
    if (response.status !== 503 || wafRetries >= WAF_MAX_RETRIES) break
    let solution = null
    try {
      solution = await solveWafChallenge(text, { url })
    } catch (e) {
      solution = null
    }
    if (!solution || !solution.cookies.length) break
    wafRetries += 1
    wafCookieHeader = mergeCookieHeader(wafCookieHeader, solution.cookies)
    rememberWafCookies(wafHost, solution.cookies)
    setWafCookies(ensureBase(source), solution.cookies)
  }
  if (response.status === 503 && wafRetries > 0) {
    throw new RequestError(`WAF 挑战求解失败：重试 ${wafRetries} 次后仍返回 HTTP 503`, {
      url,
      status: response.status,
      stage: options.stage,
      sourceName: source.name
    })
  }
  if (response.status >= 400) {
    throw new RequestError(`网站返回 HTTP ${response.status}`, {
      url,
      status: response.status,
      stage: options.stage,
      sourceName: source.name
    })
  }
  if (!text || !text.trim()) {
    throw new RequestError('网站返回了空内容', {
      url,
      status: response.status,
      stage: options.stage,
      sourceName: source.name
    })
  }
  if (looksBlocked(text)) {
    throw new RequestError('该网站启用了人机验证/反爬，已无法直接解析', {
      url,
      status: response.status,
      stage: options.stage,
      sourceName: source.name
    })
  }

  const result = {
    text,
    charset,
    status: response.status,
    headers: response.headers,
    contentType,
    url: response.url || url
  }
  if (method === 'GET' && options.cache !== false) putCache(cacheKey, result)
  return result
}

function parseJsonLoose(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (e) {
    // JSONP
    const match = trimmed.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/)
    if (match) {
      try {
        return JSON.parse(match[1])
      } catch (e2) {
        return null
      }
    }
    return null
  }
}

export function parseDocument(text, source = {}, contentType = '') {
  const trimmed = String(text || '').trim()
  const looksJsonp = /^[\w$.]+\s*\([\s\S]*\)\s*;?$/.test(trimmed)
  const shouldTryJson = source.type === 'json' ||
    /json/i.test(contentType || '') ||
    trimmed[0] === '{' ||
    trimmed[0] === '[' ||
    looksJsonp
  if (shouldTryJson) {
    const json = parseJsonLoose(trimmed)
    if (json !== null) {
      return { doc: null, jsonRoot: json, isJson: true }
    }
  }
  return { doc: parseHTML(text), jsonRoot: undefined, isJson: false }
}

function ensureBase(source) {
  const url = String(source.url || '').trim()
  if (!url) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url.replace(/^\/+/, '')
}

export function buildSearchRequest(source, key) {
  const base = ensureBase(source)
  const vars = { key, baseUrl: base, page: 1 }
  const template = source.searchUrl || ''
  const target = buildTemplate(template, vars, source.searchCharset || source.charset || 'utf-8')
  const url = resolveUrl(base, target)
  const method = String(source.searchMethod || (source.searchBody ? 'POST' : 'GET')).toUpperCase()
  const body = source.searchBody
    ? buildTemplate(source.searchBody, vars, source.searchCharset || source.charset || 'utf-8')
    : ''
  return { url, method, body, base }
}

const indexSearchCache = new Map()
const INDEX_CACHE_TTL = 6 * 60 * 60 * 1000

function buildCrawlIndexUrls(source, base) {
  const urls = []
  if (Array.isArray(source.indexPages) && source.indexPages.length) {
    for (const page of source.indexPages) {
      const url = resolveUrl(base, String(page))
      if (url) urls.push(url)
    }
    return urls
  }
  if (!source.indexPagePattern) return urls
  const categories = Array.isArray(source.indexCategories) && source.indexCategories.length
    ? source.indexCategories
    : ['']
  const limit = Math.max(1, Math.min(100, Number(source.indexPageLimit) || 1))
  for (let page = 1; page <= limit; page++) {
    for (const category of categories) {
      const path = String(source.indexPagePattern)
        .replace(/\{page\}/g, String(page))
        .replace(/\{category\}/g, String(category))
      const url = resolveUrl(base, path)
      if (url) urls.push(url)
    }
  }
  return urls
}

async function enrichIndexItems(source, items, options = {}) {
  if (!source.ruleBookInfo || !Object.keys(source.ruleBookInfo).length) return
  if (options.enrich === false) return
  const targets = items.filter((item) => item.bookUrl && !item._enriched).slice(0, 24)
  if (!targets.length) return
  let cursor = 0
  const concurrency = Math.max(1, Math.min(6, Number(options.enrichConcurrency) || 4))
  async function worker() {
    while (cursor < targets.length) {
      const item = targets[cursor++]
      try {
        const page = await fetchText(item.bookUrl, {
          source,
          referer: source.url,
          cache: true,
          timeout: 12000,
          stage: 'search'
        })
        const parsed = parseDocument(page.text, source, page.contentType)
        const info = extractBookInfo(parsed.doc, source, {
          baseUrl: page.url || item.bookUrl,
          bookUrl: item.bookUrl,
          jsonRoot: parsed.jsonRoot,
          fallback: item
        })
        item.name = info.name || item.name
        item.author = item.author || info.author || ''
        item.coverUrl = item.coverUrl || info.coverUrl || ''
        item.intro = item.intro || info.intro || ''
        item.kind = item.kind || info.kind || ''
        item.lastChapter = item.lastChapter || info.lastChapter || ''
        item._enriched = true
      } catch (e) {
        // 单本详情失败不影响整个搜索结果
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

export function dedupeIndexResults(items, keyword) {
  const needle = String(keyword || '').trim().toLowerCase()
  const map = new Map()
  const order = []
  const quality = (item) => {
    const name = String(item.name || '').toLowerCase()
    let score = 0
    if (name === needle) score += 1000
    else if (name.startsWith(needle)) score += 300
    else if (name.indexOf(needle) !== -1) score += 100
    score -= Math.max(0, name.length - needle.length)
    if (item.coverUrl) score += 5
    if (item.intro) score += 5
    return score
  }
  for (const item of items || []) {
    const author = String(item.author || '').replace(/\s+/g, '').toLowerCase()
    const latest = String(item.lastChapter || '').replace(/\s+/g, '').toLowerCase()
    const sourceKey = item.sourceId || item.sourceName || ''
    const key = author && latest
      ? `book|${sourceKey}|${author}|${latest}`
      : 'url|' + (item.bookUrl || Math.random())
    if (!map.has(key)) {
      map.set(key, item)
      order.push(key)
    } else if (quality(item) > quality(map.get(key))) {
      map.set(key, item)
    }
  }
  return order.map((key) => map.get(key))
}

async function searchByIndex(source, keyword, options = {}) {
  const startedAt = Date.now()
  const base = ensureBase(source)
  const cacheKey = source.id + '|' + (source.searchIndexUrl || source.indexPagePattern || '') + '|' + (source.indexPageLimit || '')
  let cached = indexSearchCache.get(cacheKey)
  let items = cached && Date.now() - cached.at < INDEX_CACHE_TTL ? cached.items : null

  if (!items) {
    items = []
    const seen = new Set()
    const urlPattern = source.indexBookUrlPattern ? new RegExp(source.indexBookUrlPattern) : null
    const addResult = (result) => {
      if (!result || !result.name || !result.bookUrl) return
      if (urlPattern && !urlPattern.test(result.bookUrl)) return
      if (seen.has(result.bookUrl)) return
      seen.add(result.bookUrl)
      items.push(result)
    }

    if (source.searchIndexUrl) {
      const indexUrl = resolveUrl(source.repoManifestUrl || base, source.searchIndexUrl)
      const page = await fetchText(indexUrl, { source, cache: true, stage: 'search' })
      let payload
      try { payload = JSON.parse(page.text) } catch (e) { throw new RequestError('书源索引不是有效 JSON', { stage: 'search', sourceName: source.name }) }
      const books = Array.isArray(payload) ? payload : (payload.books || payload.sources || [])
      for (const book of books) {
        addResult({
          name: book.name || book.title || '',
          author: book.author || '',
          coverUrl: book.coverUrl || book.cover || '',
          intro: book.intro || book.description || '',
          kind: book.kind || book.category || '',
          lastChapter: book.lastChapter || '',
          bookUrl: resolveUrl(base, book.url || book.bookUrl || ''),
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url
        })
      }
    } else {
      const pageUrls = buildCrawlIndexUrls(source, base)
      let cursor = 0
      const concurrency = Math.max(1, Math.min(8, Number(options.indexConcurrency) || 6))
      async function worker() {
        while (cursor < pageUrls.length) {
          const index = cursor++
          const pageUrl = pageUrls[index]
          try {
            const page = await fetchText(pageUrl, { source, cache: true, stage: 'search', timeout: 15000 })
            const doc = parseHTML(page.text)
            const results = extractSearchResults(doc, { ...source, ruleSearch: source.ruleSearch || {} }, {
              baseUrl: page.url || pageUrl
            })
            for (const result of results) addResult(result)
          } catch (e) {
            // 分类页可能停更/404，跳过
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
    }
    if (indexSearchCache.size >= 6 && !indexSearchCache.has(cacheKey)) {
      const first = indexSearchCache.keys().next().value
      indexSearchCache.delete(first)
    }
    indexSearchCache.set(cacheKey, { at: Date.now(), items })
  }

  const needle = String(keyword || '').trim().toLowerCase()
  const matched = items.filter((item) => {
    const name = String(item.name || '').toLowerCase()
    const author = String(item.author || '').toLowerCase()
    return name.indexOf(needle) !== -1 || author.indexOf(needle) !== -1
  })
  matched.sort((a, b) => {
    const an = String(a.name || '').toLowerCase()
    const bn = String(b.name || '').toLowerCase()
    const score = (name) => name === needle ? 3 : name.startsWith(needle) ? 2 : 1
    return score(bn) - score(an)
  })

  let results = matched.slice(0, 50)
  await enrichIndexItems(source, results, options)
  results = dedupeIndexResults(results, needle)

  return {
    sourceId: source.id,
    sourceName: source.name,
    results,
    url: source.searchIndexUrl || '(分类索引)',
    finalUrl: '',
    charset: 'utf-8',
    isJson: false,
    elapsed: Date.now() - startedAt
  }
}

/**
 * 搜索单个书源。
 */
export async function searchSource(source, key, options = {}) {
  const searchKey = String(key || '').trim()
  if (!searchKey) throw new RequestError('请输入搜索关键词', { stage: 'search', sourceName: source.name })
  if (source.searchMode === 'crawl-index' || source.searchIndexUrl) {
    return searchByIndex(source, searchKey, options)
  }
  if (!source.searchUrl) throw new RequestError('该书源没有搜索地址', { stage: 'search', sourceName: source.name })
  if (!source.ruleSearch || !source.ruleSearch.bookList) {
    throw new RequestError('该书源没有搜索列表规则', { stage: 'search', sourceName: source.name })
  }
  const keyword = searchKey
  const startedAt = Date.now()
  const request = buildSearchRequest(source, keyword)
  if (!request.url) throw new RequestError('搜索地址无效', { stage: 'search', sourceName: source.name })

  const page = await fetchText(request.url, {
    source,
    method: request.method,
    body: request.body,
    stage: 'search',
    timeout: options.timeout
  })
  const parsed = parseDocument(page.text, source, page.contentType)
  const results = extractSearchResults(parsed.doc, source, {
    baseUrl: page.url || request.url,
    jsonRoot: parsed.jsonRoot
  })
  return {
    sourceId: source.id,
    sourceName: source.name,
    results,
    url: request.url,
    finalUrl: page.url,
    charset: page.charset,
    isJson: parsed.isJson,
    elapsed: Date.now() - startedAt
  }
}

function sameChapterPage(currentUrl, nextUrl) {
  const normalize = (value) => String(value || '')
    .replace(/[?#].*$/, '')
    .replace(/_\d+(\.html?)$/i, '$1')
  const a = normalize(currentUrl)
  const b = normalize(nextUrl)
  if (a && b && a === b) return true
  // 查询参数分页：?page=2 / &p=2
  const queryPage = (value) => String(value || '').replace(/([?&](?:page|p)=\d+)/ig, '$1')
  return queryPage(currentUrl) === queryPage(nextUrl) && /[?&](?:page|p)=\d+/i.test(nextUrl)
}

function sameHost(urlA, urlB) {
  const host = (value) => {
    const match = String(value || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i)
    return match ? match[1].toLowerCase() : ''
  }
  return host(urlA) === host(urlB)
}

function bookIdFromUrl(url) {
  const matches = String(url || '').match(/\d{6,}/g)
  return matches && matches.length ? matches[matches.length - 1] : ''
}

async function fetchTocPages(urls, source, referer, options) {
  const results = new Array(urls.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor
      cursor += 1
      const url = urls[index]
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          results[index] = await fetchText(url, {
            source,
            referer,
            stage: 'toc',
            timeout: options.timeout
          })
          break
        } catch (e) {
          if (attempt === 1) results[index] = null
        }
      }
    }
  }
  const workers = Array.from({ length: Math.min(6, urls.length) }, worker)
  await Promise.all(workers)
  return results
}

async function loadTocChapters(source, tocUrl, target, targetPage, targetParsed, options) {
  const tocRules = source.ruleToc || {}
  const maxPages = Math.max(1, Math.min(100, Number(tocRules.maxPages) || 30))
  const chapters = []
  const seenChapterUrls = new Set()
  const addChapters = (list) => {
    for (const chapter of list) {
      if (seenChapterUrls.has(chapter.url)) continue
      seenChapterUrls.add(chapter.url)
      chapters.push(chapter)
    }
  }

  const firstPage = tocUrl === target
    ? targetPage
    : await fetchText(tocUrl, { source, referer: target, stage: 'toc', timeout: options.timeout })
  const firstParsed = tocUrl === target
    ? targetParsed
    : parseDocument(firstPage.text, source, firstPage.contentType)
  const firstChapters = extractChapters(firstParsed.doc, source, {
    baseUrl: firstPage.url || tocUrl,
    jsonRoot: firstParsed.jsonRoot
  })
  addChapters(firstChapters)
  if (!firstChapters.length) return chapters

  const totalText = tocRules.totalChapters
    ? extractValue(firstParsed.doc, tocRules.totalChapters, {
      baseUrl: firstPage.url || tocUrl,
      field: 'totalChapters'
    })
    : ''
  const totalCount = parseInt((String(totalText || '').match(/\d+/) || [])[0], 10) || 0
  const pageCount = totalCount && firstChapters.length
    ? Math.min(maxPages, Math.ceil(totalCount / firstChapters.length))
    : 0

  if (tocRules.pageUrl && pageCount > 1) {
    const bookId = bookIdFromUrl(tocUrl) || bookIdFromUrl(target)
    const pageUrls = []
    for (let page = 2; page <= pageCount; page += 1) {
      const template = buildTemplate(tocRules.pageUrl, {
        page,
        bookId,
        tocId: bookId,
        baseUrl: ensureBase(source)
      }, 'utf-8')
      const pageUrl = resolveUrl(tocUrl, template)
      if (pageUrl) pageUrls.push(pageUrl)
    }
    const pages = await fetchTocPages(pageUrls, source, target, options)
    for (const tocPage of pages) {
      if (!tocPage) continue
      const parsedPage = parseDocument(tocPage.text, source, tocPage.contentType)
      addChapters(extractChapters(parsedPage.doc, source, {
        baseUrl: tocPage.url || tocUrl,
        jsonRoot: parsedPage.jsonRoot
      }))
    }
    return chapters
  }

  // 没有页码模板时，沿 rel=next / 下一页链接顺序抓取
  const seenPages = new Set([tocUrl])
  let pageUrl = extractNextPageUrl(firstParsed.doc, tocRules.nextPage, firstPage.url || tocUrl)
  for (let pageIndex = 1; pageIndex < maxPages && pageUrl; pageIndex += 1) {
    if (seenPages.has(pageUrl)) break
    seenPages.add(pageUrl)
    let tocPage = null
    try {
      tocPage = await fetchText(pageUrl, { source, referer: target, stage: 'toc', timeout: options.timeout })
    } catch (e) {
      break
    }
    const parsedPage = parseDocument(tocPage.text, source, tocPage.contentType)
    const pageChapters = extractChapters(parsedPage.doc, source, {
      baseUrl: tocPage.url || pageUrl,
      jsonRoot: parsedPage.jsonRoot
    })
    if (!pageChapters.length) break
    addChapters(pageChapters)
    pageUrl = extractNextPageUrl(parsedPage.doc, tocRules.nextPage, tocPage.url || pageUrl)
  }
  return chapters
}

/**
 * 打开书籍：抓详情页，再抓目录页。
 */
export async function openBook(source, bookUrl, fallback = {}, options = {}) {
  const base = ensureBase(source)
  const target = resolveUrl(base, bookUrl)
  if (!target) throw new RequestError('书籍地址无效', { stage: 'book', sourceName: source.name })

  const page = await fetchText(target, { source, referer: base, stage: 'book', timeout: options.timeout })
  const parsed = parseDocument(page.text, source, page.contentType)
  const info = extractBookInfo(parsed.doc, source, {
    baseUrl: page.url || target,
    bookUrl: target,
    jsonRoot: parsed.jsonRoot,
    fallback
  })
  info.name = info.name || fallback.name || ''
  info.author = info.author || fallback.author || ''
  info.coverUrl = info.coverUrl || fallback.coverUrl || ''
  info.intro = info.intro || fallback.intro || ''
  info.kind = info.kind || fallback.kind || ''

  let chapters = []
  let tocUrl = info.tocUrl || target
  if (source.singleChapter) {
    chapters = [{ name: info.name || '全文', url: target }]
    tocUrl = target
  } else if (tocUrl) {
    chapters = await loadTocChapters(source, tocUrl, target, page, parsed, options)
  }
  if (!chapters.length) {
    chapters = extractChapters(parsed.doc, source, {
      baseUrl: page.url || target,
      jsonRoot: parsed.jsonRoot
    })
    tocUrl = target
  }
  if (!info.name && chapters.length && fallback.name) info.name = fallback.name
  if (!chapters.length) {
    throw new RequestError('没有解析到章节列表，书源规则可能已失效', {
      stage: 'toc',
      sourceName: source.name,
      url: tocUrl
    })
  }

  return {
    info,
    chapters,
    bookUrl: target,
    tocUrl,
    charset: page.charset,
    elapsed: Date.now()
  }
}

/**
 * 获取章节正文，自动跟随正文分页（最多 5 页）。
 */
export async function getChapterContent(source, chapter, options = {}) {
  const base = ensureBase(source)
  const target = resolveUrl(base, chapter.url)
  if (!target) throw new RequestError('章节地址无效', { stage: 'content', sourceName: source.name })

  const page = await fetchText(target, {
    source,
    referer: options.bookUrl || base,
    stage: 'content',
    timeout: options.timeout,
    cache: false
  })
  const parsed = parseDocument(page.text, source, page.contentType)
  const decodeBase64Script = source.ruleContent && source.ruleContent.decode === 'base64-script'

  // 每一页走同一套解析/解码流程。base64-script 站点的正文在脚本而非 DOM 文本中，
  // extractChapterContent 可能因正文过短抛错，此时仍要取出分页地址，否则后续页无法跟随。
  const readPagePart = (pageText, doc, baseUrl, jsonRoot, fallbackTitle) => {
    let part
    try {
      part = extractChapterContent(doc, source, {
        baseUrl,
        jsonRoot,
        chapterName: fallbackTitle
      })
    } catch (e) {
      if (!decodeBase64Script) throw e
      const rule = source.ruleContent && source.ruleContent.nextContentUrl
      part = {
        title: fallbackTitle,
        content: '',
        nextContentUrl: rule
          ? extractValue(doc, rule, { baseUrl, isUrl: true, field: 'nextContentUrl' })
          : ''
      }
    }
    if (decodeBase64Script) {
      const decoded = decodeScriptedContent(pageText, source, part.title || fallbackTitle)
      if (decoded) part.content = decoded
    }
    return part
  }

  const first = readPagePart(page.text, parsed.doc, page.url || target, parsed.jsonRoot, chapter.name)
  let content = first.content
  let title = first.title || chapter.name
  let next = first.nextContentUrl
  const visited = new Set([target])
  while (next && !visited.has(next) && visited.size < 20) {
    if (!sameHost(next, target)) break
    if (source.followAnyContentPage !== true && !sameChapterPage(target, next)) break
    visited.add(next)
    try {
      const nextPage = await fetchText(next, {
        source,
        referer: target,
        stage: 'content',
        timeout: options.timeout,
        cache: false
      })
      const nextParsed = parseDocument(nextPage.text, source, nextPage.contentType)
      const part = readPagePart(
        nextPage.text,
        nextParsed.doc,
        nextPage.url || next,
        nextParsed.jsonRoot,
        title
      )
      if (part.content && part.content !== content) {
        content += '\n' + part.content
      }
      next = part.nextContentUrl
    } catch (e) {
      break
    }
  }

  return {
    title,
    content,
    url: target,
    chapterName: chapter.name,
    elapsed: Date.now()
  }
}

/**
 * 书源体检：搜索 → 详情 → 目录 → 第一章正文。
 */
export async function testSource(source, keyword, options = {}) {
  const report = {
    sourceId: source.id,
    sourceName: source.name,
    keyword,
    stages: {},
    ok: false
  }
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  try {
    progress('search', '正在搜索…')
    const search = await searchSource(source, keyword, options)
    report.stages.search = {
      ok: true,
      count: search.results.length,
      elapsed: search.elapsed,
      sample: search.results.slice(0, 3)
    }
    if (!search.results.length) throw new RequestError('没有搜索到结果', { stage: 'search', sourceName: source.name })

    const first = search.results[0]
    progress('book', `正在打开《${first.name}》…`)
    const book = await openBook(source, first.bookUrl, first, options)
    report.stages.book = {
      ok: true,
      name: book.info.name,
      author: book.info.author,
      coverUrl: book.info.coverUrl,
      chapterCount: book.chapters.length,
      tocUrl: book.tocUrl
    }
    if (!book.chapters.length) throw new RequestError('目录为空', { stage: 'toc', sourceName: source.name })

    progress('content', `正在读取《${book.chapters[0].name}》…`)
    const chapter = await getChapterContent(source, book.chapters[0], { ...options, bookUrl: book.bookUrl })
    report.stages.content = {
      ok: true,
      title: chapter.title,
      length: chapter.content.length,
      preview: chapter.content.slice(0, 120)
    }
    report.book = {
      name: book.info.name,
      author: book.info.author,
      coverUrl: book.info.coverUrl,
      intro: book.info.intro,
      tocUrl: book.tocUrl,
      chapters: book.chapters
    }
    report.result = first
    report.ok = true
    progress('done', '书源可用')
    return report
  } catch (e) {
    report.error = e && e.message ? e.message : '测试失败'
    report.errorStage = e && e.stage ? e.stage : ''
    progress('error', report.error)
    return report
  }
}

/**
 * 并发搜索多个书源。
 */
export async function searchAllSources(sources, keyword, options = {}) {
  const enabled = (sources || [])
    .filter((source) => options.includeDisabled || source.enabled !== false)
    .filter((source) => source.direct !== true && (!!source.searchUrl || source.searchMode === 'crawl-index' || !!source.searchIndexUrl))
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 3))
  const results = []
  let cursor = 0
  const onSourceDone = typeof options.onSourceDone === 'function' ? options.onSourceDone : () => {}

  async function worker() {
    while (cursor < enabled.length) {
      const index = cursor++
      const source = enabled[index]
      const started = Date.now()
      try {
        const result = await searchSource(source, keyword, options)
        const item = { source, results: result.results, error: '', elapsed: result.elapsed }
        results[index] = item
        onSourceDone(item)
      } catch (e) {
        const item = {
          source,
          results: [],
          error: e && e.message ? e.message : '搜索失败',
          elapsed: Date.now() - started
        }
        results[index] = item
        onSourceDone(item)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results.filter(Boolean)
}

function normalizeBookKey(name, author) {
  return String(name || '').replace(/[《》\s\-—_·:：]/g, '').toLowerCase() +
    '|' +
    String(author || '').replace(/[\s\-—_·:：]/g, '').toLowerCase()
}

function offerScore(offer) {
  let score = 0
  if (offer.author) score += 2
  if (offer.coverUrl) score += 2
  if (offer.intro) score += 1
  if (offer.lastChapter) score += 1
  if (offer.sourceMode === 'crawl-index') score -= 1
  return score
}

function normalizeSearchText(value) {
  return String(value || '')
    .replace(/[《》\s\-—_·:：,，.。!！?？、'"“”‘’]/g, '')
    .toLowerCase()
}

function groupRelevance(group, keyword) {
  const q = normalizeSearchText(keyword)
  if (!q) return 0
  const name = normalizeSearchText(group.name)
  const author = normalizeSearchText(group.author)
  const intro = normalizeSearchText(group.intro)
  let score = 0
  if (name === q) score += 1000
  else if (name.startsWith(q)) score += 600
  else if (name.includes(q)) score += 400
  if (author === q) score += 300
  else if (author.includes(q)) score += 150
  if (intro.includes(q)) score += 50
  if (name.includes(q)) score += Math.max(0, 40 - (name.length - q.length))
  return score
}

/**
 * 聚合多个书源的搜索结果，按“书名 + 作者”分组，按搜索相关性排序，
 * 同组内按来源质量排序。默认使用质量最高的来源；其余保留为备选。
 */
export function groupSearchResults(items, keyword = '') {
  const groups = new Map()
  for (const item of items || []) {
    for (const result of item.results || []) {
      const key = normalizeBookKey(result.name, result.author)
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: result.name,
          author: result.author,
          coverUrl: result.coverUrl,
          intro: result.intro,
          kind: result.kind,
          lastChapter: result.lastChapter,
          offers: [],
          offerKeys: new Set()
        })
      }
      const group = groups.get(key)
      const offerKey = (result.sourceId || item.source.id) + '|' + result.bookUrl
      if (group.offerKeys.has(offerKey)) continue
      group.offerKeys.add(offerKey)
      group.offers.push({
        ...result,
        sourceId: result.sourceId || item.source.id,
        sourceName: result.sourceName || item.source.name,
        sourceMode: item.source.searchMode || ''
      })
      if (!group.coverUrl && result.coverUrl) group.coverUrl = result.coverUrl
      if (!group.intro && result.intro) group.intro = result.intro
      if (!group.kind && result.kind) group.kind = result.kind
      if (!group.lastChapter && result.lastChapter) group.lastChapter = result.lastChapter
    }
  }
  const list = Array.from(groups.values())
  const order = new Map(list.map((group, index) => [group, index]))
  list.sort((a, b) => {
    const diff = groupRelevance(b, keyword) - groupRelevance(a, keyword)
    return diff !== 0 ? diff : order.get(a) - order.get(b)
  })
  for (const group of list) {
    group.offers.sort((a, b) => offerScore(b) - offerScore(a))
    delete group.offerKeys
    const primary = group.offers[0]
    if (primary) {
      group.coverUrl = group.coverUrl || primary.coverUrl || ''
      group.intro = group.intro || primary.intro || ''
      group.kind = group.kind || primary.kind || ''
      group.lastChapter = group.lastChapter || primary.lastChapter || ''
    }
  }
  return list
}

export function pickPrimaryOffer(group) {
  return group && group.offers && group.offers.length ? group.offers[0] : null
}
