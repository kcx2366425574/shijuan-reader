/**
 * 离线书籍缓存。
 *
 * - App：写入 _doc/shijuan-offline/*.json（plus.io 文件系统）
 * - H5：IndexedDB
 * - 其他/测试环境：内存或 uni storage
 *
 * 一本书存为一个对象：书籍信息 + 完整目录 + 已下载章节正文。
 * 内存中最多保留 2 本，正文查找用 Map。
 */

import { hashCode } from './source.js'

const INDEX_KEY = 'shijuan.offlineIndex.v1'
const FILE_DIR = 'shijuan-offline'
const DB_NAME = 'shijuan-offline'
const DB_STORE = 'books'
const memoryBooks = new Map()
const memoryIndex = new Map()
const MAX_MEMORY_BOOKS = 2
const UNI_MAX_BYTES = 2 * 1024 * 1024

const HAS_UNI = typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function'
const HAS_IDB = typeof indexedDB !== 'undefined'

let dbPromise = null

function readIndexArray() {
  try {
    if (HAS_UNI) {
      const raw = uni.getStorageSync(INDEX_KEY)
      const list = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
      return Array.isArray(list) ? list : []
    }
  } catch (e) {
    // ignore
  }
  return Array.from(memoryIndex.values())
}

function writeIndexArray(list) {
  try {
    if (HAS_UNI) uni.setStorageSync(INDEX_KEY, JSON.stringify(list))
    else {
      memoryIndex.clear()
      for (const item of list) memoryIndex.set(item.bookId, item)
    }
  } catch (e) {
    // ignore
  }
}

function indexMap() {
  return new Map(readIndexArray().map((item) => [item.bookId, item]))
}

function updateIndex(meta) {
  const map = indexMap()
  map.set(meta.bookId, meta)
  writeIndexArray(Array.from(map.values()))
}

function removeIndex(bookId) {
  const map = indexMap()
  map.delete(bookId)
  writeIndexArray(Array.from(map.values()))
}

export function loadOfflineIndex() {
  return readIndexArray()
}

export function getOfflineMeta(bookId) {
  return indexMap().get(bookId) || null
}

export function getOfflineStats() {
  const list = readIndexArray()
  return {
    count: list.length,
    completeCount: list.filter((item) => item.complete).length,
    size: list.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
  }
}

function fileName(bookId) {
  return 'book-' + hashCode(bookId) + '.json'
}

function plusRoot() {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL('_doc/', (root) => resolve(root), reject)
  })
}

function plusDir(create) {
  return plusRoot().then((root) => new Promise((resolve, reject) => {
    root.getDirectory(FILE_DIR, { create: !!create }, (dir) => resolve(dir), reject)
  }))
}

function plusWrite(bookId, text) {
  return plusDir(true).then((dir) => new Promise((resolve, reject) => {
    const name = fileName(bookId)
    dir.getFile(name, { create: true }, (entry) => {
      const createWriter = () => dir.getFile(name, { create: true }, (fresh) => {
        fresh.createWriter((writer) => {
          writer.onwrite = () => resolve()
          writer.onerror = reject
          writer.write(text)
        }, reject)
      }, reject)
      entry.remove(createWriter, createWriter)
    }, reject)
  }))
}

function plusRead(bookId) {
  return plusDir(false).then((dir) => new Promise((resolve, reject) => {
    dir.getFile(fileName(bookId), {}, (entry) => {
      entry.file((file) => {
        const reader = new plus.io.FileReader()
        reader.onloadend = (event) => resolve(event.target.result)
        reader.onerror = reject
        reader.readAsText(file, 'utf-8')
      }, reject)
    }, reject)
  }))
}

function plusDelete(bookId) {
  return plusDir(false).then((dir) => new Promise((resolve) => {
    dir.getFile(fileName(bookId), {}, (entry) => {
      entry.remove(() => resolve(), () => resolve())
    }, () => resolve())
  })).catch(() => {})
}

function openDb() {
  if (!HAS_IDB) return Promise.reject(new Error('IndexedDB 不可用'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'bookId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'))
  })
  return dbPromise
}

async function idbPut(data) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(data)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB 写入失败'))
  })
}

async function idbGet(bookId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const request = tx.objectStore(DB_STORE).get(bookId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('IndexedDB 读取失败'))
  })
}

async function idbDelete(bookId) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).delete(bookId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    // ignore
  }
}

function uniKey(bookId) {
  return 'shijuan.offline.book.' + bookId
}

function hasPlus() {
  return typeof plus !== 'undefined' && plus && plus.io
}

function preferredStorage() {
  if (hasPlus()) return 'plus'
  if (HAS_IDB) return 'idb'
  if (HAS_UNI) return 'uni'
  return 'memory'
}

