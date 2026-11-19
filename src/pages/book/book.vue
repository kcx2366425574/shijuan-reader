<template>
  <view class="page book-page">
    <view class="hero">
      <view class="hero-bg-char serif">{{ initial }}</view>
      <view class="hero-glow" />
      <view class="nav">
        <view class="nav-btn" @tap="goBack" hover-class="press">
          <view class="chevron" />
        </view>
        <view class="nav-actions">
          <view class="nav-btn small" @tap="copyLink" hover-class="press">
            <view class="copy-icon"><view class="copy-icon-inner" /></view>
          </view>
          <view class="nav-btn small" @tap="refresh" hover-class="press">
            <view class="refresh-icon" :class="{ spinning: loading }" />
          </view>
        </view>
      </view>

      <view class="hero-body">
        <view class="hero-cover">
          <BookCover
            :src="info.coverUrl"
            :title="info.name"
            :author="info.author"
            :referer="source ? source.url : ''"
            radius="12rpx"
            shadow
          />
        </view>
        <view class="hero-info">
          <text class="hero-kicker">{{ info.kind || '在读书目' }}</text>
          <text class="hero-title serif">{{ info.name || '正在翻开…' }}</text>
          <text class="hero-author">{{ info.author || '佚名' }}</text>
          <view class="hero-chips">
            <text v-if="info.status" class="chip">{{ info.status }}</text>
            <text v-if="source" class="chip jade-chip">{{ source.name }}</text>
            <text v-if="chapters.length" class="chip">{{ chapters.length }} 章</text>
          </view>
          <text v-if="info.lastChapter" class="hero-latest ellipsis">最新 · {{ info.lastChapter }}</text>
        </view>
      </view>
    </view>

    <view v-if="loading && !chapters.length" class="body">
      <view class="skeleton-card">
        <view class="skeleton-line w40" />
        <view class="skeleton-line" />
        <view class="skeleton-line" />
        <view class="skeleton-line w70" />
      </view>
      <LoadingState text="正在读取目录…" />
    </view>

    <view v-else-if="error && !chapters.length" class="body">
      <view class="error-card">
        <text class="error-title serif">这一页暂时翻不开</text>
        <text class="error-text">{{ error }}</text>
        <view class="error-actions">
          <view class="ghost-btn small-btn" @tap="goBack">返回</view>
          <view v-if="info.name && (alternateOffers.length || sources.length > 1)" class="ghost-btn small-btn" @tap="switchSource">换源</view>
          <view class="primary-btn small-btn" @tap="refresh">再试一次</view>
        </view>
      </view>
    </view>

    <view v-else class="body">
      <view class="action-row">
        <view class="read-btn" @tap="handleRead" hover-class="press">
          <text>{{ readButtonText }}</text>
          <text class="read-arrow">→</text>
        </view>
        <view class="shelf-btn" @tap="toggleShelf" hover-class="press">
          <text>{{ inShelf ? '已在书架' : '+ 加入书架' }}</text>
        </view>
        <view class="more-btn" @tap="switchSource" hover-class="press">
          <text>{{ switching ? '换源中' : '换源' }}</text>
        </view>
      </view>

      <view class="offline-card" :class="{ done: offlineComplete, active: downloading }">
        <view class="offline-icon">
          <text>{{ offlineComplete ? '✓' : '↓' }}</text>
        </view>
        <view class="offline-copy">
          <text class="offline-title">{{ offlineTitle }}</text>
          <text class="offline-desc">{{ offlineDesc }}</text>
          <view v-if="downloading || (offlineMeta && offlineMeta.cachedChapters && !offlineComplete)" class="offline-track">
            <view class="offline-fill" :style="{ width: Math.max(2, downloadPercent) + '%' }" />
          </view>
        </view>
        <view class="offline-btn" :class="{ primary: !offlineComplete }" @tap="handleOffline" hover-class="press">{{ offlineBtn }}</view>
      </view>

      <view v-if="error" class="inline-error" @tap="refresh">
        <text>{{ error }}</text>
        <text class="inline-error-action">重试 ›</text>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-label">简介</text>
          <text v-if="info.intro" class="section-action" @tap="introExpanded = !introExpanded">
            {{ introExpanded ? '收起' : '展开' }}
          </text>
        </view>
        <text class="intro-text" :class="{ expanded: introExpanded }">
          {{ info.intro || '这本书还没有留下简介。读下去，也许会比简介更精彩。' }}
        </text>
      </view>

      <view class="chapter-card">
        <view class="chapter-head">
          <view class="chapter-head-left">
            <text class="chapter-title serif">目录</text>
            <text class="chapter-count">共 {{ chapters.length }} 章</text>
          </view>
          <view class="catalog-link" @tap="openCatalog" hover-class="press">
            <text>全部目录</text>
            <text class="catalog-link-arrow">›</text>
          </view>
        </view>

        <view class="chapter-list">
          <view
            v-for="chapter in previewChapters"
            :key="chapter.url"
            class="chapter-row"
            hover-class="press"
            :hover-stay-time="60"
            @tap="startReading(chapter.index)"
          >
            <text class="chapter-index">{{ pad2(chapter.index + 1) }}</text>
            <text class="chapter-name ellipsis">{{ chapter.name }}</text>
            <text v-if="isCurrentChapter(chapter.index)" class="current-tag">读到这里</text>
            <text v-else class="chapter-arrow">›</text>
          </view>
        </view>

        <view v-if="chapters.length > previewChapters.length" class="chapter-more" @tap="openCatalog" hover-class="press">
          <text>查看全部 {{ chapters.length }} 章</text>
        </view>
      </view>

      <view class="source-note">
        <text class="source-note-label">书源</text>
        <text class="source-note-name">{{ source ? source.name : '未知书源' }}</text>
        <text class="source-note-url ellipsis">{{ hostOf(source && source.url) }}</text>
      </view>
    </view>

    <view class="bottom-space" />

    <BottomSheet v-model:show="showCatalog" title="章节目录">
      <view class="catalog-tools">
        <text class="catalog-range">{{ catalogRangeText }}</text>
        <view class="catalog-sort" @tap="toggleCatalogOrder">{{ settings.catalogReverse ? '⇅ 正序' : '⇅ 倒序' }}</view>
        <view class="catalog-jump">
          <input
            v-model="catalogJump"
            class="catalog-jump-input"
            type="number"
            placeholder="章节号"
            placeholder-class="placeholder"
            @confirm="jumpToChapter"
          />
          <view class="catalog-jump-btn" @tap="jumpToChapter">定位</view>
        </view>
      </view>

      <view class="catalog-list">
        <view
          v-for="chapter in catalogItems"
          :key="chapter.url"
          class="catalog-row"
          :class="{ current: isCurrentChapter(chapter.index) }"
          hover-class="press"
          @tap="selectChapter(chapter.index)"
        >
          <text class="catalog-index">{{ pad2(chapter.index + 1) }}</text>
          <text class="catalog-name ellipsis">{{ chapter.name }}</text>
          <text v-if="isCurrentChapter(chapter.index)" class="catalog-current">正在读</text>
        </view>
      </view>

      <view class="catalog-pager">
        <view class="pager-btn" :class="{ disabled: catalogPage <= 0 }" @tap="changeCatalogPage(-1)">上一页</view>
        <text class="pager-info">{{ catalogPage + 1 }} / {{ catalogPageCount }}</text>
        <view class="pager-btn" :class="{ disabled: catalogPage >= catalogPageCount - 1 }" @tap="changeCatalogPage(1)">下一页</view>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { decodeRouteValue } from '../../core/rule.js'
