/**
 * 书籍详情与目录的内存缓存，避免详情页与阅读器之间重复请求。
 * 不写入持久化存储，控制占用量。
 */

const MAX_BOOKS = 6
const cache = new Map()

export function cacheBook(bookId, data) {
  if (!bookId) return
  if (cache.has(bookId)) cache.delete(bookId)
  cache.set(bookId, { ...data, cachedAt: Date.now() })
  while (cache.size > MAX_BOOKS) {
    const first = cache.keys().next().value
    cache.delete(first)
  }
}

export function getCachedBook(bookId) {
  return cache.get(bookId) || null
}

export function removeCachedBook(bookId) {
  cache.delete(bookId)
}

export function clearBookCache() {
  cache.clear()
}
