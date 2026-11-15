/**
 * 远程书源仓库。
 *
 * 书源规则是数据，不是 App 代码：独立仓库维护 index.json + sources/*.json，
 * App 通过 GitHub / Gitee / 静态清单同步。站点改版时只需更新书源仓库。
 *
 * index.json 示例：
 * {
 *   "name": "拾卷书源库",
 *   "version": 3,
 *   "engine": 1,
 *   "sources": [
 *     { "id": "85zw", "name": "八五中文网", "path": "sources/85zw.json", "version": 2 }
 *   ]
 * }
 */

import { APP_META } from '../config.js'
import { fetchText } from './service.js'
import { normalizeSource } from './source.js'
import { loadSources, saveSources } from './store.js'
import { resolveUrl } from './rule.js'

export const SOURCE_ENGINE_VERSION = 3
const STATE_KEY = 'shijuan.sourceRepo.v1'
const CHECK_INTERVAL = 12 * 60 * 60 * 1000
const memory = new Map()
const HAS_UNI = typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function'

export class SourceRepoError extends Error {
  constructor(message, stage) {
    super(message)
    this.name = 'SourceRepoError'
    this.stage = stage || ''
  }
}

export function getSourceRepoConfig(settings) {
  const base = APP_META.sourceRepo || {}
  const config = {
    provider: base.provider || 'github',
    repo: base.repo || '',
    branch: base.branch || 'main',
    manifestUrl: base.manifestUrl || '',
    autoSync: base.autoSync !== false
  }
  const stored = settings || {}
  if (stored.sourceRepoProvider) config.provider = stored.sourceRepoProvider
  if (stored.sourceRepoRepo) config.repo = String(stored.sourceRepoRepo).trim()
  if (stored.sourceRepoBranch) config.branch = String(stored.sourceRepoBranch).trim()
  if (stored.sourceRepoManifestUrl) config.manifestUrl = String(stored.sourceRepoManifestUrl).trim()
  if (stored.sourceRepoAutoSync === false) config.autoSync = false
  return config
}

export function isSourceRepoConfigured(config) {
  return !!(config && (config.manifestUrl || config.repo))
}

export function sourceRepoUrls(config) {
  if (!config) return []
  if (config.manifestUrl) return [config.manifestUrl]
  if (!config.repo) return []
  const branch = config.branch || 'main'
  if (config.provider === 'gitee') {
    return [
      `https://gitee.com/${config.repo}/raw/${branch}/index.json`,
      `https://gitee.com/${config.repo}/raw/${branch}/index.json?t=${Date.now()}`
    ]
  }
  return [
    `https://cdn.jsdelivr.net/gh/${config.repo}@${branch}/index.json`,
    `https://raw.githubusercontent.com/${config.repo}/${branch}/index.json`
  ]
}

