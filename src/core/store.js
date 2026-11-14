/**
 * 本地数据层：书源、书架、阅读进度、阅读设置与搜索历史。
 * 使用 uni storage 持久化；Node 测试环境退化为内存 Map。
 */

import { cloneBuiltinSources, BUILTIN_CONFIG_VERSION } from './builtin-sources.js'
import { hashCode, normalizeSource } from './source.js'

const HAS_UNI = typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function'
const memory = new Map()

export const KEYS = {
  SOURCES: 'shijuan.sources.v1',
  DELETED_BUILTINS: 'shijuan.deletedBuiltins.v1',
  SHELF: 'shijuan.shelf.v1',
  SETTINGS: 'shijuan.settings.v1',
  SEARCH_HISTORY: 'shijuan.searchHistory.v1',
  SEEDED: 'shijuan.seeded.v1',
  BUILTIN_VERSION: 'shijuan.builtinVersion.v1',
  PROGRESS: 'shijuan.progress.v1'
}

const DEFAULT_SETTINGS = {
  theme: 'paper',
  fontSize: 19,
  lineHeight: 1.9,
  fontFamily: 'serif',
  autoNext: false,
  keepScreenOn: true,
  searchConcurrency: 3,
  autoCheckUpdate: true,
  updateProvider: '',
  updateRepo: '',
  updateManifestUrl: '',
  sourceRepoAutoSync: true,
  sourceRepoProvider: '',
  sourceRepoRepo: '',
  sourceRepoBranch: 'main',
  sourceRepoManifestUrl: ''
}

function clone(value) {
  if (value === undefined) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    return value
  }
}

function readJson(key, fallback) {
  try {
    if (HAS_UNI) {
      const raw = uni.getStorageSync(key)
      if (raw === '' || raw === null || raw === undefined) return clone(fallback)
      return typeof raw === 'string' ? JSON.parse(raw) : clone(raw)
    }
    return memory.has(key) ? clone(memory.get(key)) : clone(fallback)
  } catch (e) {
    return clone(fallback)
  }
}

function writeJson(key, value) {
  try {
    if (HAS_UNI) {
      uni.setStorageSync(key, JSON.stringify(value))
    } else {
      memory.set(key, clone(value))
    }
    return true
  } catch (e) {
    return false
  }
}

function removeKey(key) {
  try {
    if (HAS_UNI) uni.removeStorageSync(key)
    else memory.delete(key)
  } catch (e) {
    // ignore
  }
}

export function __resetMemoryStorage() {
  memory.clear()
}

// ---------------------------------------------------------------- 书源

function builtinSource(source) {
  const normalized = normalizeSource({ ...source, builtin: true, enabled: source.enabled !== false })
  normalized.id = source.id
  normalized.builtin = true
  normalized.enabled = source.enabled !== false
  return normalized
}

function sourceFingerprint(source) {
  const url = String((source && source.url) || '').trim().toLowerCase().replace(/\/+$/, '')
  const name = String((source && source.name) || '').trim().toLowerCase()
  return url + '|' + name
}

function dedupeSourceList(list) {
  const map = new Map()
  for (const source of list || []) {
    const key = sourceFingerprint(source)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, source)
      continue
    }
    const preferred = (!existing.builtin && source.builtin) || (!existing.fromRepo && source.fromRepo) ? source : existing
    map.set(key, {
      ...preferred,
      enabled: existing.enabled !== false || source.enabled !== false,
      userModified: existing.userModified === true || source.userModified === true
    })
  }
  return Array.from(map.values())
}

export function loadSources() {
  const sources = readJson(KEYS.SOURCES, [])
  return Array.isArray(sources) ? sources : []
}

export function saveSources(sources) {
  return writeJson(KEYS.SOURCES, Array.isArray(sources) ? sources : [])
}

/**
 * 首次启动写入内置书源；后续启动只补齐被删除过的内置源（尊重用户删除）。
 */