import BookCover from '../../components/BookCover.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import LoadingState from '../../components/LoadingState.vue'
import {
  ensureSources,
  getShelfBook,
  makeBookId,
  upsertShelfBook,
  updateShelfBook,
  loadSettings,
  saveSettings
} from '../../core/store.js'
import { getCachedBook, cacheBook } from '../../core/book-cache.js'
import { takeHandoff } from '../../core/handoff.js'
import { openBook } from '../../core/service.js'
import { searchAllSources, groupSearchResults } from '../../core/service.js'
import { copyText, toast, toastSuccess, pad2, firstReadableIndex, confirmDialog } from '../../utils/format.js'
import { getOfflineBook, getOfflineMeta, removeOfflineBook } from '../../core/offline.js'
import { downloadBook, cancelBookDownload, getDownloadState } from '../../core/download.js'

const params = ref({})
const sources = ref([])
const source = ref(null)
const info = ref({})
const chapters = ref([])
const shelfBook = ref(null)
const loading = ref(true)
const error = ref('')
const introExpanded = ref(false)
const showCatalog = ref(false)
const catalogPage = ref(0)
const catalogJump = ref('')
const settings = ref(loadSettings())
const switching = ref(false)
const currentBookId = ref('')
const currentBookUrl = ref('')
const currentTocUrl = ref('')
const alternateOffers = ref([])
const offlineMeta = ref(null)
const downloading = ref(false)
const downloadPercent = ref(0)
const downloadText = ref('')
let offlineTimer = null

const PAGE_SIZE = 100
const initial = computed(() => String(info.value.name || '书').replace(/[《》\s]/g, '').slice(0, 1))
const inShelf = computed(() => !!shelfBook.value)
const progress = computed(() => (shelfBook.value && shelfBook.value.progress) || null)

const readIndex = computed(() => {
  if (progress.value && Number.isInteger(progress.value.chapterIndex) && progress.value.chapterIndex < chapters.value.length) {
    return progress.value.chapterIndex
  }
  return firstReadableIndex(chapters.value)
})

const readButtonText = computed(() => {
  if (!progress.value || !chapters.value.length) return chapters.value.length ? '开始阅读' : '正在载入'
  const name = progress.value.chapterName || `第 ${readIndex.value + 1} 章`
  return '继续阅读 · ' + (name.length > 12 ? name.slice(0, 12) + '…' : name)
})