async function writeByStorage(storage, data, text) {
  if (storage === 'plus') return plusWrite(data.bookId, text)
  if (storage === 'idb') return idbPut(data)
  if (storage === 'uni') {
    if (text.length > UNI_MAX_BYTES) throw new Error('书籍超过本地存储上限，请使用 App 版缓存')
    uni.setStorageSync(uniKey(data.bookId), text)
    return
  }
  memoryBooks.set(data.bookId, data)
}

async function readByStorage(storage, bookId) {
  if (storage === 'plus') {
    const text = await plusRead(bookId)
    return JSON.parse(text)
  }
  if (storage === 'idb') return idbGet(bookId)
  if (storage === 'uni') {
    const raw = uni.getStorageSync(uniKey(bookId))
    return raw ? JSON.parse(raw) : null
  }
  return memoryBooks.get(bookId) || null
}

function makePayload(input) {
  return {
    bookId: input.bookId,
    sourceId: input.sourceId || '',
    sourceName: input.sourceName || '',
    info: input.info || {},
    bookUrl: input.bookUrl || '',
    tocUrl: input.tocUrl || '',
    chapters: input.chapters || [],
    contents: input.contents || [],
    complete: input.complete === true,
    chapterCount: Number(input.chapterCount) || (input.chapters || []).length,
    cachedChapters: Number(input.cachedChapters) || (input.contents || []).length,
    size: Number(input.size) || 0,
    updatedAt: Date.now()
  }
}

function attachMemory(payload) {
  payload.__contentMap = new Map((payload.contents || []).map((item) => [item.url, item]))
  memoryBooks.set(payload.bookId, payload)
  while (memoryBooks.size > MAX_MEMORY_BOOKS) {
    const first = memoryBooks.keys().next().value
    memoryBooks.delete(first)
  }
  return payload
}

export async function saveOfflineBook(input) {
  const payload = makePayload(input)
  let text = JSON.stringify(payload)
  payload.size = text.length
  text = JSON.stringify(payload)
  const storage = preferredStorage()
  try {
    await writeByStorage(storage, payload, text)
  } catch (e) {
    if (storage !== 'uni' && HAS_UNI && text.length <= UNI_MAX_BYTES) {
      await writeByStorage('uni', payload, text)
      payload.storage = 'uni'
    } else {
      throw e
    }
  }
  if (!payload.storage) payload.storage = storage
  attachMemory(payload)
  updateIndex({
    bookId: payload.bookId,
    name: (payload.info && payload.info.name) || '',
    author: (payload.info && payload.info.author) || '',
    coverUrl: (payload.info && payload.info.coverUrl) || '',
    sourceName: payload.sourceName,
    chapterCount: payload.chapterCount,
    cachedChapters: payload.cachedChapters,
    complete: payload.complete,
    size: payload.size,
    storage: payload.storage,
    updatedAt: payload.updatedAt
  })
  return payload
}

export async function getOfflineBook(bookId) {
  if (!bookId) return null
  const cached = memoryBooks.get(bookId)
  if (cached) {
    if (!cached.__contentMap) cached.__contentMap = new Map((cached.contents || []).map((item) => [item.url, item]))
    return cached
  }
  const meta = getOfflineMeta(bookId)
  const storages = [meta && meta.storage, 'plus', 'idb', 'uni', 'memory'].filter(Boolean)
  for (const storage of Array.from(new Set(storages))) {
    if (storage === 'plus' && !hasPlus()) continue
    if (storage === 'idb' && !HAS_IDB) continue
    if (storage === 'uni' && !HAS_UNI) continue
    try {
      const data = await readByStorage(storage, bookId)
      if (data && data.bookId) {
        data.storage = storage
        return attachMemory(data)
      }
    } catch (e) {
      // 尝试下一个存储
    }
  }
  return null
}

export async function getOfflineChapter(bookId, chapterUrl) {
  const book = await getOfflineBook(bookId)
  if (!book) return null
  if (!book.__contentMap) book.__contentMap = new Map((book.contents || []).map((item) => [item.url, item]))
  return book.__contentMap.get(chapterUrl) || null
}

/* ------------------------------------------------------------------ *
 * 增量追加章节（在线阅读时自动缓存）
 *
 * saveOfflineBook 是全量重写，不能每读一章就无脑写一次。这里提供
 * 批量、按 url 去重的纯函数 + 串行化写入 API，调用方只需在 1~2 秒
 * 防抖窗口结束后提交一次。
 * ------------------------------------------------------------------ */

/** 从离线书的 contents 构造已缓存 URL 集合，供目录同步渲染标记。 */
export function buildCachedUrlSet(contents) {
  const set = new Set()
  for (const item of Array.isArray(contents) ? contents : []) {
    if (item && item.url) set.add(item.url)
  }
  return set
}

