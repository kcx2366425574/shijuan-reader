/**
 * H5 开发环境代理。
 *
 * 浏览器直连小说站会被 CORS 拦截；开发 H5 时把请求转发到 /__proxy，
 * 由 Vite 的 Node 进程代发。App 端不会使用这个代理。
 */

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const MAX_BODY = 5 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function devProxyPlugin() {
  return {
    name: 'shijuan-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const target = requestUrl.searchParams.get('url')
        if (!target || !/^https?:\/\//i.test(target)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: '缺少有效的 url 参数' }))
          return
        }

        const referer = requestUrl.searchParams.get('referer') || target
        const headers = {
          'User-Agent': DEFAULT_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: referer
        }
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']
        const method = String(req.method || 'GET').toUpperCase()
        const body = (method === 'GET' || method === 'HEAD') ? undefined : await readBody(req)

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30000)
        try {
          const upstream = await fetch(target, {
            method,
            headers,
            body,
            redirect: 'follow',
            signal: controller.signal
          })
          const buffer = Buffer.from(await upstream.arrayBuffer())
          res.statusCode = upstream.status
          for (const [key, value] of upstream.headers.entries()) {
            const lower = key.toLowerCase()
            if (['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(lower)) continue
            try {
              res.setHeader(key, value)
            } catch (e) {
              // 忽略不合法的响应头
            }
          }
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(buffer)
        } catch (e) {
          const message = e && e.name === 'AbortError' ? '上游请求超时' : (e && e.message) || '代理请求失败'
          server.config.logger.warn('[dev-proxy] ' + target + ' -> ' + message)
          if (!res.headersSent) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          res.end(JSON.stringify({ error: message }))
        } finally {
          clearTimeout(timer)
        }
      })
    }
  }
}
