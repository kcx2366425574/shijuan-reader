<template>
  <view class="page mine-page">
    <view class="top-safe" />
    <view class="header">
      <text class="header-kicker">MY · 我的</text>
      <text class="header-title serif">拾卷 · 我的书房</text>
    </view>

    <view class="profile-card">
      <image class="profile-logo" src="/static/logo.png" mode="aspectFill" />
      <view class="profile-info">
        <view class="profile-name-row">
          <text class="profile-name serif">拾卷</text>
          <text class="profile-version">v{{ versionName }}</text>
        </view>
        <text class="profile-slogan">{{ slogan }}</text>
      </view>
      <view class="profile-seal serif">卷</view>
      <view class="profile-stats">
        <view class="profile-stat">
          <text class="profile-stat-value">{{ shelfCount }}</text>
          <text class="profile-stat-label">在架</text>
        </view>
        <view class="profile-stat-divider" />
        <view class="profile-stat">
          <text class="profile-stat-value">{{ enabledSources }}</text>
          <text class="profile-stat-label">书源</text>
        </view>
        <view class="profile-stat-divider" />
        <view class="profile-stat">
          <text class="profile-stat-value">{{ themes.length }}</text>
          <text class="profile-stat-label">主题</text>
        </view>
      </view>
    </view>

    <view class="card-section">
      <view class="card-head">
        <view>
          <text class="card-title serif">阅读偏好</text>
          <text class="card-sub">在阅读器内也可以随时调整</text>
        </view>
        <view class="card-action" @tap="openReadingSheet" hover-class="press">更多 ›</view>
      </view>

      <view class="preview-panel" :style="previewStyle">
        <text class="preview-text">寒夜读书忘却眠，锦衾香尽炉无烟。</text>
        <text class="preview-meta">{{ currentTheme.name }} · {{ settings.fontSize }}px · 行距 {{ settings.lineHeight.toFixed(1) }}</text>
      </view>

      <view class="quick-settings">
        <view class="theme-quick-row">
          <view
            v-for="item in themes"
            :key="item.key"
            class="theme-quick"
            :class="{ active: settings.theme === item.key }"
            @tap="setTheme(item.key)"
          >
            <view class="theme-quick-swatch" :style="{ background: item.background, borderColor: item.line }">
              <text class="serif" :style="{ color: item.text }">文</text>
            </view>
            <text class="theme-quick-name">{{ item.name }}</text>
          </view>
        </view>
        <view class="font-quick-row">
          <text class="font-label">字号</text>
          <view class="stepper">
            <view class="stepper-btn" @tap="changeFont(-1)">−</view>
            <text class="stepper-value">{{ settings.fontSize }}</text>
            <view class="stepper-btn" @tap="changeFont(1)">+</view>
          </view>
          <view class="font-spacer" />
          <text class="font-label">字体</text>
          <view class="mini-segment">
            <view class="mini-segment-item" :class="{ active: settings.fontFamily === 'serif' }" @tap="setFontFamily('serif')">宋</view>
            <view class="mini-segment-item" :class="{ active: settings.fontFamily === 'sans' }" @tap="setFontFamily('sans')">黑</view>
          </view>
        </view>
      </view>
    </view>

    <view class="card-section update-section">
      <view class="card-head">
        <view>
          <text class="card-title serif">在线升级</text>
          <text class="card-sub">{{ updateSubtitle }}</text>
        </view>
        <view class="version-pill">v{{ versionName }} ({{ versionCode }})</view>
      </view>

      <view class="update-body">
        <view class="update-status">
          <view class="update-dot" :class="{ available: updateInfo && updateInfo.hasUpdate }" />
          <view class="update-copy">
            <text class="update-status-title">{{ updateStatusTitle }}</text>
            <text class="update-status-desc">{{ updateStatusDesc }}</text>
          </view>
        </view>
        <view class="update-actions">
          <view class="update-btn primary" :class="{ disabled: checking }" @tap="handleCheckUpdate">
            {{ checking ? '检查中…' : '检查更新' }}
          </view>
          <view class="update-btn" @tap="openUpdateConfig">更新源</view>
        </view>
        <view class="update-switch-row">
          <view class="update-switch-copy">
            <text class="update-switch-title">启动时静默检查</text>
            <text class="update-switch-desc">有新版本时在“我的”标签显示红点提示</text>
          </view>
          <switch :checked="settings.autoCheckUpdate !== false" color="#2f5d50" @change="onAutoCheckChange" />
        </view>
      </view>
    </view>

    <view class="card-section">
      <view class="card-head">
        <view>
          <text class="card-title serif">书源与数据</text>
          <text class="card-sub">本地优先，书籍与进度只保存在这台设备</text>
        </view>
      </view>
      <view class="menu-list">
        <view class="menu-item" @tap="goSources" hover-class="press">
          <view class="menu-icon source-menu-icon"><view class="source-menu-dot" /></view>
          <view class="menu-copy">
            <text class="menu-title">书源管理</text>
            <text class="menu-desc">{{ sources.length }} 个书源 · {{ enabledSources }} 个启用</text>
          </view>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="clearSearchCache" hover-class="press">
          <view class="menu-icon cache-menu-icon"><view class="cache-line" /><view class="cache-line short" /></view>
          <view class="menu-copy">
            <text class="menu-title">清除搜索缓存</text>
            <text class="menu-desc">释放页面与目录缓存，不影响书架</text>
          </view>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="clearReadings" hover-class="press">
          <view class="menu-icon clear-menu-icon"><view class="clear-line" /><view class="clear-line" /></view>
          <view class="menu-copy">
            <text class="menu-title">清空书架与阅读记录</text>
            <text class="menu-desc">移除全部藏书和进度，不可恢复</text>
          </view>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="restoreSources" hover-class="press">
          <view class="menu-icon restore-menu-icon"><view class="restore-ring" /></view>
          <view class="menu-copy">
            <text class="menu-title">恢复内置书源</text>
            <text class="menu-desc">用最新规则覆盖内置源，保留启用状态</text>
          </view>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="about-card">
      <view class="about-head">
        <image class="about-logo" src="/static/logo.png" mode="aspectFill" />
        <view class="about-title-wrap">
          <text class="about-title serif">拾卷</text>
          <text class="about-en">SHIJUAN READER</text>
        </view>
        <text class="about-version">v{{ versionName }}</text>
      </view>
      <text class="about-text">{{ disclaimer }}</text>
      <view class="about-meta">
        <text>uni-app · Vue 3</text>
        <text>·</text>
        <text>本地书源解析</text>
        <text>·</text>
        <text>无账号 · 无上传</text>
      </view>
    </view>

    <view class="mine-footer">
      <view class="footer-line" />
      <text class="serif">书卷多情似故人</text>
      <view class="footer-line" />
    </view>

    <BottomSheet v-model:show="showReadingSheet" title="阅读偏好">
      <view class="sheet-preview" :style="previewStyle">
        <text>山色空蒙雨亦奇</text>
      </view>
      <view class="setting-block">
        <text class="setting-label">主题</text>
        <view class="sheet-theme-row">
          <view
            v-for="item in themes"
            :key="item.key"
            class="sheet-theme"
            :class="{ active: settings.theme === item.key }"
            @tap="setTheme(item.key)"
          >
            <view class="sheet-theme-swatch" :style="{ background: item.background, borderColor: item.line }">
              <text class="serif" :style="{ color: item.text }">字</text>
            </view>
            <text class="sheet-theme-name">{{ item.name }}</text>
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
      </view>
      <view class="setting-block">
        <view class="setting-row">
          <text class="setting-label">行距</text>
          <text class="setting-value">{{ settings.lineHeight.toFixed(1) }}</text>
        </view>
        <slider
          :value="settings.lineHeight"
          :min="1.4"
          :max="2.6"
          :step="0.1"
          active-color="#8a6b45"
          background-color="rgba(37,42,36,0.14)"
          block-size="18"
          @change="onLineHeightChange"
        />
      </view>
      <view class="setting-block">
        <text class="setting-label">字体</text>
        <view class="sheet-segment">
          <view class="sheet-segment-item" :class="{ active: settings.fontFamily === 'serif' }" @tap="setFontFamily('serif')">
            <text class="serif">宋体 · 书卷</text>
          </view>
          <view class="sheet-segment-item" :class="{ active: settings.fontFamily === 'sans' }" @tap="setFontFamily('sans')">
            <text>黑体 · 清朗</text>
          </view>
        </view>
      </view>
      <view class="setting-block switch-block">
        <view class="switch-row">
          <view class="switch-copy">
            <text class="setting-label">读完自动下一章</text>
            <text class="switch-desc">在阅读器滚动到章节底部时自动续读</text>
          </view>
          <switch :checked="settings.autoNext === true" color="#2f5d50" @change="onAutoNextChange" />
        </view>
        <view class="switch-row">
          <view class="switch-copy">
            <text class="setting-label">保持屏幕常亮</text>
            <text class="switch-desc">只在阅读页面生效</text>
          </view>
          <switch :checked="settings.keepScreenOn !== false" color="#2f5d50" @change="onKeepScreenOnChange" />
        </view>
      </view>
    </BottomSheet>

    <BottomSheet v-model:show="showUpdateConfig" title="配置更新源">
      <text class="config-tip">推荐在代码仓库发布 Release，并把 APK 作为附件上传。也可以填写仓库中的静态 update.json 地址（例如 jsDelivr），避免 GitHub API 限流。</text>
      <view class="config-segment">
        <view class="config-segment-item" :class="{ active: updateForm.provider === 'github' }" @tap="updateForm.provider = 'github'">GitHub</view>
        <view class="config-segment-item" :class="{ active: updateForm.provider === 'gitee' }" @tap="updateForm.provider = 'gitee'">Gitee</view>
        <view class="config-segment-item" :class="{ active: updateForm.provider === 'manifest' }" @tap="updateForm.provider = 'manifest'">静态清单</view>
      </view>
      <view v-if="updateForm.provider !== 'manifest'" class="config-field">
        <text class="config-label">仓库</text>
        <input v-model="updateForm.repo" class="config-input" placeholder="owner/repo，例如 yourname/shijuan-reader" placeholder-class="placeholder" />
        <text class="config-help">应用会读取该仓库 Latest Release，自动选择 .apk 或 .wgt 附件。</text>
      </view>
      <view v-else class="config-field">
        <text class="config-label">update.json 地址</text>
        <input v-model="updateForm.manifestUrl" class="config-input" placeholder="https://cdn.jsdelivr.net/gh/owner/repo@main/update.json" placeholder-class="placeholder" />
        <text class="config-help">静态清单字段：versionName、versionCode、apkUrl、wgtUrl、notes、force、pageUrl。</text>
      </view>
      <view class="config-actions">
        <view class="ghost-btn config-btn" @tap="showUpdateConfig = false">取消</view>
        <view class="primary-btn config-btn" @tap="saveUpdateConfig">保存</view>
      </view>
    </BottomSheet>

    <BottomSheet v-model:show="showUpdateSheet" :title="updateInfo && updateInfo.hasUpdate ? '发现新版本' : '版本信息'">
      <view v-if="updateInfo" class="update-sheet-body">
        <view class="update-version-row">
          <text class="update-version serif">v{{ updateInfo.latest.versionName }}</text>
          <text class="update-current">当前 v{{ updateInfo.current.versionName }}</text>
          <text v-if="updateInfo.latest.force" class="force-tag">强制更新</text>
        </view>
        <view class="update-meta-row">
          <text v-if="updateInfo.latest.publishedAt">{{ formatDate(updateInfo.latest.publishedAt) }}</text>
          <text v-if="updateInfo.latest.size">{{ formatSize(updateInfo.latest.size) }}</text>
          <text>{{ updateInfo.source === 'manifest' ? '静态清单' : updateInfo.source }}</text>
        </view>
        <scroll-view scroll-y class="update-notes-scroll">
          <text class="update-notes">{{ updateInfo.latest.notes || '这个版本没有附带更新说明。' }}</text>
        </scroll-view>
        <view v-if="downloading" class="download-progress">
          <view class="download-track"><view class="download-fill" :style="{ width: downloadProgress + '%' }" /></view>
          <text class="download-text">正在下载 {{ downloadProgress }}%</text>
        </view>
        <view class="update-sheet-actions">
          <view v-if="updateInfo.latest.pageUrl" class="ghost-btn update-sheet-btn" @tap="openReleasePage(updateInfo.latest.pageUrl)">发布页</view>
          <view
            v-if="updateInfo.hasUpdate && (updateInfo.latest.apkUrl || updateInfo.latest.wgtUrl || updateInfo.latest.pageUrl)"
            class="primary-btn update-sheet-btn"
            :class="{ disabled: downloading }"
            @tap="startDownload"
          >{{ downloading ? '下载中…' : '下载并安装' }}</view>
          <view v-else-if="!updateInfo.hasUpdate" class="primary-btn update-sheet-btn" @tap="showUpdateSheet = false">已是最新版</view>
          <view v-else class="primary-btn update-sheet-btn" @tap="openUpdateConfig">去配置更新源</view>
        </view>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BottomSheet from '../../components/BottomSheet.vue'
