<template>
  <view class="page discover-page">
    <view class="top-safe" />

    <view class="hero">
      <view class="hero-top">
        <view class="hero-title-wrap">
          <text class="hero-kicker">SEARCH · 书城</text>
          <text class="hero-title serif">寻一卷想读的书</text>
        </view>
        <view class="round-btn" @tap="openSourceSheet" hover-class="press">
          <view class="filter-icon">
            <view class="filter-line f1" />
            <view class="filter-line f2" />
            <view class="filter-line f3" />
          </view>
        </view>
      </view>

      <view class="search-bar">
        <view class="search-glyph">
          <view class="search-circle" />
          <view class="search-stick" />
        </view>
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          confirm-type="search"
          placeholder="书名、作者，或一句记得的话"
          placeholder-class="placeholder"
          @confirm="runSearch"
          @focus="onFocus"
        />
        <view v-if="keyword" class="clear-btn" @tap="keyword = ''" hover-class="press">×</view>
        <view class="search-submit" :class="{ disabled: searching }" @tap="runSearch" hover-class="press">
          <text>{{ searching ? '寻书中' : '搜索' }}</text>
        </view>
      </view>

      <view class="source-line" @tap="openSourceSheet" hover-class="press">
        <view class="source-dot" />
        <text class="source-line-text">当前 {{ activeSourceCount }} 个书源参与搜索</text>
        <text class="source-line-arrow">›</text>
      </view>
    </view>

    <view v-if="searching || statuses.length" class="status-panel">
      <view class="status-head">
        <view class="status-head-copy">
          <text class="section-label">{{ searching ? '搜索中' : '搜索完成' }}</text>
          <text class="status-summary">{{ summaryText }}</text>
        </view>
        <view v-if="searching && completedCount" class="stop-wait" @tap="stopWaiting">先看已有结果</view>
      </view>
      <scroll-view class="status-scroll" scroll-x :show-scrollbar="false">
        <view class="status-row">
          <view
            v-for="status in statuses"
            :key="status.sourceId"
            class="status-chip"
            :class="status.state"
            @tap="showStatusDetail(status)"
          >
            <view class="status-indicator" />
            <text class="status-name">{{ status.sourceName }}</text>
            <text class="status-value">{{ statusText(status) }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="groups.length" class="result-list">
      <view
        v-for="group in groups"
        :key="group.key"
        class="result-card"
        hover-class="press"
        :hover-stay-time="80"
        @tap="openGroup(group)"
      >
        <view class="result-cover">
          <BookCover
            :src="group.coverUrl"
            :title="group.name"
            :author="group.author"
            :referer="group.offers[0] && group.offers[0].sourceUrl"
            radius="8rpx"
            shadow
          />
        </view>
        <view class="result-info">
          <text class="result-title serif ellipsis">{{ group.name }}</text>
          <view class="result-meta">
            <text class="result-author">{{ group.author || '佚名' }}</text>
            <text v-if="group.kind" class="result-dot">·</text>
            <text v-if="group.kind" class="result-kind">{{ group.kind }}</text>
          </view>
          <text class="result-intro clamp-2">{{ group.intro || '暂无简介，点开看看吧。' }}</text>
          <view class="result-bottom">
            <view class="source-tags">
              <text v-for="offer in group.offers.slice(0, 3)" :key="offer.sourceId" class="source-tag">{{ offer.sourceName }}</text>
              <text v-if="group.offers.length > 3" class="source-tag">+{{ group.offers.length - 3 }}</text>
            </view>
            <text v-if="group.offers[0].lastChapter" class="result-latest ellipsis">{{ group.offers[0].lastChapter }}</text>
          </view>
        </view>
        <view class="result-arrow">›</view>
      </view>
    </view>

    <view v-else-if="searchDone && !searching" class="no-result">
      <EmptyState
        title="没有找到这本书"
        desc="换个关键词，或在书源页添加更多书源。不同书源的收录范围并不相同。"
        action-text="去管理书源"
        @action="goSources"
      />
    </view>

    <view v-else class="idle-area">
      <view class="direct-entry" @tap="goDirect" hover-class="press">
        <view class="direct-entry-icon">
          <view class="direct-arrow">↗</view>
        </view>
        <view class="direct-entry-copy">
          <text class="direct-entry-title">有书籍链接？</text>
          <text class="direct-entry-desc">粘贴书籍页地址，直接解析阅读</text>
        </view>
        <text class="direct-entry-arrow">›</text>
      </view>

      <view v-if="history.length" class="idle-block">
        <view class="idle-head">
          <text class="section-label">最近搜索</text>
          <text class="idle-action" @tap="clearHistory">清空</text>
        </view>
        <view class="keyword-wrap">
          <view v-for="item in history" :key="item" class="keyword-chip" @tap="searchKeyword(item)" hover-class="press">
            <text>{{ item }}</text>
          </view>
        </view>
      </view>

      <view class="idle-block">
        <view class="idle-head">
          <text class="section-label">不妨试试</text>
        </view>
        <view class="keyword-wrap">
          <view v-for="item in suggestions" :key="item" class="keyword-chip suggestion" @tap="searchKeyword(item)" hover-class="press">
            <text>{{ item }}</text>
          </view>
        </view>
      </view>

      <view class="quote-card">
        <text class="quote-mark serif">“</text>
        <text class="quote-text serif">书卷多情似故人，晨昏忧乐每相亲。</text>
        <text class="quote-author">—— 于谦《观书》</text>
        <view class="quote-seal serif">卷</view>
      </view>

      <view class="source-preview">
        <view class="idle-head">
          <text class="section-label">已启用书源</text>
          <text class="idle-action" @tap="goSources">管理 ›</text>
        </view>
        <view class="source-preview-list">
          <view v-for="source in enabledSources" :key="source.id" class="source-preview-item">
            <view class="source-preview-mark">{{ source.name.slice(0, 1) }}</view>
            <view class="source-preview-info">
              <text class="source-preview-name">{{ source.name }}</text>
              <text class="source-preview-host">{{ hostOf(source.url) }} · {{ source.group || '自定义' }}</text>
            </view>
            <view class="source-preview-state">可用</view>
          </view>
          <view v-if="!enabledSources.length" class="source-preview-empty">
            <text>还没有启用任何书源</text>
            <text class="idle-action" @tap="goSources">去添加</text>
          </view>
        </view>
      </view>
    </view>

    <view class="bottom-space" />

    <BottomSheet v-model:show="showSourceSheet" title="参与搜索的书源">
      <view class="sheet-desc">关闭某个书源后，本次搜索不会向它发起请求。</view>
      <view class="sheet-actions">
        <text class="sheet-link" @tap="selectAllSources">全选</text>
        <text class="sheet-link" @tap="clearSourceSelection">仅保留推荐</text>
      </view>
      <view class="source-choice-list">
        <view
          v-for="source in allSources"
          :key="source.id"
          class="source-choice"
          :class="{ disabled: !source.enabled }"
          @tap="toggleSourceChoice(source)"
        >
          <view class="choice-check" :class="{ checked: isSourceSelected(source) }">
            <text v-if="isSourceSelected(source)">✓</text>
          </view>
          <view class="choice-info">
            <text class="choice-name">{{ source.name }}</text>
            <text class="choice-host">{{ hostOf(source.url) }}</text>
          </view>
          <text v-if="!source.enabled" class="choice-off">已停用</text>
          <text v-else class="choice-group">{{ source.group || '自定义' }}</text>
        </view>
      </view>
      <view class="sheet-primary" @tap="showSourceSheet = false" hover-class="press">完成</view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BookCover from '../../components/BookCover.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  ensureSources,
  loadSearchHistory,
  addSearchHistory,
  clearSearchHistory,
  loadSettings
} from '../../core/store.js'
import { searchAllSources, groupSearchResults } from '../../core/service.js'
import { setHandoff } from '../../core/handoff.js'
import { toast } from '../../utils/format.js'

