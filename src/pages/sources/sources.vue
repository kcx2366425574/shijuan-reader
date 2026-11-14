<template>
  <view class="page sources-page">
    <view class="top-safe" />
    <view class="header">
      <view class="header-copy">
        <text class="header-kicker">SOURCES · 书源</text>
        <text class="header-title serif">万千站点，皆可成卷</text>
        <text class="header-sub">打开即用；书源失效时可以一键同步更新</text>
      </view>
      <view v-if="showAdvanced" class="header-actions">
        <view class="round-btn" @tap="openImport" hover-class="press">
          <text class="plus">+</text>
        </view>
        <view class="round-btn" @tap="openMore" hover-class="press">
          <view class="more-dots">
            <view class="more-dot" />
            <view class="more-dot" />
            <view class="more-dot" />
          </view>
        </view>
      </view>
    </view>

    <view class="stats-card">
      <view class="stat-item">
        <text class="stat-value serif">{{ sources.length }}</text>
        <text class="stat-label">全部书源</text>
      </view>
      <view class="stat-divider" />
      <view class="stat-item">
        <text class="stat-value serif">{{ enabledCount }}</text>
        <text class="stat-label">已启用</text>
      </view>
    </view>

    <view class="repo-card" :class="{ configured: repoConfigured }">
      <view class="repo-icon">
        <view class="cloud-shape" />
        <view class="cloud-arrow">↓</view>
      </view>
      <view class="repo-info">
        <view class="repo-title-row">
          <text class="repo-title">书源库</text>
          <text class="repo-badge" :class="{ on: repoConfigured }">{{ repoConfigured ? '自动更新' : '内置' }}</text>
        </view>
        <text class="repo-desc">{{ repoConfigured ? '书源会自动检查更新，失效时可以手动同步' : '当前使用内置书源，无需配置' }}</text>
        <text v-if="repoConfigured" class="repo-meta-line">{{ repoLastSyncText }}</text>
      </view>
      <view class="repo-actions">
        <view v-if="showAdvanced" class="repo-btn" @tap.stop="openRepoConfig" hover-class="press">配置</view>
        <view v-if="repoConfigured" class="repo-btn primary" :class="{ disabled: repoSyncing }" @tap.stop="syncRepo" hover-class="press">
          {{ repoSyncing ? '同步中' : '同步' }}
        </view>
      </view>
    </view>

    <view v-if="showAdvanced" class="quick-actions">
      <view class="quick-action primary" @tap="goDetect" hover-class="press">
        <view class="quick-icon spark">
          <view class="spark-line s1" />
          <view class="spark-line s2" />
          <view class="spark-dot" />
        </view>
        <view class="quick-copy">
          <text class="quick-title">智能识别网站</text>
          <text class="quick-desc">输入网址和书名，自动生成书源</text>
        </view>
        <text class="quick-arrow">→</text>
      </view>
      <view class="quick-action" @tap="openImport" hover-class="press">
        <view class="quick-icon import">
          <view class="import-arrow">↓</view>
        </view>
        <view class="quick-copy">
          <text class="quick-title">导入书源</text>
          <text class="quick-desc">粘贴 JSON，兼容 Legado</text>
        </view>
        <text class="quick-arrow">→</text>
      </view>
      <view class="quick-action" @tap="goDirect" hover-class="press">
        <view class="quick-icon link">
          <view class="link-glyph">↗</view>
        </view>
        <view class="quick-copy">
          <text class="quick-title">链接添加</text>
          <text class="quick-desc">粘贴书籍页地址，使用直链源解析</text>
        </view>
        <text class="quick-arrow">→</text>
      </view>
    </view>

    <view class="list-head">
      <text class="section-label">可用书源</text>
      <text class="list-hint advanced-link" @tap="toggleAdvanced">{{ showAdvanced ? '收起高级工具' : '高级工具' }}</text>
    </view>

    <view v-if="sources.length" class="source-list">
      <view
        v-for="source in sources"
        :key="source.id"
        class="source-card"
        :class="{ off: source.enabled === false }"
        hover-class="press"
        :hover-stay-time="80"
        @tap="openSourceInfo(source)"
        @longpress="handleSourceLongPress(source)"
      >
        <view class="source-top">
          <view class="source-mark" :class="{ builtin: source.builtin }">
            <text class="serif">{{ source.name.slice(0, 1) }}</text>
            <view v-if="source.builtin" class="builtin-seal">内置</view>
          </view>
          <view class="source-main">
            <view class="source-title-row">
              <text class="source-name ellipsis">{{ source.name }}</text>
              <text class="source-group">{{ source.group || '自定义' }}</text>
            </view>
            <text class="source-desc ellipsis">{{ sourceDescription(source) }}</text>
            <view v-if="showAdvanced" class="source-meta">
              <text class="source-meta-chip">{{ source.type === 'json' ? 'JSON' : 'HTML' }}</text>
              <text class="source-meta-chip">{{ (source.charset || 'auto').toUpperCase() }}</text>
              <text v-if="source.direct" class="source-meta-chip">DIRECT</text>
              <text v-else-if="source.searchMode === 'crawl-index'" class="source-meta-chip">INDEX</text>
              <text v-else class="source-meta-chip">{{ source.searchMethod || 'GET' }}</text>
              <text v-if="source.warnings && source.warnings.length" class="source-meta-warning">
                {{ source.warnings.length }} 条提示
              </text>
            </view>
          </view>
          <view class="source-switch" @tap.stop>
            <switch
              :checked="source.enabled !== false"
              color="#2f5d50"
              style="transform: scale(0.82)"
              @change="onToggle(source, $event)"
            />
          </view>
        </view>
        <view v-if="showAdvanced" class="source-bottom">
          <view class="source-actions">
            <view v-if="!source.direct" class="source-action" @tap.stop="openTest(source)" hover-class="press">体检</view>
            <view class="source-action" @tap.stop="editSource(source)" hover-class="press">编辑</view>
            <view class="source-action" @tap.stop="copySource(source)" hover-class="press">复制</view>
          </view>
          <text class="source-state">{{ source.enabled === false ? '已停用' : '参与搜索' }}</text>
        </view>
        <view v-else class="source-reader-state">
          <text class="state-dot" :class="{ on: source.enabled !== false }" />
          <text>{{ source.enabled === false ? '已停用' : '可用' }}</text>
        </view>
      </view>
    </view>

    <EmptyState
      v-else
      title="书源不见了"
      desc="内置书源可能被停用或删除。恢复后即可继续搜索书籍。"
      action-text="恢复内置书源"
      @action="restoreBuiltins"
    />

    <view class="footer-note">
      <text class="footer-title">关于书源</text>
      <text class="footer-text">书源会自动更新，只负责找书与解析公开网页，不保存小说内容。若某本书搜不到，可以换个书源或稍后再试。</text>
    </view>

    <view class="bottom-space" />

    <BottomSheet v-model:show="showImport" title="导入书源">
      <view class="import-mode-tabs">
        <view class="import-mode" :class="{ active: !preview.length }" @tap="preview = []">粘贴 JSON</view>
        <view class="import-mode" :class="{ active: preview.length }">预览</view>
      </view>

      <template v-if="!preview.length">
        <textarea
          v-model="importText"
          class="import-textarea"
          placeholder="在这里粘贴 Legado 书源 JSON（单个对象或数组均可）"
          placeholder-class="placeholder"
          :maxlength="-1"
        />
        <view v-if="importError" class="import-error">{{ importError }}</view>
        <view class="import-tools">
          <view class="import-tool" @tap="pasteFromClipboard" hover-class="press">从剪贴板粘贴</view>
          <view v-if="isH5" class="import-tool" @tap="chooseFile" hover-class="press">选择文件</view>
          <view class="import-tool" @tap="loadExample" hover-class="press">填入示例</view>
        </view>
        <view class="sheet-primary" @tap="parseImport" hover-class="press">解析书源</view>
        <text class="import-tip">支持 bookSourceName、searchUrl、ruleSearch 等 Legado 字段；@js 与 @XPath 规则暂不支持，会在导入后提示。</text>
      </template>

      <template v-else>
        <view class="preview-summary">
          <text class="preview-count serif">{{ preview.length }}</text>
          <text class="preview-label">个书源待导入</text>
        </view>
        <view class="preview-list">
          <view v-for="item in preview" :key="item.id" class="preview-item">
            <view class="preview-main">
              <text class="preview-name">{{ item.name }}</text>
              <text class="preview-url">{{ hostOf(item.url) }} · {{ item.group }}</text>
              <view v-if="item.warnings && item.warnings.length" class="preview-warnings">
                <text v-for="(warning, index) in item.warnings.slice(0, 2)" :key="index" class="preview-warning">{{ warning }}</text>
              </view>
              <view v-if="item.errors && item.errors.length" class="preview-errors">
                <text v-for="(error, index) in item.errors" :key="index">{{ error }}</text>
              </view>
            </view>
            <text class="preview-state" :class="{ invalid: item.errors && item.errors.length }">
              {{ item.errors && item.errors.length ? '不完整' : '可导入' }}
            </text>
          </view>
        </view>
        <view class="preview-actions">
          <view class="ghost-btn preview-btn" @tap="preview = []">返回修改</view>
          <view class="primary-btn preview-btn" @tap="confirmImport">确认导入 {{ preview.length }} 个</view>
        </view>
      </template>
    </BottomSheet>

    <BottomSheet v-model:show="showTest" :title="testTarget ? '书源体检 · ' + testTarget.name : '书源体检'">
      <view class="test-intro">
        <text>输入一本书名，拾卷会依次验证搜索、详情、目录和正文四个环节。</text>
      </view>
      <view class="test-input-row">
        <input
          v-model="testKeyword"
          class="test-input"
          type="text"
          placeholder="例如：万相之王"
          placeholder-class="placeholder"
          @confirm="runTest"
        />
        <view class="test-start" :class="{ disabled: testing }" @tap="runTest">开始</view>
      </view>

      <view v-if="testing || testReport" class="test-report">
        <view class="test-progress-text">{{ testProgressText }}</view>
        <view v-if="testReport" class="test-stages">
          <view class="test-stage">
            <view class="stage-dot" :class="{ ok: testReport.stages.search && testReport.stages.search.ok, fail: testReport.stages.search && !testReport.stages.search.ok }" />
            <text class="stage-name">搜索</text>
            <text class="stage-value">{{ stageText(testReport.stages.search, 'count', '条结果') }}</text>
          </view>
          <view class="test-stage">
            <view class="stage-dot" :class="{ ok: testReport.stages.book && testReport.stages.book.ok, fail: testReport.stages.book && !testReport.stages.book.ok }" />
            <text class="stage-name">详情</text>
            <text class="stage-value">{{ stageText(testReport.stages.book, 'chapterCount', '章') }}</text>
          </view>
          <view class="test-stage">
            <view class="stage-dot" :class="{ ok: testReport.stages.content && testReport.stages.content.ok, fail: testReport.stages.content && !testReport.stages.content.ok }" />
            <text class="stage-name">正文</text>
            <text class="stage-value">{{ stageText(testReport.stages.content, 'length', '字') }}</text>
          </view>
        </view>
        <view v-if="testReport && testReport.stages.content && testReport.stages.content.ok" class="test-preview">
          <text class="test-preview-title">{{ testReport.stages.content.title }}</text>
          <text class="test-preview-text">{{ testReport.stages.content.preview }}</text>
        </view>
        <view v-if="testReport && testReport.error" class="test-error">
          <text>{{ testReport.error }}</text>
        </view>
        <view v-if="testReport && testReport.ok" class="test-success">书源可用，可以开始找书了。</view>
      </view>
    </BottomSheet>

    <BottomSheet v-model:show="showRepoConfig" title="书源仓库">
      <text class="config-tip">书源与解析规则放在独立仓库维护。站点改版时只更新仓库，App 同步即可，不需要重新发版。</text>
      <view class="config-segment">
        <view class="config-segment-item" :class="{ active: repoForm.provider === 'github' }" @tap="repoForm.provider = 'github'">GitHub</view>
        <view class="config-segment-item" :class="{ active: repoForm.provider === 'gitee' }" @tap="repoForm.provider = 'gitee'">Gitee</view>
        <view class="config-segment-item" :class="{ active: repoForm.provider === 'manifest' }" @tap="repoForm.provider = 'manifest'">静态清单</view>
      </view>
      <view v-if="repoForm.provider !== 'manifest'" class="config-field">
        <text class="config-label">仓库</text>
        <input v-model="repoForm.repo" class="config-input" placeholder="owner/shijuan-sources" placeholder-class="placeholder" />
        <text class="config-label branch-label">分支</text>
        <input v-model="repoForm.branch" class="config-input" placeholder="main" placeholder-class="placeholder" />
        <text class="config-help">GitHub 会优先走 jsDelivr CDN，失败后回退 raw.githubusercontent.com；Gitee 使用 raw 地址。清单文件为 index.json。</text>
      </view>
      <view v-else class="config-field">
        <text class="config-label">index.json 地址</text>
        <input v-model="repoForm.manifestUrl" class="config-input" placeholder="https://cdn.jsdelivr.net/gh/owner/repo@main/index.json" placeholder-class="placeholder" />
        <text class="config-help">适合使用对象存储、GitHub Pages 或 jsDelivr 的网络环境。</text>
      </view>
      <view class="config-switch-row">
        <view class="config-switch-copy">
          <text class="config-switch-title">启动时自动检查</text>
          <text class="config-switch-desc">12 小时内最多检查一次，版本变化才重新拉取</text>
        </view>
        <switch :checked="repoForm.autoSync" color="#2f5d50" @change="onRepoAutoSyncChange" />
      </view>
      <view class="config-actions">
        <view class="ghost-btn config-btn" @tap="showRepoConfig = false">取消</view>
        <view class="primary-btn config-btn" @tap="saveRepoConfig">保存</view>
      </view>
    </BottomSheet>

    <BottomSheet v-model:show="showSourceInfo" :title="infoSource ? infoSource.name : '书源信息'">
      <view v-if="infoSource" class="info-source">
        <view class="info-source-head">
          <view class="source-mark" :class="{ builtin: infoSource.builtin }">
            <text class="serif">{{ infoSource.name.slice(0, 1) }}</text>
          </view>
          <view class="info-source-copy">
            <text class="info-source-name">{{ infoSource.name }}</text>
            <text class="info-source-desc">{{ sourceDescription(infoSource) }}</text>
          </view>
          <view class="info-source-badge" :class="{ off: infoSource.enabled === false }">
            {{ infoSource.enabled === false ? '已停用' : '可用' }}
          </view>
        </view>

        <view class="info-rows">
          <view class="info-row">
            <text class="info-key">书源类型</text>
            <text class="info-value">{{ sourceKindText(infoSource) }}</text>
          </view>
          <view class="info-row">
            <text class="info-key">更新方式</text>
            <text class="info-value">{{ infoSource.builtin ? '随应用或书源库自动更新' : '手动维护' }}</text>
          </view>
          <view class="info-row">
            <text class="info-key">支持内容</text>
            <text class="info-value">搜索 · 详情 · 目录 · 正文</text>
          </view>
        </view>

        <view class="info-switch-row">
          <view class="info-switch-copy">
            <text class="info-switch-title">参与书籍搜索</text>
            <text class="info-switch-desc">关闭后不会在书城向该书源发请求</text>
          </view>
          <switch
            :checked="infoSource.enabled !== false"
            color="#2f5d50"
            @change="onToggle(infoSource, $event)"
          />
        </view>

        <view v-if="showAdvanced" class="info-advanced">
          <text class="info-advanced-label">高级操作</text>
          <view class="info-advanced-actions">
            <view v-if="!infoSource.direct" class="info-advanced-btn" @tap="openTest(infoSource)">体检</view>
            <view class="info-advanced-btn" @tap="editSource(infoSource)">编辑规则</view>
            <view class="info-advanced-btn" @tap="copySource(infoSource)">复制 JSON</view>
            <view class="info-advanced-btn danger" @tap="removeSource(infoSource)">删除</view>
          </view>
        </view>

        <view class="sheet-primary" @tap="showSourceInfo = false">完成</view>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BottomSheet from '../../components/BottomSheet.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  ensureSources,
  loadSettings,
  saveSettings,
  toggleSource,
  deleteSource,
  addSources,
  restoreBuiltinSources
} from '../../core/store.js'
import {
  parseSourceImport,
  exportSources,
  SOURCE_TEMPLATE,
  normalizeSource
} from '../../core/source.js'
import { testSource, clearHttpCache } from '../../core/service.js'
import { clearBookCache } from '../../core/book-cache.js'
import {
  syncSourceRepo,
  getSourceRepoConfig,
  isSourceRepoConfigured,
  sourceRepoLabel,
  loadSourceRepoState
} from '../../core/source-repo.js'
import { copyText, confirmDialog, toast, toastSuccess } from '../../utils/format.js'