const offlineComplete = computed(() => !!(offlineMeta.value && offlineMeta.value.complete))
const offlineTitle = computed(() => {
  if (downloading.value) return `正在缓存 ${downloadPercent.value}%`
  if (offlineComplete.value) return '已缓存全书'
  if (offlineMeta.value && offlineMeta.value.cachedChapters) return `已缓存 ${offlineMeta.value.cachedChapters}/${offlineMeta.value.chapterCount} 章`
  return '整本离线缓存'
})
const offlineDesc = computed(() => {
  if (downloading.value) return downloadText.value || '正在逐章下载…'
  if (offlineComplete.value) return '之后阅读不再请求网络'
  if (offlineMeta.value && offlineMeta.value.cachedChapters) return '可继续下载剩余章节'
  return '一次性下载整本，弱网也能读'
})
const offlineBtn = computed(() => {
  if (downloading.value) return '取消'
  if (offlineComplete.value) return '删除'
  if (offlineMeta.value && offlineMeta.value.cachedChapters) return '继续'
  return '缓存'
})

const previewChapters = computed(() => {
  if (!chapters.value.length) return []
  const total = chapters.value.length
  let start = 0
  if (progress.value && Number.isInteger(progress.value.chapterIndex)) {
    start = Math.max(0, Math.min(progress.value.chapterIndex - 1, total - 6))
  }
  return chapters.value.slice(start, start + 6).map((chapter, offset) => ({ ...chapter, index: start + offset }))
})

const catalogPageCount = computed(() => Math.max(1, Math.ceil(chapters.value.length / PAGE_SIZE)))
// 排序方向只影响目录展示；index 始终指向 chapters 原数组下标。
const catalogRangeText = computed(() => {
  const total = chapters.value.length
  if (!total) return '暂无章节'
  const start = catalogPage.value * PAGE_SIZE
  if (settings.value.catalogReverse) {
    const end = Math.max(1, total - start)
    const begin = Math.max(1, end - PAGE_SIZE + 1)
    return `${begin}–${end} / ${total}`
  }
  const begin = start + 1
  const end = Math.min(total, (catalogPage.value + 1) * PAGE_SIZE)
  return `${begin}–${end} / ${total}`
})
const catalogItems = computed(() => {
  const total = chapters.value.length
  if (!total) return []
  const start = catalogPage.value * PAGE_SIZE
  if (settings.value.catalogReverse) {
    // 倒序第 start 项对应原数组 total - 1 - start，反向切片后逐项回填原 index。
    const last = Math.max(0, total - 1 - start)
    const from = Math.max(0, last - PAGE_SIZE + 1)
    return chapters.value.slice(from, last + 1).reverse()
      .map((chapter, offset) => ({ ...chapter, index: last - offset }))
  }
  return chapters.value.slice(start, start + PAGE_SIZE).map((chapter, offset) => ({ ...chapter, index: start + offset }))
})

function catalogPageForIndex(index) {
  const total = chapters.value.length
  const offset = settings.value.catalogReverse ? total - 1 - index : index
  return Math.max(0, Math.min(catalogPageCount.value - 1, Math.floor(offset / PAGE_SIZE)))
}

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1].replace(/^www\./, '') : ''
}

function isCurrentChapter(index) {
  return !!progress.value && progress.value.chapterIndex === index
}

function currentProgressIndex() {
  if (progress.value && Number.isInteger(progress.value.chapterIndex)) return progress.value.chapterIndex
  return 0
}

function applyOpened(opened) {
  info.value = {
    ...info.value,
    ...opened.info,
    name: opened.info.name || info.value.name || '未知书名',
    author: opened.info.author || info.value.author || '',
    coverUrl: opened.info.coverUrl || info.value.coverUrl || '',
    intro: opened.info.intro || info.value.intro || '',
    kind: opened.info.kind || info.value.kind || '',
    status: opened.info.status || info.value.status || '',
    lastChapter: opened.info.lastChapter || info.value.lastChapter || ''
  }
  chapters.value = opened.chapters || []
  currentTocUrl.value = opened.tocUrl || currentBookUrl.value
  cacheBook(currentBookId.value, {
    info: info.value,
    chapters: chapters.value,
    bookUrl: currentBookUrl.value,
    tocUrl: currentTocUrl.value
  })
  refreshOfflineMeta()
  if (shelfBook.value) {
    shelfBook.value = updateShelfBook(shelfBook.value.id, {
      sourceId: source.value ? source.value.id : (shelfBook.value.sourceId || ''),
      sourceName: source.value ? source.value.name : (shelfBook.value.sourceName || ''),
      sourceUrl: source.value ? source.value.url : (shelfBook.value.sourceUrl || ''),
      name: info.value.name,
      author: info.value.author,
      coverUrl: info.value.coverUrl,
      intro: info.value.intro,
      kind: info.value.kind,
      status: info.value.status,
      lastChapter: info.value.lastChapter,
      bookUrl: currentBookUrl.value,
      tocUrl: currentTocUrl.value,
      chapterCount: chapters.value.length,
      sourceUrl: source.value ? source.value.url : ''
    }) || shelfBook.value
  }
}

