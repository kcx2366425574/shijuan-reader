<template>
  <view class="reader-root" :class="'theme-' + theme.key" :style="rootStyle">
    <view v-if="!chapterReady && loadingBook" class="reader-state">
      <LoadingState text="正在铺开书页…" />
    </view>

    <view v-else-if="!chapterReady && fatalError" class="reader-state">
      <view class="reader-error-card">
        <text class="reader-error-title serif">书页没有打开</text>
        <text class="reader-error-text">{{ fatalError }}</text>
        <view class="reader-error-actions">
          <view class="reader-error-btn" @tap="goBack">返回</view>
          <view class="reader-error-btn primary" @tap="retryInit">重试</view>
        </view>
      </view>
    </view>

    <template v-else>
      <scroll-view
        :key="scrollKey"
        class="reader-scroll"
        scroll-y
        :scroll-top="scrollTopValue"
        :show-scrollbar="false"
        :style="{ backgroundColor: theme.background }"
        @scroll="onScroll"
        @scrolltolower="onScrollToLower"
      >
        <view class="reader-inner" :style="textStyle" @tap="toggleToolbar">
          <view class="chapter-head">
            <text class="book-crumb">{{ book.name }}</text>
            <text class="chapter-title serif">{{ chapterTitle }}</text>
            <view class="chapter-meta">
              <text>第 {{ currentIndex + 1 }} / {{ chapters.length }} 章</text>
              <text class="chapter-meta-dot">·</text>
              <text>{{ readingPercent }}%</text>
            </view>
            <view class="chapter-rule">
              <view class="rule-line" />
              <view class="rule-diamond" />
              <view class="rule-line" />
            </view>
          </view>

          <view v-if="loadingChapter" class="chapter-loading">
            <LoadingState text="正在取这一章…" inline />
          </view>

          <view v-else-if="chapterError" class="chapter-error" @tap.stop>
            <text class="chapter-error-text">{{ chapterError }}</text>
            <view class="chapter-error-btn" @tap.stop="retryChapter">重试本章</view>
          </view>

          <view v-else class="paragraphs" :class="fontFamilyClass">
            <text
              v-for="(paragraph, index) in paragraphs"
              :key="index"
              class="reader-para"
            >{{ paragraph }}</text>
          </view>

          <view v-if="!loadingChapter && !chapterError" class="chapter-tail">
            <view class="tail-ornament">
              <view class="tail-line" />
              <text class="tail-text serif">本章完</text>
              <view class="tail-line" />
            </view>
            <view
              v-if="nextChapterData"
              class="next-card"
              hover-class="press"
              @tap.stop="nextChapter"
            >
              <view class="next-info">
                <text class="next-label">下一章</text>
                <text class="next-name serif ellipsis">{{ nextChapterData.name }}</text>
              </view>
              <text class="next-arrow">→</text>
            </view>
            <view v-else class="last-chapter-note serif">已读到最后一章</view>
          </view>
        </view>
      </scroll-view>

      <view class="reader-top" :class="{ visible: showToolbar }" @tap.stop>
        <view class="top-safe" />
        <view class="top-bar">
          <view class="reader-icon-btn" @tap="goBack" hover-class="press">
            <view class="back-chevron" />
          </view>
          <view class="top-titles">
            <text class="top-book ellipsis">{{ book.name }}</text>
            <text class="top-chapter ellipsis">{{ chapterTitle }}</text>
          </view>
          <view class="reader-icon-btn" @tap="openCatalog" hover-class="press">
            <view class="catalog-icon">
              <view class="catalog-line" />
              <view class="catalog-line short" />
              <view class="catalog-line" />
            </view>
          </view>
        </view>
      </view>

      <view class="reader-bottom" :class="{ visible: showToolbar }" @tap.stop>
        <view class="reader-progress">
          <view class="reader-progress-fill" :style="{ width: readingPercent + '%' }" />
        </view>
        <view class="bottom-bar">
          <view class="bottom-action" @tap="openCatalog" hover-class="press">
            <view class="action-icon catalog-icon">
              <view class="catalog-line" />
              <view class="catalog-line short" />
              <view class="catalog-line" />
            </view>
            <text class="action-label">目录</text>
          </view>
          <view class="bottom-action" :class="{ disabled: currentIndex <= 0 }" @tap="prevChapter" hover-class="press">
            <view class="action-icon prev-icon" />
            <text class="action-label">上一章</text>
          </view>
          <view class="bottom-action" :class="{ disabled: currentIndex >= chapters.length - 1 }" @tap="nextChapter" hover-class="press">
            <view class="action-icon next-icon" />
            <text class="action-label">下一章</text>
          </view>
          <view class="bottom-action" @tap="openCacheMenu" hover-class="press">
            <view class="action-icon cache-icon">
              <view class="cache-arrow" />
              <view class="cache-tray" />
            </view>
            <text class="action-label">{{ cachePercent !== null ? '缓存 ' + cachePercent + '%' : '缓存' }}</text>
          </view>
          <view class="bottom-action" @tap="openSettings" hover-class="press">
            <view class="action-icon settings-icon">
              <view class="settings-ring" />
              <view class="settings-dot" />
            </view>
            <text class="action-label">设置</text>
          </view>
        </view>
      </view>
    </template>

    <BottomSheet v-model:show="showCatalog" title="章节目录" :scroll-into-view="catalogScrollIntoView">
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
          :id="'catalog-row-' + chapter.index"
          class="catalog-row"
          :class="{ current: chapter.index === currentIndex, target: chapter.index === catalogTargetIndex }"
          hover-class="press"
          @tap="selectCatalogChapter(chapter.index)"
        >
          <text class="catalog-index">{{ pad2(chapter.index + 1) }}</text>
          <text class="catalog-name ellipsis">{{ chapter.name }}</text>
          <text v-if="cachedUrls.has(chapter.url)" class="catalog-cached">已缓存</text>
          <text v-if="chapter.index === currentIndex" class="catalog-current">正在读</text>
        </view>
      </view>
      <view class="catalog-pager">
        <view class="pager-btn" :class="{ disabled: catalogPage <= 0 }" @tap="changeCatalogPage(-1)">上一页</view>
        <text class="pager-info">{{ catalogPage + 1 }} / {{ catalogPageCount }}</text>
        <view class="pager-btn" :class="{ disabled: catalogPage >= catalogPageCount - 1 }" @tap="changeCatalogPage(1)">下一页</view>
      </view>
    </BottomSheet>

    <BottomSheet v-model:show="showSettings" title="阅读设置">
      <view class="settings-preview" :style="previewStyle">
        <text class="preview-text">山色空蒙雨亦奇</text>
        <text class="preview-sub">— 阅读效果预览 —</text>
      </view>

      <view class="setting-block">
        <text class="setting-label">主题</text>
        <view class="theme-row">
          <view
            v-for="item in themes"
            :key="item.key"
            class="theme-item"
            :class="{ active: settings.theme === item.key }"
            @tap="setTheme(item.key)"
          >
            <view class="theme-swatch" :style="{ background: item.background, borderColor: item.line }">
              <text class="theme-swatch-text serif" :style="{ color: item.text }">文</text>
            </view>
            <text class="theme-name">{{ item.name }}</text>
          </view>
        </view>
      </view>

      <view class="setting-block">
        <view class="setting-row">
          <text class="setting-label">字号</text>
          <view class="stepper">
            <view class="stepper-btn" @tap="changeFont(-1)">−</view>
            <text class="stepper-value">{{ settings.fontSize }}</text>
            <view class="stepper-btn" @tap="changeFont(1)">+</view>
          </view>
        </view>
        <view class="slider-wrap">
          <text class="slider-edge">小</text>
          <slider
            class="reader-slider"
            :value="settings.fontSize"
            :min="14"
            :max="32"
            :step="1"
            active-color="#8a6b45"
            background-color="rgba(37,42,36,0.14)"
            block-size="18"
            @change="onFontSlider"
          />
          <text class="slider-edge">大</text>
        </view>
      </view>

      <view class="setting-block">
        <view class="setting-row">
          <text class="setting-label">行距</text>
          <text class="setting-value">{{ settings.lineHeight.toFixed(1) }}</text>
        </view>
        <view class="slider-wrap">
          <text class="slider-edge">紧</text>
          <slider
            class="reader-slider"
            :value="settings.lineHeight"
            :min="1.4"
            :max="2.6"
            :step="0.1"
            active-color="#8a6b45"
            background-color="rgba(37,42,36,0.14)"
            block-size="18"
            @change="onLineHeightSlider"
          />
          <text class="slider-edge">松</text>
        </view>
      </view>

      <view class="setting-block">
        <text class="setting-label">字体</text>
        <view class="segment">
          <view class="segment-item" :class="{ active: settings.fontFamily === 'serif' }" @tap="setFontFamily('serif')">
            <text class="segment-serif serif">宋体 · 书卷</text>
          </view>
          <view class="segment-item" :class="{ active: settings.fontFamily === 'sans' }" @tap="setFontFamily('sans')">
            <text>黑体 · 清朗</text>
          </view>
        </view>
      </view>

      <view class="setting-block switch-block">
        <view class="switch-row">
          <view class="switch-copy">
            <text class="setting-label">读完自动下一章</text>
            <text class="switch-desc">滚动到章节底部时自动继续</text>
          </view>
          <switch :checked="settings.autoNext" color="#2f5d50" @change="onAutoNextChange" />
        </view>
        <view class="switch-row">
          <view class="switch-copy">
            <text class="setting-label">阅读时保持屏幕常亮</text>
            <text class="switch-desc">离开阅读页后自动恢复</text>
          </view>
          <switch :checked="settings.keepScreenOn" color="#2f5d50" @change="onKeepScreenOnChange" />
        </view>
      </view>

      <view class="settings-bottom-space" />
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { onBackPress, onHide, onLoad, onUnload } from '@dcloudio/uni-app'
import LoadingState from '../../components/LoadingState.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import {
  ensureSources,
  getShelfBook,
  upsertShelfBook,
  updateShelfBook,
  updateBookProgress,
  loadSettings,
  saveSettings
} from '../../core/store.js'
import { getCachedBook, cacheBook } from '../../core/book-cache.js'
import { getOfflineBook, getOfflineChapter, buildCachedUrlSet, appendOfflineChapters } from '../../core/offline.js'
import { createAutoCacheScheduler } from '../../core/auto-cache.js'
import { downloadBook, cancelBookDownload, getDownloadState } from '../../core/download.js'
import { openBook, getChapterContent } from '../../core/service.js'
import { READER_THEMES, THEME_LIST, getTheme } from '../../core/theme.js'
import { splitParagraphs, toast, pad2, clamp, firstReadableIndex } from '../../utils/format.js'