const sources = ref([])
const showImport = ref(false)
const importText = ref('')
const importError = ref('')
const preview = ref([])
const showTest = ref(false)
const testTarget = ref(null)
const testKeyword = ref('万相之王')
const testing = ref(false)
const testReport = ref(null)
const testProgressText = ref('')
const showAdvanced = ref(false)
const showSourceInfo = ref(false)
const infoSource = ref(null)
const settings = ref(loadSettings())
const repoState = ref(null)
const repoSyncing = ref(false)
const showRepoConfig = ref(false)
const repoForm = ref({ provider: 'github', repo: '', branch: 'main', manifestUrl: '', autoSync: true })
const isH5 = (() => {
  try {
    const info = uni.getSystemInfoSync()
    return info.uniPlatform === 'web'
  } catch (e) {
    return false
  }
})()

const enabledCount = computed(() => sources.value.filter((source) => source.enabled !== false).length)
const repoConfig = computed(() => getSourceRepoConfig(settings.value))
const repoConfigured = computed(() => isSourceRepoConfigured(repoConfig.value))
const repoDesc = computed(() => {
  if (!repoConfigured.value) return '连接独立书源库，站点改版只需更新仓库'
  const state = repoState.value
  if (!state) return '已配置，尚未同步'
  return `${state.manifestName || '书源库'} · v${state.version || 1} · ${state.lastSyncAt ? '上次同步 ' + formatDate(state.lastSyncAt) : '尚未同步'}`
})
const repoLastSyncText = computed(() => {
  const state = repoState.value
  if (!state || !state.lastSyncAt) return '尚未同步'
  return `上次同步 ${formatDate(state.lastSyncAt)}`
})
const repoMeta = computed(() => {
  if (!repoConfigured.value) return '支持 GitHub / Gitee / 静态 index.json'
  const state = repoState.value
  const counts = state && state.report ? `新增 ${state.report.added || 0} · 更新 ${state.report.updated || 0}` : ''
  return [sourceRepoLabel(repoConfig.value), counts].filter(Boolean).join(' · ')
})

