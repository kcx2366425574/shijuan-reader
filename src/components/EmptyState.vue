<template>
  <view class="empty-state" :class="{ compact }">
    <view class="empty-art" aria-hidden="true">
      <view class="sun" />
      <view class="book b1" />
      <view class="book b2" />
      <view class="book b3" />
      <view class="bookmark" />
      <view class="ground" />
    </view>
    <text class="empty-title serif">{{ title }}</text>
    <text v-if="desc" class="empty-desc">{{ desc }}</text>
    <view v-if="actionText" class="empty-action" @tap="$emit('action')" hover-class="press">
      <text>{{ actionText }}</text>
      <text class="arrow">→</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  title: { type: String, default: '这里还空着' },
  desc: { type: String, default: '' },
  actionText: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})
defineEmits(['action'])
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 40rpx;
  text-align: center;
}

.empty-state.compact {
  padding: 40rpx 20rpx;
}

.empty-art {
  position: relative;
  width: 260rpx;
  height: 190rpx;
  margin-bottom: 34rpx;
}

.sun {
  position: absolute;
  right: 44rpx;
  top: 20rpx;
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  background: rgba(168, 73, 58, 0.24);
}

.book {
  position: absolute;
  bottom: 36rpx;
  border-radius: 8rpx 6rpx 6rpx 8rpx;
  background: #f6ead2;
  border: 1rpx solid rgba(120, 100, 66, 0.28);
  box-shadow: 0 8rpx 18rpx rgba(60, 52, 36, 0.1);
}

.book::before {
  content: '';
  position: absolute;
  left: 10rpx;
  right: 10rpx;
  top: 18rpx;
  height: 2rpx;
  background: rgba(120, 100, 66, 0.22);
  box-shadow: 0 12rpx 0 rgba(120, 100, 66, 0.18), 0 24rpx 0 rgba(120, 100, 66, 0.14);
}

.b1 {
  left: 44rpx;
  width: 56rpx;
  height: 108rpx;
  transform: rotate(-6deg);
  background: #e8dcc4;
}

.b2 {
  left: 106rpx;
  width: 58rpx;
  height: 136rpx;
  background: #f2e6cd;
}

.b3 {
  left: 168rpx;
  width: 52rpx;
  height: 94rpx;
  transform: rotate(5deg);
  background: #ded3bb;
}

.bookmark {
  position: absolute;
  left: 128rpx;
  top: 18rpx;
  width: 14rpx;
  height: 66rpx;
  background: var(--accent);
  border-radius: 2rpx 2rpx 6rpx 6rpx;
  box-shadow: 0 4rpx 10rpx rgba(168, 73, 58, 0.22);
}

.bookmark::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -10rpx;
  width: 0;
  height: 0;
  border-left: 7rpx solid var(--accent);
  border-right: 7rpx solid var(--accent);
  border-bottom: 10rpx solid transparent;
}

.ground {
  position: absolute;
  left: 34rpx;
  right: 34rpx;
  bottom: 20rpx;
  height: 2rpx;
  background: rgba(37, 42, 36, 0.13);
}

.empty-title {
  font-size: 34rpx;
  color: var(--ink);
  letter-spacing: 2rpx;
}

.empty-desc {
  margin-top: 14rpx;
  max-width: 480rpx;
  font-size: 25rpx;
  line-height: 1.7;
  color: var(--muted);
}

.empty-action {
  margin-top: 30rpx;
  display: inline-flex;
  align-items: center;
  height: 76rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: var(--jade);
  color: #f8f3e7;
  font-size: 27rpx;
  letter-spacing: 1rpx;
  box-shadow: 0 10rpx 24rpx rgba(47, 93, 80, 0.2);
}

.arrow {
  margin-left: 12rpx;
  font-size: 24rpx;
  opacity: 0.8;
}
</style>