const chapterContentCache = new Map()
const prefetching = new Set()
const PAGE_SIZE = 100

const params = ref({})
const book = ref({ name: '阅读' })
const source = ref(null)
const chapters = ref([])
const currentIndex = ref(0)
const pendingIndex = ref(null)
const queuedIndex = ref(null)
const chapterTitle = ref('')
const paragraphs = ref([])
const loadingBook = ref(true)
const loadingChapter = ref(false)
const chapterReady = ref(false)
const fatalError = ref('')
const chapterError = ref('')
const showToolbar = ref(true)
const showCatalog = ref(false)
const showSettings = ref(false)
const catalogPage = ref(0)
const catalogTargetIndex = ref(-1)
const catalogScrollIntoView = ref('')
const catalogJump = ref('')
const cachedUrls = ref(new Set())
const scrollTopValue = ref(0)
const trackedScrollTop = ref(0)
const scrollKey = ref(0)
const scrollRatio = ref(0)
const cachePercent = ref(null)
let cacheTimer = null
const settings = ref(loadSettings())
const themes = THEME_LIST
const theme = computed(() => getTheme(settings.value.theme))
const readingPercent = computed(() => {
  const total = chapters.value.length
  if (!total) return 0
  const value = ((currentIndex.value + scrollRatio.value) / total) * 100
  return Math.max(0, Math.min(100, Math.round(value)))
})
const rootStyle = computed(() => ({
  '--r-bg': theme.value.background,
  '--r-surface': theme.value.surface,
  '--r-text': theme.value.text,
  '--r-sub': theme.value.secondary,
  '--r-line': theme.value.line,
  '--r-accent': theme.value.accent,
  backgroundColor: theme.value.background,
  color: theme.value.text
}))
const textStyle = computed(() => ({
  fontSize: settings.value.fontSize + 'px',
  lineHeight: settings.value.lineHeight
}))
const previewStyle = computed(() => ({
  fontSize: settings.value.fontSize + 'px',
  lineHeight: settings.value.lineHeight,
  fontFamily: settings.value.fontFamily === 'serif'
    ? "'Songti SC','STSong','Noto Serif CJK SC',serif"
    : "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"
}))
const fontFamilyClass = computed(() => settings.value.fontFamily === 'serif' ? 'font-serif' : 'font-sans')
const nextChapterData = computed(() => chapters.value[currentIndex.value + 1] || null)
const prevChapterData = computed(() => chapters.value[currentIndex.value - 1] || null)

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

