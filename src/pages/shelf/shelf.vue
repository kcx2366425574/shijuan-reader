<template>
  <view class="page shelf-page">
    <view class="top-safe" />

    <view class="topbar">
      <view class="brand">
        <image class="brand-logo" src="/static/logo.png" mode="aspectFill" />
        <view class="brand-text">
          <text class="brand-name serif">拾卷</text>
          <text class="brand-sub">把喜欢的书，收进一卷里</text>
        </view>
      </view>
      <view class="round-btn" @tap="goDiscover" hover-class="press" hover-stay-time="80">
        <view class="search-icon">
          <view class="search-handle" />
        </view>
      </view>
    </view>

    <view class="date-line">
      <text>{{ today }}</text>
      <text class="date-dot">·</text>
      <text>{{ shelf.length }} 卷在架</text>
    </view>

    <view v-if="continueBook" class="continue-card" @tap="continueReading" hover-class="press" hover-stay-time="80">
      <view class="continue-cover">
        <BookCover
          :src="continueBook.coverUrl"
          :title="continueBook.name"
          :author="continueBook.author"
          :referer="continueBook.sourceUrl"
          radius="10rpx"
          shadow
        />
      </view>
      <view class="continue-info">
        <view class="continue-kicker-row">
          <text class="continue-kicker">继续阅读</text>
          <text class="continue-source">{{ continueBook.sourceName }}</text>
        </view>
        <text class="continue-title serif ellipsis">{{ continueBook.name }}</text>
        <text class="continue-chapter ellipsis">{{ progressText(continueBook) }}</text>
        <view class="continue-bottom">
          <view class="progress-track">
            <view class="progress-fill" :style="{ width: progressPercent(continueBook) + '%' }" />
          </view>
          <text class="progress-num">{{ progressPercent(continueBook) }}%</text>
        </view>
      </view>
      <view class="continue-arrow">→</view>
    </view>

    <view v-else class="continue-empty" @tap="goDiscover" hover-class="press">
      <view class="continue-empty-mark serif">拾</view>
      <view class="continue-empty-info">
        <text class="continue-empty-title serif">从一页开始</text>
        <text class="continue-empty-desc">搜索一本书，或导入你的书源</text>
      </view>
      <text class="continue-empty-arrow">→</text>
    </view>

    <view class="shelf-head">
      <view class="shelf-head-left">
        <text class="shelf-title serif">我的书架</text>
        <text class="shelf-sub">{{ shelf.length ? '按最近阅读排序' : '还没有藏书' }}</text>
      </view>
      <view class="shelf-head-actions">
        <view
          v-if="shelf.length"
          class="update-link"
          :class="{ busy: updatingAll }"
          @tap="updateAll"
          hover-class="press"
        >
          <text class="update-icon">↻</text>
          <text>{{ updatingAll ? updateDone + '/' + shelf.length : '更新' }}</text>
        </view>
        <view class="source-link" @tap="goSources" hover-class="press">
          <text>书源 {{ enabledSources }}</text>
          <text class="source-link-arrow">›</text>
        </view>
      </view>
    </view>

    <view v-if="sortedShelf.length" class="book-grid">
      <view
        v-for="book in sortedShelf"
        :key="book.id"
        class="grid-item"
        hover-class="press"
        hover-stay-time="80"
        @tap="openDetail(book)"
        @longpress="showBookMenu(book)"
      >
        <view class="grid-cover">
          <BookCover
            :src="book.coverUrl"
            :title="book.name"
            :author="book.author"
            :referer="book.sourceUrl"
            radius="10rpx"
            shadow
          />
          <view v-if="offlineState(book)" class="offline-ribbon">
            <text>{{ offlineState(book) }}</text>
          </view>
          <view v-if="book.progress" class="read-ribbon">
            <text>{{ progressPercent(book) }}%</text>
          </view>
          <view
            class="update-fab"
            :class="{ busy: updatingIds[book.id] }"
            @tap.stop="updateBook(book)"
            hover-class="press"
          >
            <text>{{ updatingIds[book.id] ? '…' : '↻' }}</text>
          </view>
        </view>
        <text class="grid-title ellipsis">{{ book.name }}</text>
        <text class="grid-author ellipsis">{{ book.author || '佚名' }}</text>
        <text class="grid-latest ellipsis">{{ book.lastChapter || '暂无目录' }}</text>
        <view class="grid-meta">
          <view class="grid-progress">
            <view class="grid-progress-fill" :style="{ width: Math.max(4, progressPercent(book)) + '%' }" />
          </view>
          <text class="grid-time">{{ book.lastReadAt ? relativeTime(book.lastReadAt) : '新收' }}</text>
        </view>
      </view>
    </view>

    <EmptyState
      v-else
      title="书架还空着"
      desc="去书城搜一本想读的书，或者先导入一个书源。读过的每一页，都会安静地留在这里。"
      action-text="去书城看看"
      @action="goDiscover"
    />

    <view class="shelf-footer">
      <view class="footer-line" />
      <text class="serif">万千书源 · 一卷在手</text>
      <view class="footer-line" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BookCover from '../../components/BookCover.vue'
