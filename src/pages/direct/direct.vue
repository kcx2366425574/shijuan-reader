<template>
  <view class="page direct-page">
    <AppHeader title="链接添加" subtitle="粘贴书籍页地址" back show-border />

    <view class="direct-body">
      <view class="direct-hero">
        <view class="hero-link">
          <view class="link-ring" />
          <view class="link-bar" />
          <view class="link-bar short" />
        </view>
        <view class="hero-copy">
          <text class="hero-title serif">有书页链接，就能读</text>
          <text class="hero-desc">如果站点已有“直链书源”，会直接使用它的解析规则；否则会尝试自动识别详情、目录与正文。</text>
        </view>
      </view>

      <view class="input-card">
        <text class="input-label">书籍详情页地址</text>
        <textarea
          v-model="bookUrl"
          class="url-input"
          placeholder="例如：https://www.yoboi.com/xiaoshuo/563355.html"
          placeholder-class="placeholder"
          :maxlength="-1"
          :disabled="detecting"
        />
        <view class="input-tip">请粘贴书籍详情/目录页，而不是某一章的阅读页。部分站点需要登录或人机验证，无法解析。</view>
        <view class="detect-btn" :class="{ disabled: detecting }" @tap="detect" hover-class="press">
          {{ detecting ? '正在解析…' : '解析这个链接' }}
        </view>
      </view>

      <view v-if="detecting" class="progress-card">
        <view class="progress-row">
          <view class="progress-dot" />
          <text>{{ progressText }}</text>
        </view>
      </view>

      <view v-if="error" class="error-card">
        <text class="error-title serif">解析没有完成</text>
        <text class="error-text">{{ error }}</text>
        <view class="error-actions">
          <view class="ghost-btn error-btn" @tap="detect">重试</view>
          <view class="ghost-btn error-btn" @tap="goSources">管理书源</view>
        </view>
      </view>

      <view v-if="result" class="result-card">
        <view class="result-head">
          <view class="result-cover">
            <BookCover
              :src="result.info.coverUrl"
              :title="result.info.name"
              :referer="result.source.url"
              radius="10rpx"
              shadow
            />
          </view>
          <view class="result-info">
            <view class="result-source">{{ result.source.name }}{{ result.source.direct ? ' · 直链' : ' · 自动识别' }}</view>
            <text class="result-title serif">{{ result.info.name || '未知书名' }}</text>
            <text class="result-author">{{ result.info.author || '佚名' }}</text>
            <view class="result-chips">
              <text class="chip">{{ result.chapters.length }} 章</text>
              <text v-if="result.info.kind" class="chip">{{ result.info.kind }}</text>
            </view>
          </view>
        </view>

        <text v-if="result.info.intro" class="result-intro clamp-3">{{ result.info.intro }}</text>

        <view class="chapter-preview">
          <view class="preview-head">
            <text class="preview-title serif">开篇</text>
            <text class="preview-count">共 {{ result.chapters.length }} 章</text>
          </view>
          <view v-for="(chapter, index) in result.chapters.slice(0, 4)" :key="chapter.url" class="preview-row">
            <text class="preview-index">{{ index + 1 }}</text>
            <text class="preview-name ellipsis">{{ chapter.name }}</text>
          </view>
        </view>

        <view class="result-actions">
          <view class="primary-btn result-btn" @tap="startReading" hover-class="press">
            {{ inShelf ? '继续阅读' : '加入书架并阅读' }}
          </view>
        </view>
      </view>

      <view v-if="!detecting && !result && !error" class="links-card">
        <text class="links-title">哪些链接可以？</text>
        <text class="links-line">· 书籍详情页（含简介和章节目录）最稳定。</text>
        <text class="links-line">· 已内置「笔趣阁直链」规则，可直接粘贴 yoboi.com 的书籍页。</text>
        <text class="links-line">· 普通站点会自动识别；失败时可在书源页用“智能识别”生成规则。</text>
      </view>

      <view class="bottom-space" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import BookCover from '../../components/BookCover.vue'
import {
  ensureSources,
  addSources,
  makeBookId,
  getShelfBook,
  upsertShelfBook
} from '../../core/store.js'
import { normalizeSiteUrl, detectBookInfo, detectToc, detectContent } from '../../core/autodetect.js'
import { fetchText, openBook } from '../../core/service.js'
import { parseHTML } from '../../core/html.js'
import { normalizeSource, hashCode } from '../../core/source.js'
import { cacheBook } from '../../core/book-cache.js'
import { toast, toastSuccess } from '../../utils/format.js'

const bookUrl = ref('')
const detecting = ref(false)
const progressText = ref('')
const error = ref('')
const result = ref(null)

const inShelf = computed(() => {
  if (!result.value) return false
  const id = makeBookId(result.value.source.id, result.value.bookUrl)
  return !!getShelfBook(id)
})

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1].replace(/^www\./, '') : ''
}

function goSources() {
  uni.switchTab({ url: '/pages/sources/sources' })
}