const keyword = ref('')
const searching = ref(false)
const searchDone = ref(false)
const statuses = ref([])
const groups = ref([])
const allSources = ref([])
const selectedIds = ref([])
const history = ref([])
const showSourceSheet = ref(false)
const searchRunId = ref(0)
const completedCount = ref(0)
const ignoreLateResults = ref(false)
const settings = ref(loadSettings())
const suggestions = ['神通者', '万相之王', '斗破苍穹', '诡秘之主']

const enabledSources = computed(() => allSources.value.filter((source) => source.enabled !== false && source.direct !== true && (!!source.searchUrl || source.searchMode === 'crawl-index' || !!source.searchIndexUrl)))
const activeSources = computed(() => {
  const enabled = enabledSources.value
  if (!selectedIds.value.length) return enabled
  const set = new Set(selectedIds.value)
  return enabled.filter((source) => set.has(source.id))
})
const activeSourceCount = computed(() => activeSources.value.length)

const summaryText = computed(() => {
  if (searching.value) {
    const total = statuses.value.length || activeSourceCount.value
    return `${groups.value.length} 本 · 已完成 ${completedCount.value}/${total} 个书源`
  }
  const ok = statuses.value.filter((status) => status.state === 'done').length
  const failed = statuses.value.filter((status) => status.state === 'error').length
  const skipped = statuses.value.filter((status) => status.state === 'skipped').length
  return `${groups.value.length} 本书 · ${ok} 个书源命中${failed ? ` · ${failed} 个失败` : ''}${skipped ? ` · ${skipped} 个已跳过` : ''}`
})