function applyOfflineBook(offline) {
  info.value = {
    ...info.value,
    ...(offline.info || {}),
    name: (offline.info && offline.info.name) || info.value.name || '未知书名',
    author: (offline.info && offline.info.author) || info.value.author || '',
    coverUrl: (offline.info && offline.info.coverUrl) || info.value.coverUrl || '',
    intro: (offline.info && offline.info.intro) || info.value.intro || '',
    kind: (offline.info && offline.info.kind) || info.value.kind || '',
    lastChapter: (offline.info && offline.info.lastChapter) || info.value.lastChapter || ''
  }
  chapters.value = offline.chapters || []
  currentTocUrl.value = offline.tocUrl || currentBookUrl.value
  cacheBook(currentBookId.value, {
    info: info.value,
    chapters: chapters.value,
    bookUrl: offline.bookUrl || currentBookUrl.value,
    tocUrl: currentTocUrl.value
  })
  loading.value = false
  refreshOfflineMeta()
}

async function tryAlternateSource() {
  const currentSourceId = source.value ? source.value.id : ''
  const candidates = alternateOffers.value.filter((item) => item.sourceId && item.sourceId !== currentSourceId)
  for (const alt of candidates) {
    const altSource = sources.value.find((item) => item.id === alt.sourceId && item.enabled !== false)
    if (!altSource) continue
    try {
      const opened = await openBook(altSource, alt.bookUrl, alt)
      source.value = altSource
      currentBookUrl.value = opened.bookUrl || alt.bookUrl
      alternateOffers.value = candidates.filter((item) => item !== alt)
      applyOpened(opened)
      toast('当前书源不可用，已自动切换')
      return true
    } catch (e) {
      // 尝试下一个备选
    }
  }
  return false
}

async function load(force = false) {
  loading.value = true
  error.value = ''
  sources.value = ensureSources()
  let fallback = {}
  let bookUrl = ''
  let bookId = ''

  if (params.value.bookId) {
    bookId = params.value.bookId
    const existing = getShelfBook(bookId)
    if (!existing) {
      loading.value = false
      error.value = '书架中没有这本书，可能已被移出。'
      return
    }
    shelfBook.value = existing
    fallback = existing
    bookUrl = existing.bookUrl
    source.value = sources.value.find((item) => item.id === existing.sourceId) || null
    if (!source.value) {
      const offline = await getOfflineBook(bookId)
      if (!offline || !offline.chapters || !offline.chapters.length) {
        loading.value = false
        error.value = '这本书使用的书源已被删除，且没有离线缓存。'
        return
      }
    }
  } else {
    source.value = sources.value.find((item) => item.id === params.value.sourceId) || null
    if (!source.value) {
      loading.value = false
      error.value = '没有找到对应的书源，可能已被删除。'
      return
    }
    bookUrl = params.value.bookUrl || ''
    bookId = makeBookId(source.value.id, bookUrl)
    const handoff = takeHandoff(source.value.id + '|' + bookUrl)
    const existing = getShelfBook(bookId)
    shelfBook.value = existing
    fallback = { ...(existing || {}), ...(handoff || {}) }
    if (!bookUrl) {
      loading.value = false
      error.value = '缺少书籍地址。'
      return
    }
  }

  currentBookId.value = bookId
  currentBookUrl.value = bookUrl
  alternateOffers.value = Array.isArray(fallback.alternates) ? fallback.alternates : []
  const offlineBook = bookId ? await getOfflineBook(bookId) : null
  info.value = {
    ...fallback,
    name: fallback.name || '',
    author: fallback.author || '',
    coverUrl: fallback.coverUrl || '',
    intro: fallback.intro || '',
    kind: fallback.kind || '',
    status: fallback.status || '',
    lastChapter: fallback.lastChapter || ''
  }

  if (!force) {
    const cached = getCachedBook(bookId)
    if (cached && cached.chapters && cached.chapters.length) {
      info.value = { ...info.value, ...cached.info }
      chapters.value = cached.chapters
      currentTocUrl.value = cached.tocUrl || bookUrl
      loading.value = false
      refreshOfflineMeta()
      return
    }
  }

  if (offlineBook && offlineBook.chapters && offlineBook.chapters.length && !source.value) {
    applyOfflineBook(offlineBook)
    return
  }

  try {
    const opened = await openBook(source.value, bookUrl, fallback)
    applyOpened(opened)
  } catch (e) {
    if (offlineBook && offlineBook.chapters && offlineBook.chapters.length) {
      applyOfflineBook(offlineBook)
      toast('网络不可用，已使用离线缓存')
    } else {
      const switched = await tryAlternateSource()
      if (!switched) {
        error.value = e && e.message ? e.message : '加载失败'
        if (!chapters.value.length) {
          chapters.value = []
        }
      }
    }
  } finally {
    loading.value = false
  }
}

function applyDownloadState(state) {
  if (!state) return
  downloadPercent.value = state.percent || 0
  downloadText.value = `正在缓存 ${state.done}/${state.total} 章${state.failed ? ` · ${state.failed} 章失败` : ''}`
}

function stopOfflinePolling() {
  if (offlineTimer) {
    clearInterval(offlineTimer)
    offlineTimer = null
  }
}

function refreshOfflineMeta() {
  if (!currentBookId.value) return
  offlineMeta.value = getOfflineMeta(currentBookId.value)
  const state = getDownloadState(currentBookId.value)
  if (state) {
    downloading.value = true
    applyDownloadState(state)
    startOfflinePolling()
  } else {
    downloading.value = false
    stopOfflinePolling()
  }
}

