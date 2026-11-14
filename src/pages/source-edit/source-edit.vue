<template>
  <view class="page edit-page">
    <AppHeader title="编辑书源" :subtitle="sourceName" back show-border>
      <template #actions>
        <view class="header-save" @tap="saveSource" hover-class="press">保存</view>
      </template>
    </AppHeader>

    <view class="edit-body">
      <view class="edit-hero">
        <view class="edit-mark serif">{{ sourceName ? sourceName.slice(0, 1) : '源' }}</view>
        <view class="edit-hero-info">
          <text class="edit-name">{{ sourceName || '新书源' }}</text>
          <text class="edit-host">{{ hostOf(editorValue('bookSourceUrl')) || '尚未填写网站地址' }}</text>
        </view>
        <text v-if="isBuiltin" class="builtin-badge">内置</text>
      </view>

      <view class="tip-card">
        <text class="tip-title">直接编辑规则 JSON</text>
        <text class="tip-text">支持 Legado 字段：bookSourceName、bookSourceUrl、searchUrl、ruleSearch、ruleBookInfo、ruleToc、ruleContent。支持 {{key}} 搜索词模板与 ##正则##替换。App 端直连网站；H5 开发环境自动走本地代理。</text>
      </view>

      <textarea
        v-model="editorText"
        class="rule-editor"
        placeholder="在此粘贴或编辑书源 JSON"
        placeholder-class="placeholder"
        :maxlength="-1"
        :auto-height="false"
        @input="dirty = true"
      />

      <view v-if="validationErrors.length" class="validation-box error-box">
        <text class="validation-title">需要修正</text>
        <text v-for="(error, index) in validationErrors" :key="index" class="validation-line">{{ error }}</text>
      </view>
      <view v-else-if="validationWarnings.length" class="validation-box warning-box">
        <text class="validation-title">兼容性提示</text>
        <text v-for="(warning, index) in validationWarnings" :key="index" class="validation-line">{{ warning }}</text>
      </view>

      <view class="test-card">
        <view class="test-head">
          <text class="test-title">书源体检</text>
          <text class="test-hint">搜索 → 详情 → 目录 → 正文</text>
        </view>
        <view class="test-row">
          <input
            v-model="testKeyword"
            class="test-input"
            type="text"
            placeholder="测试书名，例如：万相之王"
            placeholder-class="placeholder"
            @confirm="runTest"
          />
          <view class="test-btn" :class="{ disabled: testing }" @tap="runTest">{{ testing ? '检测中' : '测试' }}</view>
        </view>
        <view v-if="testResult" class="test-result" :class="{ ok: testResult.ok }">
          <text class="test-result-title">{{ testResult.ok ? '书源可用' : '测试未通过' }}</text>
          <text class="test-result-text">{{ testResult.summary }}</text>
          <text v-if="testResult.preview" class="test-result-preview">{{ testResult.preview }}</text>
        </view>
      </view>

      <view class="edit-actions">
        <view class="ghost-btn edit-action" @tap="copyEditor" hover-class="press">复制 JSON</view>
        <view class="ghost-btn edit-action" @tap="validate" hover-class="press">校验规则</view>
      </view>

      <view v-if="sourceId" class="danger-zone">
        <view class="danger-btn" @tap="removeSource" hover-class="press">删除这个书源</view>
        <text class="danger-hint">删除内置书源后，可在书源页菜单中恢复。</text>
      </view>

      <view class="bottom-space" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import {
  loadSources,
  addSources,
  deleteSource
} from '../../core/store.js'
import {
  exportSource,
  normalizeSource,
  SOURCE_TEMPLATE
} from '../../core/source.js'
import { testSource } from '../../core/service.js'
import { copyText, confirmDialog, toast, toastSuccess } from '../../utils/format.js'

const sourceId = ref('')
const existing = ref(null)
const editorText = ref(JSON.stringify(SOURCE_TEMPLATE, null, 2))
const dirty = ref(false)
const validationErrors = ref([])
const validationWarnings = ref([])
const testKeyword = ref('万相之王')
const testing = ref(false)
const testResult = ref(null)