function load() {
  allSources.value = ensureSources()
  history.value = loadSearchHistory()
  settings.value = loadSettings()
  // 清理已被删除书源的选择
  const ids = new Set(allSources.value.map((source) => source.id))
  selectedIds.value = selectedIds.value.filter((id) => ids.has(id))
}

function onFocus() {}

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1].replace(/^www\./, '') : String(url || '')
}

function isSourceSelected(source) {
  if (source.enabled === false) return false
  if (!selectedIds.value.length) return true
  return selectedIds.value.includes(source.id)
}

function toggleSourceChoice(source) {
  if (source.enabled === false) {
    toast('请先在书源页启用该书源')
    return
  }
  const current = new Set(activeSources.value.map((item) => item.id))
  if (current.has(source.id)) current.delete(source.id)
  else current.add(source.id)
  if (!current.size) {
    toast('至少保留一个书源')
    return
  }
  selectedIds.value = Array.from(current)
}

function selectAllSources() {
  selectedIds.value = []
}

function clearSourceSelection() {
  selectedIds.value = enabledSources.value.length > 1 ? [enabledSources.value[0].id] : []
}

function openSourceSheet() {
  showSourceSheet.value = true
}

function goSources() {
  uni.switchTab({ url: '/pages/sources/sources' })
}

function goDirect() {
  uni.navigateTo({ url: '/pages/direct/direct' })
}

function searchKeyword(value) {
  keyword.value = value
  runSearch()
}

async function clearHistory() {
  clearSearchHistory()
  history.value = []
}

function statusText(status) {
  if (status.state === 'loading') return '搜索中'
  if (status.state === 'waiting') return '等待'
  if (status.state === 'error') return '失败'
  if (status.state === 'done') return status.count ? `${status.count} 条` : '无结果'
  if (status.state === 'skipped') return '已跳过'
  return ''
}

function showStatusDetail(status) {
  if (status.state === 'error') {
    uni.showModal({
      title: status.sourceName,
      content: status.error || '该书源搜索失败',
      showCancel: false,
      confirmText: '知道了'
    })
  } else if (status.state === 'done') {
    toast(`${status.sourceName}：${status.count} 条结果`)
  }
}

function updateStatus(sourceId, patch) {
  statuses.value = statuses.value.map((item) => item.sourceId === sourceId ? { ...item, ...patch } : item)
}