function startOfflinePolling() {
  if (offlineTimer) return
  offlineTimer = setInterval(() => {
    if (!currentBookId.value) return
    const state = getDownloadState(currentBookId.value)
    if (state) {
      downloading.value = true
      applyDownloadState(state)
    } else {
      downloading.value = false
      offlineMeta.value = getOfflineMeta(currentBookId.value)
      stopOfflinePolling()
    }
  }, 700)
}

async function handleOffline() {
  if (!currentBookId.value) return
  if (downloading.value) {
    cancelBookDownload(currentBookId.value)
    downloadText.value = '正在取消，已下载章节会保留…'
    toast('已请求取消缓存')
    return
  }
  if (offlineComplete.value) {
    const ok = await confirmDialog({
      title: '删除离线缓存',
      content: '删除后需要联网才能阅读这本书。书架与阅读进度不受影响。',
      confirmText: '删除'
    })
    if (!ok) return
    await removeOfflineBook(currentBookId.value)
    refreshOfflineMeta()
    toast('离线缓存已删除')
    return
  }
  if (!source.value) {
    toast('书源不可用，暂时无法下载')
    return
  }
  if (!chapters.value.length) {
    toast('目录还没有加载好')
    return
  }
  const startIndex = Math.max(0, Math.min(chapters.value.length - 1, readIndex.value))
  const lastIndex = chapters.value.length - 1
  const options = [
    offlineMeta.value && offlineMeta.value.cachedChapters ? '继续缓存剩余全书' : '缓存全书',
    `从第 ${startIndex + 1} 章缓存到结尾`,
    `仅缓存第 ${startIndex + 1} 章`
  ]
  uni.showActionSheet({
    itemList: options,
    success(res) {
      if (res.tapIndex === 0) beginOfflineDownload(0, lastIndex, '缓存全书')
      else if (res.tapIndex === 1) beginOfflineDownload(startIndex, lastIndex, '从当前章缓存')
      else if (res.tapIndex === 2) beginOfflineDownload(startIndex, startIndex, '缓存当前章')
    }
  })
}

function beginOfflineDownload(startIndex, endIndex, label) {
  if (!source.value || !chapters.value.length) return
  addToShelf(true)
  downloading.value = true
  downloadPercent.value = 0
  downloadText.value = '正在准备下载…'
  startOfflinePolling()
  downloadBook(source.value, buildShelfPayload(), chapters.value, {
    concurrency: 3,
    startIndex,
    endIndex,
    onProgress(state) {
      if (state) applyDownloadState(state)
    }
  }).then((state) => {
    downloading.value = false
    stopOfflinePolling()
    refreshOfflineMeta()
    if (state.status === 'done') toastSuccess('全书已缓存，可离线阅读')
    else if (state.status === 'cancelled') toast('已取消，保留已下载章节')
    else toast(`“${label}”完成，已缓存 ${metaCached()} 章，可稍后继续`)
  }).catch((e) => {
    downloading.value = false
    stopOfflinePolling()
    refreshOfflineMeta()
    toast(e && e.message ? e.message : '缓存失败')
  })
}

function metaCached() {
  const meta = offlineMeta.value || getOfflineMeta(currentBookId.value)
  return meta ? meta.cachedChapters || 0 : 0
}

function goBack() {
  const pages = getCurrentPages()
  if (pages && pages.length > 1) uni.navigateBack({ delta: 1 })
  else uni.switchTab({ url: '/pages/shelf/shelf' })
}

function buildShelfPayload() {
  return {
    id: currentBookId.value,
    sourceId: source.value.id,
    sourceName: source.value.name,
    sourceUrl: source.value.url,
    name: info.value.name,
    author: info.value.author,
    coverUrl: info.value.coverUrl,
    intro: info.value.intro,
    kind: info.value.kind,
    status: info.value.status,
    lastChapter: info.value.lastChapter,
    bookUrl: currentBookUrl.value,
    tocUrl: currentTocUrl.value,
    chapterCount: chapters.value.length
  }
}

function addToShelf(silent) {
  if (!source.value || !chapters.value.length) return shelfBook.value
  const stored = upsertShelfBook(buildShelfPayload())
  shelfBook.value = stored
  if (!silent) toastSuccess('已加入书架')
  return stored
}

function toggleShelf() {
  if (inShelf.value) {
    toast('已经在书架里了')
    return
  }
  addToShelf(false)
}

function handleRead() {
  startReading(readIndex.value)
}

function startReading(index) {
  if (!chapters.value.length) {
    toast('目录还没有加载好')
    return
  }
  const stored = addToShelf(true)
  if (!stored) return
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, chapters.value.length - 1))
  cacheBook(currentBookId.value, {
    info: info.value,
    chapters: chapters.value,
    bookUrl: currentBookUrl.value,
    tocUrl: currentTocUrl.value
  })
  uni.navigateTo({
    url: `/pages/reader/reader?bookId=${encodeURIComponent(currentBookId.value)}&chapter=${safeIndex}`
  })
}