let hideTimer = null
let saveTimer = null
let autoNextTimer = null
let windowHeight = 600
let restoredScroll = false

function getWindowHeight() {
  try {
    const info = uni.getSystemInfoSync()
    windowHeight = info.windowHeight || info.screenHeight || 600
  } catch (e) {
    windowHeight = 600
  }
}

function applyStatusBar() {
  // #ifdef APP-PLUS
  try {
    plus.navigator.setStatusBarStyle(theme.value.statusBar === 'light' ? 'light' : 'dark')
    plus.navigator.setStatusBarBackground(theme.value.background)
    uni.setBackgroundColor({ backgroundColor: theme.value.background })
  } catch (e) {
    // ignore
  }
  // #endif
}

function showChromeTemporarily() {
  showToolbar.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showToolbar.value = false
  }, 2800)
}

function toggleToolbar() {
  if (showCatalog.value || showSettings.value) return
  if (showToolbar.value) {
    showToolbar.value = false
    if (hideTimer) clearTimeout(hideTimer)
  } else {
    showChromeTemporarily()
  }
}

function saveProgress(immediate) {
  if (!book.value.id || !chapters.value.length) return
  const payload = {
    chapterIndex: currentIndex.value,
    chapterName: chapterTitle.value || (chapters.value[currentIndex.value] || {}).name || '',
    chapterUrl: (chapters.value[currentIndex.value] || {}).url || '',
    scrollTop: trackedScrollTop.value,
    percent: readingPercent.value / 100,
    updatedAt: Date.now()
  }
  const run = () => updateBookProgress(book.value.id, payload)
  if (saveTimer) clearTimeout(saveTimer)
  if (immediate) run()
  else saveTimer = setTimeout(run, 2000)
}

function ensureShelfEntry() {
  if (!source.value || !chapters.value.length) return
  upsertShelfBook({
    id: book.value.id,
    sourceId: source.value.id,
    sourceName: source.value.name,
    sourceUrl: source.value.url,
    name: book.value.name,
    author: book.value.author,
    coverUrl: book.value.coverUrl,
    intro: book.value.intro,
    kind: book.value.kind,
    status: book.value.status,
    lastChapter: book.value.lastChapter,
    bookUrl: book.value.bookUrl,
    tocUrl: book.value.tocUrl,
    chapterCount: chapters.value.length
  })
}

/** 目录「已缓存」标记：进入页面/整本缓存完成后重建 URL 集合。 */
async function refreshCachedUrls() {
  if (!book.value.id) return
  try {
    const offline = await getOfflineBook(book.value.id)
    cachedUrls.value = buildCachedUrlSet(offline && offline.contents)
  } catch (e) {
    // 读不到离线数据不影响阅读，仅不显示标记
  }
}

/**
 * 在线加载成功后的自动缓存：1.2 秒防抖窗口内只写一次离线文件。
 * 写入由 offline.js 的批量 API 串行化并按 url 去重，失败不阻塞阅读。
 */
const autoCache = createAutoCacheScheduler(async (entries) => {
  const base = {
    bookId: book.value.id,
    info: book.value,
    chapters: chapters.value,
    bookUrl: book.value.bookUrl,
    tocUrl: book.value.tocUrl,
    sourceId: source.value ? source.value.id : '',
    sourceName: source.value ? source.value.name : ''
  }
  try {
    const payload = await appendOfflineChapters({ ...base, entries })
    if (payload) {
      const next = new Set(cachedUrls.value)
      for (const entry of entries) next.add(entry.chapter.url)
      cachedUrls.value = next
    }
  } catch (e) {
    // 自动缓存失败不阻塞在线阅读
  }
}, 1200)