const parsed = computed(() => {
  try {
    return JSON.parse(editorText.value)
  } catch (e) {
    return null
  }
})
const sourceName = computed(() => {
  const data = parsed.value
  if (!data) return existing.value ? existing.value.name : ''
  return data.bookSourceName || data.name || ''
})
const isBuiltin = computed(() => !!(existing.value && existing.value.builtin))

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1].replace(/^www\./, '') : String(url || '')
}

function editorValue(field) {
  const data = parsed.value
  if (!data) return ''
  return data[field] || data[field.replace('bookSource', '').toLowerCase()] || ''
}

onLoad((options) => {
  sourceId.value = (options && options.id) || ''
  const sources = loadSources()
  const source = sources.find((item) => item.id === sourceId.value)
  if (source) {
    existing.value = source
    editorText.value = JSON.stringify(exportSource(source), null, 2)
    testKeyword.value = source.name ? '万相之王' : '万相之王'
  }
})

function parseAndNormalize() {
  validationErrors.value = []
  validationWarnings.value = []
  let data
  try {
    data = JSON.parse(editorText.value)
  } catch (e) {
    validationErrors.value = ['JSON 格式错误：' + e.message]
    return null
  }
  if (Array.isArray(data)) {
    validationErrors.value = ['这里只能编辑单个书源，请导入数组时使用书源页的“导入书源”。']
    return null
  }
  const normalized = normalizeSource(data)
  normalized.id = sourceId.value || normalized.id
  if (existing.value) {
    normalized.id = existing.value.id
    normalized.builtin = existing.value.builtin
    normalized.enabled = existing.value.enabled
  }
  validationErrors.value = normalized.errors || []
  validationWarnings.value = normalized.warnings || []
  return normalized
}

function validate() {
  const source = parseAndNormalize()
  if (!source) return null
  if (!validationErrors.value.length) {
    toast(validationWarnings.value.length ? '规则可用，但有兼容性提示' : '规则校验通过')
  }
  return source
}

function saveSource() {
  const source = parseAndNormalize()
  if (!source) return
  if (validationErrors.value.length) {
    toast('请先修正错误')
    return
  }
  addSources([source])
  dirty.value = false
  toastSuccess('书源已保存')
  setTimeout(() => {
    const pages = getCurrentPages()
    if (pages && pages.length > 1) uni.navigateBack({ delta: 1 })
    else uni.switchTab({ url: '/pages/sources/sources' })
  }, 300)
}

async function runTest() {
  if (testing.value) return
  const source = parseAndNormalize()
  if (!source || validationErrors.value.length) {
    toast('请先修正规则错误')
    return
  }
  const keyword = String(testKeyword.value || '').trim() || '万相之王'
  testing.value = true
  testResult.value = null
  try {
    const report = await testSource(source, keyword)
    const stages = report.stages || {}
    if (report.ok) {
      const count = stages.search ? stages.search.count : 0
      const chapters = stages.book ? stages.book.chapterCount : 0
      const length = stages.content ? stages.content.length : 0
      testResult.value = {
        ok: true,
        summary: `搜索 ${count} 条 · 目录 ${chapters} 章 · 正文 ${length} 字`,
        preview: stages.content ? stages.content.preview : ''
      }
    } else {
      testResult.value = {
        ok: false,
        summary: (report.errorStage ? `失败于${stageName(report.errorStage)}：` : '') + (report.error || '未知错误'),
        preview: ''
      }
    }
  } catch (e) {
    testResult.value = { ok: false, summary: e && e.message ? e.message : '测试失败', preview: '' }
  } finally {
    testing.value = false
  }
}

function stageName(stage) {
  return { search: '搜索', book: '详情', toc: '目录', content: '正文' }[stage] || stage
}

async function copyEditor() {
  await copyText(editorText.value, '书源 JSON 已复制')
}

