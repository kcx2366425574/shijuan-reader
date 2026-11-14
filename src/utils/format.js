/** 界面格式化与小交互工具。 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function todayLabel(date) {
  const d = date || new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAYS[d.getDay()]}`
}

export function relativeTime(timestamp) {
  const ts = Number(timestamp) || 0
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatCount(value) {
  const number = Number(value) || 0
  if (number >= 10000) return (number / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(number)
}

export function progressPercent(book) {
  if (!book) return 0
  const progress = book.progress || {}
  if (typeof progress.percent === 'number' && progress.percent >= 0) {
    return Math.max(0, Math.min(100, Math.round(progress.percent * 100)))
  }
  if (book.chapterCount && progress.chapterIndex !== undefined) {
    return Math.max(1, Math.min(100, Math.round(((progress.chapterIndex + 1) / book.chapterCount) * 100)))
  }
  return 0
}

export function progressText(book) {
  const progress = book.progress || {}
  if (progress.chapterName) return progress.chapterName
  if (progress.chapterIndex !== undefined) return `第 ${progress.chapterIndex + 1} 章`
  return book.lastChapter || '尚未开始'
}

export function safeText(value, fallback) {
  const text = String(value == null ? '' : value).trim()
  return text || fallback || ''
}

export function truncate(value, length) {
  const text = String(value || '')
  const max = Number(length) || 80
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function toast(title) {
  if (typeof uni === 'undefined') return
  uni.showToast({ title: String(title || ''), icon: 'none', duration: 1800 })
}

export function toastSuccess(title) {
  if (typeof uni === 'undefined') return
  uni.showToast({ title: String(title || ''), icon: 'success', duration: 1500 })
}

export function confirmDialog(options = {}) {
  if (typeof uni === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    uni.showModal({
      title: options.title || '确认',
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      confirmColor: options.confirmColor || '#a8493a',
      success(res) {
        resolve(!!res.confirm)
      },
      fail() {
        resolve(false)
      }
    })
  })
}

export function actionSheet(items, title) {
  if (typeof uni === 'undefined') return Promise.resolve(-1)
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: items,
      ...(title ? { title } : {}),
      success(res) {
        resolve(res.tapIndex)
      },
      fail() {
        resolve(-1)
      }
    })
  })
}

export function copyText(text, tip) {
  if (typeof uni === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    uni.setClipboardData({
      data: String(text || ''),
      success() {
        toast(tip || '已复制')
        resolve(true)
      },
      fail() {
        resolve(false)
      }
    })
  })
}

export function vibrate() {
  if (typeof uni === 'undefined') return
  try {
    uni.vibrateShort({ type: 'light' })
  } catch (e) {
    // ignore
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function firstReadableIndex(chapters) {
  if (!chapters || !chapters.length) return 0
  const first = String((chapters[0] && chapters[0].name) || '')
  return /新书感言|上架感言|完本感言|请假条|作品相关/.test(first) && chapters.length > 1 ? 1 : 0
}

export function splitParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function chapterLabel(index) {
  return `第 ${Number(index) + 1} 章`
}

export { pad2 }
