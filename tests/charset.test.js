import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decodeGBK,
  encodeGBK,
  decodeUTF8,
  detectCharset,
  decodeResponse,
  percentEncode,
  encodeForCharset,
  decodeBase64,
  decodeBase64UTF8
} from '../src/core/charset.js'

test('GBK 解码：万相之王', () => {
  const bytes = Uint8Array.from([0xcd, 0xf2, 0xcf, 0xe0, 0xd6, 0xae, 0xcd, 0xf5])
  assert.equal(decodeGBK(bytes), '万相之王')
})

test('GBK 编码与解码往返', () => {
  const text = '大奉打更人，第1838章 大结局！'
  const bytes = encodeGBK(text)
  assert.equal(decodeGBK(bytes), text)
})

test('GBK 混合 ASCII 与非法字节', () => {
  const bytes = Uint8Array.from([0x41, 0x42, 0xcd, 0xf2, 0x20, 0xff, 0x43])
  assert.equal(decodeGBK(bytes), 'AB万 �C')
})

test('UTF-8 解码与替换非法序列', () => {
  const text = '你好，世界 🌏'
  const bytes = new TextEncoder().encode(text)
  assert.equal(decodeUTF8(bytes), text)
  assert.equal(decodeUTF8(Uint8Array.from([0xe4, 0xbd, 0xa0, 0xff, 0x41])), '你�A')
})

test('编码检测：BOM、header 与 meta', () => {
  const gbkMeta = new TextEncoder().encode('<html><head><meta charset="gbk"></head><body>中文</body></html>')
  assert.equal(detectCharset(gbkMeta, 'text/html'), 'gbk')

  const header = new TextEncoder().encode('<html></html>')
  assert.equal(detectCharset(header, 'text/html; charset=GB2312'), 'gbk')
  assert.equal(detectCharset(header, 'text/html; charset=utf-8'), 'utf-8')

  const bom = Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])
  assert.equal(detectCharset(bom, ''), 'utf-8')

  assert.equal(detectCharset(header, '', 'gbk'), 'gbk')
})

test('decodeResponse 自动识别 GBK 页面', () => {
  // “中文”的 GBK 字节：D6 D0 CE C4
  const html = Uint8Array.from([
    0x3c, 0x6d, 0x65, 0x74, 0x61, 0x20, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x3d, 0x22, 0x67, 0x62, 0x6b, 0x22, 0x3e,
    0xd6, 0xd0, 0xce, 0xc4
  ])
  const result = decodeResponse(html, 'text/html')
  assert.equal(result.charset, 'gbk')
  assert.equal(result.text, '<meta charset="gbk">中文')
})

test('GBK 搜索词百分号编码', () => {
  assert.equal(percentEncode('万相之王', 'gbk'), '%CD%F2%CF%E0%D6%AE%CD%F5')
  assert.equal(encodeForCharset('万相之王', 'gbk'), '%CD%F2%CF%E0%D6%AE%CD%F5')
  assert.equal(encodeForCharset('万相 之王', 'gbk'), '%CD%F2%CF%E0%20%D6%AE%CD%F5')
})


test('Base64 解码：中文 HTML 片段', () => {
  const encoded = 'PHA+5paX56C06IuN56m55LmL5peg5LiK5beF5bOwPC9wPg=='
  assert.equal(decodeBase64UTF8(encoded), '<p>斗破苍穹之无上巅峰</p>')
  assert.equal(decodeBase64(encoded).length > 0, true)
  assert.equal(decodeBase64UTF8(''), '')
})