function findDirectSource(bookPageUrl) {
  const host = hostOf(bookPageUrl)
  const candidates = ensureSources().filter((source) => {
    if (source.enabled === false) return false
    if (hostOf(source.url) !== host) return false
    return source.ruleBookInfo && source.ruleToc && source.ruleContent
  })
  return candidates.find((source) => source.direct) || candidates[0] || null
}

async function detect() {
  if (detecting.value) return
  const input = String(bookUrl.value || '').trim()
  if (!/^https?:\/\//i.test(input) && !/^[\w.-]+\.[a-z]{2,}/i.test(input)) {
    toast('请输入有效的书籍页地址')
    return
  }
  detecting.value = true
  error.value = ''
  result.value = null
  progressText.value = '正在打开书籍页…'
  try {
    const normalized = /^https?:\/\//i.test(input) ? input : 'https://' + input
    const direct = findDirectSource(normalized)
    if (direct) {
      progressText.value = `使用直链书源「${direct.name}」，正在读取目录…`
      const book = await openBook(direct, normalized, {})
      result.value = {
        source: direct,
        info: book.info,
        chapters: book.chapters,
        bookUrl: book.bookUrl,
        tocUrl: book.tocUrl
      }
      progressText.value = ''
      return
    }

    // 没有现成直链源时，尝试自动识别详情、目录、正文
    const site = normalizeSiteUrl(normalized)
    const page = await fetchText(normalized, {
      source: { url: site.origin, charset: 'auto' },
      timeout: 18000,
      cache: false
    })
    const doc = parseHTML(page.text)
    const info = detectBookInfo(doc, page.url || normalized)
    let tocDoc = doc
    let tocPageUrl = page.url || normalized
    if (info.tocUrl && info.tocUrl !== normalized) {
      progressText.value = '正在读取目录页…'
      try {
        const tocPage = await fetchText(info.tocUrl, {
          source: { url: site.origin, charset: 'auto' },
          timeout: 18000,
          cache: false
        })
        tocDoc = parseHTML(tocPage.text)
        tocPageUrl = tocPage.url || info.tocUrl
      } catch (e) {
        tocDoc = doc
      }
    }
    let toc = detectToc(tocDoc, tocPageUrl)
    if (!toc.found && tocDoc !== doc) toc = detectToc(doc, normalized)
    if (!toc.found) throw new Error('没有识别到章节目录，可能需要先在书源页生成专属规则。')

    progressText.value = '正在验证正文…'
    const firstChapter = toc.chapters[0]
    const chapterPage = await fetchText(firstChapter.url, {
      source: { url: site.origin, charset: 'auto' },
      timeout: 18000,
      cache: false
    })
    const content = detectContent(parseHTML(chapterPage.text), chapterPage.url || firstChapter.url, firstChapter.name)
    if (!content.found) throw new Error('识别到目录，但正文提取失败。')

    const generated = normalizeSource({
      id: 'direct-' + hashCode(site.origin + '|' + (info.info.name || normalized)),
      bookSourceName: '直链 · ' + hostOf(site.origin),
      bookSourceUrl: site.origin,
      bookSourceGroup: '直链',
      charset: 'auto',
      searchUrl: '',
      direct: true,
      ruleBookInfo: info.rules,
      ruleToc: toc.rules,
      ruleContent: content.rules,
      singleChapter: false
    })
    generated.direct = true
    generated.enabled = true
    addSources([generated])
    const book = await openBook(generated, normalized, info.info)
    result.value = {
      source: generated,
      info: book.info,
      chapters: book.chapters,
      bookUrl: book.bookUrl,
      tocUrl: book.tocUrl
    }
    progressText.value = ''
  } catch (e) {
    error.value = e && e.message ? e.message : '解析失败'
    progressText.value = ''
  } finally {
    detecting.value = false
  }
}

function startReading() {
  if (!result.value) return
  const { source, info, chapters, bookUrl: targetBookUrl, tocUrl } = result.value
  const bookId = makeBookId(source.id, targetBookUrl)
  const existing = getShelfBook(bookId)
  const stored = upsertShelfBook({
    id: bookId,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    name: info.name,
    author: info.author,
    coverUrl: info.coverUrl,
    intro: info.intro,
    kind: info.kind,
    status: info.status,
    lastChapter: info.lastChapter,
    bookUrl: targetBookUrl,
    tocUrl,
    chapterCount: chapters.length
  })
  cacheBook(bookId, {
    info,
    chapters,
    bookUrl: targetBookUrl,
    tocUrl
  })
  const savedIndex = existing && existing.progress && Number.isInteger(existing.progress.chapterIndex)
    ? existing.progress.chapterIndex
    : 0
  toastSuccess(existing ? '继续阅读' : '已加入书架')
  uni.navigateTo({
    url: `/pages/reader/reader?bookId=${encodeURIComponent(bookId)}&chapter=${savedIndex}`
  })
}

onLoad((options) => {
  if (options && options.url) {
    bookUrl.value = decodeURIComponent(options.url)
    if (options.auto === '1') setTimeout(detect, 250)
  }
})
</script>

