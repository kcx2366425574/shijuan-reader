import test from 'node:test'
import assert from 'node:assert/strict'

import { summarizeRefresh } from '../src/core/shelf-update.js'

function openedWith(names, info = {}) {
  return {
    info: { name: '万相之王', author: '天蚕土豆', ...info },
    chapters: names.map((name, index) => ({ name, url: 'https://example.com/' + index })),
    tocUrl: 'https://example.com/book/1/'
  }
}

test('书架更新：章节增加时返回新增数量', () => {
  const book = { chapterCount: 10, lastChapter: '第10章 旧章', tocUrl: '' }
  const result = summarizeRefresh(book, openedWith(['第1章', '第11章', '第12章 新章']))
  assert.equal(result.chapterCount, 3)
  assert.equal(result.lastChapter, '第12章 新章')
  // 目录数变少时不做负数处理，避免站点改版时显示负增长
  assert.equal(result.newChapterCount, 0)
  assert.equal(result.hasNew, true)
  assert.equal(result.tocUrl, 'https://example.com/book/1/')
})

test('书架更新：章节数增加时按差值计算', () => {
  const names = Array.from({ length: 12 }, (_, index) => '第' + (index + 1) + '章')
  const result = summarizeRefresh({ chapterCount: 10, lastChapter: '第10章' }, openedWith(names))
  assert.equal(result.newChapterCount, 2)
  assert.equal(result.hasNew, true)
  assert.equal(result.lastChapter, '第12章')
})

test('书架更新：章节数未变且末章名称未变时视为最新', () => {
  const names = Array.from({ length: 10 }, (_, index) => '第' + (index + 1) + '章')
  const result = summarizeRefresh({ chapterCount: 10, lastChapter: '第10章' }, openedWith(names))
  assert.equal(result.newChapterCount, 0)
  assert.equal(result.hasNew, false)
})

test('书架更新：章节数未变但末章改名也提示有变化', () => {
  const names = Array.from({ length: 10 }, (_, index) => '第' + (index + 1) + '章')
  names[9] = '第10章 修改后的标题'
  const result = summarizeRefresh({ chapterCount: 10, lastChapter: '第10章 旧标题' }, openedWith(names))
  assert.equal(result.newChapterCount, 0)
  assert.equal(result.hasNew, true)
})

test('书架更新：首次更新不把已有章节算成新章节', () => {
  const result = summarizeRefresh({ chapterCount: 0, lastChapter: '' }, openedWith(['第1章', '第2章']))
  assert.equal(result.chapterCount, 2)
  assert.equal(result.newChapterCount, 0)
  assert.equal(result.hasNew, false)
})

test('书架更新：目录为空时保留原有信息', () => {
  const book = { chapterCount: 8, lastChapter: '第8章', tocUrl: 'https://example.com/old/' }
  const result = summarizeRefresh(book, { info: {}, chapters: [], tocUrl: '' })
  assert.equal(result.chapterCount, 8)
  assert.equal(result.lastChapter, '第8章')
  assert.equal(result.tocUrl, 'https://example.com/old/')
  assert.equal(result.hasNew, false)
})