async function removeSource() {
  if (!sourceId.value) return
  const ok = await confirmDialog({
    title: '删除书源',
    content: '删除后，使用该书的书架条目可能无法继续加载。确定删除吗？',
    confirmText: '删除'
  })
  if (!ok) return
  deleteSource(sourceId.value)
  toast('书源已删除')
  setTimeout(() => {
    uni.navigateBack({ delta: 1 })
  }, 300)
}
</script>

<style scoped>
.edit-page {
  background: #f6f1e5;
}

.header-save {
  font-size: 26rpx;
  color: var(--jade);
  padding: 10rpx 4rpx 10rpx 20rpx;
  font-weight: 500;
}

.edit-body {
  padding: 20rpx 36rpx 40rpx;
}

.edit-hero {
  display: flex;
  align-items: center;
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 252, 245, 0.7);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

.edit-mark {
  width: 70rpx;
  height: 70rpx;
  border-radius: 18rpx;
  background: var(--jade);
  color: #f5edd9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  flex-shrink: 0;
}

.edit-hero-info {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.edit-name {
  font-size: 28rpx;
  color: var(--ink);
}

.edit-host {
  margin-top: 3rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.builtin-badge {
  font-size: 18rpx;
  color: #8a6b3c;
  background: rgba(176, 138, 82, 0.14);
  border-radius: 999rpx;
  padding: 4rpx 12rpx;
}

.tip-card {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 20rpx;
  background: rgba(47, 93, 80, 0.05);
  border: 1rpx solid rgba(47, 93, 80, 0.1);
}

.tip-title {
  display: block;
  font-size: 23rpx;
  color: var(--jade);
  margin-bottom: 6rpx;
}

.tip-text {
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--muted);
}

.rule-editor {
  width: 100%;
  height: 780rpx;
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 20rpx;
  background: rgba(35, 33, 27, 0.94);
  color: #e9e1cf;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  font-size: 21rpx;
  line-height: 1.65;
  box-sizing: border-box;
}

.validation-box {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
}

.error-box {
  background: rgba(168, 73, 58, 0.08);
}

.warning-box {
  background: rgba(176, 138, 82, 0.1);
}

.validation-title {
  display: block;
  font-size: 21rpx;
  margin-bottom: 6rpx;
  color: var(--ink);
}

.validation-line {
  display: block;
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--accent);
}

.warning-box .validation-line {
  color: #8a6b3c;
}

.test-card {
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: rgba(255, 252, 245, 0.68);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

.test-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.test-title {
  font-size: 26rpx;
  color: var(--ink);
}

.test-hint {
  font-size: 19rpx;
  color: var(--muted);
}

.test-row {
  display: flex;
  align-items: center;
}

.test-input {
  flex: 1;
  height: 72rpx;
  padding: 0 18rpx;
  border-radius: 14rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 23rpx;
  color: var(--ink);
}

.test-btn {
  height: 72rpx;
  padding: 0 26rpx;
  margin-left: 10rpx;
  border-radius: 14rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  font-size: 23rpx;
}

.test-btn.disabled {
  opacity: 0.55;
}

.test-result {
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  background: rgba(168, 73, 58, 0.06);
}

.test-result.ok {
  background: rgba(47, 93, 80, 0.06);
}

.test-result-title {
  display: block;
  font-size: 22rpx;
  color: var(--accent);
  margin-bottom: 4rpx;
}

.test-result.ok .test-result-title {
  color: var(--jade);
}

.test-result-text {
  display: block;
  font-size: 20rpx;
  line-height: 1.6;
  color: var(--muted);
}

.test-result-preview {
  display: block;
  margin-top: 8rpx;
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--muted);
}

.edit-actions {
  display: flex;
  margin-top: 22rpx;
}

.edit-action {
  flex: 1;
  height: 78rpx;
  font-size: 24rpx;
}

.edit-action + .edit-action {
  margin-left: 14rpx;
}

.danger-zone {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.danger-btn {
  font-size: 24rpx;
  color: var(--accent);
  padding: 14rpx 28rpx;
}

.danger-hint {
  margin-top: 4rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.bottom-space {
  height: 40rpx;
}
</style>
