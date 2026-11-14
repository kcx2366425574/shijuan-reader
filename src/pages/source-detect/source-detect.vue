<template>
  <view class="page detect-page">
    <AppHeader title="智能识别书源" subtitle="自动探测网站结构" back show-border />

    <view class="detect-body">
      <view class="detect-hero">
        <view class="hero-orbit">
          <view class="orbit-ring r1" />
          <view class="orbit-ring r2" />
          <view class="orbit-core serif">识</view>
        </view>
        <view class="hero-copy">
          <text class="hero-title serif">让拾卷替你看懂一个网站</text>
          <text class="hero-desc">输入网站地址和一本能搜到的书名，自动识别搜索入口、书籍详情、章节目录与正文容器。</text>
        </view>
      </view>

      <view class="form-card">
        <view class="field">
          <text class="field-label">网站地址</text>
          <input
            v-model="form.url"
            class="field-input"
            type="text"
            placeholder="例如 https://www.85zw.com"
            placeholder-class="placeholder"
            :disabled="detecting"
            @confirm="startDetect"
          />
        </view>
        <view class="field">
          <text class="field-label">示例书名</text>
          <input
            v-model="form.keyword"
            class="field-input"
            type="text"
            placeholder="用一本站内能搜到的书来验证"
            placeholder-class="placeholder"
            :disabled="detecting"
            @confirm="startDetect"
          />
        </view>
        <view class="field">
          <text class="field-label">书源名称<text class="field-optional">（可选）</text></text>
          <input
            v-model="form.name"
            class="field-input"
            type="text"
            placeholder="留空则使用网站域名"
            placeholder-class="placeholder"
            :disabled="detecting"
          />
        </view>

        <view class="detect-btn" :class="{ disabled: detecting }" @tap="startDetect" hover-class="press">
          <text v-if="!detecting">开始识别</text>
          <view v-else class="detect-btn-loading">
            <view class="btn-dot" />
            <view class="btn-dot" />
            <view class="btn-dot" />
            <text>正在识别</text>
          </view>
        </view>
        <text class="form-tip">识别过程会实际访问网站并读取少量公开页面，不会保存小说内容。</text>
      </view>

      <view v-if="detecting || stageList.length" class="progress-card">
        <view class="progress-head">
          <text class="section-label">识别进度</text>
          <text class="progress-state">{{ progressStateText }}</text>
        </view>
        <view class="stage-list">
          <view v-for="stage in stageList" :key="stage.key" class="stage-item" :class="stage.state">
            <view class="stage-marker">
              <view class="stage-dot">
                <text v-if="stage.state === 'done'">✓</text>
                <text v-else-if="stage.state === 'error'">×</text>
              </view>
              <view v-if="stage.key !== 'content'" class="stage-line" />
            </view>
            <view class="stage-copy">
              <text class="stage-label">{{ stage.label }}</text>
              <text class="stage-detail">{{ stage.detail }}</text>
            </view>
          </view>
        </view>
        <view v-if="error" class="progress-error">{{ error }}</view>
      </view>

      <view v-if="result" class="result-card">
        <view class="result-head">
          <view class="result-badge serif">成</view>
          <view class="result-head-copy">
            <text class="result-title serif">识别成功</text>
            <text class="result-sub">{{ result.source.name }} · {{ result.source.warnings.length }} 条提示</text>
          </view>
          <text class="result-time">{{ (result.report.elapsed / 1000).toFixed(1) }}s</text>
        </view>

        <view class="result-grid">
          <view class="result-item">
            <text class="result-value serif">{{ reportValue('search.count', 0) }}</text>
            <text class="result-label">搜索结果</text>
          </view>
          <view class="result-item">
            <text class="result-value serif">{{ reportValue('toc.count', 0) }}</text>
            <text class="result-label">章节</text>
          </view>
          <view class="result-item">
            <text class="result-value serif">{{ reportValue('content.length', 0) }}</text>
            <text class="result-label">正文字数</text>
          </view>
        </view>

        <view class="result-info">
          <view class="result-row">
            <text class="result-key">书源地址</text>
            <text class="result-text ellipsis">{{ result.source.url }}</text>
          </view>
          <view class="result-row">
            <text class="result-key">搜索地址</text>
            <text class="result-text ellipsis">{{ result.source.searchUrl }}</text>
          </view>
          <view class="result-row">
            <text class="result-key">编码 / 方法</text>
            <text class="result-text">{{ result.source.searchCharset }} / {{ result.source.searchMethod }}</text>
          </view>
          <view class="result-row">
            <text class="result-key">目录链接</text>
            <text class="result-text ellipsis">{{ result.report.stages.toc.url }}</text>
          </view>
        </view>

        <view class="rules-block">
          <text class="rules-title">生成的规则</text>
          <view class="rule-line"><text class="rule-key">搜索列表</text><text class="rule-value">{{ result.source.ruleSearch.bookList }}</text></view>
          <view class="rule-line"><text class="rule-key">书名</text><text class="rule-value">{{ result.source.ruleSearch.name }}</text></view>
          <view class="rule-line"><text class="rule-key">目录</text><text class="rule-value">{{ result.source.ruleToc.chapterList }}</text></view>
          <view class="rule-line"><text class="rule-key">正文</text><text class="rule-value">{{ result.source.ruleContent.content }}</text></view>
        </view>

        <scroll-view scroll-y class="preview-scroll">
          <text class="preview-title">{{ reportValue('content.title', '正文预览') }}</text>
          <text class="preview-text">{{ reportValue('content.preview', '') }}</text>
        </scroll-view>

        <view class="result-actions">
          <view class="ghost-btn result-btn" @tap="startDetect">再识别一次</view>
          <view class="primary-btn result-btn" @tap="saveSource">保存书源</view>
        </view>
      </view>

      <view v-if="!detecting && !result" class="hints-card">
        <text class="hints-title">识别小贴士</text>
        <text class="hints-line">· 优先使用搜索页能直接搜到的书名，避免生僻字。</text>
        <text class="hints-line">· 如果搜索入口来自 JavaScript，可能会识别失败，可改用导入现成书源。</text>
        <text class="hints-line">· 识别成功后建议在书源页做一次“体检”，确认目录与正文完整。</text>
      </view>

      <view class="bottom-space" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppHeader from '../../components/AppHeader.vue'