function openCatalog() {
  if (!chapters.value.length) {
    toast('目录还没有加载好')
    return
  }
  catalogPage.value = catalogPageForIndex(currentProgressIndex())
  catalogJump.value = ''
  showCatalog.value = true
}

function changeCatalogPage(delta) {
  const next = catalogPage.value + delta
  if (next < 0 || next >= catalogPageCount.value) return
  catalogPage.value = next
}

function toggleCatalogOrder() {
  settings.value = saveSettings({ ...settings.value, catalogReverse: !settings.value.catalogReverse })
  // 切换后仍让当前进度章所在页可见。
  catalogPage.value = catalogPageForIndex(currentProgressIndex())
}

function jumpToChapter() {
  const value = parseInt(catalogJump.value, 10)
  if (!Number.isFinite(value) || value < 1) {
    toast('请输入有效的章节号')
    return
  }
  const index = Math.min(chapters.value.length, value) - 1
  catalogPage.value = catalogPageForIndex(index)
  catalogJump.value = ''
  toast(`已定位到第 ${index + 1} 章`)
}

function selectChapter(index) {
  showCatalog.value = false
  setTimeout(() => startReading(index), 80)
}

async function refresh() {
  if (loading.value) return
  await load(true)
  if (!error.value) toast('目录已更新')
}

async function copyLink() {
  await copyText(currentBookUrl.value, '书籍地址已复制')
}

async function switchSource() {
  if (switching.value || !info.value.name) return
  const others = sources.value.filter((item) => item.enabled !== false && item.id !== (source.value && source.value.id))
  if (!others.length) {
    toast('没有其他可用书源')
    return
  }
  switching.value = true
  try {
    const results = await searchAllSources(others, info.value.name, { concurrency: 3 })
    const groups = groupSearchResults(results, info.value.name)
    const normalized = String(info.value.name).replace(/[《》\s]/g, '')
    const matches = groups.filter((group) => {
      const name = String(group.name || '').replace(/[《》\s]/g, '')
      return name === normalized || name.indexOf(normalized) !== -1 || normalized.indexOf(name) !== -1
    })
    const offers = []
    for (const group of matches) {
      for (const offer of group.offers) offers.push({ ...offer, group })
    }
    if (!offers.length) {
      toast('其他书源暂时没有找到同名书')
      return
    }
    uni.showActionSheet({
      itemList: offers.slice(0, 8).map((offer) => offer.sourceName),
      success: async (res) => {
        const offer = offers[res.tapIndex]
        if (offer) await performSwitch(offer)
      }
    })
  } catch (e) {
    toast(e && e.message ? e.message : '换源失败')
  } finally {
    switching.value = false
  }
}

async function performSwitch(offer) {
  const newSource = sources.value.find((item) => item.id === offer.sourceId)
  if (!newSource) {
    toast('书源不存在')
    return
  }
  loading.value = true
  try {
    const opened = await openBook(newSource, offer.bookUrl, offer)
    const oldProgress = shelfBook.value ? shelfBook.value.progress : null
    const newChapters = opened.chapters || []
    let newIndex = 0
    if (oldProgress && Number.isInteger(oldProgress.chapterIndex)) {
      const oldName = String(oldProgress.chapterName || '').replace(/[《》\s]/g, '')
      const found = newChapters.findIndex((chapter) => String(chapter.name || '').replace(/[《》\s]/g, '') === oldName)
      newIndex = found >= 0 ? found : Math.min(oldProgress.chapterIndex, Math.max(0, newChapters.length - 1))
    }
    source.value = newSource
    currentBookUrl.value = opened.bookUrl || offer.bookUrl
    currentTocUrl.value = opened.tocUrl || currentBookUrl.value
    info.value = { ...info.value, ...opened.info, name: opened.info.name || info.value.name }
    chapters.value = newChapters
    cacheBook(currentBookId.value, {
      info: info.value,
      chapters: chapters.value,
      bookUrl: currentBookUrl.value,
      tocUrl: currentTocUrl.value
    })
    if (shelfBook.value) {
      const stored = updateShelfBook(shelfBook.value.id, {
        sourceId: newSource.id,
        sourceName: newSource.name,
        sourceUrl: newSource.url,
        bookUrl: currentBookUrl.value,
        tocUrl: currentTocUrl.value,
        name: info.value.name,
        author: info.value.author,
        coverUrl: info.value.coverUrl,
        intro: info.value.intro,
        kind: info.value.kind,
        status: info.value.status,
        lastChapter: info.value.lastChapter,
        chapterCount: chapters.value.length,
        progress: oldProgress ? {
          ...oldProgress,
          chapterIndex: newIndex,
          chapterName: newChapters[newIndex] ? newChapters[newIndex].name : '',
          chapterUrl: newChapters[newIndex] ? newChapters[newIndex].url : '',
          scrollTop: 0
        } : null
      })
      if (stored) shelfBook.value = stored
    }
    toastSuccess('已切换书源')
  } catch (e) {
    toast(e && e.message ? e.message : '换源失败')
  } finally {
    loading.value = false
  }
}

onLoad((options) => {
  const next = { ...(options || {}) }
  next.sourceId = decodeRouteValue(next.sourceId)
  next.bookUrl = decodeRouteValue(next.bookUrl)
  params.value = next
  load(false)
})

