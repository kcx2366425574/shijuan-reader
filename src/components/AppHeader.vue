<template>
  <view class="app-header" :class="{ 'is-transparent': transparent, 'is-dark': dark, 'with-border': showBorder }">
    <view class="status-space" />
    <view class="bar">
      <view v-if="back" class="side back" @tap="goBack" hover-class="press" hover-stay-time="80">
        <view class="chevron" />
      </view>
      <view v-else class="side" />
      <view class="titles">
        <text class="title ellipsis">{{ title }}</text>
        <text v-if="subtitle" class="subtitle ellipsis">{{ subtitle }}</text>
      </view>
      <view class="side actions">
        <slot name="actions" />
      </view>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  back: { type: Boolean, default: false },
  transparent: { type: Boolean, default: false },
  dark: { type: Boolean, default: false },
  showBorder: { type: Boolean, default: false }
})

function goBack() {
  const pages = getCurrentPages()
  if (pages && pages.length > 1) {
    uni.navigateBack({ delta: 1 })
  } else {
    uni.switchTab({ url: '/pages/shelf/shelf' })
  }
}
</script>

<style scoped>
.app-header {
  position: relative;
  z-index: 20;
}

.status-space {
  height: var(--status-bar-height, 0px);
}

.bar {
  height: 88rpx;
  display: flex;
  align-items: center;
  padding: 0 20rpx;
}

.side {
  width: 88rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.actions {
  justify-content: flex-end;
}

.back {
  justify-content: flex-start;
  padding-left: 8rpx;
}

.chevron {
  width: 20rpx;
  height: 20rpx;
  border-left: 3rpx solid var(--ink);
  border-bottom: 3rpx solid var(--ink);
  transform: rotate(45deg);
  margin-left: 10rpx;
}

.titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.title {
  max-width: 100%;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--ink);
}

.subtitle {
  max-width: 100%;
  font-size: 20rpx;
  color: var(--muted);
  margin-top: 2rpx;
  letter-spacing: 1rpx;
}

.with-border {
  border-bottom: 1rpx solid var(--line);
}

.is-transparent {
  background: transparent;
}

.is-dark .title {
  color: #f0eadc;
}

.is-dark .subtitle {
  color: rgba(240, 234, 220, 0.55);
}

.is-dark .chevron {
  border-color: #f0eadc;
}
</style>