function load() {
  sources.value = ensureSources()
  settings.value = loadSettings()
  repoState.value = loadSourceRepoState()
  if (infoSource.value) {
    infoSource.value = sources.value.find((source) => source.id === infoSource.value.id) || null
    if (!infoSource.value) showSourceInfo.value = false
  }
}

function formatDate(value) {
  const date = new Date(Number(value) || value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function hostOf(url) {
  const match = String(url || '').match(/^[a-z]+:\/\/([^/?#]+)/i)
  return match ? match[1].replace(/^www\./, '') : String(url || '')
}

function openImport() {
  preview.value = []
  importError.value = ''
  showImport.value = true
}

function openMore() {
  uni.showActionSheet({
    itemList: ['智能识别网站', '导入书源', '同步书源仓库', '复制全部书源', '恢复内置书源', '清空搜索缓存'],
    success(res) {
      if (res.tapIndex === 0) goDetect()
      else if (res.tapIndex === 1) openImport()
      else if (res.tapIndex === 2) syncRepo()
      else if (res.tapIndex === 3) copyAllSources()
      else if (res.tapIndex === 4) restoreBuiltins()
      else if (res.tapIndex === 5) {
        clearHttpCache()
        clearBookCache()
        toastSuccess('搜索缓存已清除')
      }
    }
  })
}

function goDetect() {
  showImport.value = false
  uni.navigateTo({ url: '/pages/source-detect/source-detect' })
}

function goDirect() {
  uni.navigateTo({ url: '/pages/direct/direct' })
}

function sourceDescription(source) {
  if (!source) return ''
  if (source.retired) return '书源已下架，可删除或恢复内置源。'
  if (source.description) return source.description
  const fallback = {
    'builtin-85zw': '玄幻、都市等常见小说，目录与正文完整。',
    'builtin-quanben': '完本小说较多，使用 AMP 完整目录，适合作为备用源。',
    'builtin-biqvge99': '搜索速度较快，目录与正文完整。',
    'builtin-yoboi': '收录较多，首次搜索稍慢，适合备用。',
    'builtin-gutenberg': '公版经典与英文原著，单本全文阅读。'
  }
  return fallback[source.id] || (source.group ? source.group + '书源，点击查看详情' : '书源已就绪')
}

function sourceKindText(source) {
  if (source.searchMode === 'crawl-index') return '分类索引搜索'
  if (source.direct) return '仅链接解析'
  if (source.type === 'json') return '接口书源'
  return '网页书源'
}

function openSourceInfo(source) {
  infoSource.value = source
  showSourceInfo.value = true
}

function handleSourceLongPress(source) {
  if (showAdvanced.value) showSourceMenu(source)
  else openSourceInfo(source)
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
  if (showAdvanced.value) {
    toast('已显示高级工具，普通读者可以忽略')
  }
}

function editSource(source) {
  uni.navigateTo({ url: '/pages/source-edit/source-edit?id=' + encodeURIComponent(source.id) })
}

function onToggle(source, event) {
  const value = event.detail ? event.detail.value : event.target.value
  toggleSource(source.id, !!value)
  source.enabled = !!value
  sources.value = [...sources.value]
  if (infoSource.value && infoSource.value.id === source.id) infoSource.value = { ...infoSource.value, enabled: !!value }
  toast(value ? '已启用 ' + source.name : '已停用 ' + source.name)
}

async function copySource(source) {
  await copyText(exportSources([source]), '书源 JSON 已复制')
}

async function copyAllSources() {
  if (!sources.value.length) {
    toast('还没有书源')
    return
  }
  await copyText(exportSources(sources.value), '全部书源已复制')
}

async function restoreBuiltins() {
  const ok = await confirmDialog({
    title: '恢复内置书源',
    content: '会用最新规则覆盖内置书源，并保留它们的启用状态。自定义书源不受影响。',
    confirmText: '恢复'
  })
  if (!ok) return
  sources.value = restoreBuiltinSources()
  toastSuccess('内置书源已恢复')
}

async function showSourceMenu(source) {
  const index = await new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ['编辑书源', '体检', '复制 JSON', '删除书源'],
      success(res) { resolve(res.tapIndex) },
      fail() { resolve(-1) }
    })
  })
  if (index === 0) editSource(source)
  else if (index === 1) openTest(source)
  else if (index === 2) copySource(source)
  else if (index === 3) removeSource(source)
}

async function removeSource(source) {
  const ok = await confirmDialog({
    title: '删除书源',
    content: `确定删除「${source.name}」吗？${source.builtin ? '内置书源可以在菜单中恢复。' : ''}`,
    confirmText: '删除'
  })
  if (!ok) return
  deleteSource(source.id)
  load()
  toast('书源已删除')
}

async function pasteFromClipboard() {
  try {
    const res = await new Promise((resolve, reject) => {
      uni.getClipboardData({ success: resolve, fail: reject })
    })
    importText.value = res.data || ''
    importError.value = ''
    toast('已读取剪贴板')
  } catch (e) {
    toast('读取剪贴板失败')
  }
}

function loadExample() {
  importText.value = JSON.stringify(SOURCE_TEMPLATE, null, 2)
  importError.value = ''
}

function chooseFile() {
  // #ifdef H5
  uni.chooseFile({
    count: 1,
    extension: ['.json', '.txt'],
    success(res) {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      fetch(path)
        .then((response) => response.text())
        .then((text) => {
          importText.value = text
          importError.value = ''
        })
        .catch(() => toast('读取文件失败'))
    }
  })
  // #endif
}

function parseImport() {
  importError.value = ''
  const result = parseSourceImport(importText.value)
  if (result.errors.length && !result.sources.length) {
    importError.value = result.errors.join('\n')
    return
  }
  if (!result.sources.length) {
    importError.value = '没有解析到任何书源'
    return
  }
  const deduped = []
  const ids = new Set()
  for (const source of result.sources) {
    let id = source.id
    let suffix = 2
    while (ids.has(id)) {
      id = source.id + '-' + suffix
      suffix++
    }
    source.id = id
    ids.add(id)
    deduped.push(source)
  }
  preview.value = deduped
  if (result.errors.length) toast(result.errors[0])
}

function confirmImport() {
  if (!preview.value.length) return
  addSources(preview.value)
  const count = preview.value.length
  showImport.value = false
  preview.value = []
  importText.value = ''
  load()
  toastSuccess(`已导入 ${count} 个书源`)
}

function openTest(source) {
  testTarget.value = source
  testKeyword.value = '万相之王'
  testReport.value = null
  testProgressText.value = ''
  showTest.value = true
}

function stageText(stage, key, suffix) {
  if (!stage) return '未开始'
  if (!stage.ok) return '失败'
  return `${stage[key] || 0} ${suffix}`
}

async function runTest() {
  if (testing.value || !testTarget.value) return
  const keyword = String(testKeyword.value || '').trim()
  if (!keyword) {
    toast('请输入一本测试书')
    return
  }
  testing.value = true
  testReport.value = null
  testProgressText.value = '准备中…'
  try {
    const report = await testSource(testTarget.value, keyword, {
      onProgress(stage, message) {
        testProgressText.value = message
      }
    })
    testReport.value = report
    testProgressText.value = report.ok ? '体检完成' : '体检未通过'
  } catch (e) {
    testProgressText.value = e && e.message ? e.message : '体检失败'
  } finally {
    testing.value = false
  }
}

function openRepoConfig() {
  const config = repoConfig.value
  repoForm.value = {
    provider: config.manifestUrl ? 'manifest' : (config.provider || 'github'),
    repo: config.repo || '',
    branch: config.branch || 'main',
    manifestUrl: config.manifestUrl || '',
    autoSync: config.autoSync !== false
  }
  showRepoConfig.value = true
}

function onRepoAutoSyncChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  repoForm.value.autoSync = !!value
}