import { autoDetectSource } from '../../core/autodetect.js'
import { addSources } from '../../core/store.js'
import { toast, toastSuccess } from '../../utils/format.js'

const form = ref({
  url: '',
  keyword: '',
  name: ''
})
const detecting = ref(false)
const error = ref('')
const result = ref(null)
const stageList = ref([])

const STAGES = [
  { key: 'home', label: '打开网站', detail: '读取首页与搜索入口' },
  { key: 'search', label: '识别搜索', detail: '实测搜索并定位结果条目' },
  { key: 'book', label: '解析详情', detail: '识别书名、作者、封面与目录链接' },
  { key: 'toc', label: '读取目录', detail: '识别章节列表与章节链接' },
  { key: 'content', label: '验证正文', detail: '读取第一章并提取正文' }
]

const progressStateText = computed(() => {
  if (!stageList.value.length) return ''
  if (error.value) return '识别中断'
  if (result.value) return '识别完成'
  return '正在工作'
})

function initStages() {
  stageList.value = STAGES.map((stage) => ({ ...stage, state: 'waiting' }))
}

function setStage(key, message) {
  const index = STAGES.findIndex((stage) => stage.key === key)
  stageList.value = stageList.value.map((stage, i) => {
    if (i < index) return { ...stage, state: 'done' }
    if (i === index) return { ...stage, state: key === 'done' ? 'done' : 'active', detail: message || stage.detail }
    return { ...stage, state: 'waiting' }
  })
}

function markStageError(key, message) {
  stageList.value = stageList.value.map((stage) => {
    if (stage.key === key) return { ...stage, state: 'error', detail: message || stage.detail }
    return stage
  })
}