onShow(() => {
  settings.value = loadSettings()
  refreshOfflineMeta()
})

onUnload(() => {
  stopOfflinePolling()
})
</script>

<style scoped>
.book-page {
  padding-bottom: 30rpx;
}

.hero {
  position: relative;
  padding-top: var(--status-bar-height, 0px);
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  left: -160rpx;
  top: 60rpx;
  width: 620rpx;
  height: 620rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(47, 93, 80, 0.14) 0%, rgba(47, 93, 80, 0) 68%);
  pointer-events: none;
}

.hero-bg-char {
  position: absolute;
  right: -20rpx;
  top: 40rpx;
  font-size: 320rpx;
  line-height: 1;
  color: rgba(37, 42, 36, 0.035);
  pointer-events: none;
}

.nav {
  position: relative;
  z-index: 3;
  height: 88rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-actions {
  display: flex;
  align-items: center;
}

.nav-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 252, 245, 0.7);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 18rpx rgba(45, 40, 28, 0.06);
}

.nav-btn.small {
  width: 64rpx;
  height: 64rpx;
  margin-left: 14rpx;
}

.chevron {
  width: 20rpx;
  height: 20rpx;
  border-left: 3rpx solid var(--ink);
  border-bottom: 3rpx solid var(--ink);
  transform: rotate(45deg);
  margin-left: 8rpx;
}

.copy-icon {
  width: 24rpx;
  height: 26rpx;
  border: 2rpx solid var(--ink-soft);
  border-radius: 4rpx;
  position: relative;
}

.copy-icon-inner {
  position: absolute;
  left: -6rpx;
  top: 6rpx;
  width: 22rpx;
  height: 22rpx;
  border: 2rpx solid var(--ink-soft);
  border-radius: 4rpx;
  background: #f6f1e5;
}

.refresh-icon {
  width: 26rpx;
  height: 26rpx;
  border: 2rpx solid var(--ink-soft);
  border-right-color: transparent;
  border-radius: 50%;
  position: relative;
}

.refresh-icon::after {
  content: '';
  position: absolute;
  right: -4rpx;
  top: -1rpx;
  width: 0;
  height: 0;
  border-top: 6rpx solid var(--ink-soft);
  border-left: 6rpx solid transparent;
}

.refresh-icon.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hero-body {
  position: relative;
  z-index: 2;
  display: flex;
  padding: 18rpx 44rpx 30rpx;
}

.hero-cover {
  width: 194rpx;
  height: 272rpx;
  flex-shrink: 0;
  border-radius: 12rpx;
  transform: rotate(-1.6deg);
}

.hero-info {
  flex: 1;
  min-width: 0;
  margin-left: 34rpx;
  padding-top: 10rpx;
  display: flex;
  flex-direction: column;
}

.hero-kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: var(--gold);
}

.hero-title {
  margin-top: 12rpx;
  font-size: 44rpx;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--ink);
}

.hero-author {
  margin-top: 12rpx;
  font-size: 25rpx;
  color: var(--ink-soft);
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18rpx;
}

.hero-chips .chip {
  margin: 0 10rpx 8rpx 0;
}

.hero-latest {
  margin-top: 12rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.body {
  padding: 0 36rpx;
}

.action-row {
  display: flex;
  align-items: center;
  margin: 12rpx 0 28rpx;
}

.read-btn {
  flex: 1;
  height: 92rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 500;
  letter-spacing: 1rpx;
  box-shadow: 0 14rpx 32rpx rgba(47, 93, 80, 0.24);
  min-width: 0;
}

.read-arrow {
  margin-left: 12rpx;
  font-size: 24rpx;
  opacity: 0.8;
}

.shelf-btn {
  margin-left: 16rpx;
  height: 92rpx;
  padding: 0 26rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  background: rgba(255, 252, 245, 0.4);
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  flex-shrink: 0;
}

.more-btn {
  margin-left: 12rpx;
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  border: 1rpx solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--muted);
  flex-shrink: 0;
}

.inline-error {
  margin-bottom: 20rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  background: rgba(168, 73, 58, 0.07);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 22rpx;
  color: var(--accent);
}

.inline-error-action {
  flex-shrink: 0;
  margin-left: 16rpx;
}

.section-card,
.chapter-card {
  background: rgba(255, 252, 245, 0.66);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  border-radius: 26rpx;
  padding: 28rpx 28rpx 26rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.04);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-action {
  font-size: 22rpx;
  color: var(--jade);
}

.intro-text {
  font-size: 25rpx;
  line-height: 1.8;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.intro-text.expanded {
  display: block;
  overflow: visible;
}

.chapter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}

.chapter-head-left {
  display: flex;
  align-items: baseline;
}

.chapter-title {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: var(--ink);
}