import EmptyState from '../../components/EmptyState.vue'
import { loadOfflineIndex } from '../../core/offline.js'
import {
  loadShelf,
  getContinueReading,
  removeShelfBook,
  ensureSources,
  updateShelfBook
} from '../../core/store.js'
import { refreshBookInfo } from '../../core/shelf-update.js'
import {
  todayLabel,
  relativeTime,
  progressPercent,
  progressText,
  confirmDialog,
  actionSheet,
  toast
} from '../../utils/format.js'

const shelf = ref([])
const continueBook = ref(null)
const sources = ref([])
const offlineMap = ref({})
const updatingIds = ref({})
const updatingAll = ref(false)
const updateDone = ref(0)
const today = todayLabel()
let suppressTap = false

const sortedShelf = computed(() => {
  return [...shelf.value].sort((a, b) => {
    const readDiff = (b.lastReadAt || 0) - (a.lastReadAt || 0)
    if (readDiff !== 0) return readDiff
    return (b.addedAt || 0) - (a.addedAt || 0)
  })
})

const enabledSources = computed(() => sources.value.filter((source) => source.enabled !== false).length)

function load() {
  shelf.value = loadShelf()
  continueBook.value = getContinueReading()
  sources.value = ensureSources()
  offlineMap.value = Object.fromEntries(loadOfflineIndex().map((item) => [item.bookId, item]))
}

function offlineState(book) {
  const meta = offlineMap.value[book.id]
  if (!meta) return ''
  if (meta.complete) return '离线'
  if (!meta.chapterCount) return '离线'
  return Math.round(((meta.cachedChapters || 0) / meta.chapterCount) * 100) + '%'
}

function goDiscover() {
  uni.switchTab({ url: '/pages/discover/discover' })
}

function goSources() {
  uni.switchTab({ url: '/pages/sources/sources' })
}

function openDetail(book) {
  if (suppressTap) return
  uni.navigateTo({ url: '/pages/book/book?bookId=' + encodeURIComponent(book.id) })
}

function sourceForBook(book) {
  return sources.value.find((item) => item.id === book.sourceId) || null
}

function applyRefresh(book, result) {
  const info = result.info || {}
  const patch = {
    name: info.name || book.name,
    author: info.author || book.author,
    coverUrl: info.coverUrl || book.coverUrl,
    intro: info.intro || book.intro,
    kind: info.kind || book.kind,
    status: info.status || book.status,
    lastChapter: result.lastChapter || book.lastChapter,
    chapterCount: result.chapterCount || book.chapterCount,
    tocUrl: result.tocUrl || book.tocUrl,
    newChapterCount: result.newChapterCount || 0,
    updatedAt: Date.now()
  }
  updateShelfBook(book.id, patch)
  Object.assign(book, patch)
}

async function updateBook(book, options = {}) {
  if (updatingIds.value[book.id]) return { skipped: true }
  const source = sourceForBook(book)
  if (!source) {
    if (!options.silent) toast('这本书的书源已被删除，无法更新')
    return { failed: true }
  }
  updatingIds.value = { ...updatingIds.value, [book.id]: true }
  try {
    const result = await refreshBookInfo(source, book)
    applyRefresh(book, result)
    if (!options.silent) {
      toast(result.hasNew
        ? `《${book.name}》已更新，最新章节：${result.lastChapter}`
        : `《${book.name}》已是最新，共 ${result.chapterCount} 章`)
    }
    return { ok: true, hasNew: result.hasNew, result }
  } catch (e) {
    if (!options.silent) toast((e && e.message) || '更新失败，请稍后重试')
    return { failed: true, error: e }
  } finally {
    const next = { ...updatingIds.value }
    delete next[book.id]
    updatingIds.value = next
  }
}

async function updateAll() {
  if (updatingAll.value || !shelf.value.length) return
  updatingAll.value = true
  updateDone.value = 0
  let changed = 0
  let failed = 0
  for (const book of [...shelf.value]) {
    const outcome = await updateBook(book, { silent: true })
    if (outcome.ok && outcome.hasNew) changed += 1
    if (outcome.failed) failed += 1
    updateDone.value += 1
  }
  updatingAll.value = false
  load()
  if (!failed) {
    toast(changed ? `更新完成，${changed} 本有新章节` : '全部已是最新')
  } else {
    toast(`更新完成，${changed} 本有新章节，${failed} 本失败`)
  }
}