async function startDetect() {
  if (detecting.value) return
  const url = String(form.value.url || '').trim()
  const keyword = String(form.value.keyword || '').trim()
  if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(url)) {
    toast('请输入有效的网站地址')
    return
  }
  if (!keyword) {
    toast('请输入一本用于识别的书名')
    return
  }
  detecting.value = true
  error.value = ''
  result.value = null
  initStages()
  try {
    const detected = await autoDetectSource({
      url,
      keyword,
      name: form.value.name
    }, {
      onProgress(stage, message) {
        if (stage === 'done') {
          stageList.value = stageList.value.map((item) => ({ ...item, state: 'done' }))
          return
        }
        setStage(stage, message)
      }
    })
    stageList.value = stageList.value.map((item) => ({ ...item, state: 'done' }))
    result.value = detected
    toastSuccess('识别成功')
  } catch (e) {
    const stage = e && e.stage ? e.stage : ''
    if (stage) markStageError(stage, e.message)
    error.value = (stage ? `[${stageLabel(stage)}] ` : '') + (e && e.message ? e.message : '识别失败')
  } finally {
    detecting.value = false
  }
}

function stageLabel(key) {
  const stage = STAGES.find((item) => item.key === key)
  return stage ? stage.label : key
}

function reportValue(path, fallback) {
  if (!result.value) return fallback
  const parts = path.split('.')
  let value = result.value.report.stages
  for (const part of parts) {
    if (value === undefined || value === null) return fallback
    const index = Number(part)
    value = Number.isInteger(index) ? value[index] : value[part]
  }
  return value === undefined || value === null || value === '' ? fallback : value
}

function saveSource() {
  if (!result.value) return
  addSources([result.value.source])
  toastSuccess('书源已保存')
  setTimeout(() => {
    uni.navigateBack({ delta: 1 })
  }, 300)
}
</script>

<style scoped>
.detect-page {
  background: #f6f1e5;
}

.detect-body {
  padding: 20rpx 36rpx 40rpx;
}

.detect-hero {
  display: flex;
  align-items: center;
  padding: 28rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(340rpx 220rpx at 100% 0%, rgba(201, 164, 106, 0.2), transparent 70%),
    linear-gradient(135deg, #2b5146, #1d3a32);
  box-shadow: 0 18rpx 40rpx rgba(28, 54, 46, 0.22);
  overflow: hidden;
}

.hero-orbit {
  width: 124rpx;
  height: 124rpx;
  position: relative;
  flex-shrink: 0;
}

.orbit-ring {
  position: absolute;
  border-radius: 50%;
  border: 1rpx solid rgba(233, 211, 170, 0.3);
}

.r1 { left: 0; top: 0; width: 124rpx; height: 124rpx; }
.r2 { left: 18rpx; top: 18rpx; width: 88rpx; height: 88rpx; border-color: rgba(233, 211, 170, 0.45); }

.orbit-core {
  position: absolute;
  left: 42rpx;
  top: 42rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #f1e3c6;
  color: #2b5146;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
}

.hero-copy {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
}

.hero-title {
  display: block;
  font-size: 32rpx;
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

.form-card {
  margin-top: 22rpx;
  padding: 28rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.72);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.05);
}

.field {
  margin-bottom: 20rpx;
}

.field-label {
  display: block;
  font-size: 22rpx;
  color: var(--ink-soft);
  margin-bottom: 8rpx;
}

.field-optional {
  color: var(--muted);
  font-size: 19rpx;
}

.field-input {
  height: 82rpx;
  padding: 0 22rpx;
  border-radius: 16rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 25rpx;
  color: var(--ink);
}

.detect-btn {
  height: 86rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  letter-spacing: 2rpx;
  margin-top: 10rpx;
  box-shadow: 0 12rpx 26rpx rgba(47, 93, 80, 0.2);
}

.detect-btn.disabled {
  opacity: 0.75;
}

.detect-btn-loading {
  display: flex;
  align-items: center;
}

.btn-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: #f1e3c6;
  margin: 0 4rpx;
  animation: inkPulse 1s infinite;
}

.btn-dot:nth-child(2) { animation-delay: 0.15s; }
.btn-dot:nth-child(3) { animation-delay: 0.3s; }

.detect-btn-loading text {
  margin-left: 10rpx;
  font-size: 24rpx;
}

.form-tip {
  display: block;
  margin-top: 14rpx;
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--muted);
}

.progress-card,
.result-card,
.hints-card {
  margin-top: 22rpx;
  padding: 26rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.68);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.progress-state {
  font-size: 20rpx;
  color: var(--muted);
}

.stage-item {
  display: flex;
  min-height: 88rpx;
}