async function runSearch() {
  const text = String(keyword.value || '').trim()
  if (!text) {
    toast('先输入书名或作者')
    return
  }
  if (searching.value) return
  if (!activeSources.value.length) {
    toast('还没有可用的书源')
    openSourceSheet()
    return
  }
  const runId = ++searchRunId.value
  ignoreLateResults.value = false
  completedCount.value = 0
  keyword.value = text
  history.value = addSearchHistory(text)
  searching.value = true
  searchDone.value = false
  groups.value = []
  statuses.value = activeSources.value.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    state: 'waiting',
    count: 0,
    error: ''
  }))

  const completedItems = new Map()
  const applyItem = (item) => {
    updateStatus(item.source.id, {
      state: item.error ? 'error' : 'done',
      count: item.results.length,
      error: item.error || ''
    })
    completedItems.set(item.source.id, item)
    completedCount.value = completedItems.size
    groups.value = groupSearchResults(Array.from(completedItems.values()))
  }

  try {
    const results = await searchAllSources(activeSources.value, text, {
      concurrency: settings.value.searchConcurrency || 3,
      onSourceDone(item) {
        if (runId !== searchRunId.value || ignoreLateResults.value) return
        applyItem(item)
      }
    })
    if (runId !== searchRunId.value || ignoreLateResults.value) return
    // 兜底：极快返回时 onSourceDone 可能早于状态初始化
    for (const item of results) applyItem(item)
    groups.value = groupSearchResults(results)
  } catch (e) {
    if (!ignoreLateResults.value) toast(e && e.message ? e.message : '搜索失败')
  } finally {
    if (runId === searchRunId.value) {
      if (!ignoreLateResults.value) {
        searching.value = false
        searchDone.value = true
      }
      history.value = loadSearchHistory()
    }
  }
}

function stopWaiting() {
  if (!searching.value) return
  ignoreLateResults.value = true
  searching.value = false
  searchDone.value = true
  statuses.value = statuses.value.map((status) => {
    if (status.state === 'waiting' || status.state === 'loading') {
      return { ...status, state: 'skipped' }
    }
    return status
  })
  toast('已展示当前完成的书源结果')
}

function openGroup(group) {
  if (!group.offers.length) return
  if (group.offers.length === 1) {
    openOffer(group.offers[0], group)
    return
  }
  uni.showActionSheet({
    itemList: group.offers.slice(0, 8).map((offer) => offer.sourceName),
    success(res) {
      const offer = group.offers[res.tapIndex]
      if (offer) openOffer(offer, group)
    }
  })
}

function openOffer(offer, group) {
  const fallback = {
    name: group.name || offer.name,
    author: group.author || offer.author,
    coverUrl: offer.coverUrl || group.coverUrl || '',
    intro: offer.intro || group.intro || '',
    kind: offer.kind || group.kind || '',
    lastChapter: offer.lastChapter || group.lastChapter || '',
    sourceId: offer.sourceId,
    sourceName: offer.sourceName
  }
  const key = offer.sourceId + '|' + offer.bookUrl
  setHandoff(key, fallback)
  uni.navigateTo({
    url: `/pages/book/book?sourceId=${encodeURIComponent(offer.sourceId)}&bookUrl=${encodeURIComponent(offer.bookUrl)}`
  })
}

onShow(load)
</script>

<style scoped>
.discover-page {
  padding-bottom: 40rpx;
}

.top-safe {
  height: var(--status-bar-height, 0px);
}

.hero {
  padding: 26rpx 36rpx 0;
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.hero-kicker {
  font-size: 20rpx;
  letter-spacing: 4rpx;
  color: var(--gold);
}

.hero-title {
  display: block;
  margin-top: 10rpx;
  font-size: 48rpx;
  line-height: 1.25;
  letter-spacing: 3rpx;
  color: var(--ink);
  font-weight: 600;
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
  flex-shrink: 0;
}

.filter-icon {
  width: 32rpx;
  display: flex;
  flex-direction: column;
}

.filter-line {
  height: 2rpx;
  background: var(--ink-soft);
  border-radius: 2rpx;
  margin: 4rpx 0;
  position: relative;
}

.filter-line::after {
  content: '';
  position: absolute;
  top: -3rpx;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: var(--ink-soft);
}

.f1::after { left: 6rpx; }
.f2::after { right: 5rpx; }
.f3::after { left: 13rpx; }

.search-bar {
  margin-top: 32rpx;
  height: 100rpx;
  border-radius: 28rpx;
  background: rgba(255, 252, 245, 0.86);
  border: 1rpx solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 12rpx 30rpx rgba(47, 42, 30, 0.07);
  display: flex;
  align-items: center;
  padding: 0 12rpx 0 26rpx;
}

.search-glyph {
  width: 32rpx;
  height: 32rpx;
  position: relative;
  flex-shrink: 0;
}

.search-circle {
  width: 26rpx;
  height: 26rpx;
  border: 3rpx solid var(--ink-soft);
  border-radius: 50%;
  position: absolute;
  left: 0;
  top: 0;
}

.search-stick {
  position: absolute;
  width: 14rpx;
  height: 3rpx;
  border-radius: 2rpx;
  background: var(--ink-soft);
  right: -2rpx;
  bottom: 2rpx;
  transform: rotate(45deg);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 80rpx;
  margin-left: 18rpx;
  font-size: 28rpx;
  color: var(--ink);
}

.clear-btn {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 34rpx;
  line-height: 1;
}

.search-submit {
  height: 72rpx;
  padding: 0 30rpx;
  border-radius: 22rpx;
  background: var(--jade);
  color: #f8f3e7;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  letter-spacing: 1rpx;
  flex-shrink: 0;
}

.search-submit.disabled {
  opacity: 0.6;
}

.source-line {
  display: flex;
  align-items: center;
  padding: 20rpx 4rpx 0;
  font-size: 22rpx;
  color: var(--muted);
}

.source-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #5c8a6f;
  margin-right: 10rpx;
  box-shadow: 0 0 0 4rpx rgba(92, 138, 111, 0.12);
}