function continueReading() {
  if (!continueBook.value) {
    goDiscover()
    return
  }
  const book = continueBook.value
  const index = book.progress && book.progress.chapterIndex !== undefined ? book.progress.chapterIndex : 0
  uni.navigateTo({
    url: `/pages/reader/reader?bookId=${encodeURIComponent(book.id)}&chapter=${index}`
  })
}

async function showBookMenu(book) {
  suppressTap = true
  setTimeout(() => { suppressTap = false }, 700)
  const hasProgress = !!book.progress
  const items = [hasProgress ? '继续阅读' : '开始阅读', '更新最新章节', '书籍详情', '移出书架']
  const index = await actionSheet(items, book.name)
  if (index === 1) {
    updateBook(book)
  } else if (index === 0) {
    if (hasProgress) {
      uni.navigateTo({
        url: `/pages/reader/reader?bookId=${encodeURIComponent(book.id)}&chapter=${book.progress.chapterIndex || 0}`
      })
    } else {
      uni.navigateTo({ url: '/pages/book/book?bookId=' + encodeURIComponent(book.id) })
    }
  } else if (index === 2) {
    uni.navigateTo({ url: '/pages/book/book?bookId=' + encodeURIComponent(book.id) })
  } else if (index === 3) {
    const ok = await confirmDialog({
      title: '移出书架',
      content: `确定把《${book.name}》移出书架吗？阅读进度也会一并清除。`,
      confirmText: '移出'
    })
    if (ok) {
      removeShelfBook(book.id)
      load()
      toast('已移出书架')
    }
  }
}

onShow(load)
</script>

<style scoped>
.shelf-page {
  padding-bottom: 48rpx;
}

.top-safe {
  height: var(--status-bar-height, 0px);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 36rpx 0;
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
}

.brand-logo {
  width: 74rpx;
  height: 74rpx;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 20rpx rgba(20, 30, 25, 0.18);
  flex-shrink: 0;
}