export function ensureSources() {
  const seeded = readJson(KEYS.SEEDED, false)
  const storedVersion = Number(readJson(KEYS.BUILTIN_VERSION, 0)) || 0
  const deleted = readJson(KEYS.DELETED_BUILTINS, [])
  const deletedSet = new Set(Array.isArray(deleted) ? deleted : [])
  const existingList = loadSources()
  const deduped = dedupeSourceList(existingList)
  let changed = deduped.length !== existingList.length
  const map = new Map(deduped.map((source) => [source.id, source]))
  const needsUpgrade = seeded && storedVersion < BUILTIN_CONFIG_VERSION

  for (const builtin of cloneBuiltinSources()) {
    const existing = map.get(builtin.id)
    if (!existing) {
      if (deletedSet.has(builtin.id)) continue
      const fresh = builtinSource(builtin)
      fresh.builtinConfigVersion = BUILTIN_CONFIG_VERSION
      map.set(fresh.id, fresh)
      changed = true
      continue
    }
    if (needsUpgrade && existing.builtin && !existing.userModified) {
      const fresh = builtinSource(builtin)
      fresh.builtinConfigVersion = BUILTIN_CONFIG_VERSION
      fresh.enabled = existing.enabled !== false
      fresh.userModified = false
      map.set(fresh.id, fresh)
      changed = true
    }
  }

  if (!seeded || storedVersion !== BUILTIN_CONFIG_VERSION) {
    writeJson(KEYS.SEEDED, true)
    writeJson(KEYS.BUILTIN_VERSION, BUILTIN_CONFIG_VERSION)
    changed = true
  }

  const sources = Array.from(map.values())
  if (changed) saveSources(sources)
  return sources
}

export function addSources(incoming) {
  const sources = loadSources()
  const map = new Map(sources.map((item) => [item.id, item]))
  const byFingerprint = new Map(sources.map((item) => [sourceFingerprint(item), item]))
  for (const source of incoming || []) {
    if (!source || !source.id) continue
    if (map.has(source.id)) {
      map.set(source.id, source)
      byFingerprint.set(sourceFingerprint(source), source)
      continue
    }
    const fingerprint = sourceFingerprint(source)
    const duplicate = byFingerprint.get(fingerprint)
    if (duplicate) {
      const merged = {
        ...source,
        id: duplicate.id,
        enabled: duplicate.enabled !== false,
        builtin: duplicate.builtin === true,
        userModified: duplicate.userModified === true || source.userModified === true
      }
      map.set(duplicate.id, merged)
      byFingerprint.set(fingerprint, merged)
      continue
    }
    map.set(source.id, source)
    byFingerprint.set(fingerprint, source)
  }
  const result = Array.from(map.values())
  saveSources(result)
  return result
}

export function updateSource(id, patch) {
  const sources = loadSources()
  const index = sources.findIndex((item) => item.id === id)
  if (index === -1) return null
  sources[index] = { ...sources[index], ...patch }
  saveSources(sources)
  return sources[index]
}

export function toggleSource(id, enabled) {
  return updateSource(id, { enabled: !!enabled })
}

export function deleteSource(id) {
  const sources = loadSources()
  const target = sources.find((item) => item.id === id)
  if (target && target.builtin) {
    const deleted = readJson(KEYS.DELETED_BUILTINS, [])
    const set = new Set(Array.isArray(deleted) ? deleted : [])
    set.add(id)
    writeJson(KEYS.DELETED_BUILTINS, Array.from(set))
  }
  const result = sources.filter((item) => item.id !== id)
  saveSources(result)
  return result
}

export function restoreBuiltinSources() {
  writeJson(KEYS.DELETED_BUILTINS, [])
  const sources = loadSources()
  const map = new Map(sources.map((item) => [item.id, item]))
  for (const builtin of cloneBuiltinSources()) {
    const fresh = builtinSource(builtin)
    const old = map.get(fresh.id)
    if (old) fresh.enabled = old.enabled !== false
    map.set(fresh.id, fresh)
  }
  const result = Array.from(map.values())
  saveSources(result)
  writeJson(KEYS.SEEDED, true)
  writeJson(KEYS.BUILTIN_VERSION, BUILTIN_CONFIG_VERSION)
  return result
}

// ---------------------------------------------------------------- 书架

export function makeBookId(sourceId, bookUrl) {
  return 'b-' + hashCode(String(sourceId) + '|' + String(bookUrl))
}

export function loadShelf() {
  const shelf = readJson(KEYS.SHELF, [])
  const progressMap = readJson(KEYS.PROGRESS, {})
  if (!Array.isArray(shelf)) return []
  return shelf.map((book) => {
    const progress = progressMap && progressMap[book.id]
    if (!progress) return book
    return {
      ...book,
      progress,
      lastReadAt: Math.max(book.lastReadAt || 0, progress.updatedAt || 0)
    }
  })
}

export function saveShelf(shelf) {
  return writeJson(KEYS.SHELF, Array.isArray(shelf) ? shelf : [])
}

export function getShelfBook(id) {
  return loadShelf().find((book) => book.id === id) || null
}

/**
 * 加入/更新书架。已有书籍会保留阅读进度与加入时间。
 */