import {
  loadShelf,
  ensureSources,
  loadSettings,
  saveSettings,
  clearReadingData,
  restoreBuiltinSources
} from '../../core/store.js'
import {
  THEME_LIST,
  getTheme
} from '../../core/theme.js'
import { clearHttpCache } from '../../core/service.js'
import { clearBookCache } from '../../core/book-cache.js'
import { APP_META } from '../../config.js'
import {
  checkUpdate,
  getAppVersion,
  loadUpdateInfo,
  clearUpdateBadge,
  downloadAndInstall,
  openReleasePage,
  getUpdateConfig
} from '../../core/update.js'
import { clamp, confirmDialog, toast, toastSuccess } from '../../utils/format.js'

const themes = THEME_LIST
const settings = ref(loadSettings())
const versionName = ref(APP_META.versionName)
const versionCode = ref(APP_META.versionCode)
const shelfCount = ref(0)
const sources = ref([])
const showReadingSheet = ref(false)
const showUpdateConfig = ref(false)
const showUpdateSheet = ref(false)
const checking = ref(false)
const downloading = ref(false)
const downloadProgress = ref(0)
const updateInfo = ref(null)
const updateForm = ref({
  provider: 'github',
  repo: '',
  manifestUrl: ''
})

const enabledSources = computed(() => sources.value.filter((source) => source.enabled !== false).length)
const currentTheme = computed(() => getTheme(settings.value.theme))
const slogan = APP_META.slogan
const disclaimer = APP_META.disclaimer

