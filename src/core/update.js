/**
 * 在线升级。
 *
 * 支持：
 * - GitHub Releases API / Gitee Releases API
 * - 仓库中的静态 update.json（可放到 GitHub Pages、Gitee Pages 或 jsDelivr）
 * - App 内下载 APK / WGT 并调用 plus.runtime.install
 *
 * 版本号约定：tag v1.2.3，Release 正文可写 `versionCode: 102`，
 * 若没有写则退化为语义版本比较。
 */

import { APP_META } from '../config.js'
import { fetchText } from './service.js'

const UPDATE_KEY = 'shijuan.update.v1'
const CHECK_INTERVAL = 12 * 60 * 60 * 1000
const memory = new Map()
const HAS_UNI = typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function'

function hasPlus() {
  return typeof plus !== 'undefined' && plus && plus.runtime
}

export class UpdateError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'UpdateError'
    this.code = code || ''
  }
}

export function getUpdateConfig(settings) {
  const config = {
    provider: APP_META.update.provider || 'github',
    repo: APP_META.update.repo || '',
    manifestUrl: APP_META.update.manifestUrl || '',
    releasePage: APP_META.update.releasePage || '',
    autoCheck: APP_META.update.autoCheck !== false
  }
  const stored = settings || {}
  if (stored.updateProvider) config.provider = stored.updateProvider
  if (stored.updateRepo) config.repo = String(stored.updateRepo).trim()
  if (stored.updateManifestUrl) config.manifestUrl = String(stored.updateManifestUrl).trim()
  if (stored.autoCheckUpdate === false) config.autoCheck = false
  return config
}

export function trimVersion(value) {
  return String(value == null ? '' : value).trim().replace(/^v/i, '').replace(/\s+.*$/, '')
}

export function compareVersions(a, b) {
  const left = trimVersion(a).split('-')[0].split('.')
  const right = trimVersion(b).split('-')[0].split('.')
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const l = parseInt(left[i] || '0', 10) || 0
    const r = parseInt(right[i] || '0', 10) || 0
    if (l !== r) return l > r ? 1 : -1
  }
  return 0
}

export function parseVersionCodeFromNotes(notes) {
  const match = String(notes || '').match(/(?:versionCode|version_code|版本号)\s*[:：]\s*(\d+)/i)
  return match ? parseInt(match[1], 10) : 0
}

export function pickReleaseAsset(assets, extension) {
  const list = Array.isArray(assets) ? assets : []
  const suffix = String(extension || '').toLowerCase()
  const matched = list.filter((asset) => {
    const name = String(asset && (asset.name || asset.filename) || '').toLowerCase()
    return name.endsWith(suffix)
  })
  if (!matched.length) return null
  // 优先通用包，其次名字里带 shijuan 的包
  return matched.find((asset) => /universal/i.test(asset.name || '')) ||
    matched.find((asset) => /shijuan|拾卷/i.test(asset.name || '')) ||
    matched[0]
}

export function normalizeUpdatePayload(payload, options = {}) {
  const data = payload || {}
  const current = options.current || { versionName: APP_META.versionName, versionCode: APP_META.versionCode }
  const source = options.source || 'unknown'

  let versionName = trimVersion(data.versionName || data.tag_name || data.tagName || data.name || '')
  if (!versionName) versionName = trimVersion(data.tag_name || data.name || '')
  const notes = String(data.notes || data.body || data.changelog || '').trim()
  const versionCode = Number(
    data.versionCode ||
    data.version_code ||
    parseVersionCodeFromNotes(notes) ||
    0
  )
  let force = data.force === true ||
    data.mandatory === true ||
    /\[force\]|(?:^|\n)\s*force\s*[:：]?\s*(?:true|yes)|强制更新/i.test(notes)

  let apkUrl = data.apkUrl || data.apk_url || ''
  let wgtUrl = data.wgtUrl || data.wgt_url || ''
  let size = Number(data.size) || 0
  const assets = Array.isArray(data.assets) ? data.assets : []
  if (assets.length) {
    const apk = pickReleaseAsset(assets, '.apk')
    const wgt = pickReleaseAsset(assets, '.wgt')
    if (apk) {
      apkUrl = apk.browser_download_url || apk.download_url || apk.url || apkUrl
      size = Number(apk.size) || size
    }
    if (wgt) {
      wgtUrl = wgt.browser_download_url || wgt.download_url || wgt.url || wgtUrl
      if (!size) size = Number(wgt.size) || 0
    }
  }
  if (!apkUrl && !wgtUrl) {
    const direct = notes.match(/https?:\/\/[^\s)]+\.apk[^\s)]*/i)
    if (direct) apkUrl = direct[0]
  }

  const currentCode = Number(current.versionCode) || 0
  let hasUpdate
  if (versionCode > 0 && currentCode > 0) hasUpdate = versionCode > currentCode
  else hasUpdate = compareVersions(versionName, current.versionName) > 0
  if (data.minVersionCode && currentCode && currentCode < Number(data.minVersionCode)) {
    hasUpdate = true
    force = true
  }

  return {
    hasUpdate,
    source,
    current: {
      versionName: current.versionName,
      versionCode: currentCode
    },
    latest: {
      versionName: versionName || current.versionName,
      versionCode: versionCode || currentCode,
      notes,
      force,
      apkUrl,
      wgtUrl,
      pageUrl: data.pageUrl || data.html_url || data.releasePage || '',
      publishedAt: data.publishedAt || data.published_at || data.created_at || '',
      size
    }
  }
}