export function upsertShelfBook(book) {
  const shelf = loadShelf()
  const sourceId = book.sourceId || ''
  const bookUrl = book.bookUrl || ''
  const id = book.id || makeBookId(sourceId, bookUrl)
  const index = shelf.findIndex((item) => item.id === id || (item.sourceId === sourceId && item.bookUrl === bookUrl))
  const now = Date.now()
  const incoming = {
    id,
    sourceId,
    sourceName: book.sourceName || '',
    sourceUrl: book.sourceUrl || '',
    name: book.name || '未知书名',
    author: book.author || '',
    coverUrl: book.coverUrl || '',
    intro: book.intro || '',
    kind: book.kind || '',
    status: book.status || '',
    lastChapter: book.lastChapter || '',
    bookUrl,
    tocUrl: book.tocUrl || '',
    chapterCount: Number(book.chapterCount) || 0,
    addedAt: book.addedAt || now,
    lastReadAt: book.lastReadAt || 0,
    progress: book.progress || null
  }
  if (index === -1) {
    shelf.unshift(incoming)
  } else {
    const old = shelf[index]
    shelf[index] = {
      ...incoming,
      addedAt: old.addedAt || incoming.addedAt,
      lastReadAt: old.lastReadAt || incoming.lastReadAt,
      progress: old.progress || incoming.progress || null,
      coverUrl: incoming.coverUrl || old.coverUrl,
      intro: incoming.intro || old.intro,
      chapterCount: incoming.chapterCount || old.chapterCount || 0
    }
  }
  saveShelf(shelf)
  return index === -1 ? incoming : shelf[index]
}

export function updateShelfBook(id, patch) {
  const shelf = loadShelf()
  const index = shelf.findIndex((book) => book.id === id)
  if (index === -1) return null
  shelf[index] = { ...shelf[index], ...(patch || {}) }
  saveShelf(shelf)
  return shelf[index]
}

export function removeShelfBook(id) {
  const result = loadShelf().filter((book) => book.id !== id)
  saveShelf(result)
  const progressMap = readJson(KEYS.PROGRESS, {})
  if (progressMap && progressMap[id]) {
    delete progressMap[id]
    writeJson(KEYS.PROGRESS, progressMap)
  }
  return result
}

export function updateBookProgress(id, progress) {
  if (!id) return null
  const progressMap = readJson(KEYS.PROGRESS, {}) || {}
  progressMap[id] = {
    ...(progress || {}),
    updatedAt: (progress && progress.updatedAt) || Date.now()
  }
  writeJson(KEYS.PROGRESS, progressMap)
  return loadShelf().find((book) => book.id === id) || null
}

export function getContinueReading() {
  const shelf = loadShelf()
  return shelf
    .filter((book) => book.progress && book.progress.chapterIndex !== undefined)
    .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0] || null
}

// ---------------------------------------------------------------- 设置

export function loadSettings() {
  const stored = readJson(KEYS.SETTINGS, {})
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored && typeof stored === 'object' ? stored : {})
  settings.fontSize = Math.max(14, Math.min(32, Number(settings.fontSize) || 19))
  settings.lineHeight = Math.max(1.4, Math.min(2.6, Number(settings.lineHeight) || 1.9))
  settings.searchConcurrency = Math.max(1, Math.min(6, Number(settings.searchConcurrency) || 3))
  if (!['paper', 'green', 'night', 'gray'].includes(settings.theme)) settings.theme = 'paper'
  if (!['serif', 'sans'].includes(settings.fontFamily)) settings.fontFamily = 'serif'
  return settings
}

export function saveSettings(patch) {
  const settings = Object.assign({}, loadSettings(), patch || {})
  settings.fontSize = Math.max(14, Math.min(32, Number(settings.fontSize) || 19))
  settings.lineHeight = Math.max(1.4, Math.min(2.6, Number(settings.lineHeight) || 1.9))
  settings.searchConcurrency = Math.max(1, Math.min(6, Number(settings.searchConcurrency) || 3))
  writeJson(KEYS.SETTINGS, settings)
  return settings
}

export function resetSettings() {
  writeJson(KEYS.SETTINGS, DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS }
}

// ---------------------------------------------------------------- 搜索历史

export function loadSearchHistory() {
  const history = readJson(KEYS.SEARCH_HISTORY, [])
  return Array.isArray(history) ? history : []
}

export function addSearchHistory(keyword) {
  const text = String(keyword || '').trim()
  if (!text) return loadSearchHistory()
  const history = loadSearchHistory().filter((item) => item !== text)
  history.unshift(text)
  const result = history.slice(0, 12)
  writeJson(KEYS.SEARCH_HISTORY, result)
  return result
}

export function clearSearchHistory() {
  writeJson(KEYS.SEARCH_HISTORY, [])
  return []
}

// ---------------------------------------------------------------- 清理

export function clearReadingData() {
  removeKey(KEYS.SHELF)
  removeKey(KEYS.PROGRESS)
  removeKey(KEYS.SEARCH_HISTORY)
}

export function clearAllLocalData() {
  for (const key of Object.values(KEYS)) removeKey(key)
}
