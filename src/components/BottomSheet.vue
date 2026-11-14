<template>
  <view v-if="show" class="bs-root">
    <view class="mask" @tap="close" @touchmove.stop.prevent />
    <view class="sheet-panel bs-panel" @tap.stop>
      <view class="bs-handle" />
      <view v-if="title || closable" class="bs-head">
        <text class="bs-title serif">{{ title }}</text>
        <view v-if="closable" class="bs-close" @tap="close" hover-class="press">×</view>
      </view>
      <scroll-view class="bs-body" scroll-y :show-scrollbar="false">
        <slot />
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true }
})
const emit = defineEmits(['update:show', 'close'])

function close() {
  emit('update:show', false)
  emit('close')
}
</script>

<style scoped>
.bs-root {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
}

.bs-panel {
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  padding-top: 14rpx;
}

.bs-handle {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: rgba(37, 42, 36, 0.16);
  margin: 4rpx auto 10rpx;
}

.bs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 36rpx 20rpx;
}

.bs-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.bs-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: var(--muted);
  line-height: 1;
}

.bs-body {
  max-height: 68vh;
  padding: 0 36rpx 30rpx;
  box-sizing: border-box;
}
</style>