/**
 * 纯函数：把若干章节增量并入离线书 payload。
 * 不修改入参；按 url 去重（同 url 覆盖）；无离线书时新建一条 complete:false 的记录。
 */
export function buildOfflinePayloadWithChapters(existing, input) {
  const base = input || {}
  const chapters = Array.isArray(existing && existing.chapters) && existing.chapters.length
    ? existing.chapters
    : (Array.isArray(base.chapters) ? base.chapters : [])
  const contents = Array.isArray(existing && existing.contents) ? existing.contents.slice() : []
  const byUrl = new Map(contents.map((item) => [item && item.url, item]).filter(([url]) => !!url))
  let changed = false
  for (const entry of Array.isArray(base.entries) ? base.entries : []) {
    const chapter = (entry && entry.chapter) || {}
    const url = String(chapter.url || '')
    const content = String((entry && entry.content) || '')
    if (!url || !content) continue
    const record = {
      url,
      title: String((entry && entry.title) || chapter.name || ''),
      name: String(chapter.name || ''),
      content
    }
    if (byUrl.has(url)) {
      const index = contents.findIndex((item) => item && item.url === url)
      if (index >= 0) contents[index] = record
      else contents.push(record)
    } else {
      contents.push(record)
      byUrl.set(url, record)
    }
    changed = true
  }
  if (!changed) return null
  return {
    bookId: base.bookId,
    sourceId: (existing && existing.sourceId) || base.sourceId || '',
    sourceName: (existing && existing.sourceName) || base.sourceName || '',
    info: (existing && existing.info) || base.info || {},
    bookUrl: (existing && existing.bookUrl) || base.bookUrl || '',
    tocUrl: (existing && existing.tocUrl) || base.tocUrl || '',
    chapters,
    contents,
    // 新书只缓存了零星章节，不能标记为全书完成，避免书架误显示“已缓存全书”。
    complete: existing ? existing.complete === true : false,
    chapterCount: (existing && (Number(existing.chapterCount) || chapters.length)) || chapters.length,
    cachedChapters: contents.length,
    size: Number(existing && existing.size) || 0
  }
}

const appendQueues = new Map()

/**
 * 批量追加章节。同一 bookId 的调用串行执行，避免“读取-合并-写入”竞态丢章。
 * 已在离线缓存中的 url 会跳过；全部命中时不做任何写入。
 * @returns {Promise<object|null>} 写入后的 payload，无需写入时返回 null
 */
export async function appendOfflineChapters(input) {
  const base = input || {}
  const bookId = String(base.bookId || '')
  if (!bookId || !Array.isArray(base.entries) || !base.entries.length) return null
  const previous = appendQueues.get(bookId) || Promise.resolve(null)
  const task = previous.then(() => doAppendOfflineChapters(base), () => doAppendOfflineChapters(base))
  appendQueues.set(bookId, task)
  const done = () => { if (appendQueues.get(bookId) === task) appendQueues.delete(bookId) }
  task.then(done, done)
  return task
}

async function doAppendOfflineChapters(base) {
  const existing = await getOfflineBook(base.bookId)
  const cached = buildCachedUrlSet(existing && existing.contents)
  const fresh = (base.entries || []).filter((entry) => {
    const chapter = (entry && entry.chapter) || {}
    const url = String(chapter.url || '')
    return url && String((entry && entry.content) || '') && !cached.has(url)
  })
  if (!fresh.length) return null
  const payload = buildOfflinePayloadWithChapters(existing, { ...base, entries: fresh })
  if (!payload) return null
  try {
    return await saveOfflineBook(payload)
  } catch (e) {
    // 自动缓存失败不能影响在线阅读；保留错误供调用方决定是否提示
    throw e
  }
}

/** 单章便捷入口，复用批量 API。 */
export function appendOfflineChapter(base, entry) {
  return appendOfflineChapters({ ...(base || {}), entries: [entry] })
}

export async function removeOfflineBook(bookId) {
  const meta = getOfflineMeta(bookId)
  memoryBooks.delete(bookId)
  removeIndex(bookId)
  const storages = [meta && meta.storage, 'plus', 'idb', 'uni'].filter(Boolean)
  for (const storage of Array.from(new Set(storages))) {
    if (storage === 'plus' && hasPlus()) await plusDelete(bookId)
    else if (storage === 'idb' && HAS_IDB) await idbDelete(bookId)
    else if (storage === 'uni' && HAS_UNI) {
      try { uni.removeStorageSync(uniKey(bookId)) } catch (e) { /* ignore */ }
    }
  }
}

export async function clearOfflineBooks() {
  const list = readIndexArray()
  for (const item of list) await removeOfflineBook(item.bookId)
  memoryBooks.clear()
  writeIndexArray([])
}

export function __resetOfflineMemory() {
  memoryBooks.clear()
  memoryIndex.clear()
}