function scheduleAutoCache(chapter, result) {
  if (!book.value.id || !chapter || !chapter.url || !result || !result.content) return
  autoCache.schedule({
    chapter: { url: chapter.url, name: chapter.name },
    content: result.content,
    title: result.title || chapter.name
  })
}

function flushAutoCache() {
  return autoCache.flush()
}

async function loadChapter(index, options = {}) {
  if (index < 0 || index >= chapters.value.length) {
    toast(index < 0 ? '已经是第一章' : '已经是最后一章')
    return
  }
  if (loadingChapter.value) {
    if (pendingIndex.value === index) {
      toast('这一章正在加载，请稍候')
      return
    }
    queuedIndex.value = index
    toast('正在加载，完成后自动跳转')
    return
  }
  loadingChapter.value = true
  chapterError.value = ''
  pendingIndex.value = index
  const chapter = chapters.value[index]
  const restoreChapter = options.restore && book.value.progress && book.value.progress.chapterIndex === index
  if (!restoreChapter) {
    scrollTopValue.value = 0
    trackedScrollTop.value = 0
    scrollRatio.value = 0
  }
  try {
    let result = chapterContentCache.get(chapter.url)
    if (!result) {
      try {
        result = await getOfflineChapter(book.value.id, chapter.url)
      } catch (e) {
        result = null
      }
    }
    if (!result) {
      if (!source.value) throw new Error('该章尚未缓存，且当前没有可用的书源')
      result = await getChapterContent(source.value, chapter, { bookUrl: book.value.bookUrl })
      chapterContentCache.set(chapter.url, result)
      scheduleAutoCache(chapter, result)
      if (chapterContentCache.size > 30) {
        const first = chapterContentCache.keys().next().value
        chapterContentCache.delete(first)
      }
    }
    currentIndex.value = index
    pendingIndex.value = null
    chapterTitle.value = result.title || chapter.name
    paragraphs.value = splitParagraphs(result.content)
    chapterReady.value = true
    loadingChapter.value = false
    scrollKey.value++
    if (restoreChapter) {
      const target = Math.max(0, Number(book.value.progress.scrollTop) || 0)
      await nextTick()
      setTimeout(() => {
        scrollTopValue.value = target
        trackedScrollTop.value = target
        restoredScroll = true
      }, 80)
    } else {
      scrollTopValue.value = 0
      trackedScrollTop.value = 0
      scrollRatio.value = 0
    }
    ensureShelfEntry()
    saveProgress(true)
    showChromeTemporarily()
    prefetchNext(index)
    runQueuedChapter()
  } catch (e) {
    loadingChapter.value = false
    chapterError.value = e && e.message ? e.message : '这一章加载失败'
    chapterReady.value = true
    if (!paragraphs.value.length) chapters.value = chapters.value.slice()
    runQueuedChapter()
  }
}

function runQueuedChapter() {
  const target = queuedIndex.value
  queuedIndex.value = null
  if (target === null || target === currentIndex.value) return
  setTimeout(() => {
    if (!loadingChapter.value) loadChapter(target)
  }, 40)
}

function prefetchNext(index) {
  if (!source.value) return
  const next = chapters.value[index + 1]
  if (!next || chapterContentCache.has(next.url) || prefetching.has(next.url)) return
  prefetching.add(next.url)
  setTimeout(() => {
    getChapterContent(source.value, next, { bookUrl: book.value.bookUrl })
      .then((result) => {
        chapterContentCache.set(next.url, result)
      })
      .catch(() => {})
      .finally(() => prefetching.delete(next.url))
  }, 900)
}