export function getAppVersion() {
  if (hasPlus()) {
    return new Promise((resolve) => {
      const versionName = plus.runtime.version || APP_META.versionName
      let finished = false
      const fallback = setTimeout(() => {
        if (finished) return
        finished = true
        resolve({ versionName, versionCode: APP_META.versionCode })
      }, 900)
      try {
        plus.runtime.getProperty(plus.runtime.appid, (info) => {
          if (finished) return
          finished = true
          clearTimeout(fallback)
          resolve({
            versionName: versionName || info.version || APP_META.versionName,
            versionCode: Number(info.versionCode) || APP_META.versionCode
          })
        })
      } catch (e) {
        clearTimeout(fallback)
        finished = true
        resolve({ versionName, versionCode: APP_META.versionCode })
      }
    })
  }
  return Promise.resolve({
    versionName: APP_META.versionName,
    versionCode: APP_META.versionCode
  })
}

function apiUrl(config) {
  if (config.provider === 'gitee') {
    return `https://gitee.com/api/v5/repos/${config.repo}/releases/latest`
  }
  return `https://api.github.com/repos/${config.repo}/releases/latest`
}

async function fetchJson(url, options = {}) {
  const page = await fetchText(url, {
    source: {
      url: '',
      charset: 'utf-8',
      headers: Object.assign({
        Accept: 'application/vnd.github+json, application/json;q=0.9, */*;q=0.8'
      }, options.headers || {})
    },
    cache: false,
    timeout: options.timeout || 20000,
    stage: 'update'
  })
  try {
    return JSON.parse(page.text)
  } catch (e) {
    throw new UpdateError('更新信息不是有效的 JSON', 'BAD_JSON')
  }
}

export async function checkUpdate(settings) {
  const config = getUpdateConfig(settings)
  const current = await getAppVersion()

  let payload
  let source
  if (config.manifestUrl) {
    try {
      payload = await fetchJson(config.manifestUrl)
      source = 'manifest'
    } catch (e) {
      throw new UpdateError('读取更新清单失败：' + (e.message || '未知错误'), 'MANIFEST')
    }
  } else if (config.repo) {
    const url = apiUrl(config)
    try {
      payload = await fetchJson(url, {
        headers: config.provider === 'gitee' ? { Accept: 'application/json' } : {}
      })
      source = config.provider
    } catch (e) {
      if (config.provider === 'github' && /HTTP 403|HTTP 429/.test(e.message || '')) {
        throw new UpdateError('GitHub API 请求受限，请稍后再试，或配置静态 update.json 地址。', 'RATE_LIMIT')
      }
      throw new UpdateError('读取 Release 失败：' + (e.message || '未知错误'), 'RELEASE')
    }
  } else {
    throw new UpdateError('尚未配置更新仓库。请在 src/config.js 填写 repo，或在“我的 → 在线升级”中设置仓库。', 'NO_CONFIG')
  }

  const result = normalizeUpdatePayload(payload, { current, source })
  result.checkedAt = Date.now()
  saveUpdateInfo(result)
  return result
}