.brand-text {
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-name {
  font-size: 44rpx;
  line-height: 1.1;
  letter-spacing: 6rpx;
  color: var(--ink);
  font-weight: 600;
}

.brand-sub {
  margin-top: 6rpx;
  font-size: 21rpx;
  letter-spacing: 1rpx;
  color: var(--muted);
}

.round-btn {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: rgba(255, 252, 245, 0.72);
  border: 1rpx solid rgba(37, 42, 36, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(47, 42, 30, 0.06);
}

.search-icon {
  width: 30rpx;
  height: 30rpx;
  border: 3rpx solid var(--ink-soft);
  border-radius: 50%;
  position: relative;
}

.search-handle {
  position: absolute;
  right: -10rpx;
  bottom: -6rpx;
  width: 14rpx;
  height: 3rpx;
  background: var(--ink-soft);
  transform: rotate(45deg);
  border-radius: 2rpx;
}

.date-line {
  display: flex;
  align-items: center;
  padding: 26rpx 36rpx 22rpx;
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: var(--muted);
}

.date-dot {
  margin: 0 12rpx;
  opacity: 0.6;
}

.continue-card {
  margin: 6rpx 36rpx 40rpx;
  padding: 30rpx;
  border-radius: 30rpx;
  background:
    radial-gradient(420rpx 260rpx at 100% 0%, rgba(201, 164, 106, 0.22), transparent 70%),
    linear-gradient(135deg, #2b5146 0%, #1d3a32 100%);
  display: flex;
  align-items: center;
  box-shadow: 0 20rpx 44rpx rgba(28, 54, 46, 0.24);
  position: relative;
  overflow: hidden;
}

.continue-card::after {
  content: '';
  position: absolute;
  right: -90rpx;
  bottom: -120rpx;
  width: 300rpx;
  height: 300rpx;
  border-radius: 50%;
  border: 1rpx solid rgba(240, 230, 206, 0.12);
}

.continue-cover {
  width: 128rpx;
  height: 178rpx;
  flex-shrink: 0;
  border-radius: 10rpx;
  overflow: hidden;
}

.continue-info {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
  display: flex;
  flex-direction: column;
  color: #f4eddd;
}

.continue-kicker-row {
  display: flex;
  align-items: center;
}

.continue-kicker {
  font-size: 21rpx;
  letter-spacing: 4rpx;
  color: #d9bd88;
}

.continue-source {
  margin-left: 14rpx;
  font-size: 20rpx;
  color: rgba(244, 237, 221, 0.46);
  max-width: 180rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.continue-title {
  margin-top: 12rpx;
  font-size: 38rpx;
  letter-spacing: 2rpx;
  color: #f7f1e3;
}

.continue-chapter {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(244, 237, 221, 0.62);
}

.continue-bottom {
  display: flex;
  align-items: center;
  margin-top: 22rpx;
}

.progress-track {
  flex: 1;
  height: 6rpx;
  border-radius: 999rpx;
  background: rgba(244, 237, 221, 0.18);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #c9a46a, #e5c894);
}

.progress-num {
  margin-left: 16rpx;
  font-size: 21rpx;
  color: rgba(244, 237, 221, 0.7);
}

.continue-arrow {
  margin-left: 16rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 1rpx solid rgba(244, 237, 221, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e7d2a9;
  font-size: 26rpx;
  flex-shrink: 0;
}

.continue-empty {
  margin: 6rpx 36rpx 40rpx;
  padding: 34rpx 30rpx;
  border-radius: 28rpx;
  border: 1rpx dashed rgba(37, 42, 36, 0.18);
  background: rgba(255, 252, 245, 0.5);
  display: flex;
  align-items: center;
}

.continue-empty-mark {
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  background: var(--jade-soft);
  color: var(--jade);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  flex-shrink: 0;
}

.continue-empty-info {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
  display: flex;
  flex-direction: column;
}

.continue-empty-title {
  font-size: 32rpx;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.continue-empty-desc {
  margin-top: 6rpx;
  font-size: 23rpx;
  color: var(--muted);
}

.continue-empty-arrow {
  color: var(--muted);
  font-size: 30rpx;
}

.shelf-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 36rpx 24rpx;
}

.shelf-head-left {
  display: flex;
  flex-direction: column;
}

.shelf-title {
  font-size: 36rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: var(--ink);
}

.shelf-sub {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}

.shelf-head-actions {
  display: flex;
  align-items: center;
}

.update-link {
  display: flex;
  align-items: center;
  gap: 4rpx;
  margin-right: 18rpx;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(47, 94, 78, 0.08);
  color: var(--jade);
  font-size: 22rpx;
}

.update-link.busy {
  opacity: 0.6;
}

.update-icon {
  font-size: 26rpx;
  line-height: 1;
}

.source-link {
  display: flex;
  align-items: center;
  font-size: 23rpx;
  color: var(--jade);
  padding: 8rpx 0 8rpx 0;
}

.source-link-arrow {
  margin-left: 4rpx;
  font-size: 28rpx;
  line-height: 1;
}

.book-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 0 26rpx;
}

.grid-item {
  width: 33.333%;
  padding: 0 10rpx 34rpx;
  display: flex;
  flex-direction: column;
}

.grid-cover {
  width: 100%;
  height: 282rpx;
  position: relative;
  border-radius: 10rpx;
}

.update-fab {
  position: absolute;
  right: 10rpx;
  bottom: 10rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 999rpx;
  background: rgba(246, 241, 229, 0.9);
  color: var(--jade);
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(20, 28, 24, 0.16);
}

.update-fab.busy {
  opacity: 0.65;
}

.read-ribbon {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  background: rgba(20, 28, 24, 0.56);
  color: #f4e8cf;
  font-size: 18rpx;
  display: flex;
  align-items: center;
  backdrop-filter: blur(6rpx);
}

.grid-title {
  margin-top: 16rpx;
  font-size: 26rpx;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: 0.5rpx;
}

.grid-author {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.grid-latest {
  margin-top: 4rpx;
  font-size: 19rpx;
  color: rgba(90, 96, 86, 0.72);
}

.grid-meta {
  margin-top: 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.grid-progress {
  flex: 1;
  height: 4rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.08);
  overflow: hidden;
  margin-right: 12rpx;
}

.grid-progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: var(--accent);
  opacity: 0.6;
}

.grid-time {
  font-size: 18rpx;
  color: var(--muted);
  flex-shrink: 0;
}

.shelf-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36rpx 60rpx 20rpx;
  color: var(--muted);
  font-size: 20rpx;
  letter-spacing: 3rpx;
}

.footer-line {
  width: 50rpx;
  height: 1rpx;
  background: var(--line-strong);
  margin: 0 18rpx;
}

.offline-ribbon {
  position: absolute;
  left: 10rpx;
  top: 10rpx;
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  background: rgba(47, 93, 80, 0.82);
  color: #f4e8cf;
  font-size: 18rpx;
  display: flex;
  align-items: center;
  backdrop-filter: blur(6rpx);
}
</style>