export function sourceRepoLabel(config) {
  if (!config) return '未配置'
  if (config.manifestUrl) {
    try {
      const match = config.manifestUrl.match(/^[a-z]+:\/\/([^/?#]+)/i)
      return match ? match[1] : config.manifestUrl
    } catch (e) {
      return config.manifestUrl
    }
  }
  return `${config.provider === 'gitee' ? 'Gitee' : 'GitHub'} · ${config.repo}@${config.branch || 'main'}`
}

async function fetchJson(url, fetcher, stage) {
  let page
  try {
    page = await fetcher(url, {
      source: { url: '', charset: 'utf-8', headers: { Accept: 'application/json, */*;q=0.8' } },
      cache: false,
      timeout: 20000,
      stage: stage || 'source-repo'
    })
  } catch (e) {
    throw new SourceRepoError('请求失败：' + (e.message || '未知错误'), stage)
  }
  try {
    return JSON.parse(page.text)
  } catch (e) {
    throw new SourceRepoError('返回内容不是有效的 JSON', stage)
  }
}

export function normalizeManifest(payload, manifestUrl) {
  if (!payload) throw new SourceRepoError('书源清单为空', 'manifest')
  if (Array.isArray(payload)) {
    return {
      name: '书源清单',
      version: 1,
      engine: 1,
      updatedAt: '',
      manifestUrl,
      entries: payload.map((source, index) => ({ inline: source, id: source.id || source.bookSourceName || `inline-${index}` }))
    }
  }
  if (payload.bookSourceName || payload.searchUrl) {
    return {
      name: payload.name || '单书源',
      version: 1,
      engine: 1,
      updatedAt: '',
      manifestUrl,
      entries: [{ inline: payload, id: payload.id || payload.bookSourceName || 'inline-0' }]
    }
  }
  const list = Array.isArray(payload.sources) ? payload.sources : []
  const entries = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (typeof item === 'string') {
      entries.push({ path: item, id: '' })
    } else if (item && typeof item === 'object') {
      entries.push({
        id: String(item.id || ''),
        name: String(item.name || ''),
        path: String(item.path || item.file || item.url || ''),
        url: String(item.url || ''),
        version: item.version || 0,
        enabledByDefault: item.enabledByDefault !== false,
        inline: item.source || null
      })
    }
  }
  return {
    name: String(payload.name || '书源仓库'),
    version: Number(payload.version) || 1,
    engine: Number(payload.engine) || 1,
    updatedAt: payload.updatedAt || '',
    manifestUrl,
    entries
  }
}

async function fetchManifest(config, fetcher) {
  const urls = sourceRepoUrls(config)
  if (!urls.length) throw new SourceRepoError('尚未配置书源仓库', 'manifest')
  let lastError = null
  for (const url of urls) {
    try {
      const payload = await fetchJson(url, fetcher, 'manifest')
      const manifest = normalizeManifest(payload, url)
      if (!manifest.entries.length) throw new SourceRepoError('书源清单里没有书源', 'manifest')
      return manifest
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new SourceRepoError('无法读取书源清单', 'manifest')
}

async function fetchSourceEntry(entry, manifest, fetcher) {
  if (entry.inline) return [entry.inline]
  if (!entry.path && !entry.url) throw new SourceRepoError('书源条目缺少 path', 'source')
  const baseUrl = manifest.manifestUrl
  const url = entry.url ? resolveUrl(baseUrl, entry.url) : resolveUrl(baseUrl, entry.path)
  const payload = await fetchJson(url, fetcher, 'source')
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.bookSources)) return payload.bookSources
  if (payload && Array.isArray(payload.sources)) return payload.sources
  if (payload && typeof payload === 'object') return [payload]
  throw new SourceRepoError('书源文件格式不正确：' + entry.path, 'source')
}

function loadState() {
  try {
    const raw = HAS_UNI ? uni.getStorageSync(STATE_KEY) : memory.get(STATE_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return null
  }
}

function saveState(state) {
  try {
    const value = JSON.stringify(state)
    if (HAS_UNI) uni.setStorageSync(STATE_KEY, value)
    else memory.set(STATE_KEY, value)
  } catch (e) {
    // ignore
  }
}

export function loadSourceRepoState() {
  return loadState()
}

export function clearSourceRepoState() {
  try {
    if (HAS_UNI) uni.removeStorageSync(STATE_KEY)
    else memory.delete(STATE_KEY)
  } catch (e) {
    // ignore
  }
}

/**
 * 同步书源仓库。
 */
export async function syncSourceRepo(settings, options = {}) {
  const config = options.config || getSourceRepoConfig(settings)
  if (!isSourceRepoConfigured(config)) {
    throw new SourceRepoError('尚未配置书源仓库', 'config')
  }
  const fetcher = options.fetchText || fetchText
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const startedAt = Date.now()

  progress('manifest', '正在读取书源清单…')
  const manifest = await fetchManifest(config, fetcher)
  const warning = manifest.engine > SOURCE_ENGINE_VERSION
    ? `该书源库需要拾卷引擎 ${manifest.engine}，当前引擎 ${SOURCE_ENGINE_VERSION}，部分规则可能无法使用。`
    : ''

  const report = {
    ok: true,
    manifestName: manifest.name,
    version: manifest.version,
    engine: manifest.engine,
    warning,
    added: 0,
    updated: 0,
    skipped: 0,
    retired: 0,
    failed: 0,
    errors: [],
    sources: [],
    elapsed: 0
  }

  // 引擎版本更高时保留现有可用书源，避免用不兼容规则覆盖
  if (manifest.engine > SOURCE_ENGINE_VERSION) {
    const previous = loadState() || {}
    const state = {
      ...previous,
      config,
      manifestName: manifest.name,
      engine: manifest.engine,
      manifestUrl: manifest.manifestUrl,
      lastCheckAt: Date.now(),
      engineWarning: warning
    }
    saveState(state)
    report.skippedEngine = true
    report.state = state
    report.elapsed = Date.now() - startedAt
    progress('done', '书源库需要更高引擎版本，已保留现有书源')
    return report
  }

  const local = loadSources()
  const map = new Map(local.map((source) => [source.id, source]))
  const byUrl = new Map(local.filter((source) => source.builtin || source.fromRepo).map((source) => [source.url, source]))

  const ids = new Set(local.map((source) => source.id))
  const seenRepoIds = new Set()

  const skippedEntry = (entry) => {
    if (!entry.id || !(Number(entry.version) > 0)) return null
    const existing = map.get(entry.id)
    if (!existing) return null
    return existing.fromRepo === true &&
      existing.repoManifestUrl === manifest.manifestUrl &&
      Number(existing.remoteVersion) === Number(entry.version) &&
      !existing.retired
      ? existing
      : null
  }

  const fetched = new Map()
  const fetchTasks = []
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i]
    const existing = skippedEntry(entry)
    if (existing) {
      report.skipped++
      seenRepoIds.add(existing.id)
      report.sources.push({ id: existing.id, name: existing.name, enabled: existing.enabled !== false })
      continue
    }
    if (entry.id) seenRepoIds.add(entry.id)
    fetchTasks.push({ index: i, entry })
  }

  // 并发拉取有变化的书源文件；合并仍按清单顺序执行
  let fetchCursor = 0
  const fetchConcurrency = Math.max(1, Math.min(4, Number(options.concurrency) || 3))
  async function fetchWorker() {
    while (fetchCursor < fetchTasks.length) {
      const task = fetchTasks[fetchCursor++]
      progress('source', `正在拉取 ${fetchCursor}/${fetchTasks.length}${task.entry.name ? ' · ' + task.entry.name : ''}…`)
      try {
        fetched.set(task.index, { list: await fetchSourceEntry(task.entry, manifest, fetcher) })
      } catch (e) {
        fetched.set(task.index, { error: e })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(fetchConcurrency, Math.max(1, fetchTasks.length)) }, () => fetchWorker()))

  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i]
    const fetchedItem = fetched.get(i)
    if (!fetchedItem) continue
    if (fetchedItem.error) {
      report.failed++
      report.errors.push((entry.name || entry.path || `第 ${i + 1} 项`) + '：' + fetchedItem.error.message)
      continue
    }
    for (const raw of fetchedItem.list) {
      const normalized = normalizeSource(raw)
      if (!normalized.valid) {
        report.failed++
        report.errors.push(`${normalized.name}: ${normalized.errors.join('；')}`)
        continue
      }
      let id = entry.id || normalized.id
      if (!entry.id) {
        const existingByUrl = byUrl.get(normalized.url)
        if (existingByUrl) id = existingByUrl.id
      }
      let suffix = 2
      const baseId = id
      while (map.has(id) && map.get(id).fromRepo !== true && map.get(id).builtin !== true) {
        id = baseId + '-' + suffix
        suffix++
      }
      const existing = map.get(id)
      normalized.id = id
      normalized.builtin = existing ? existing.builtin === true : false
      normalized.enabled = existing ? existing.enabled !== false : entry.enabledByDefault !== false
      normalized.fromRepo = true
      normalized.repoManifestUrl = manifest.manifestUrl
      normalized.remoteVersion = entry.version || manifest.version
      normalized.syncedAt = Date.now()
      normalized.retired = false
      if (existing) report.updated++
      else {
        report.added++
        ids.add(id)
      }
      seenRepoIds.add(id)
      map.set(id, normalized)
      byUrl.set(normalized.url, normalized)
      report.sources.push({ id, name: normalized.name, enabled: normalized.enabled })
    }
  }

  // 清单中移除的仓库书源标记为已下架，不静默保留为可用
  for (const [id, source] of Array.from(map.entries())) {
    if (source.fromRepo && source.repoManifestUrl === manifest.manifestUrl && !seenRepoIds.has(id) && !source.retired) {
      map.set(id, { ...source, retired: true, enabled: false, syncedAt: Date.now() })
      report.retired++
    }
  }

  saveSources(Array.from(map.values()))
  const state = {
    config,
    manifestName: manifest.name,
    version: manifest.version,
    engine: manifest.engine,
    manifestUrl: manifest.manifestUrl,
    lastSyncAt: Date.now(),
    lastCheckAt: Date.now(),
    report: {
      added: report.added,
      updated: report.updated,
      skipped: report.skipped,
      retired: report.retired,
      failed: report.failed
    }
  }
  saveState(state)
  report.elapsed = Date.now() - startedAt
  report.state = state
  progress('done', '书源同步完成')
  return report
}

/**
 * 启动时静默检查；版本变化才拉取书源文件。
 */
export async function autoSyncSourceRepo(settings) {
  const config = getSourceRepoConfig(settings)
  if (!config.autoSync || !isSourceRepoConfigured(config)) return null
  const state = loadState()
  if (state && state.lastCheckAt && Date.now() - state.lastCheckAt < CHECK_INTERVAL) return state
  try {
    const manifest = await fetchManifest(config, fetchText)
    if (state && state.version === manifest.version && state.manifestUrl === manifest.manifestUrl) {
      const next = { ...state, lastCheckAt: Date.now(), config }
      saveState(next)
      return next
    }
    return await syncSourceRepo(settings)
  } catch (e) {
    return null
  }
}