const previewStyle = computed(() => ({
  background: currentTheme.value.background,
  color: currentTheme.value.text,
  fontFamily: settings.value.fontFamily === 'serif'
    ? "'Songti SC','STSong','Noto Serif CJK SC',serif"
    : "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"
}))

const updateSubtitle = computed(() => {
  if (checking.value) return '正在连接代码仓库…'
  if (updateInfo.value && updateInfo.value.hasUpdate) return `发现 v${updateInfo.value.latest.versionName}`
  return '结合代码仓库 Release 检查新版本'
})

const updateStatusTitle = computed(() => {
  if (updateInfo.value && updateInfo.value.hasUpdate) return `发现新版本 v${updateInfo.value.latest.versionName}`
  if (updateInfo.value) return '当前已是最新版本'
  return '尚未检查更新'
})

const updateStatusDesc = computed(() => {
  const config = getUpdateConfig(settings.value)
  if (!config.manifestUrl && !config.repo) return '请先设置 GitHub/Gitee 仓库或静态清单地址'
  if (updateInfo.value && updateInfo.value.hasUpdate) {
    return updateInfo.value.latest.notes
      ? updateInfo.value.latest.notes.split('\n')[0].slice(0, 60)
      : '有新版本可以安装'
  }
  return updateInfo.value ? `上次检查：${formatDate(updateInfo.value.checkedAt)}` : '从仓库 Latest Release 获取版本信息'
})

