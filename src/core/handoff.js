/** 页面间传递较长的搜索结果，避免 URL 过长。 */

const store = new Map()

export function setHandoff(key, value) {
  if (!key) return
  store.set(key, value)
  if (store.size > 30) {
    const first = store.keys().next().value
    store.delete(first)
  }
}

export function takeHandoff(key) {
  if (!key) return null
  const value = store.get(key)
  store.delete(key)
  return value || null
}

export function peekHandoff(key) {
  return store.get(key) || null
}