<style scoped>
.direct-page {
  background: #f6f1e5;
}

.direct-body {
  padding: 20rpx 36rpx 40rpx;
}

.direct-hero {
  display: flex;
  align-items: center;
  padding: 28rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(320rpx 220rpx at 100% 0%, rgba(201, 164, 106, 0.18), transparent 70%),
    linear-gradient(135deg, #2b5146, #1d3a32);
  box-shadow: 0 18rpx 40rpx rgba(28, 54, 46, 0.2);
}

.hero-link {
  width: 110rpx;
  height: 110rpx;
  position: relative;
  flex-shrink: 0;
}

.link-ring {
  position: absolute;
  left: 4rpx;
  top: 4rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  border: 1rpx solid rgba(233, 211, 170, 0.35);
}

.link-bar {
  position: absolute;
  left: 28rpx;
  top: 48rpx;
  width: 56rpx;
  height: 5rpx;
  border-radius: 4rpx;
  background: #f1e3c6;
}

.link-bar.short {
  left: 40rpx;
  top: 64rpx;
  width: 32rpx;
  opacity: 0.55;
}

.hero-copy {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.hero-title {
  display: block;
  font-size: 30rpx;
  color: #f5eddc;
  letter-spacing: 1rpx;
}

.hero-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.65;
  color: rgba(245, 237, 220, 0.58);
}

.input-card,
.progress-card,
.error-card,
.result-card,
.links-card {
  margin-top: 22rpx;
  padding: 26rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.72);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.05);
}

.input-label {
  display: block;
  font-size: 22rpx;
  color: var(--ink-soft);
  margin-bottom: 8rpx;
}

.url-input {
  width: 100%;
  height: 170rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--ink);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  box-sizing: border-box;
}

.input-tip {
  margin-top: 10rpx;
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--muted);
}

.detect-btn {
  margin-top: 18rpx;
  height: 84rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27rpx;
  letter-spacing: 2rpx;
}

.detect-btn.disabled {
  opacity: 0.6;
}

.progress-card {
  display: flex;
  align-items: center;
}

.progress-row {
  display: flex;
  align-items: center;
  font-size: 23rpx;
  color: var(--ink-soft);
}

.progress-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--gold);
  margin-right: 12rpx;
  animation: inkPulse 1.1s infinite;
}

.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.error-title {
  font-size: 32rpx;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.error-text {
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: var(--muted);
}

.error-actions {
  display: flex;
  margin-top: 22rpx;
}

.error-btn {
  height: 72rpx;
  padding: 0 30rpx;
  font-size: 23rpx;
  margin: 0 6rpx;
}

.result-head {
  display: flex;
  align-items: flex-start;
}

.result-cover {
  width: 150rpx;
  height: 208rpx;
  flex-shrink: 0;
  border-radius: 10rpx;
  overflow: hidden;
}

.result-info {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
  display: flex;
  flex-direction: column;
}

.result-source {
  font-size: 19rpx;
  color: var(--gold);
  letter-spacing: 1rpx;
}

.result-title {
  margin-top: 10rpx;
  font-size: 36rpx;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.result-author {
  margin-top: 8rpx;
  font-size: 23rpx;
  color: var(--muted);
}

.result-chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 14rpx;
}

.result-chips .chip {
  margin-right: 10rpx;
}

.result-intro {
  margin-top: 20rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: var(--ink-soft);
}

.chapter-preview {
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid var(--line);
}

.preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6rpx;
}

.preview-title {
  font-size: 28rpx;
  color: var(--ink);
}

.preview-count {
  font-size: 19rpx;
  color: var(--muted);
}

.preview-row {
  display: flex;
  align-items: center;
  height: 66rpx;
  border-bottom: 1rpx solid var(--line);
}

.preview-row:last-child {
  border-bottom: none;
}

.preview-index {
  width: 46rpx;
  font-size: 19rpx;
  color: var(--muted);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.preview-name {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  color: var(--ink-soft);
}

.result-actions {
  margin-top: 22rpx;
}

.result-btn {
  width: 100%;
  height: 84rpx;
  font-size: 26rpx;
}

.links-card {
  background: rgba(255, 252, 245, 0.42);
  border-style: dashed;
}

.links-title {
  display: block;
  font-size: 21rpx;
  letter-spacing: 2rpx;
  color: var(--muted);
  margin-bottom: 10rpx;
}

.links-line {
  display: block;
  font-size: 20rpx;
  line-height: 1.75;
  color: var(--muted);
}

.bottom-space {
  height: 30rpx;
}

.preset-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.preset-label {
  font-size: 19rpx;
  color: var(--muted);
  margin-right: 12rpx;
}

.preset-chip {
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: rgba(176, 138, 82, 0.1);
  border: 1rpx solid rgba(176, 138, 82, 0.2);
  color: #7c6236;
  font-size: 20rpx;
  display: flex;
  align-items: center;
}
</style>