.stage-marker {
  width: 34rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.stage-dot {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  border: 2rpx solid var(--line-strong);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 17rpx;
  flex-shrink: 0;
}

.stage-item.active .stage-dot {
  border-color: var(--gold);
  background: var(--gold);
  animation: inkPulse 1.2s infinite;
}

.stage-item.done .stage-dot {
  border-color: var(--jade);
  background: var(--jade);
}

.stage-item.error .stage-dot {
  border-color: var(--accent);
  background: var(--accent);
}

.stage-line {
  width: 2rpx;
  flex: 1;
  background: var(--line);
  margin: 4rpx 0;
}

.stage-copy {
  flex: 1;
  min-width: 0;
  margin-left: 14rpx;
  padding-bottom: 18rpx;
  display: flex;
  flex-direction: column;
}

.stage-label {
  font-size: 24rpx;
  color: var(--ink-soft);
}

.stage-item.active .stage-label { color: var(--ink); font-weight: 500; }
.stage-item.done .stage-label { color: var(--ink); }

.stage-detail {
  margin-top: 2rpx;
  font-size: 19rpx;
  line-height: 1.5;
  color: var(--muted);
}

.stage-item.error .stage-detail { color: var(--accent); }

.progress-error {
  margin-top: 8rpx;
  padding: 14rpx 16rpx;
  border-radius: 12rpx;
  background: rgba(168, 73, 58, 0.07);
  font-size: 20rpx;
  line-height: 1.6;
  color: var(--accent);
}

.result-head {
  display: flex;
  align-items: center;
}

.result-badge {
  width: 58rpx;
  height: 58rpx;
  border-radius: 16rpx;
  background: var(--jade);
  color: #f4e8cf;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
}

.result-head-copy {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  display: flex;
  flex-direction: column;
}

.result-title {
  font-size: 30rpx;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.result-sub {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.result-time {
  font-size: 19rpx;
  color: var(--muted);
}

.result-grid {
  display: flex;
  margin-top: 22rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--line);
  border-bottom: 1rpx solid var(--line);
}

.result-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.result-value {
  font-size: 32rpx;
  color: var(--ink);
}

.result-label {
  margin-top: 2rpx;
  font-size: 18rpx;
  color: var(--muted);
}

.result-info {
  padding-top: 14rpx;
}

.result-row {
  display: flex;
  align-items: center;
  padding: 8rpx 0;
}

.result-key {
  width: 150rpx;
  font-size: 20rpx;
  color: var(--muted);
  flex-shrink: 0;
}

.result-text {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  color: var(--ink-soft);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.rules-block {
  margin-top: 16rpx;
  padding: 18rpx;
  border-radius: 14rpx;
  background: rgba(35, 33, 27, 0.94);
}

.rules-title {
  display: block;
  font-size: 19rpx;
  letter-spacing: 2rpx;
  color: rgba(233, 225, 207, 0.55);
  margin-bottom: 8rpx;
}

.rule-line {
  display: flex;
  align-items: flex-start;
  padding: 3rpx 0;
}

.rule-key {
  width: 100rpx;
  font-size: 18rpx;
  color: rgba(233, 225, 207, 0.45);
  flex-shrink: 0;
}

.rule-value {
  flex: 1;
  min-width: 0;
  font-size: 18rpx;
  line-height: 1.5;
  color: #e9e1cf;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  word-break: break-all;
}

.preview-scroll {
  max-height: 180rpx;
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  background: rgba(37, 42, 36, 0.035);
  border: 1rpx solid var(--line);
}

.preview-title {
  display: block;
  font-size: 21rpx;
  color: var(--ink);
  margin-bottom: 6rpx;
}

.preview-text {
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--muted);
  white-space: pre-wrap;
}

.result-actions {
  display: flex;
  margin-top: 22rpx;
}

.result-btn {
  flex: 1;
  height: 80rpx;
  font-size: 25rpx;
}

.result-btn + .result-btn {
  margin-left: 14rpx;
}

.hints-card {
  background: rgba(255, 252, 245, 0.42);
  border-style: dashed;
}

.hints-title {
  display: block;
  font-size: 21rpx;
  letter-spacing: 2rpx;
  color: var(--muted);
  margin-bottom: 10rpx;
}

.hints-line {
  display: block;
  font-size: 20rpx;
  line-height: 1.75;
  color: var(--muted);
}

.bottom-space {
  height: 30rpx;
}
</style>
