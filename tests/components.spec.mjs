/**
 * 组件自检 —— 跑 `node tests/components.spec.mjs`。
 *
 * 守的是**拆分后 import 有没有漏**：一个组件少 import 一个 S 或 el，
 * esbuild 不一定报（它只管解析得到），但渲染时会抛。这里拿真实形状的数据
 * 把每个组件渲染一遍，漏了就在这里炸。
 *
 * 用真 react 的 createElement（devDependency），自己走一遍元素树 ——
 * 不引 react-dom：我们要的只是「函数能跑完、该有的文字在」，
 * 不是真实 DOM 行为。hooks 用一组替身顶掉，因为没有 renderer。
 */
import React from 'react'

const R = new URL('../src/client/', import.meta.url).pathname

// hooks 替身 —— 没有 renderer，真 hooks 会抛 Invalid hook call。
// 只要「返回初始值 + 不抛」就够：我们测的是渲染路径，不是状态流转。
const realUseState = React.useState
React.useState = (v) => [typeof v === 'function' ? v() : v, () => {}]
React.useCallback = (f) => f
React.useRef = (v) => ({ current: v ?? 0 })

/**
 * ⚠️ useEffect **必须真的跑一遍 effect 函数**，不能空实现。
 *
 * 实测踩过：AccountPage 用了 `API` 但漏了 import，空 useEffect 让那条
 * 取数路径永远不执行，测试全绿 —— 而面板上是「读不到账户信息。API is not
 * defined」。组件里真正会引用跨模块常量的地方，大半在 effect 里。
 *
 * 同步跑、吞掉 promise 拒绝（fetch 在 node 里会失败，那不是我们要测的）；
 * 只要 effect 体内的**同步部分**能跑完，漏 import 就会抛出来。
 */
const effectErrors = []
React.useEffect = (fn) => {
  try {
    const cleanup = fn()
    if (cleanup && typeof cleanup.catch === 'function') cleanup.catch(() => {})
  } catch (error) {
    // ReferenceError 才是漏 import；其余（fetch 不通之类）不关心
    if (error instanceof ReferenceError) effectErrors.push(error.message)
  }
}

const { AudienceReport } = await import(R + 'report/audience.js')
const { SignalReport } = await import(R + 'report/signal.js')
const { Report } = await import(R + 'report/reddit-pain.js')
const { IgReport } = await import(R + 'report/ig-pain.js')
const { rowMeta, MODULES, EmptyHint } = await import(R + 'modules.js')
const { appIcon, BRAND } = await import(R + 'icons.js')
const { TreeNode } = await import(R + 'TreeNode.js')
const { AccountPage } = await import(R + 'AccountPage.js')
const { S } = await import(R + 'styles.js')

const el = React.createElement

/** 把元素树摊成文本。真 React 元素的孩子在 props.children。 */
function txt(node, depth = 0) {
  if (node === null || node === undefined || node === false || depth > 60) return ''
  if (typeof node !== 'object') return String(node)
  if (Array.isArray(node)) return node.map((n) => txt(n, depth + 1)).join('')
  if (typeof node.type === 'function') {
    return txt(node.type(node.props ?? {}), depth + 1)
  }
  const kids = node.props?.children
  return kids === undefined ? '' : txt(kids, depth + 1)
}

let fail = 0
function t(name, node, expect = []) {
  let s
  effectErrors.length = 0
  try {
    s = txt(node)
  } catch (error) {
    console.log(`  ✗ ${name} → 抛了: ${error.message}`)
    fail += 1
    return
  }
  if (effectErrors.length > 0) {
    console.log(`  ✗ ${name} → effect 里漏 import: ${effectErrors.join('; ')}`)
    fail += 1
    return
  }
  const miss = expect.filter((e) => !s.includes(e))
  if (miss.length > 0) {
    console.log(`  ✗ ${name} 缺: ${miss.join(' / ')}`)
    fail += 1
    return
  }
  console.log(`  ✓ ${name}`)
}

console.log('四个报告组件（真实形状的数据）')

t('AudienceReport', el(AudienceReport, {
  r: {
    audience: '攀岩者', slug: 'rock', summary: 's',
    communities: [{ name: 'r/climbing', slug: 'climbing', subscribers: 120000, reason: 'r', why: 'w' }],
  },
  runId: 'aud_1', done: [], onOpen() {}, onSubmit() {},
}), ['攀岩者', 'r/climbing', '120.0k'])