async function init() {
  getWindowHeight()
  settings.value = loadSettings()
  applyStatusBar()

  let shelfBook = null
  let bookId = params.value.bookId || ''
  let sourceId = params.value.sourceId || ''
  let bookUrl = params.value.bookUrl || ''

  if (bookId) {
    shelfBook = getShelfBook(bookId)
    if (shelfBook) {
      sourceId = shelfBook.sourceId
      bookUrl = shelfBook.bookUrl
    }
  }

  const sources = ensureSources()
  source.value = sources.find((item) => item.id === sourceId) || null
  const offlineBook = bookId ? await getOfflineBook(bookId) : null
  cachedUrls.value = buildCachedUrlSet(offlineBook && offlineBook.contents)
  if (!source.value && !offlineBook) {
    loadingBook.value = false
    fatalError.value = '找不到这本书的书源，可能已被删除。'
    return
  }

  const cached = bookId ? getCachedBook(bookId) : null
  if (cached && cached.chapters && cached.chapters.length) {
    chapters.value = cached.chapters
    book.value = {
      id: bookId,
      ...(shelfBook || {}),
      ...(cached.info || {}),
      bookUrl: cached.bookUrl || bookUrl,
      tocUrl: cached.tocUrl,
      name: (cached.info && cached.info.name) || (shelfBook && shelfBook.name) || '阅读'
    }
  } else if (offlineBook && offlineBook.chapters && offlineBook.chapters.length) {
    chapters.value = offlineBook.chapters
    book.value = {
      id: bookId,
      ...(shelfBook || {}),
      ...(offlineBook.info || {}),
      sourceId: offlineBook.sourceId || sourceId,
      sourceName: offlineBook.sourceName || '',
      sourceUrl: source.value ? source.value.url : '',
      bookUrl: offlineBook.bookUrl || bookUrl,
      tocUrl: offlineBook.tocUrl || '',
      chapterCount: chapters.value.length,
      offline: true
    }
    cacheBook(bookId, {
      info: book.value,
      chapters: chapters.value,
      bookUrl: book.value.bookUrl,
      tocUrl: book.value.tocUrl
    })
  } else {
    // 书源已删除、离线目录又为空时，openBook 无法工作，后续访问 source.value.id 会抛空指针。
    if (!source.value) {
      loadingBook.value = false
      fatalError.value = '这本书的书源已被删除，且本地缓存不完整，无法阅读。'
      return
    }
    try {
      const opened = await openBook(source.value, bookUrl, shelfBook || {}, {})
      chapters.value = opened.chapters || []
      bookId = bookId || 'b-' + Date.now()
      book.value = {
        id: bookId,
        ...(shelfBook || {}),
        ...(opened.info || {}),
        sourceId: source.value.id,
        sourceName: source.value.name,
        sourceUrl: source.value.url,
        bookUrl: opened.bookUrl,
        tocUrl: opened.tocUrl,
        chapterCount: chapters.value.length
      }
      cacheBook(bookId, {
        info: book.value,
        chapters: chapters.value,
        bookUrl: opened.bookUrl,
        tocUrl: opened.tocUrl
      })
      ensureShelfEntry()
    } catch (e) {
      loadingBook.value = false
      fatalError.value = e && e.message ? e.message : '书籍加载失败'
      return
    }
  }

  if (shelfBook && shelfBook.progress) book.value.progress = shelfBook.progress
  if (!chapters.value.length) {
    loadingBook.value = false
    fatalError.value = '目录为空，无法阅读。'
    return
  }

  const requested = Number(params.value.chapter)
  let index = 0
  if (Number.isInteger(requested) && requested >= 0) index = requested
  else if (book.value.progress && Number.isInteger(book.value.progress.chapterIndex)) index = book.value.progress.chapterIndex
  else index = firstReadableIndex(chapters.value)
  index = clamp(index, 0, chapters.value.length - 1)
  loadingBook.value = false
  await loadChapter(index, { restore: true })

  // 真正进入正文后清掉追更角标。放在 reader 层可一处覆盖书架卡片、详情页、
  // 搜索结果、书城等全部入口；未成功读出正文时保留角标，避免误清。
  if (!chapterError.value && paragraphs.value.length) {
    const readingBookId = (book.value && book.value.id) || bookId
    if (readingBookId) updateShelfBook(readingBookId, { newChapterCount: 0 })
  }

  refreshCacheState()
  if (settings.value.keepScreenOn) {
    try { uni.setKeepScreenOn({ keepScreenOn: true }) } catch (e) { /* ignore */ }
  }
}

function retryInit() {
  fatalError.value = ''
  loadingBook.value = true
  init()
}

function retryChapter() {
  const target = pendingIndex.value !== null ? pendingIndex.value : currentIndex.value
  pendingIndex.value = null
  loadChapter(target, { restore: false })
}

function goBack() {
  saveProgress(true)
  if (hideTimer) clearTimeout(hideTimer)
  try { uni.setKeepScreenOn({ keepScreenOn: false }) } catch (e) { /* ignore */ }
  const pages = getCurrentPages()
  if (pages && pages.length > 1) uni.navigateBack({ delta: 1 })
  else uni.switchTab({ url: '/pages/shelf/shelf' })
}

function prevChapter() {
  if (currentIndex.value <= 0) {
    toast('已经是第一章')
    return
  }
  loadChapter(currentIndex.value - 1)
}

function nextChapter() {
  if (currentIndex.value >= chapters.value.length - 1) {
    toast('已经是最后一章')
    return
  }
  loadChapter(currentIndex.value + 1)
}

function onScroll(event) {
  const detail = event.detail || {}
  trackedScrollTop.value = detail.scrollTop || 0
  const scrollHeight = detail.scrollHeight || 0
  const max = scrollHeight > windowHeight ? scrollHeight - windowHeight : 0
  scrollRatio.value = max ? clamp(trackedScrollTop.value / max, 0, 1) : 0
  saveProgress(false)
}

function onScrollToLower() {
  if (!settings.value.autoNext || loadingChapter.value) return
  if (currentIndex.value >= chapters.value.length - 1) return
  if (autoNextTimer) clearTimeout(autoNextTimer)
  autoNextTimer = setTimeout(() => {
    if (settings.value.autoNext) loadChapter(currentIndex.value + 1)
  }, 700)
}

function openCatalog() {
  if (!chapters.value.length) return
  catalogPage.value = catalogPageForIndex(currentIndex.value)
  catalogJump.value = ''
  catalogTargetIndex.value = currentIndex.value
  catalogScrollIntoView.value = ''
  showCatalog.value = true
  showToolbar.value = false
  nextTick(() => {
    setTimeout(() => {
      catalogScrollIntoView.value = 'catalog-row-' + currentIndex.value
    }, 80)
  })
}

function changeCatalogPage(delta) {
  const next = catalogPage.value + delta
  if (next < 0 || next >= catalogPageCount.value) return
  catalogPage.value = next
}

function toggleCatalogOrder() {
  persistSettings({ catalogReverse: !settings.value.catalogReverse })
  // 切换后仍让当前阅读章所在页可见，并同步高亮目标。
  catalogPage.value = catalogPageForIndex(currentIndex.value)
  catalogTargetIndex.value = currentIndex.value
  catalogScrollIntoView.value = ''
  nextTick(() => {
    setTimeout(() => {
      catalogScrollIntoView.value = 'catalog-row-' + currentIndex.value
    }, 80)
  })
}