.chapter-count {
  margin-left: 14rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.catalog-link {
  display: flex;
  align-items: center;
  font-size: 23rpx;
  color: var(--jade);
}

.catalog-link-arrow {
  margin-left: 4rpx;
  font-size: 28rpx;
}

.chapter-row {
  display: flex;
  align-items: center;
  height: 86rpx;
  border-bottom: 1rpx solid var(--line);
}

.chapter-row:last-child {
  border-bottom: none;
}

.chapter-index {
  width: 60rpx;
  font-size: 20rpx;
  color: var(--muted);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.chapter-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: var(--ink);
}

.current-tag {
  font-size: 19rpx;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999rpx;
  padding: 4rpx 12rpx;
  flex-shrink: 0;
}

.chapter-arrow {
  color: var(--muted);
  font-size: 26rpx;
  margin-left: 10rpx;
}

.chapter-more {
  margin-top: 14rpx;
  height: 76rpx;
  border-radius: 18rpx;
  background: rgba(47, 93, 80, 0.06);
  color: var(--jade);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 23rpx;
}

.source-note {
  display: flex;
  align-items: center;
  padding: 20rpx 6rpx 0;
  font-size: 20rpx;
  color: var(--muted);
}

.source-note-label {
  letter-spacing: 2rpx;
  margin-right: 10rpx;
}

.source-note-name {
  color: var(--ink-soft);
}

.source-note-url {
  margin-left: 12rpx;
  max-width: 260rpx;
}

.bottom-space {
  height: 30rpx;
}

.skeleton-card {
  margin-top: 20rpx;
  padding: 30rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.6);
}

.skeleton-line {
  height: 24rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.07);
  margin-bottom: 18rpx;
  animation: inkPulse 1.4s ease-in-out infinite;
}

.skeleton-line.w40 { width: 40%; }
.skeleton-line.w70 { width: 70%; }

.error-card {
  margin-top: 30rpx;
  padding: 40rpx 30rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.7);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.error-title {
  font-size: 34rpx;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.error-text {
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--muted);
}

.error-actions {
  display: flex;
  margin-top: 30rpx;
}

.small-btn {
  height: 76rpx;
  padding: 0 34rpx;
  font-size: 25rpx;
  margin: 0 10rpx;
}

.catalog-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 18rpx;
  border-bottom: 1rpx solid var(--line);
}

.catalog-range {
  font-size: 23rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}

.catalog-sort {
  flex-shrink: 0;
  height: 48rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.06);
  color: var(--jade);
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.catalog-jump {
  display: flex;
  align-items: center;
  height: 60rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.05);
  padding: 0 6rpx 0 20rpx;
}

.catalog-jump-input {
  width: 110rpx;
  height: 60rpx;
  font-size: 22rpx;
  color: var(--ink);
  text-align: center;
}

.catalog-jump-btn {
  height: 48rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  margin-left: 6rpx;
}

.catalog-list {
  padding: 6rpx 0;
}

.catalog-row {
  display: flex;
  align-items: center;
  height: 76rpx;
  border-bottom: 1rpx solid var(--line);
}

.catalog-row.current {
  background: rgba(47, 93, 80, 0.05);
  margin: 0 -12rpx;
  padding: 0 12rpx;
  border-radius: 12rpx;
}

.catalog-index {
  width: 58rpx;
  font-size: 19rpx;
  color: var(--muted);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.catalog-name {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--ink-soft);
}

.catalog-current {
  font-size: 18rpx;
  color: var(--jade);
}

.catalog-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 4rpx 10rpx;
  border-top: 1rpx solid var(--line);
  margin-top: 8rpx;
}

.pager-btn {
  font-size: 23rpx;
  color: var(--jade);
  padding: 12rpx 20rpx;
}

.pager-btn.disabled {
  color: var(--muted);
  opacity: 0.4;
}

.pager-info {
  font-size: 21rpx;
  color: var(--muted);
}

.offline-card {
  display: flex;
  align-items: center;
  padding: 20rpx 22rpx;
  margin-bottom: 20rpx;
  border-radius: 20rpx;
  background: rgba(255, 252, 245, 0.55);
  border: 1rpx solid var(--line);
}

.offline-card.done {
  background: rgba(47, 93, 80, 0.06);
  border-color: rgba(47, 93, 80, 0.14);
}

.offline-card.active {
  background: rgba(176, 138, 82, 0.07);
  border-color: rgba(176, 138, 82, 0.18);
}

.offline-icon {
  width: 54rpx;
  height: 54rpx;
  border-radius: 16rpx;
  background: rgba(47, 93, 80, 0.09);
  color: var(--jade);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25rpx;
  flex-shrink: 0;
}

.offline-card.done .offline-icon {
  background: var(--jade);
  color: #f8f3e7;
}

.offline-copy {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  display: flex;
  flex-direction: column;
}

.offline-title {
  font-size: 23rpx;
  color: var(--ink);
}

.offline-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.offline-track {
  height: 5rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.08);
  margin-top: 8rpx;
  overflow: hidden;
}

.offline-fill {
  height: 100%;
  border-radius: 999rpx;
  background: var(--gold);
  transition: width 0.3s ease;
}

.offline-btn {
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  color: var(--ink-soft);
  font-size: 20rpx;
  display: flex;
  align-items: center;
  margin-left: 14rpx;
  flex-shrink: 0;
}

.offline-btn.primary {
  background: var(--jade);
  border-color: var(--jade);
  color: #f8f3e7;
}
</style>
