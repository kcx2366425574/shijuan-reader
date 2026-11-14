<script>
import { ensureSources, loadSettings, saveSettings } from './core/store.js'
import { autoCheckUpdate } from './core/update.js'
import { autoSyncSourceRepo } from './core/source-repo.js'

export default {
  onLaunch() {
    try {
      ensureSources()
      // 触发一次读取，确保历史版本缺少的字段被默认值补齐
      const settings = saveSettings(loadSettings())
      // 后台静默检查更新；未配置更新仓库时自动跳过
      autoCheckUpdate(settings).catch(() => {})
      // 静默同步独立书源仓库；未配置时自动跳过
      autoSyncSourceRepo(settings).catch(() => {})
    } catch (e) {
      console.error('[拾卷] 初始化失败', e)
    }
  },
  onShow() {},
  onHide() {},
  onError(error) {
    console.error('[拾卷] 运行错误', error)
  }
}
</script>

<style>
/* ============================================================
   拾卷 · 全局设计系统
   墨纸底色、朱砂强调、青黛辅助；阅读界面使用宋体。
   ============================================================ */

page {
  --paper: #f6f1e5;
  --paper-deep: #efe6d4;
  --surface: rgba(255, 252, 245, 0.76);
  --surface-solid: #fbf7ee;
  --ink: #252a24;
  --ink-soft: #555b51;
  --muted: #8e887a;
  --line: rgba(37, 42, 36, 0.1);
  --line-strong: rgba(37, 42, 36, 0.18);
  --accent: #a8493a;
  --accent-deep: #8d3a2e;
  --accent-soft: #f1dfd9;
  --jade: #2f5d50;
  --jade-soft: #e3ece7;
  --gold: #b08a52;
  --shadow: 0 16rpx 48rpx rgba(45, 40, 28, 0.08);

  min-height: 100%;
  background-color: #f6f1e5;
  background-image:
    radial-gradient(1200rpx 900rpx at 92% -8%, rgba(176, 138, 82, 0.12), transparent 62%),
    radial-gradient(1000rpx 700rpx at -12% 18%, rgba(47, 93, 80, 0.07), transparent 60%),
    linear-gradient(180deg, #f7f2e7 0%, #f4eee1 100%);
  background-attachment: fixed;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
  font-size: 28rpx;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

view,
text,
image,
input,
textarea,
scroll-view,
swiper,
swiper-item {
  box-sizing: border-box;
}

image {
  display: block;
}

button {
  padding: 0;
  margin: 0;
  background: transparent;
  border-radius: 0;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

button::after {
  border: none;
}

input,
textarea {
  font-family: inherit;
}

/* ---------- 字体 ---------- */

.serif {
  font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif;
}

.mono {
  font-family: 'SFMono-Regular', 'Cascadia Code', 'Consolas', monospace;
}

/* ---------- 布局 ---------- */

.page {
  min-height: 100vh;
  position: relative;
}

.page-pad {
  padding: 0 36rpx;
}

.safe-top {
  padding-top: var(--status-bar-height, 0px);
}

.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.col {
  display: flex;
  flex-direction: column;
}

.flex1 {
  flex: 1;
  min-width: 0;
}

.center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ---------- 文字 ---------- */

.muted {
  color: var(--muted);
}

.ink-soft {
  color: var(--ink-soft);
}

.accent {
  color: var(--accent);
}

.jade {
  color: var(--jade);
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.clamp-3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.section-label {
  font-size: 22rpx;
  letter-spacing: 4rpx;
  color: var(--muted);
  text-transform: uppercase;
}

/* ---------- 卡片与按钮 ---------- */

.card {
  background: var(--surface);
  border: 1rpx solid rgba(255, 255, 255, 0.55);
  border-radius: 28rpx;
  box-shadow: var(--shadow);
}

.hairline {
  border-bottom: 1rpx solid var(--line);
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 44rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f7f2e6;
  font-size: 30rpx;
  font-weight: 500;
  letter-spacing: 1rpx;
  box-shadow: 0 12rpx 30rpx rgba(47, 93, 80, 0.24);
}

.primary-btn.accent-btn {
  background: var(--accent);
  box-shadow: 0 12rpx 30rpx rgba(168, 73, 58, 0.24);
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 40rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line-strong);
  color: var(--ink);
  font-size: 30rpx;
  background: rgba(255, 255, 255, 0.35);
}

.icon-btn {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--ink);
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 44rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: var(--ink-soft);
  background: rgba(37, 42, 36, 0.05);
  border: 1rpx solid transparent;
}

.chip.jade-chip {
  color: var(--jade);
  background: var(--jade-soft);
}

.chip.accent-chip {
  color: var(--accent);
  background: var(--accent-soft);
}

.press {
  opacity: 0.72;
  transform: scale(0.992);
}

/* ---------- 滚动 ---------- */

::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* ---------- 动画 ---------- */

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(18rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-up {
  animation: fadeUp 0.36s ease both;
}

@keyframes inkPulse {
  0%, 100% { opacity: 0.35; transform: scale(0.86); }
  50% { opacity: 1; transform: scale(1); }
}

.ink-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--jade);
  animation: inkPulse 1.2s ease-in-out infinite;
}

.ink-dot:nth-child(2) { animation-delay: 0.16s; }
.ink-dot:nth-child(3) { animation-delay: 0.32s; }

/* ---------- 遮罩与面板 ---------- */

.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(20, 24, 20, 0.42);
  backdrop-filter: blur(4rpx);
  z-index: 900;
}

.sheet-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 901;
  background: var(--surface-solid);
  border-radius: 36rpx 36rpx 0 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -20rpx 60rpx rgba(20, 24, 20, 0.16);
  animation: sheetUp 0.28s cubic-bezier(0.22, 0.8, 0.3, 1) both;
}

@keyframes sheetUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* ---------- 输入 ---------- */

.text-input {
  height: 88rpx;
  padding: 0 28rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.6);
  border: 1rpx solid var(--line);
  font-size: 28rpx;
  color: var(--ink);
}

.textarea {
  width: 100%;
  padding: 24rpx 28rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.55);
  border: 1rpx solid var(--line);
  font-size: 26rpx;
  line-height: 1.7;
  color: var(--ink);
}

.placeholder {
  color: #a9a292;
}
</style>