function jumpToChapter() {
  const value = parseInt(catalogJump.value, 10)
  if (!Number.isFinite(value) || value < 1) {
    toast('请输入有效的章节号')
    return
  }
  const index = Math.min(chapters.value.length, value) - 1
  catalogPage.value = catalogPageForIndex(index)
  catalogTargetIndex.value = index
  catalogJump.value = ''
  catalogScrollIntoView.value = ''
  nextTick(() => {
    setTimeout(() => {
      catalogScrollIntoView.value = 'catalog-row-' + index
    }, 80)
  })
  toast(`已定位到第 ${index + 1} 章，点击条目开始阅读`)
}

function selectCatalogChapter(index) {
  showCatalog.value = false
  setTimeout(() => loadChapter(index), 80)
}

function refreshCacheState() {
  if (!book.value.id) return
  const state = getDownloadState(book.value.id)
  cachePercent.value = state ? state.percent : null
  if (state) startCachePolling()
  else stopCachePolling()
}

function startCachePolling() {
  if (cacheTimer) return
  cacheTimer = setInterval(() => {
    const state = getDownloadState(book.value.id)
    if (state) cachePercent.value = state.percent
    else {
      cachePercent.value = null
      stopCachePolling()
    }
  }, 1000)
}

function stopCachePolling() {
  if (cacheTimer) {
    clearInterval(cacheTimer)
    cacheTimer = null
  }
}

function openCacheMenu() {
  if (!book.value.id || !chapters.value.length) {
    toast('目录还没有加载好')
    return
  }
  if (!source.value) {
    toast('当前没有可下载的书源')
    return
  }
  const state = getDownloadState(book.value.id)
  if (state) {
    uni.showActionSheet({
      itemList: ['取消缓存'],
      success() {
        cancelBookDownload(book.value.id)
        toast('已请求取消，已下载章节会保留')
      }
    })
    return
  }
  const index = currentIndex.value
  const last = chapters.value.length - 1
  uni.showActionSheet({
    itemList: [`从本章缓存到结尾`, `仅缓存本章`, `缓存全书`],
    success(res) {
      if (res.tapIndex === 0) startCache(index, last, '开始从本章缓存')
      else if (res.tapIndex === 1) startCache(index, index, '开始缓存本章')
      else if (res.tapIndex === 2) startCache(0, last, '开始缓存全书')
    }
  })
}

function startCache(startIndex, endIndex, tip) {
  ensureShelfEntry()
  const payload = {
    id: book.value.id,
    name: book.value.name,
    author: book.value.author,
    coverUrl: book.value.coverUrl,
    intro: book.value.intro,
    kind: book.value.kind,
    status: book.value.status,
    lastChapter: book.value.lastChapter,
    bookUrl: book.value.bookUrl,
    tocUrl: book.value.tocUrl,
    sourceId: source.value.id,
    sourceName: source.value.name,
    chapterCount: chapters.value.length
  }
  cachePercent.value = 0
  toast(tip)
  startCachePolling()
  downloadBook(source.value, payload, chapters.value, {
    startIndex,
    endIndex,
    concurrency: 3,
    onProgress(state) {
      if (state) cachePercent.value = state.percent
    }
  }).then((state) => {
    cachePercent.value = null
    stopCachePolling()
    refreshCachedUrls()
    if (state.status === 'done') toast('全书已缓存，可离线阅读')
    else if (state.status === 'cancelled') toast('已取消缓存')
    else toast(`本次已缓存 ${state.done}/${state.total} 章`)
  }).catch((e) => {
    cachePercent.value = null
    stopCachePolling()
    toast(e && e.message ? e.message : '缓存失败')
  })
}

function openSettings() {
  showSettings.value = true
  showToolbar.value = false
}

function persistSettings(patch) {
  settings.value = saveSettings({ ...settings.value, ...patch })
  if (settings.value.keepScreenOn) {
    try { uni.setKeepScreenOn({ keepScreenOn: true }) } catch (e) { /* ignore */ }
  } else {
    try { uni.setKeepScreenOn({ keepScreenOn: false }) } catch (e) { /* ignore */ }
  }
}

function setTheme(key) {
  persistSettings({ theme: key })
  setTimeout(applyStatusBar, 0)
}

function changeFont(delta) {
  persistSettings({ fontSize: clamp(settings.value.fontSize + delta, 14, 32) })
}

function onFontSlider(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persistSettings({ fontSize: clamp(Number(value) || 19, 14, 32) })
}

function onLineHeightSlider(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persistSettings({ lineHeight: clamp(Number(value) || 1.9, 1.4, 2.6) })
}

function setFontFamily(value) {
  persistSettings({ fontFamily: value })
}

function onAutoNextChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persistSettings({ autoNext: !!value })
}

function onKeepScreenOnChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persistSettings({ keepScreenOn: !!value })
}

onLoad((options) => {
  params.value = options || {}
  settings.value = loadSettings()
  init()
})

onHide(() => {
  saveProgress(true)
  flushAutoCache()
})

onUnload(() => {
  saveProgress(true)
  flushAutoCache()
  if (hideTimer) clearTimeout(hideTimer)
  if (saveTimer) clearTimeout(saveTimer)
  if (autoNextTimer) clearTimeout(autoNextTimer)
  stopCachePolling()
  try { uni.setKeepScreenOn({ keepScreenOn: false }) } catch (e) { /* ignore */ }
})

