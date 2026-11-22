import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  clearHttpCache,
  extractWafToken,
  parseWafChallenge,
  solveWafChallenge,
  fetchText,
  getChapterContent,
  RequestError
} from '../src/core/service.js'

/**
 * 2026-11-22 真实联网抓取：GET https://www.jurewx.com/s/?keyword=test
 * 返回 HTTP 503，正文如下（旧式 waf_challenge 挑战页）。
 * 关键点：token 直接写在 document.cookie 字符串里，且页面后面还有
 * document.cookie.indexOf('waf_challenge=') 判断，旧的提取正则会误命中。
 */
const REAL_LEGACY_CHALLENGE = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Verifying...</title></head><body style="font:15px sans-serif;text-align:center;padding-top:30vh;color:#666"><p id=m>Verifying your browser...</p><script>(function(){var m=document.getElementById('m'),s,n=0;try{s=sessionStorage;n=+(s.getItem('waf_reload_count')||0)}catch(e){}if(n>=5){try{s.removeItem('waf_reload_count')}catch(e){}m.textContent='Verification failed, please try again later.';return}document.cookie='waf_challenge=AAAAAGsDFT4dgpZUgD9nQ7Zx5NcIQOARacITzC76U6lmrLommqkvctOJi3ynHCvaK7m3iyPSxz8BA3_itjWgpAvGdXIPLPo2Gve3TFcT8JdPMDCWPkDXjW8; max-age=300; path=/; SameSite=Lax; domain=jurewx.com';if(document.cookie.indexOf('waf_challenge=')<0){m.textContent='Please allow cookies for this site.';return}try{s.setItem('waf_reload_count',n+1)}catch(e){}location.reload()})()</script></body></html>`

const REAL_TOKEN = 'AAAAAGsDFT4dgpZUgD9nQ7Zx5NcIQOARacITzC76U6lmrLommqkvctOJi3ynHCvaK7m3iyPSxz8BA3_itjWgpAvGdXIPLPo2Gve3TFcT8JdPMDCWPkDXjW8'

/** 按 waf_v2 通用骨架构造的挑战页：c 为迭代次数，t 为种子。 */
function makeV2ChainChallenge(algorithm, count, seed) {
  return `<!doctype html><html><body><p>Verifying...</p><script>var c=${count};var t='${seed}';function h(x){return ${algorithm}(x)}document.cookie='waf_v2='+h(t);location.reload()</script></body></html>`
}

function chainedHash(algorithm, seed, count) {
  let value = seed
  for (let i = 0; i < count; i++) value = crypto.createHash(algorithm).update(value, 'utf8').digest('hex')
  return value
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}

test('真实 503 样本：token 从 document.cookie 提取而非 indexOf 判断', () => {
  assert.equal(extractWafToken(REAL_LEGACY_CHALLENGE), REAL_TOKEN)
  const parsed = parseWafChallenge(REAL_LEGACY_CHALLENGE)
  assert.equal(parsed.type, 'legacy')
  assert.equal(parsed.token, REAL_TOKEN)
  assert.equal(extractWafToken('<html>普通页面</html>'), '')
})

test('兼容旧式 var token / waf_challenge=\'token\' 挑战', async () => {
  const old = `<script>var token='AAAA-test-token';document.cookie='waf_challenge='+token;</script>`
  assert.equal(extractWafToken(old), 'AAAA-test-token')
  const solved = await solveWafChallenge(old)
  assert.deepEqual(solved.cookies, ['waf_challenge=AAAA-test-token'])
})

test('waf_v2 哈希链求解：md5 / sha1 / sha256 均与标准实现一致', async () => {
  for (const [algorithm, marker] of [['md5', 'md5'], ['sha1', 'sha-1'], ['sha256', 'sha-256']]) {
    const html = makeV2ChainChallenge(marker, 131, 'seed-abc')
    const parsed = parseWafChallenge(html)
    assert.equal(parsed.type, 'v2', algorithm)
    assert.equal(parsed.count, 131, algorithm)
    assert.equal(parsed.seed, 'seed-abc', algorithm)
    const solved = await solveWafChallenge(html)
    assert.equal(solved.name, 'waf_v2', algorithm)
    assert.equal(solved.value, chainedHash(algorithm, 'seed-abc', 131), algorithm)
    assert.deepEqual(solved.cookies, ['waf_v2=' + chainedHash(algorithm, 'seed-abc', 131)])
  }
})

test('waf_v2 哈希现金求解：找到满足前导零的 nonce', async () => {
  const html = `<script>var c='challenge-seed';var d=2;function h(x){return sha256(x)}document.cookie='waf_v2='+h(c);</script>`
  const solved = await solveWafChallenge(html)
  const [hash, nonce] = String(solved.value).split('.')
  assert.ok(hash && nonce !== undefined, '应返回 hash.nonce')
  assert.ok(hash.startsWith('00'), '哈希前 2 位应为零')
  assert.equal(hash, crypto.createHash('sha256').update('challenge-seed' + nonce).digest('hex'))
})

test('waf_v2 挑战页若直接携带答案，无需重复计算', async () => {
  const html = `<script>var waf_v2='1';document.cookie='waf_v2=READY-TOKEN; max-age=300; path=/';</script>`
  const solved = await solveWafChallenge(html)
  assert.equal(solved.value, 'READY-TOKEN')
})

test('fetchText：真实 503 样本提取旧式 cookie 并重试成功', async () => {
  clearHttpCache()
  const url = 'https://www.jurewx.com/s/?keyword=test'
  const seenCookies = []
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = async (target, init) => {
    requestCount++
    const cookie = (init.headers && (init.headers.Cookie || init.headers.cookie)) || ''
    seenCookies.push(cookie)
    if (requestCount === 1) return htmlResponse(REAL_LEGACY_CHALLENGE, 503)
    return htmlResponse('<html><body><h1>搜索结果</h1></body></html>')
  }
  try {
    const result = await fetchText(url, { cache: false })
    assert.equal(result.status, 200)
    assert.equal(requestCount, 2)
    assert.equal(seenCookies[0], '')
    assert.equal(seenCookies[1], 'waf_challenge=' + REAL_TOKEN)
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})

test('fetchText：识别 waf_v2 挑战并自动求解、带 cookie 重试', async () => {
  clearHttpCache()
  const url = 'https://www.jurewx.com/chapter/1.html'
  const challenge = makeV2ChainChallenge('sha-256', 5, 'pow-seed')
  const expected = 'waf_v2=' + chainedHash('sha256', 'pow-seed', 5)
  const seenCookies = []
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = async (target, init) => {
    requestCount++
    seenCookies.push((init.headers && (init.headers.Cookie || init.headers.cookie)) || '')
    if (requestCount === 1) return htmlResponse(challenge, 503)
    return htmlResponse('<html><body><h1>正文内容</h1></body></html>')
  }
  try {
    const result = await fetchText(url, { cache: false })
    assert.equal(result.status, 200)
    assert.equal(requestCount, 2)
    assert.equal(seenCookies[0], '')
    assert.equal(seenCookies[1], expected)
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})

test('waf cookie 按域名缓存：同一站点后续请求不再重新解挑战', async () => {
  clearHttpCache()
  const challenge = makeV2ChainChallenge('sha-256', 3, 'cached-seed')
  const expected = 'waf_challenge=' + REAL_TOKEN + '; waf_v2=' + chainedHash('sha256', 'cached-seed', 3)
  const originalFetch = globalThis.fetch
  const seenCookies = []
  globalThis.fetch = async (target, init) => {
    seenCookies.push((init.headers && (init.headers.Cookie || init.headers.cookie)) || '')
    if (seenCookies.length === 1) return htmlResponse(REAL_LEGACY_CHALLENGE, 503)
    if (seenCookies.length === 2) return htmlResponse(challenge, 503)
    return htmlResponse('<html><body><h1>正文</h1></body></html>')
  }
  try {
    await fetchText('https://www.jurewx.com/a.html', { cache: false })
    await fetchText('https://www.jurewx.com/b.html', { cache: false })
    assert.equal(seenCookies.length, 4, '两次请求各需一次带缓存 cookie 的重试')
    assert.equal(seenCookies[1], 'waf_challenge=' + REAL_TOKEN)
    assert.equal(seenCookies[2], expected, '第二次挑战后两个 cookie 合并')
    assert.equal(seenCookies[3], expected, '第二次 fetchText 直接用缓存 cookie')
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})

test('整本缓存链路：getChapterContent 的章节请求经过 WAF 自动重试', async () => {
  clearHttpCache()
  const source = { url: 'https://www.jurewx.com', name: '聚热文学', ruleContent: { content: '#content' } }
  const challenge = makeV2ChainChallenge('sha-256', 2, 'download-seed')
  const originalFetch = globalThis.fetch
  const seenCookies = []
  globalThis.fetch = async (target, init) => {
    seenCookies.push((init.headers && (init.headers.Cookie || init.headers.cookie)) || '')
    if (seenCookies.length === 1) return htmlResponse(challenge, 503)
    return htmlResponse('<html><body><div id="content">缓存正文测试内容</div></body></html>')
  }
  try {
    // download.js 的 fetchChapter 默认就是 getChapterContent，故该路径即整本缓存路径
    const result = await getChapterContent(source, { name: '第1章', url: 'https://www.jurewx.com/chapter/waf.html' })
    assert.ok(result.content.includes('缓存正文测试内容'))
    assert.equal(seenCookies.length, 2)
    assert.equal(seenCookies[0], '')
    assert.ok(seenCookies[1].startsWith('waf_v2='))
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})

test('解不出挑战时不静默死循环：抛出可读 RequestError 且限制重试次数', async () => {
  clearHttpCache()
  const url = 'https://www.jurewx.com/locked.html'
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount++
    return htmlResponse('<html><body>Service Unavailable</body></html>', 503)
  }
  try {
    await assert.rejects(
      () => fetchText(url, { cache: false }),
      (error) => {
        assert.ok(error instanceof RequestError)
        assert.equal(error.status, 503)
        assert.match(error.message, /HTTP 503/)
        return true
      }
    )
    assert.equal(requestCount, 1, '无挑战不应重试')
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})

test('挑战反复出现时最多重试两次并给出明确错误', async () => {
  clearHttpCache()
  const url = 'https://www.jurewx.com/loop.html'
  const challenge = makeV2ChainChallenge('sha-256', 2, 'loop-seed')
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount++
    return htmlResponse(challenge, 503)
  }
  try {
    await assert.rejects(
      () => fetchText(url, { cache: false }),
      (error) => {
        assert.ok(error instanceof RequestError)
        assert.match(error.message, /WAF 挑战求解失败.*2 次.*503/)
        return true
      }
    )
    assert.equal(requestCount, 3, '初次请求 + 2 次重试')
  } finally {
    globalThis.fetch = originalFetch
    clearHttpCache()
  }
})