function formatDate(value) {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatSize(size) {
  const bytes = Number(size) || 0
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}

function load() {
  settings.value = loadSettings()
  shelfCount.value = loadShelf().length
  sources.value = ensureSources()
  updateInfo.value = loadUpdateInfo()
  updateForm.value = {
    provider: settings.value.updateProvider || getUpdateConfig(settings.value).provider || 'github',
    repo: settings.value.updateRepo || getUpdateConfig(settings.value).repo || '',
    manifestUrl: settings.value.updateManifestUrl || getUpdateConfig(settings.value).manifestUrl || ''
  }
  getAppVersion().then((version) => {
    versionName.value = version.versionName || APP_META.versionName
    versionCode.value = version.versionCode || APP_META.versionCode
  })
  clearUpdateBadge()
}

function persist(patch) {
  settings.value = saveSettings({ ...settings.value, ...patch })
}

function setTheme(key) {
  persist({ theme: key })
}

function changeFont(delta) {
  persist({ fontSize: clamp(settings.value.fontSize + delta, 14, 32) })
}

function onLineHeightChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persist({ lineHeight: clamp(Number(value) || 1.9, 1.4, 2.6) })
}

function setFontFamily(value) {
  persist({ fontFamily: value })
}

function onAutoNextChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persist({ autoNext: !!value })
}

function onKeepScreenOnChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persist({ keepScreenOn: !!value })
}

function openReadingSheet() {
  showReadingSheet.value = true
}

function goSources() {
  uni.switchTab({ url: '/pages/sources/sources' })
}

async function clearSearchCache() {
  clearHttpCache()
  clearBookCache()
  toastSuccess('缓存已清除')
}

async function clearReadings() {
  const ok = await confirmDialog({
    title: '清空书架',
    content: '将移除书架里的全部书籍与阅读进度，此操作不可恢复。书源不会被删除。',
    confirmText: '清空'
  })
  if (!ok) return
  clearReadingData()
  clearBookCache()
  shelfCount.value = 0
  toastSuccess('书架已清空')
}

async function restoreSources() {
  const ok = await confirmDialog({
    title: '恢复内置书源',
    content: '会用最新规则覆盖内置书源，并保留启用状态。自定义书源不受影响。',
    confirmText: '恢复'
  })
  if (!ok) return
  sources.value = restoreBuiltinSources()
  toastSuccess('内置书源已恢复')
}

function onAutoCheckChange(event) {
  const value = event.detail ? event.detail.value : event.target.value
  persist({ autoCheckUpdate: !!value })
}

function openUpdateConfig() {
  updateForm.value = {
    provider: settings.value.updateProvider || getUpdateConfig(settings.value).provider || 'github',
    repo: settings.value.updateRepo || getUpdateConfig(settings.value).repo || '',
    manifestUrl: settings.value.updateManifestUrl || getUpdateConfig(settings.value).manifestUrl || ''
  }
  showUpdateConfig.value = true
}

function saveUpdateConfig() {
  const form = updateForm.value
  if (form.provider !== 'manifest') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(String(form.repo || '').trim())) {
      toast('仓库格式应为 owner/repo')
      return
    }
  } else if (!/^https?:\/\//i.test(String(form.manifestUrl || '').trim())) {
    toast('请填写有效的 update.json 地址')
    return
  }
  persist({
    updateProvider: form.provider === 'manifest' ? (settings.value.updateProvider || 'github') : form.provider,
    updateRepo: form.provider === 'manifest' ? '' : String(form.repo || '').trim(),
    updateManifestUrl: form.provider === 'manifest' ? String(form.manifestUrl || '').trim() : ''
  })
  showUpdateConfig.value = false
  updateInfo.value = null
  toastSuccess('更新源已保存')
}