function saveRepoConfig() {
  const form = repoForm.value
  if (form.provider === 'manifest') {
    if (!/^https?:\/\//i.test(String(form.manifestUrl || '').trim())) {
      toast('请填写有效的 index.json 地址')
      return
    }
  } else if (!/^[\w.-]+\/[\w.-]+$/.test(String(form.repo || '').trim())) {
    toast('仓库格式应为 owner/repo')
    return
  }
  settings.value = saveSettings({
    ...settings.value,
    sourceRepoProvider: form.provider === 'manifest' ? (settings.value.sourceRepoProvider || 'github') : form.provider,
    sourceRepoRepo: form.provider === 'manifest' ? '' : String(form.repo || '').trim(),
    sourceRepoBranch: String(form.branch || 'main').trim() || 'main',
    sourceRepoManifestUrl: form.provider === 'manifest' ? String(form.manifestUrl || '').trim() : '',
    sourceRepoAutoSync: form.autoSync !== false
  })
  showRepoConfig.value = false
  toastSuccess('书源仓库已保存')
}

async function syncRepo() {
  if (repoSyncing.value) return
  if (!repoConfigured.value) {
    openRepoConfig()
    return
  }
  repoSyncing.value = true
  let progressText = '准备同步…'
  try {
    const report = await syncSourceRepo(settings.value, {
      onProgress(stage, message) {
        progressText = message
      }
    })
    repoState.value = loadSourceRepoState()
    load()
    const lines = [`新增 ${report.added} 个 · 更新 ${report.updated} 个 · 跳过 ${report.skipped || 0} 个 · 失败 ${report.failed} 个`]
    if (report.retired) lines.push(`下架 ${report.retired} 个书源`)
    if (report.warning) lines.push(report.warning)
    if (report.errors && report.errors.length) lines.push(report.errors.slice(0, 2).join('\n'))
    uni.showModal({
      title: report.ok ? '书源仓库同步完成' : '同步完成但有问题',
      content: lines.join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  } catch (e) {
    uni.showModal({
      title: '同步失败',
      content: (e && e.message ? e.message : '未知错误') + '\n\n' + progressText,
      showCancel: false,
      confirmText: '知道了'
    })
  } finally {
    repoSyncing.value = false
  }
}

onShow(load)
</script>

<style scoped>
.sources-page {
  padding-bottom: 50rpx;
}

.top-safe {
  height: var(--status-bar-height, 0px);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 28rpx 36rpx 0;
}

.header-copy {
  flex: 1;
  min-width: 0;
}

.header-kicker {
  font-size: 20rpx;
  letter-spacing: 4rpx;
  color: var(--gold);
}

.header-title {
  display: block;
  margin-top: 10rpx;
  font-size: 44rpx;
  line-height: 1.3;
  letter-spacing: 2rpx;
  color: var(--ink);
  font-weight: 600;
}

.header-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--muted);
  max-width: 520rpx;
}