export function loadUpdateInfo() {
  try {
    const raw = HAS_UNI ? uni.getStorageSync(UPDATE_KEY) : memory.get(UPDATE_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return null
  }
}

export function saveUpdateInfo(info) {
  try {
    const value = JSON.stringify(info)
    if (HAS_UNI) uni.setStorageSync(UPDATE_KEY, value)
    else memory.set(UPDATE_KEY, value)
  } catch (e) {
    // ignore
  }
}

export function clearUpdateInfo() {
  try {
    if (HAS_UNI) uni.removeStorageSync(UPDATE_KEY)
    else memory.delete(UPDATE_KEY)
  } catch (e) {
    // ignore
  }
}

function setUpdateBadge(text) {
  if (typeof uni === 'undefined' || !uni.setTabBarBadge) return
  setTimeout(() => {
    try {
      if (text) uni.setTabBarBadge({ index: 3, text })
      else uni.removeTabBarBadge({ index: 3 })
    } catch (e) {
      // tabbar 尚未创建时忽略
    }
  }, 1200)
}

export function clearUpdateBadge() {
  setUpdateBadge('')
}

export async function autoCheckUpdate(settings) {
  const config = getUpdateConfig(settings)
  if (!config.autoCheck) return null
  if (!config.manifestUrl && !config.repo) return null

  const stored = loadUpdateInfo()
  if (stored && stored.checkedAt && Date.now() - stored.checkedAt < CHECK_INTERVAL) {
    if (stored.hasUpdate) setUpdateBadge('新')
    return stored
  }

  try {
    const info = await checkUpdate(settings)
    if (info.hasUpdate) setUpdateBadge('新')
    return info
  } catch (e) {
    return null
  }
}

/**
 * 下载并安装更新。App 端支持 APK 与 WGT；H5 退化为打开下载页。
 */
export function downloadAndInstall(update, onProgress) {
  const latest = update && update.latest ? update.latest : update || {}
  const url = latest.wgtUrl || latest.apkUrl || latest.pageUrl
  if (!url) {
    return Promise.reject(new UpdateError('该版本没有提供可下载的安装包', 'NO_ASSET'))
  }

  if (!hasPlus()) {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank')
      return Promise.resolve({ opened: true })
    }
    return Promise.reject(new UpdateError('当前环境不支持安装更新', 'UNSUPPORTED'))
  }

  if (plus.os && plus.os.name && plus.os.name.toLowerCase() === 'ios') {
    openReleasePage(latest.pageUrl || url)
    return Promise.resolve({ opened: true })
  }

  const isWgt = !!latest.wgtUrl
  const filename = isWgt ? '_doc/shijuan-update.wgt' : '_doc/shijuan-update.apk'
  return new Promise((resolve, reject) => {
    let task
    try {
      task = plus.downloader.createDownload(url, {
        filename,
        timeout: 180,
        retry: 2
      }, (download, status) => {
        if (status === 200 || (download && download.state === 4)) {
          const path = download.filename || filename
          plus.runtime.install(path, { force: false }, () => {
            resolve({ installed: true, path, type: isWgt ? 'wgt' : 'apk' })
          }, (error) => {
            reject(new UpdateError('安装包启动失败：' + ((error && error.message) || '未知错误'), 'INSTALL'))
          })
        } else {
          reject(new UpdateError('下载失败，HTTP ' + status, 'DOWNLOAD'))
        }
      })
      task.addEventListener('statechanged', (download) => {
        if (!download || !download.totalSize) return
        const percent = Math.max(0, Math.min(100, Math.round((download.downloadedSize / download.totalSize) * 100)))
        if (typeof onProgress === 'function') {
          onProgress({ percent, downloadedSize: download.downloadedSize, totalSize: download.totalSize })
        }
      })
      task.start()
    } catch (e) {
      reject(new UpdateError('下载任务创建失败：' + (e.message || '未知错误'), 'DOWNLOAD'))
    }
  })
}

export function openReleasePage(url) {
  const target = String(url || '')
  if (!target) return
  if (hasPlus() && plus.runtime.openURL) {
    plus.runtime.openURL(target)
  } else if (typeof window !== 'undefined') {
    window.open(target, '_blank')
  }
}

export { APP_META }
