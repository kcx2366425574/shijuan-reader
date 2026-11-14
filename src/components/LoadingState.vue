<template>
  <view class="loading-state" :class="{ inline }">
    <view class="dots">
      <view class="ink-dot" />
      <view class="ink-dot" />
      <view class="ink-dot" />
    </view>
    <text v-if="text" class="loading-text">{{ text }}</text>
  </view>
</template>

<script setup>
defineProps({
  text: { type: String, default: '正在翻页…' },
  inline: { type: Boolean, default: false }
})
</script>

<style scoped>
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 90rpx 20rpx;
}

.loading-state.inline {
  flex-direction: row;
  padding: 24rpx 0;
}

.dots {
  display: flex;
  align-items: center;
}

.ink-dot {
  margin: 0 7rpx;
}

.loading-text {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: var(--muted);
  letter-spacing: 1rpx;
}

.inline .loading-text {
  margin-top: 0;
  margin-left: 10rpx;
}
</style>