.header-actions {
  display: flex;
  flex-shrink: 0;
  margin-left: 16rpx;
}

.round-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 252, 245, 0.72);
  border: 1rpx solid rgba(37, 42, 36, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(47, 42, 30, 0.06);
  margin-left: 12rpx;
}

.plus {
  font-size: 40rpx;
  color: var(--ink-soft);
  line-height: 1;
  margin-top: -4rpx;
}

.more-dots {
  display: flex;
}

.more-dot {
  width: 7rpx;
  height: 7rpx;
  border-radius: 50%;
  background: var(--ink-soft);
  margin: 0 3rpx;
}

.stats-card {
  margin: 34rpx 36rpx 0;
  padding: 28rpx 10rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(320rpx 200rpx at 100% 0%, rgba(176, 138, 82, 0.12), transparent 70%),
    rgba(255, 252, 245, 0.66);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 12rpx 30rpx rgba(45, 40, 28, 0.05);
  display: flex;
  align-items: center;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 46rpx;
  line-height: 1.1;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.stat-label {
  margin-top: 8rpx;
  font-size: 21rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}

.stat-divider {
  width: 1rpx;
  height: 46rpx;
  background: var(--line);
}

.quick-actions {
  padding: 24rpx 36rpx 0;
}

.quick-action {
  display: flex;
  align-items: center;
  padding: 26rpx 26rpx;
  border-radius: 24rpx;
  background: rgba(255, 252, 245, 0.55);
  border: 1rpx solid rgba(255, 255, 255, 0.55);
  margin-bottom: 16rpx;
}

.quick-action.primary {
  background:
    radial-gradient(300rpx 180rpx at 100% 0%, rgba(201, 164, 106, 0.18), transparent 70%),
    linear-gradient(135deg, #2b5146, #1d3a32);
  border-color: transparent;
  box-shadow: 0 16rpx 36rpx rgba(28, 54, 46, 0.2);
}

.quick-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background: var(--jade-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.primary .quick-icon {
  background: rgba(244, 237, 221, 0.12);
}

.spark {
  position: relative;
}

.spark-line {
  position: absolute;
  background: #e6d0a3;
  border-radius: 4rpx;
}

.spark-line.s1 {
  width: 4rpx;
  height: 34rpx;
  left: 34rpx;
  top: 19rpx;
}

.spark-line.s2 {
  width: 34rpx;
  height: 4rpx;
  left: 19rpx;
  top: 34rpx;
}

.spark-dot {
  position: absolute;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #e6d0a3;
  left: 31rpx;
  top: 31rpx;
}

.import {
  background: rgba(176, 138, 82, 0.1);
}

.import-arrow {
  font-size: 34rpx;
  color: var(--gold);
  line-height: 1;
}

.quick-copy {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
  display: flex;
  flex-direction: column;
}

.quick-title {
  font-size: 28rpx;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.primary .quick-title {
  color: #f5eddc;
}

.quick-desc {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.primary .quick-desc {
  color: rgba(245, 237, 220, 0.56);
}

.quick-arrow {
  font-size: 28rpx;
  color: var(--muted);
}

.primary .quick-arrow {
  color: #d9bd88;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 36rpx 18rpx;
}

.list-hint {
  font-size: 20rpx;
  color: var(--muted);
}

.source-list {
  padding: 0 36rpx;
}

.source-card {
  padding: 26rpx 26rpx 0;
  margin-bottom: 20rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.68);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.04);
  overflow: hidden;
}

.source-card.off {
  opacity: 0.68;
}

.source-top {
  display: flex;
  align-items: flex-start;
}

.source-mark {
  width: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  background: linear-gradient(145deg, #e7ded0, #d9cdb9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5b5548;
  font-size: 34rpx;
  position: relative;
  flex-shrink: 0;
}

.source-mark.builtin {
  background: linear-gradient(145deg, #2f5d50, #24483e);
  color: #f0e7d3;
}

.builtin-seal {
  position: absolute;
  right: -10rpx;
  top: -10rpx;
  height: 26rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: var(--gold);
  color: #fff8ea;
  font-size: 15rpx;
  display: flex;
  align-items: center;
}

.source-main {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.source-title-row {
  display: flex;
  align-items: center;
}

.source-name {
  font-size: 29rpx;
  color: var(--ink);
  font-weight: 500;
  max-width: 320rpx;
}

.source-group {
  margin-left: 12rpx;
  font-size: 18rpx;
  color: var(--jade);
  background: var(--jade-soft);
  border-radius: 999rpx;
  padding: 2rpx 10rpx;
  flex-shrink: 0;
}

.source-host {
  display: block;
  margin-top: 4rpx;
  max-width: 420rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.source-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 10rpx;
}

.source-meta-chip {
  font-size: 17rpx;
  color: var(--muted);
  background: rgba(37, 42, 36, 0.05);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
  margin: 0 8rpx 4rpx 0;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.source-meta-warning {
  font-size: 17rpx;
  color: var(--accent);
  margin-bottom: 4rpx;
}

.source-switch {
  margin-left: 10rpx;
  padding-top: 2rpx;
  flex-shrink: 0;
}

.source-bottom {
  margin-top: 20rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.source-actions {
  display: flex;
}

.source-action {
  font-size: 22rpx;
  color: var(--jade);
  padding: 8rpx 22rpx 8rpx 0;
}

.source-state {
  font-size: 20rpx;
  color: var(--muted);
}

.footer-note {
  margin: 36rpx 36rpx 0;
  padding: 26rpx;
  border-radius: 22rpx;
  background: rgba(255, 252, 245, 0.42);
  border: 1rpx dashed rgba(37, 42, 36, 0.14);
}

.footer-title {
  display: block;
  font-size: 21rpx;
  letter-spacing: 3rpx;
  color: var(--muted);
  margin-bottom: 8rpx;
}

.footer-text {
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--muted);
}

.bottom-space {
  height: 30rpx;
}

.import-mode-tabs {
  display: flex;
  margin-bottom: 16rpx;
  border-bottom: 1rpx solid var(--line);
}

.import-mode {
  padding: 12rpx 0;
  margin-right: 34rpx;
  font-size: 24rpx;
  color: var(--muted);
  position: relative;
}

.import-mode.active {
  color: var(--ink);
}

.import-mode.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1rpx;
  height: 3rpx;
  background: var(--jade);
  border-radius: 3rpx;
}

.import-textarea {
  width: 100%;
  height: 360rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--ink);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.import-error {
  margin-top: 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: rgba(168, 73, 58, 0.08);
  color: var(--accent);
  font-size: 21rpx;
  line-height: 1.5;
}

.import-tools {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.import-tool {
  height: 60rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  font-size: 21rpx;
  color: var(--ink-soft);
  margin: 0 12rpx 12rpx 0;
  background: rgba(255, 255, 255, 0.4);
}

.sheet-primary {
  margin-top: 20rpx;
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

.import-tip {
  display: block;
  margin-top: 16rpx;
  font-size: 19rpx;
  line-height: 1.7;
  color: var(--muted);
}

.preview-summary {
  display: flex;
  align-items: baseline;
  padding: 10rpx 0 18rpx;
}

.preview-count {
  font-size: 44rpx;
  color: var(--ink);
}

.preview-label {
  margin-left: 10rpx;
  font-size: 22rpx;
  color: var(--muted);
}

.preview-list {
  max-height: 46vh;
}

.preview-item {
  display: flex;
  align-items: flex-start;
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.preview-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.preview-name {
  font-size: 26rpx;
  color: var(--ink);
}

.preview-url {
  margin-top: 3rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.preview-warnings,
.preview-errors {
  margin-top: 6rpx;
  display: flex;
  flex-direction: column;
}

.preview-warning {
  font-size: 18rpx;
  color: #8a6b3c;
  line-height: 1.5;
}

.preview-errors {
  font-size: 18rpx;
  color: var(--accent);
  line-height: 1.5;
}

.preview-state {
  font-size: 19rpx;
  color: #5c8a6f;
  margin-left: 16rpx;
  flex-shrink: 0;
  padding-top: 4rpx;
}

.preview-state.invalid {
  color: var(--accent);
}

.preview-actions {
  display: flex;
  margin-top: 24rpx;
}

.preview-btn {
  flex: 1;
  height: 82rpx;
  font-size: 26rpx;
}

.preview-btn + .preview-btn {
  margin-left: 16rpx;
}

.test-intro {
  font-size: 23rpx;
  line-height: 1.7;
  color: var(--muted);
  padding-bottom: 18rpx;
}

.test-input-row {
  display: flex;
  align-items: center;
}

.test-input {
  flex: 1;
  height: 80rpx;
  padding: 0 22rpx;
  border-radius: 18rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 25rpx;
  color: var(--ink);
}

.test-start {
  height: 80rpx;
  padding: 0 30rpx;
  margin-left: 12rpx;
  border-radius: 18rpx;
  background: var(--jade);
  color: #f8f3e7;
  display: flex;
  align-items: center;
  font-size: 25rpx;
}

.test-start.disabled {
  opacity: 0.55;
}

.test-report {
  margin-top: 24rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background: rgba(37, 42, 36, 0.03);
}

.test-progress-text {
  font-size: 22rpx;
  color: var(--muted);
  margin-bottom: 14rpx;
}

.test-stages {
  display: flex;
  flex-direction: column;
}

.test-stage {
  display: flex;
  align-items: center;
  height: 54rpx;
}

.stage-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--muted);
  margin-right: 12rpx;
}

.stage-dot.ok { background: #5c8a6f; }
.stage-dot.fail { background: var(--accent); }

.stage-name {
  width: 90rpx;
  font-size: 22rpx;
  color: var(--ink-soft);
}

.stage-value {
  font-size: 21rpx;
  color: var(--muted);
}

.test-preview {
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  background: rgba(255, 252, 245, 0.7);
  border: 1rpx solid var(--line);
}

.test-preview-title {
  display: block;
  font-size: 23rpx;
  color: var(--ink);
  margin-bottom: 6rpx;
}

.test-preview-text {
  font-size: 21rpx;
  line-height: 1.6;
  color: var(--muted);
}

.test-error {
  margin-top: 14rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: var(--accent);
}

.test-success {
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #4c7a60;
}

.repo-card {
  margin: 20rpx 36rpx 0;
  padding: 24rpx;
  border-radius: 26rpx;
  background: rgba(255, 252, 245, 0.55);
  border: 1rpx solid rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
}

.repo-card.configured {
  background:
    radial-gradient(260rpx 180rpx at 100% 0%, rgba(47, 93, 80, 0.1), transparent 70%),
    rgba(255, 252, 245, 0.68);
}

.repo-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background: var(--jade-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.cloud-shape {
  width: 34rpx;
  height: 20rpx;
  border-radius: 999rpx;
  background: var(--jade);
  opacity: 0.75;
  position: relative;
  top: 4rpx;
}

.cloud-shape::before,
.cloud-shape::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: var(--jade);
  opacity: 0.75;
}

.cloud-shape::before {
  width: 22rpx;
  height: 22rpx;
  left: 4rpx;
  top: -10rpx;
}

.cloud-shape::after {
  width: 16rpx;
  height: 16rpx;
  right: 3rpx;
  top: -7rpx;
}

.cloud-arrow {
  position: absolute;
  bottom: 10rpx;
  font-size: 20rpx;
  color: var(--jade);
  line-height: 1;
}

.repo-info {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.repo-title-row {
  display: flex;
  align-items: center;
}

.repo-title {
  font-size: 26rpx;
  color: var(--ink);
}

.repo-badge {
  margin-left: 10rpx;
  font-size: 17rpx;
  color: var(--muted);
  background: rgba(37, 42, 36, 0.05);
  border-radius: 999rpx;
  padding: 2rpx 10rpx;
}

.repo-badge.on {
  color: var(--jade);
  background: var(--jade-soft);
}

.repo-desc {
  margin-top: 3rpx;
  font-size: 19rpx;
  line-height: 1.45;
  color: var(--muted);
}

.repo-meta-line {
  margin-top: 4rpx;
  font-size: 17rpx;
  color: var(--muted);
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.repo-actions {
  display: flex;
  flex-direction: column;
  margin-left: 12rpx;
  flex-shrink: 0;
}

.repo-btn {
  min-width: 96rpx;
  height: 48rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19rpx;
  color: var(--ink-soft);
  margin: 3rpx 0;
}

.repo-btn.primary {
  background: var(--jade);
  border-color: var(--jade);
  color: #f8f3e7;
}

.repo-btn.disabled {
  opacity: 0.55;
}

.config-tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--muted);
  margin-bottom: 18rpx;
}

.config-segment {
  display: flex;
  padding: 5rpx;
  border-radius: 14rpx;
  background: rgba(37, 42, 36, 0.05);
  margin-bottom: 20rpx;
}

.config-segment-item {
  flex: 1;
  height: 62rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--muted);
}

.config-segment-item.active {
  background: rgba(255, 252, 245, 0.9);
  color: var(--ink);
  box-shadow: 0 3rpx 8rpx rgba(45, 40, 28, 0.08);
}

.config-field {
  display: flex;
  flex-direction: column;
  margin-bottom: 8rpx;
}

.config-label {
  font-size: 22rpx;
  color: var(--ink-soft);
  margin-bottom: 8rpx;
}

.branch-label {
  margin-top: 12rpx;
}

.config-input {
  height: 78rpx;
  padding: 0 20rpx;
  border-radius: 14rpx;
  background: rgba(37, 42, 36, 0.04);
  border: 1rpx solid var(--line);
  font-size: 22rpx;
  color: var(--ink);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.config-help {
  margin-top: 8rpx;
  font-size: 19rpx;
  line-height: 1.6;
  color: var(--muted);
}

.config-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid var(--line);
}

.config-switch-copy {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
  display: flex;
  flex-direction: column;
}

.config-switch-title {
  font-size: 23rpx;
  color: var(--ink-soft);
}

.config-switch-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.config-actions {
  display: flex;
  margin-top: 24rpx;
}

.config-btn {
  flex: 1;
  height: 80rpx;
  font-size: 25rpx;
}

.config-btn + .config-btn {
  margin-left: 14rpx;
}

.quick-icon.link {
  background: rgba(168, 73, 58, 0.08);
}

.link-glyph {
  font-size: 32rpx;
  color: var(--accent);
  line-height: 1;
}

.source-desc {
  display: block;
  margin-top: 5rpx;
  max-width: 430rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.source-reader-state {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12rpx 0 18rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.state-dot {
  width: 9rpx;
  height: 9rpx;
  border-radius: 50%;
  background: var(--muted);
  margin-right: 8rpx;
}

.state-dot.on {
  background: #5c8a6f;
  box-shadow: 0 0 0 4rpx rgba(92, 138, 111, 0.12);
}

.advanced-link {
  color: var(--muted);
  padding: 8rpx 0 8rpx 16rpx;
}

.info-source-head {
  display: flex;
  align-items: center;
  padding-bottom: 22rpx;
  border-bottom: 1rpx solid var(--line);
}

.info-source-copy {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.info-source-name {
  font-size: 28rpx;
  color: var(--ink);
}

.info-source-desc {
  margin-top: 4rpx;
  font-size: 20rpx;
  line-height: 1.55;
  color: var(--muted);
}

.info-source-badge {
  font-size: 18rpx;
  color: #4c7a60;
  background: rgba(92, 138, 111, 0.1);
  border-radius: 999rpx;
  padding: 4rpx 12rpx;
  flex-shrink: 0;
}

.info-source-badge.off {
  color: var(--muted);
  background: rgba(37, 42, 36, 0.05);
}

.info-rows {
  padding: 10rpx 0;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
}

.info-key {
  width: 150rpx;
  font-size: 21rpx;
  color: var(--muted);
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  font-size: 22rpx;
  color: var(--ink-soft);
}

.info-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--line);
}

.info-switch-copy {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
  display: flex;
  flex-direction: column;
}

.info-switch-title {
  font-size: 23rpx;
  color: var(--ink-soft);
}

.info-switch-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.info-advanced {
  margin-top: 8rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed var(--line);
}

.info-advanced-label {
  font-size: 19rpx;
  letter-spacing: 2rpx;
  color: var(--muted);
}

.info-advanced-actions {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.info-advanced-btn {
  height: 58rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  font-size: 21rpx;
  color: var(--ink-soft);
  margin: 0 10rpx 10rpx 0;
}

.info-advanced-btn.danger {
  color: var(--accent);
  border-color: rgba(168, 73, 58, 0.2);
}
</style>