onBackPress(() => {
  saveProgress(true)
  return false
})

onBeforeUnmount(() => {
  flushAutoCache()
  if (hideTimer) clearTimeout(hideTimer)
  if (saveTimer) clearTimeout(saveTimer)
  if (autoNextTimer) clearTimeout(autoNextTimer)
})
</script>

<style scoped>
.reader-root {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  overflow: hidden;
  background: var(--r-bg);
  color: var(--r-text);
  transition: background-color 0.25s ease, color 0.25s ease;
}

.reader-scroll {
  width: 100%;
  height: 100vh;
}

.reader-inner {
  padding: calc(var(--status-bar-height, 0px) + 96rpx) 52rpx 220rpx;
  box-sizing: border-box;
  min-height: 100vh;
}

.chapter-head {
  display: flex;
  flex-direction: column;
}

.book-crumb {
  font-size: 21rpx;
  letter-spacing: 2rpx;
  color: var(--r-sub);
}

.chapter-title {
  margin-top: 18rpx;
  font-size: 46rpx;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--r-text);
}

.chapter-meta {
  margin-top: 18rpx;
  display: flex;
  align-items: center;
  font-size: 20rpx;
  color: var(--r-sub);
  letter-spacing: 1rpx;
}

.chapter-meta-dot {
  margin: 0 10rpx;
  opacity: 0.6;
}

.chapter-rule {
  display: flex;
  align-items: center;
  margin: 36rpx 0 16rpx;
  opacity: 0.5;
}

.rule-line {
  flex: 1;
  height: 1rpx;
  background: var(--r-line);
}

.rule-diamond {
  width: 8rpx;
  height: 8rpx;
  margin: 0 14rpx;
  transform: rotate(45deg);
  border: 1rpx solid var(--r-sub);
}

.paragraphs {
  padding-top: 24rpx;
}

.reader-para {
  display: block;
  text-indent: 2em;
  margin-bottom: 0.85em;
  letter-spacing: 0.5rpx;
  color: var(--r-text);
  word-break: break-word;
}

.font-serif {
  font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif;
}

.font-sans {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.chapter-loading {
  padding: 80rpx 0;
}

.chapter-error {
  margin-top: 50rpx;
  padding: 30rpx;
  border-radius: 20rpx;
  border: 1rpx solid var(--r-line);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chapter-error-text {
  font-size: 25rpx;
  color: var(--r-sub);
  line-height: 1.7;
  text-align: center;
}

.chapter-error-btn {
  margin-top: 22rpx;
  height: 68rpx;
  padding: 0 30rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--r-line);
  color: var(--r-text);
  font-size: 24rpx;
  display: flex;
  align-items: center;
}

.chapter-tail {
  margin-top: 60rpx;
}

.tail-ornament {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30rpx 0 40rpx;
}

.tail-line {
  width: 70rpx;
  height: 1rpx;
  background: var(--r-line);
}

.tail-text {
  margin: 0 20rpx;
  font-size: 22rpx;
  letter-spacing: 4rpx;
  color: var(--r-sub);
}

.next-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx;
  border-radius: 22rpx;
  background: var(--r-surface);
  border: 1rpx solid var(--r-line);
}

.next-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.next-label {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: var(--r-sub);
}

.next-name {
  margin-top: 6rpx;
  font-size: 29rpx;
  color: var(--r-text);
}

.next-arrow {
  margin-left: 20rpx;
  font-size: 30rpx;
  color: var(--r-sub);
}

.last-chapter-note {
  text-align: center;
  font-size: 24rpx;
  color: var(--r-sub);
  letter-spacing: 3rpx;
  padding: 30rpx 0;
}

.reader-top {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 40;
  background: var(--r-surface);
  border-bottom: 1rpx solid var(--r-line);
  transform: translateY(-105%);
  opacity: 0;
  transition: transform 0.24s ease, opacity 0.24s ease;
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.06);
}

.reader-top.visible {
  transform: translateY(0);
  opacity: 1;
}

.top-safe {
  height: var(--status-bar-height, 0px);
}

.top-bar {
  height: 92rpx;
  display: flex;
  align-items: center;
  padding: 0 20rpx;
}

.reader-icon-btn {
  width: 80rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.back-chevron {
  width: 20rpx;
  height: 20rpx;
  border-left: 3rpx solid var(--r-text);
  border-bottom: 3rpx solid var(--r-text);
  transform: rotate(45deg);
  margin-left: 8rpx;
}

.top-titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.top-book {
  max-width: 100%;
  font-size: 22rpx;
  color: var(--r-sub);
}

.top-chapter {
  max-width: 100%;
  margin-top: 2rpx;
  font-size: 25rpx;
  color: var(--r-text);
}

.catalog-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 30rpx;
}

.catalog-line {
  height: 2rpx;
  border-radius: 2rpx;
  background: var(--r-text);
  margin: 4rpx 0;
  opacity: 0.8;
}

.catalog-line.short {
  width: 18rpx;
}

.reader-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: var(--r-surface);
  border-top: 1rpx solid var(--r-line);
  transform: translateY(105%);
  opacity: 0;
  transition: transform 0.24s ease, opacity 0.24s ease;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -10rpx 30rpx rgba(0, 0, 0, 0.06);
}

.reader-bottom.visible {
  transform: translateY(0);
  opacity: 1;
}

.reader-progress {
  height: 3rpx;
  background: var(--r-line);
}

.reader-progress-fill {
  height: 100%;
  background: var(--r-accent);
  opacity: 0.7;
  transition: width 0.2s ease;
}

.bottom-bar {
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 20rpx;
}