.source-line-text {
  flex: 1;
}

.source-line-arrow {
  font-size: 28rpx;
}

.status-panel {
  margin: 30rpx 36rpx 0;
  padding: 24rpx 24rpx 20rpx;
  border-radius: 24rpx;
  background: rgba(255, 252, 245, 0.55);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
}

.status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.status-summary {
  font-size: 22rpx;
  color: var(--muted);
}

.status-scroll {
  width: 100%;
  white-space: nowrap;
}

.status-row {
  display: flex;
  flex-direction: row;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.04);
  margin-right: 12rpx;
  flex-shrink: 0;
}

.status-indicator {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  margin-right: 10rpx;
  background: var(--muted);
}

.status-chip.loading .status-indicator {
  background: var(--gold);
  animation: inkPulse 1s infinite;
}

.status-chip.done .status-indicator { background: #5c8a6f; }
.status-chip.error .status-indicator { background: var(--accent); }

.status-name {
  font-size: 21rpx;
  color: var(--ink-soft);
  max-width: 180rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status-value {
  margin-left: 8rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.result-list {
  padding: 30rpx 36rpx 0;
}

.result-card {
  display: flex;
  align-items: stretch;
  padding: 24rpx;
  margin-bottom: 22rpx;
  border-radius: 28rpx;
  background: rgba(255, 252, 245, 0.72);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.05);
}

.result-cover {
  width: 128rpx;
  height: 178rpx;
  flex-shrink: 0;
  border-radius: 8rpx;
  overflow: hidden;
}

.result-info {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
  display: flex;
  flex-direction: column;
}

.result-title {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--ink);
}

.result-meta {
  display: flex;
  align-items: center;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--muted);
}

.result-dot {
  margin: 0 8rpx;
  opacity: 0.6;
}

.result-intro {
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.55;
  color: var(--ink-soft);
}

.result-bottom {
  margin-top: auto;
  padding-top: 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.source-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.source-tag {
  font-size: 18rpx;
  color: var(--jade);
  background: var(--jade-soft);
  border-radius: 999rpx;
  padding: 4rpx 12rpx;
  margin-right: 8rpx;
  margin-bottom: 4rpx;
}

.result-latest {
  max-width: 220rpx;
  font-size: 19rpx;
  color: var(--muted);
  margin-left: 10rpx;
}

.result-arrow {
  width: 36rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--muted);
  font-size: 34rpx;
}

.no-result {
  padding-top: 10rpx;
}

.idle-area {
  padding: 40rpx 36rpx 0;
}

.idle-block {
  margin-bottom: 38rpx;
}

.idle-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.idle-action {
  font-size: 22rpx;
  color: var(--jade);
}

.keyword-wrap {
  display: flex;
  flex-wrap: wrap;
}

.keyword-chip {
  height: 60rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: rgba(255, 252, 245, 0.6);
  border: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  margin: 0 14rpx 14rpx 0;
  font-size: 24rpx;
  color: var(--ink-soft);
}

