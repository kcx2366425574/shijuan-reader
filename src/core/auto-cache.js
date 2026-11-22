/**
 * 在线阅读自动缓存的防抖调度器。
 *
 * 同一防抖窗口内只写一次离线文件：按章节 url 去重，窗口结束后一次性
 * 把所有条目交给 flush 回调批量提交。与主流程解耦，便于独立测试。
 */
export function createAutoCacheScheduler(flush, delay = 1200) {
  const pending = new Map()
  let timer = null

  const scheduler = {
    schedule(entry) {
      const url = entry && entry.chapter && entry.chapter.url
      if (!url || !(entry && entry.content)) return
      pending.set(url, entry)
      if (timer) return
      timer = setTimeout(() => {
        scheduler.flush()
      }, Math.max(0, Number(delay) || 0))
    },

    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!pending.size) return null
      const entries = Array.from(pending.values())
      pending.clear()
      return flush(entries)
    },

    get pendingCount() {
      return pending.size
    },

    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    }
  }
  return scheduler
}