t('SignalReport', el(SignalReport, {
  r: {
    audience: '攀岩者', slug: 'rock',
    signals: [{ title: '想要防汗指套', category: '指套', status: '空白', evidence: [{ text: 'q', post_url: 'u' }] }],
  },
  done: [], onOpen() {}, onDig() {},
}), ['想要防汗指套', '空白'])

t('Report(reddit)', el(Report, {
  r: {
    product: '挂烫机', slug: 'steamer',
    pain_points: [{ title: '水垢堵塞', description: 'd', evidence: [{ text: 'q', post_title: 't', post_url: 'u', subreddit: 'r/x', score: 9 }] }],
    opportunities: [{ title: '标注尺寸', feasibility: 'high', note: 'n' }],
    meta: { posts_collected: 42, subreddits: ['r/x'], search_terms: ['a'] },
  },
}), ['挂烫机', '水垢堵塞', '标注尺寸', '42'])

t('IgReport', el(IgReport, {
  r: {
    product: '指甲片', slug: 'nails', analyzed_at: '2026-09-15',
    pains: [{
      title: '翘边', description: 'd', frequency: 'high',
      evidence: [{ text: 'q', zh: '中文意思', code: 'C1', username: 'u', like_count: 600, media_name: 'reel', thumbnail_url: 't.jpg' }],
    }],
    stats: { fetched: 96, signal: 27, total_cost: 0.072, tags_tried: ['a'], tags_dropped: ['b'] },
    caveats: ['样本有偏'],
  },
}), ['指甲片', '翘边', '中文意思', '$0.072', '96', '样本有偏'])

t('IgReport 最小数据不崩', el(IgReport, {
  r: { product: 'x', pains: [{ title: 't', evidence: [{ text: 'a' }] }] },
}), ['x', 't'])

console.log('\n其余组件')

t('EmptyHint(ig)', el(EmptyHint, { mod: 'cl-ig-pain', name: 'IG 痛点' }), ['/cl-ig-pain', '买前顾虑'])
t('EmptyHint(reddit)', el(EmptyHint, { mod: 'cl-reddit-pain', name: '痛点洞察' }), ['/cl-reddit-pain', 'IG 痛点'])
t('EmptyHint(audience)', el(EmptyHint, { mod: 'cl-reddit-audience', name: '人群洞察' }), ['/cl-reddit-audience', 'ebike'])
t('TreeNode', el(TreeNode, {
  node: { row: { id: 'a', name: '攀岩', saved_at: Date.now(), comms: 3 }, kind: 'cl-reddit-audience', children: [] },
  depth: 0, pick: null, onPick() {},
}), ['攀岩'])
t('AccountPage', el(AccountPage, {}))

console.log('\n查表')

const igMeta = rowMeta('cl-ig-pain', { pains: 5, high: 2, fetched: 96, saved_at: Date.now() }).filter(Boolean).join(' · ')
const rdMeta = rowMeta('cl-reddit-pain', { pains: 4, posts: 42, saved_at: Date.now() }).filter(Boolean).join(' · ')
console.log(`  rowMeta(ig)     ${igMeta}`)
console.log(`  rowMeta(reddit) ${rdMeta}`)
if (!igMeta.includes('簇') || !igMeta.includes('高频')) { console.log('  ✗ IG 的列表行不对'); fail += 1 }
if (!rdMeta.includes('痛点')) { console.log('  ✗ Reddit 的列表行不对'); fail += 1 }

const names = MODULES.map((m) => `${m.name}(${m.icon})`).join(' ')
console.log(`  MODULES         ${names}`)
if (MODULES.length !== 3) { console.log('  ✗ 期望三格'); fail += 1 }
if (!MODULES.some((m) => m.icon === 'instagram')) { console.log('  ✗ IG 那格没用 instagram 图标'); fail += 1 }

const ig = appIcon('instagram', 56)
console.log(`  IG 图标         ${ig.type} · ${String(ig.props.style.background).slice(0, 28)}…`)
if (!String(ig.props.style.background).includes('gradient')) { console.log('  ✗ IG 图标不是渐变'); fail += 1 }
if (appIcon('reddit', 56).type !== 'svg') { console.log('  ✗ Reddit 图标形状变了（full:true 该直接画 logo）'); fail += 1 }
if (BRAND.instagram === undefined) { console.log('  ✗ BRAND 里没有 instagram'); fail += 1 }
if (S.thumb === undefined) { console.log('  ✗ 样式表缺 thumb（IG 封面图要用）'); fail += 1 }

React.useState = realUseState
console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`)
process.exit(fail > 0 ? 1 : 0)