.keyword-chip.suggestion {
  border-color: rgba(176, 138, 82, 0.24);
  color: #7c6236;
  background: rgba(176, 138, 82, 0.07);
}

.quote-card {
  position: relative;
  padding: 38rpx 36rpx 34rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(340rpx 220rpx at 100% 0%, rgba(168, 73, 58, 0.08), transparent 70%),
    rgba(255, 252, 245, 0.62);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  overflow: hidden;
  margin-bottom: 38rpx;
}

.quote-mark {
  position: absolute;
  left: 18rpx;
  top: 8rpx;
  font-size: 96rpx;
  line-height: 1;
  color: rgba(168, 73, 58, 0.14);
}

.quote-text {
  display: block;
  font-size: 30rpx;
  line-height: 1.8;
  letter-spacing: 2rpx;
  color: var(--ink);
  position: relative;
  z-index: 1;
}

.quote-author {
  display: block;
  margin-top: 12rpx;
  text-align: right;
  font-size: 21rpx;
  color: var(--muted);
}

.quote-seal {
  position: absolute;
  right: 28rpx;
  bottom: 24rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 8rpx;
  border: 2rpx solid rgba(168, 73, 58, 0.3);
  color: rgba(168, 73, 58, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
}

.source-preview-list {
  border-radius: 24rpx;
  background: rgba(255, 252, 245, 0.5);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

.source-preview-item {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-bottom: 1rpx solid var(--line);
}

.source-preview-item:last-child {
  border-bottom: none;
}

.source-preview-mark {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: var(--jade-soft);
  color: var(--jade);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.source-preview-info {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.source-preview-name {
  font-size: 25rpx;
  color: var(--ink);
}

.source-preview-host {
  margin-top: 2rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.source-preview-state {
  font-size: 19rpx;
  color: #5c8a6f;
  background: rgba(92, 138, 111, 0.1);
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}

.source-preview-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx;
  font-size: 23rpx;
  color: var(--muted);
}

.bottom-space {
  height: 30rpx;
}

.sheet-desc {
  font-size: 23rpx;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 16rpx;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8rpx;
}

.sheet-link {
  font-size: 22rpx;
  color: var(--jade);
  margin-left: 24rpx;
}

.source-choice-list {
  padding-bottom: 20rpx;
}

.source-choice {
  display: flex;
  align-items: center;
  padding: 22rpx 4rpx;
  border-bottom: 1rpx solid var(--line);
}

.source-choice.disabled {
  opacity: 0.5;
}

.choice-check {
  width: 38rpx;
  height: 38rpx;
  border-radius: 50%;
  border: 2rpx solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22rpx;
  flex-shrink: 0;
}

.choice-check.checked {
  background: var(--jade);
  border-color: var(--jade);
}

.choice-info {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.choice-name {
  font-size: 26rpx;
  color: var(--ink);
}

.choice-host {
  margin-top: 2rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.choice-group,
.choice-off {
  font-size: 20rpx;
  color: var(--muted);
}

.sheet-primary {
  margin-top: 12rpx;
  height: 84rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

.direct-entry {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  margin-bottom: 34rpx;
  border-radius: 22rpx;
  background:
    radial-gradient(220rpx 140rpx at 100% 0%, rgba(176, 138, 82, 0.12), transparent 70%),
    rgba(255, 252, 245, 0.62);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

.direct-entry-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  background: rgba(176, 138, 82, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.direct-arrow {
  font-size: 30rpx;
  color: var(--gold);
  line-height: 1;
}

.direct-entry-copy {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.direct-entry-title {
  font-size: 25rpx;
  color: var(--ink);
}

.direct-entry-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.direct-entry-arrow {
  font-size: 30rpx;
  color: var(--muted);
}

.suggestion-direct {
  margin-left: 8rpx;
  font-size: 16rpx;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999rpx;
  padding: 1rpx 8rpx;
}

.suggestion-note {
  display: block;
  margin-top: 4rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.status-head-copy {
  display: flex;
  flex-direction: column;
}

.status-head {
  align-items: center;
}

.stop-wait {
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  display: flex;
  align-items: center;
  font-size: 20rpx;
  color: var(--jade);
  background: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.status-chip.skipped .status-indicator {
  background: var(--muted);
  opacity: 0.45;
}
</style>
