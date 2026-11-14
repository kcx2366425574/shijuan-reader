import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseHTML,
  getAttr,
  innerHTML,
  textContent
} from '../src/core/html.js'
import { selectAll, selectOne, matchesSelector } from '../src/core/selector.js'

test('解析嵌套标签、属性与文本', () => {
  const doc = parseHTML(`
    <div id="main" class="box outer">
      <h1>标题 &amp; 副标题</h1>
      <p>第一段<br>第二行</p>
    </div>
  `)
  const h1 = selectOne(doc, 'h1')
  assert.equal(textContent(h1), '标题 & 副标题')
  const div = selectOne(doc, '#main')
  assert.equal(getAttr(div, 'class'), 'box outer')
  assert.equal(selectAll(doc, '.box.outer').length, 1)
  assert.equal(textContent(selectOne(doc, 'p')), '第一段\n第二行')
})

test('自动闭合 p/li/dd，容忍畸形 HTML', () => {
  const doc = parseHTML('<ul><li>一<li>二<li>三</ul><p>甲<p>乙<div>丙</div>')
  const lis = selectAll(doc, 'li')
  assert.deepEqual(lis.map((n) => textContent(n)), ['一', '二', '三'])
  const ps = selectAll(doc, 'p')
  assert.deepEqual(ps.map((n) => textContent(n)), ['甲', '乙'])
  assert.equal(textContent(selectOne(doc, 'div')), '丙')
})

test('忽略注释、DOCTYPE 与 script/style 内容', () => {
  const doc = parseHTML('<!DOCTYPE html><!-- 注释 --><div>正文<script>var a="<div>";</script><style>.a{}</style><span>尾</span></div>')
  assert.equal(textContent(doc), '正文尾')
})

test('处理 RCDATA 与常见实体', () => {
  const doc = parseHTML('<title>书名 &amp; 作者</title><p>&nbsp;&#20320;&#x597d;&lt;标签&gt;</p>')
  assert.equal(textContent(selectOne(doc, 'title')), '书名 & 作者')
  assert.equal(textContent(selectOne(doc, 'p')), '你好<标签>')
})

test('innerHTML 可序列化', () => {
  const doc = parseHTML('<div><b class="x">粗</b><br><img src="/a.jpg"></div>')
  const div = selectOne(doc, 'div')
  assert.equal(innerHTML(div), '<b class="x">粗</b><br><img src="/a.jpg">')
})

test('选择器：后代、子元素、兄弟与逗号', () => {
  const doc = parseHTML(`
    <div class="main">
      <h4 class="bookname"><a href="/b/1/">书一</a></h4>
      <div class="author">作者：甲</div>
      <p class="intro">简介一</p>
    </div>
    <div class="main2"><p class="intro">简介二</p></div>
  `)
  assert.equal(selectAll(doc, '.main .intro').length, 1)
  assert.equal(selectAll(doc, '.main > p').length, 1)
  assert.equal(selectAll(doc, 'h4 + .author').length, 1)
  assert.equal(selectAll(doc, 'h4 ~ .intro').length, 1)
  assert.equal(selectAll(doc, '.main, .main2').length, 2)
  assert.equal(selectAll(doc, 'div .bookname a').length, 1)
})

test('选择器：属性运算符', () => {
  const doc = parseHTML(`
    <meta property="og:novel:author" content="天蚕土豆">
    <a href="/n/wanxiang/list.html">目录</a>
    <a href="https://x.com/a.html" title="测试 值" lang="zh-CN">外链</a>
    <input disabled>
  `)
  assert.equal(getAttr(selectOne(doc, 'meta[property="og:novel:author"]'), 'content'), '天蚕土豆')
  assert.equal(selectOne(doc, 'a[href$="list.html"]') !== null, true)
  assert.equal(selectOne(doc, 'a[href^="https://"]') !== null, true)
  assert.equal(selectOne(doc, 'a[title~="测试"]') !== null, true)
  assert.equal(selectOne(doc, 'a[title*="值"]') !== null, true)
  assert.equal(selectOne(doc, 'input[disabled]') !== null, true)
  assert.equal(selectOne(doc, 'a[lang|="zh"]') !== null, true)
})

test('选择器：伪类', () => {
  const doc = parseHTML(`
    <ul>
      <li class="a">一</li>
      <li class="b">二</li>
      <li class="a">三</li>
      <li>四</li>
    </ul>
    <div><span>甲</span><span>乙</span></div>
    <p>这里写着作者：某人</p>
  `)
  assert.equal(textContent(selectOne(doc, 'li:first-child')), '一')
  assert.equal(textContent(selectOne(doc, 'li:last-child')), '四')
  assert.equal(textContent(selectOne(doc, 'li:nth-child(2)')), '二')
  assert.equal(textContent(selectOne(doc, 'li:nth-child(odd)')), '一')
  assert.equal(textContent(selectOne(doc, 'li:nth-child(2n)')), '二')
  assert.equal(textContent(selectOne(doc, 'li:nth-child(3n+1)')), '一')
  assert.equal(selectAll(doc, 'li:not(.a)').length, 2)
  assert.equal(textContent(selectOne(doc, 'p:contains(作者)')), '这里写着作者：某人')
  assert.equal(textContent(selectOne(doc, 'div span:first-of-type')), '甲')
  assert.equal(selectAll(doc, 'li:empty').length, 0)
})

test('matchesSelector 可独立判断节点', () => {
  const doc = parseHTML('<div class="wrap"><a href="/x">X</a></div>')
  const link = selectOne(doc, 'a')
  assert.equal(matchesSelector(link, 'a[href="/x"]'), true)
  assert.equal(matchesSelector(link, 'div a'), true)
  assert.equal(matchesSelector(link, 'div > a'), true)
  assert.equal(matchesSelector(link, 'div > span'), false)
})
