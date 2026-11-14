<template>
  <view
    class="book-cover"
    :class="{ 'has-shadow': shadow }"
    :style="{ borderRadius: radius }"
    @tap="$emit('tap')"
  >
    <image
      v-if="displaySrc && !failed"
      class="cover-img"
      :src="displaySrc"
      mode="aspectFill"
      :lazy-load="lazy"
      @error="onError"
    />
    <view v-else class="fallback" :style="fallbackStyle">
      <text class="fallback-char serif">{{ initial }}</text>
      <text v-if="shortTitle" class="fallback-title serif">{{ shortTitle }}</text>
      <view class="fallback-rule" />
      <view class="fallback-spine" />
    </view>
    <view class="gloss" />
    <view class="spine-light" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { DEFAULT_UA, proxiedUrl } from '../core/service.js'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '' },
  author: { type: String, default: '' },
  referer: { type: String, default: '' },
  radius: { type: String, default: '14rpx' },
  lazy: { type: Boolean, default: true },
  shadow: { type: Boolean, default: false }
})

defineEmits(['tap'])

const failed = ref(false)
const displaySrc = ref('')
const triedDirect = ref(false)
const coverCache = new Map()
const pending = new Set()

const cleanTitle = computed(() => String(props.title || '').replace(/[《》\s]/g, ''))
const initial = computed(() => cleanTitle.value.slice(0, 1) || '书')
const shortTitle = computed(() => cleanTitle.value.slice(0, 5))

const fallbackStyle = computed(() => {
  let hash = 0
  const text = cleanTitle.value || '书'
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return {
    background: `linear-gradient(150deg, hsl(${hue}, 24%, 34%) 0%, hsl(${(hue + 26) % 360}, 26%, 20%) 100%)`
  }
})

function baseSrc() {
  if (!props.src) return ''
  return proxiedUrl(props.src, props.referer || props.src)
}

function syncSrc() {
  failed.value = false
  triedDirect.value = false
  displaySrc.value = baseSrc()

  // #ifdef APP-PLUS
  loadAppCover()
  // #endif
}

// #ifdef APP-PLUS
function loadAppCover() {
  if (!props.src) return
  const cached = coverCache.get(props.src)
  if (cached) {
    displaySrc.value = cached
    return
  }
  if (pending.has(props.src)) return
  pending.add(props.src)
  uni.downloadFile({
    url: props.src,
    header: {
      Referer: props.referer || props.src,
      'User-Agent': DEFAULT_UA
    },
    success(res) {
      if (res.statusCode === 200 && res.tempFilePath) {
        coverCache.set(props.src, res.tempFilePath)
        displaySrc.value = res.tempFilePath
      }
    },
    complete() {
      pending.delete(props.src)
    }
  })
}
// #endif

function onError() {
  if (!triedDirect.value && props.src && displaySrc.value !== props.src) {
    triedDirect.value = true
    displaySrc.value = props.src
    return
  }
  failed.value = true
}

watch(() => [props.src, props.referer], syncSrc, { immediate: true })
</script>

<style scoped>
.book-cover {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #e7ddcc;
  transform: translateZ(0);
}

.has-shadow {
  box-shadow: 0 14rpx 34rpx rgba(33, 30, 22, 0.2);
}

.cover-img {
  width: 100%;
  height: 100%;
}

.fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  position: relative;
  overflow: hidden;
}

.fallback-char {
  font-size: 68rpx;
  color: rgba(246, 238, 219, 0.94);
  line-height: 1;
  text-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.18);
}

.fallback-title {
  margin-top: 12rpx;
  max-width: 100%;
  font-size: 20rpx;
  letter-spacing: 2rpx;
  color: rgba(246, 238, 219, 0.66);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fallback-rule {
  width: 46rpx;
  height: 2rpx;
  margin-top: 10rpx;
  background: rgba(246, 238, 219, 0.35);
}

.fallback-spine {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 16rpx;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0));
}

.gloss {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 34%),
    linear-gradient(0deg, rgba(30, 26, 18, 0.12) 0%, rgba(30, 26, 18, 0) 30%);
  pointer-events: none;
}

.spine-light {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10rpx;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.16), rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0));
  pointer-events: none;
}
</style>