.bottom-action {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100rpx;
}

.bottom-action.disabled {
  opacity: 0.32;
}

.action-icon {
  height: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-label {
  margin-top: 8rpx;
  font-size: 20rpx;
  color: var(--r-sub);
  letter-spacing: 1rpx;
}

.prev-icon,
.next-icon {
  width: 18rpx;
  height: 18rpx;
  border-top: 2rpx solid var(--r-text);
  border-left: 2rpx solid var(--r-text);
}

.prev-icon {
  transform: rotate(-45deg);
  margin-left: 6rpx;
}

.next-icon {
  transform: rotate(135deg);
  margin-right: 6rpx;
}

.settings-icon {
  position: relative;
  width: 30rpx;
  height: 30rpx;
}

.settings-ring {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  border: 2rpx solid var(--r-text);
  opacity: 0.8;
}

.settings-dot {
  position: absolute;
  left: 11rpx;
  top: 11rpx;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: var(--r-text);
  opacity: 0.8;
}

.reader-state {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 50rpx;
}

.reader-error-card {
  width: 100%;
  padding: 44rpx 34rpx;
  border-radius: 28rpx;
  background: var(--r-surface);
  border: 1rpx solid var(--r-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.reader-error-title {
  font-size: 36rpx;
  color: var(--r-text);
  letter-spacing: 2rpx;
}

.reader-error-text {
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--r-sub);
}

.reader-error-actions {
  display: flex;
  margin-top: 30rpx;
}

.reader-error-btn {
  height: 72rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--r-line);
  color: var(--r-text);
  font-size: 24rpx;
  display: flex;
  align-items: center;
  margin: 0 8rpx;
}

.reader-error-btn.primary {
  background: var(--r-accent);
  border-color: var(--r-accent);
  color: #fff;
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
  margin-left: 8rpx;
  flex-shrink: 0;
}

.catalog-cached {
  font-size: 16rpx;
  color: var(--jade);
  border: 1rpx solid var(--jade);
  border-radius: 6rpx;
  padding: 1rpx 7rpx;
  margin-left: 8rpx;
  flex-shrink: 0;
  opacity: 0.85;
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

.settings-preview {
  padding: 30rpx 26rpx;
  border-radius: 20rpx;
  background: rgba(255, 252, 245, 0.7);
  border: 1rpx solid var(--line);
  margin-bottom: 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-text {
  color: var(--ink);
}

.preview-sub {
  margin-top: 16rpx;
  font-size: 19rpx;
  letter-spacing: 2rpx;
  color: var(--muted);
}

.setting-block {
  margin-bottom: 30rpx;
}

.setting-label {
  font-size: 25rpx;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-value {
  font-size: 24rpx;
  color: var(--muted);
}

.theme-row {
  display: flex;
  margin-top: 18rpx;
}

.theme-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 12rpx;
}

.theme-item:last-child {
  margin-right: 0;
}

.theme-swatch {
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  border: 1rpx solid;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.theme-item.active .theme-swatch::after {
  content: '';
  position: absolute;
  left: -8rpx;
  top: -8rpx;
  right: -8rpx;
  bottom: -8rpx;
  border-radius: 50%;
  border: 2rpx solid var(--jade);
}

.theme-swatch-text {
  font-size: 34rpx;
}

.theme-name {
  margin-top: 12rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.theme-item.active .theme-name {
  color: var(--jade);
}

.stepper {
  display: flex;
  align-items: center;
  height: 60rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.05);
  padding: 0 6rpx;
}

.stepper-btn {
  width: 52rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  color: var(--ink-soft);
}

.stepper-value {
  width: 64rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--ink);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.slider-wrap {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.reader-slider {
  flex: 1;
  margin: 0 12rpx;
}

.slider-edge {
  font-size: 19rpx;
  color: var(--muted);
}

.segment {
  display: flex;
  margin-top: 16rpx;
  padding: 6rpx;
  border-radius: 16rpx;
  background: rgba(37, 42, 36, 0.05);
}

.segment-item {
  flex: 1;
  height: 68rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--muted);
}

.segment-item.active {
  background: rgba(255, 252, 245, 0.8);
  color: var(--ink);
  box-shadow: 0 4rpx 12rpx rgba(45, 40, 28, 0.08);
}

.segment-serif {
  letter-spacing: 1rpx;
}

.switch-block {
  margin-top: 6rpx;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  margin-right: 20rpx;
}

.switch-desc {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.settings-bottom-space {
  height: 20rpx;
}

.catalog-row.target {
  background: rgba(176, 138, 82, 0.16);
  margin: 0 -12rpx;
  padding: 0 12rpx;
  border-radius: 12rpx;
}

.cache-icon {
  width: 30rpx;
  height: 32rpx;
  position: relative;
}

.cache-arrow {
  position: absolute;
  left: 14rpx;
  top: 1rpx;
  width: 3rpx;
  height: 18rpx;
  border-radius: 2rpx;
  background: var(--r-text);
  opacity: 0.8;
}

.cache-arrow::after {
  content: '';
  position: absolute;
  left: -4rpx;
  bottom: -1rpx;
  width: 9rpx;
  height: 9rpx;
  border-right: 3rpx solid var(--r-text);
  border-bottom: 3rpx solid var(--r-text);
  transform: rotate(45deg);
  opacity: 0.8;
}

.cache-tray {
  position: absolute;
  left: 3rpx;
  bottom: 1rpx;
  width: 24rpx;
  height: 3rpx;
  border-radius: 2rpx;
  background: var(--r-text);
  opacity: 0.8;
}
</style>