async function handleCheckUpdate() {
  if (checking.value) return
  const config = getUpdateConfig(settings.value)
  if (!config.manifestUrl && !config.repo) {
    openUpdateConfig()
    return
  }
  checking.value = true
  try {
    const info = await checkUpdate(settings.value)
    updateInfo.value = info
    clearUpdateBadge()
    if (info.hasUpdate) {
      showUpdateSheet.value = true
    } else {
      toastSuccess('已经是最新版本')
    }
  } catch (e) {
    if (e && e.code === 'NO_CONFIG') {
      openUpdateConfig()
    } else {
      uni.showModal({
        title: '检查更新失败',
        content: e && e.message ? e.message : '请稍后再试',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  } finally {
    checking.value = false
  }
}

async function startDownload() {
  if (downloading.value || !updateInfo.value) return
  if (!updateInfo.value.latest.apkUrl && !updateInfo.value.latest.wgtUrl && updateInfo.value.latest.pageUrl) {
    openReleasePage(updateInfo.value.latest.pageUrl)
    return
  }
  downloading.value = true
  downloadProgress.value = 0
  try {
    const result = await downloadAndInstall(updateInfo.value, (progress) => {
      downloadProgress.value = progress.percent
    })
    if (result && result.opened) {
      toast('已打开发布页')
    } else {
      toast('安装包已启动，请按系统提示完成安装')
    }
  } catch (e) {
    uni.showModal({
      title: '升级失败',
      content: e && e.message ? e.message : '下载或安装失败',
      showCancel: false,
      confirmText: '知道了'
    })
  } finally {
    downloading.value = false
  }
}

onShow(load)
</script>

<style scoped>
.mine-page {
  padding-bottom: 50rpx;
}

.top-safe {
  height: var(--status-bar-height, 0px);
}

.header {
  padding: 26rpx 36rpx 18rpx;
}

.header-kicker {
  font-size: 20rpx;
  letter-spacing: 4rpx;
  color: var(--gold);
}

.header-title {
  display: block;
  margin-top: 8rpx;
  font-size: 44rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: var(--ink);
}

.profile-card {
  position: relative;
  margin: 8rpx 36rpx 24rpx;
  padding: 30rpx;
  border-radius: 30rpx;
  background:
    radial-gradient(420rpx 260rpx at 100% 0%, rgba(201, 164, 106, 0.2), transparent 70%),
    linear-gradient(135deg, #2b5146 0%, #1d3a32 100%);
  color: #f4eddd;
  box-shadow: 0 20rpx 44rpx rgba(28, 54, 46, 0.24);
  overflow: hidden;
}

.profile-card::after {
  content: '';
  position: absolute;
  right: -80rpx;
  top: -80rpx;
  width: 260rpx;
  height: 260rpx;
  border-radius: 50%;
  border: 1rpx solid rgba(244, 237, 221, 0.12);
}

.profile-logo {
  width: 84rpx;
  height: 84rpx;
  border-radius: 22rpx;
  border: 1rpx solid rgba(244, 237, 221, 0.16);
}

.profile-info {
  position: absolute;
  left: 130rpx;
  top: 30rpx;
  right: 100rpx;
}

.profile-name-row {
  display: flex;
  align-items: baseline;
}

.profile-name {
  font-size: 38rpx;
  letter-spacing: 4rpx;
  color: #f7f1e3;
}

.profile-version {
  margin-left: 12rpx;
  font-size: 19rpx;
  color: rgba(244, 237, 221, 0.5);
}

.profile-slogan {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: rgba(244, 237, 221, 0.55);
}

.profile-seal {
  position: absolute;
  right: 30rpx;
  top: 28rpx;
  width: 50rpx;
  height: 50rpx;
  border-radius: 8rpx;
  border: 2rpx solid rgba(217, 189, 136, 0.5);
  color: rgba(217, 189, 136, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
}

.profile-stats {
  display: flex;
  align-items: center;
  margin-top: 30rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid rgba(244, 237, 221, 0.13);
}

.profile-stat {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
}

.profile-stat-value {
  font-size: 34rpx;
  color: #f2e6cf;
  font-family: 'Songti SC', 'STSong', serif;
}

.profile-stat-label {
  margin-left: 6rpx;
  font-size: 19rpx;
  color: rgba(244, 237, 221, 0.48);
}

.profile-stat-divider {
  width: 1rpx;
  height: 28rpx;
  background: rgba(244, 237, 221, 0.14);
}

.card-section {
  margin: 0 36rpx 24rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background: rgba(255, 252, 245, 0.68);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 10rpx 26rpx rgba(45, 40, 28, 0.04);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.card-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  color: var(--ink);
}

.card-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.card-action {
  font-size: 21rpx;
  color: var(--jade);
  padding: 6rpx 0 6rpx 16rpx;
}

.preview-panel {
  padding: 24rpx;
  border-radius: 18rpx;
  border: 1rpx solid rgba(37, 42, 36, 0.08);
  transition: background-color 0.25s ease, color 0.25s ease;
}

.preview-text {
  display: block;
  font-size: 28rpx;
  line-height: 1.8;
  letter-spacing: 1rpx;
}

.preview-meta {
  display: block;
  margin-top: 10rpx;
  font-size: 18rpx;
  opacity: 0.55;
}

.quick-settings {
  margin-top: 20rpx;
}

.theme-quick-row {
  display: flex;
}

.theme-quick {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 10rpx;
}

.theme-quick:last-child {
  margin-right: 0;
}

.theme-quick-swatch {
  width: 74rpx;
  height: 74rpx;
  border-radius: 50%;
  border: 1rpx solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  position: relative;
}

.theme-quick.active .theme-quick-swatch::after {
  content: '';
  position: absolute;
  left: -6rpx;
  top: -6rpx;
  right: -6rpx;
  bottom: -6rpx;
  border-radius: 50%;
  border: 2rpx solid var(--jade);
}

.theme-quick-name {
  margin-top: 8rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.theme-quick.active .theme-quick-name {
  color: var(--jade);
}

.font-quick-row {
  display: flex;
  align-items: center;
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid var(--line);
}

.font-label {
  font-size: 21rpx;
  color: var(--muted);
  margin-right: 12rpx;
}

.font-spacer {
  flex: 1;
}

.stepper {
  display: flex;
  align-items: center;
  height: 54rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.05);
  padding: 0 4rpx;
}

.stepper-btn {
  width: 46rpx;
  height: 44rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: var(--ink-soft);
}

.stepper-value {
  width: 54rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.mini-segment {
  display: flex;
  padding: 3rpx;
  border-radius: 10rpx;
  background: rgba(37, 42, 36, 0.05);
}

.mini-segment-item {
  width: 52rpx;
  height: 44rpx;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  color: var(--muted);
}

.mini-segment-item.active {
  background: rgba(255, 252, 245, 0.9);
  color: var(--ink);
  box-shadow: 0 3rpx 8rpx rgba(45, 40, 28, 0.08);
}

.update-section .card-sub {
  max-width: 420rpx;
}

.version-pill {
  font-size: 18rpx;
  color: var(--muted);
  background: rgba(37, 42, 36, 0.05);
  border-radius: 999rpx;
  padding: 5rpx 12rpx;
  flex-shrink: 0;
  margin-left: 12rpx;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
}

.update-body {
  padding-top: 4rpx;
}

.update-status {
  display: flex;
  align-items: flex-start;
  padding: 16rpx;
  border-radius: 16rpx;
  background: rgba(47, 93, 80, 0.05);
}

.update-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #6d8a78;
  margin-top: 10rpx;
  flex-shrink: 0;
}

.update-dot.available {
  background: var(--accent);
  box-shadow: 0 0 0 5rpx rgba(168, 73, 58, 0.12);
}

.update-copy {
  flex: 1;
  min-width: 0;
  margin-left: 14rpx;
  display: flex;
  flex-direction: column;
}

.update-status-title {
  font-size: 24rpx;
  color: var(--ink);
}

.update-status-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  line-height: 1.5;
  color: var(--muted);
}

.update-actions {
  display: flex;
  margin-top: 18rpx;
}

.update-btn {
  flex: 1;
  height: 74rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 23rpx;
  color: var(--ink-soft);
}

.update-btn.primary {
  flex: 1.4;
  background: var(--jade);
  border-color: var(--jade);
  color: #f8f3e7;
  margin-right: 12rpx;
}

.update-btn.disabled {
  opacity: 0.55;
}

.update-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid var(--line);
}

.update-switch-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
}

.update-switch-title {
  font-size: 23rpx;
  color: var(--ink-soft);
}

.update-switch-desc {
  margin-top: 2rpx;
  font-size: 18rpx;
  color: var(--muted);
}

.menu-list {
  margin-top: 4rpx;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: rgba(47, 93, 80, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.source-menu-icon { background: rgba(47, 93, 80, 0.08); }
.cache-menu-icon { background: rgba(176, 138, 82, 0.1); }
.clear-menu-icon { background: rgba(168, 73, 58, 0.08); }
.restore-menu-icon { background: rgba(90, 110, 140, 0.1); }

.source-menu-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  border: 3rpx solid var(--jade);
}

.cache-line {
  width: 26rpx;
  height: 3rpx;
  border-radius: 3rpx;
  background: var(--gold);
  margin: 3rpx 0;
}

.cache-line.short { width: 18rpx; }

.clear-line {
  width: 26rpx;
  height: 3rpx;
  border-radius: 3rpx;
  background: var(--accent);
  margin: 3rpx 0;
}

.restore-ring {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  border: 3rpx solid #5a6e8c;
  border-right-color: transparent;
}

.menu-copy {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
  display: flex;
  flex-direction: column;
}

.menu-title {
  font-size: 25rpx;
  color: var(--ink);
}

.menu-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.menu-arrow {
  color: var(--muted);
  font-size: 28rpx;
  margin-left: 12rpx;
}

.about-card {
  margin: 0 36rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background: rgba(255, 252, 245, 0.42);
  border: 1rpx dashed rgba(37, 42, 36, 0.14);
}

.about-head {
  display: flex;
  align-items: center;
}

.about-logo {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
}

.about-title-wrap {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  display: flex;
  flex-direction: column;
}

.about-title {
  font-size: 28rpx;
  letter-spacing: 3rpx;
  color: var(--ink);
}

.about-en {
  margin-top: 2rpx;
  font-size: 16rpx;
  letter-spacing: 2rpx;
  color: var(--muted);
}

.about-version {
  font-size: 19rpx;
  color: var(--muted);
}

.about-text {
  display: block;
  margin-top: 18rpx;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--muted);
}

.about-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 14rpx;
  font-size: 18rpx;
  color: var(--muted);
}

.about-meta text {
  margin-right: 8rpx;
}

.mine-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 60rpx 20rpx;
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

.sheet-preview {
  padding: 26rpx;
  border-radius: 18rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid var(--line);
  font-size: 28rpx;
  line-height: 1.8;
}

.setting-block {
  margin-bottom: 28rpx;
}

.setting-label {
  font-size: 24rpx;
  color: var(--ink);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-value {
  font-size: 22rpx;
  color: var(--muted);
}

.sheet-theme-row {
  display: flex;
  margin-top: 16rpx;
}

.sheet-theme {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 10rpx;
}

.sheet-theme:last-child { margin-right: 0; }

.sheet-theme-swatch {
  width: 82rpx;
  height: 82rpx;
  border-radius: 50%;
  border: 1rpx solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  position: relative;
}

.sheet-theme.active .sheet-theme-swatch::after {
  content: '';
  position: absolute;
  left: -7rpx;
  top: -7rpx;
  right: -7rpx;
  bottom: -7rpx;
  border-radius: 50%;
  border: 2rpx solid var(--jade);
}

.sheet-theme-name {
  margin-top: 8rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.sheet-theme.active .sheet-theme-name {
  color: var(--jade);
}

.sheet-segment {
  display: flex;
  margin-top: 14rpx;
  padding: 5rpx;
  border-radius: 14rpx;
  background: rgba(37, 42, 36, 0.05);
}

.sheet-segment-item {
  flex: 1;
  height: 64rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--muted);
}

.sheet-segment-item.active {
  background: rgba(255, 252, 245, 0.9);
  color: var(--ink);
  box-shadow: 0 3rpx 8rpx rgba(45, 40, 28, 0.08);
}

.switch-block {
  margin-top: 4rpx;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-copy {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
  display: flex;
  flex-direction: column;
}

.switch-desc {
  margin-top: 2rpx;
  font-size: 19rpx;
  color: var(--muted);
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

.update-sheet-body {
  padding-bottom: 10rpx;
}

.update-version-row {
  display: flex;
  align-items: baseline;
}

.update-version {
  font-size: 40rpx;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.update-current {
  margin-left: 14rpx;
  font-size: 20rpx;
  color: var(--muted);
}

.force-tag {
  margin-left: auto;
  font-size: 18rpx;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999rpx;
  padding: 3rpx 12rpx;
}

.update-meta-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
  font-size: 19rpx;
  color: var(--muted);
}

.update-meta-row text {
  margin-right: 16rpx;
}

.update-notes-scroll {
  max-height: 320rpx;
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 14rpx;
  background: rgba(37, 42, 36, 0.035);
  border: 1rpx solid var(--line);
}

.update-notes {
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--ink-soft);
  white-space: pre-wrap;
}

.download-progress {
  margin-top: 18rpx;
}

.download-track {
  height: 8rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.08);
  overflow: hidden;
}

.download-fill {
  height: 100%;
  background: var(--jade);
  border-radius: 999rpx;
  transition: width 0.2s ease;
}

.download-text {
  display: block;
  margin-top: 8rpx;
  font-size: 19rpx;
  color: var(--muted);
  text-align: center;
}

.update-sheet-actions {
  display: flex;
  margin-top: 22rpx;
}

.update-sheet-btn {
  flex: 1;
  height: 82rpx;
  font-size: 25rpx;
}

.update-sheet-btn + .update-sheet-btn {
  margin-left: 12rpx;
}

.update-sheet-btn.disabled {
  opacity: 0.55;
}
</style>
