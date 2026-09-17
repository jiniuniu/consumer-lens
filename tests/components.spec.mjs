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
React.useMemo = (f) => f()
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
const { LoginPanel } = await import(R + 'LoginPanel.js')
const { accountIcon } = await import(R + 'icons.js')
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
// 登录面板两态。未登录那态是新用户看到的第一屏，渲染不出来等于注册不了。
t('LoginPanel(未登录)', el(LoginPanel, { configured: false }), ['手机号', '获取验证码', '登录 / 注册'])
t('LoginPanel(已登录)', el(LoginPanel, { configured: true }), ['已登录', '退出登录'])

console.log('\nTK')

/** 一条视频，字段照 cl-tk-search 的落盘形状。 */
const tkVideo = {
  aweme_id: '7610515484366097678',
  desc: 'Perfect outdoor chairs for summer',
  url: 'https://www.tiktok.com/@dyl/video/7610515484366097678',
  author_name: 'dyl', follower_count: 54945,
  play_count: 25352235, digg_count: 499514, comment_count: 1717,
  engage_rate: 1.98, create_time: '2026-02-24',
  type: '种草', note: '泛带货号的口袋推荐位',
}

/** 一份评论分析，形状照 SKILL.md §7 那个 JSON。 */
const tkReport = {
  video: { id: '7610515484366097678', url: 'u', author: '@dyl', name: '露营椅评论区' },
  audience: {
    stats: [{ n: '240', label: '头部评论', sub: '平台共 891 条' }],
    topics_title: '他们走到哪一步了',
    topics_hole: ['240', '条'],
    topics: [
      { label: '只说想要，没说为什么', n: 149, pct: 62, cls: 'love' },
      { label: '多少钱', n: 20, pct: 8, cls: 'ask', sub: true },
    ],
    // ⚠️ 语种 bars 没有 cls —— 走 clsColor 会拿到浅灰，画在浅灰 track 上
    // 等于隐形，所以 Bars 必须在没 cls 时用品牌色。这条数据就是那个用例。
    bars_title: '他们说的什么语言',
    bars: [{ label: '英语', n: 183, pct: 76 }],
    reads: ['这 240 条是平台按热度排在最前面的，不是随机样本。'],
  },
  groups: [{
    title: '他们被什么打动', hint: '171 条心动', count: 171,
    topics: [{
      name: '他们想到了具体的谁', count: 9, likes: 1583,
      quotes: [{ text: 'yo necesito uno', zh: '我就需要一个', likes: 1568 }],
    }],
  }],
  data_note: { caveats: ['平台给的是热度混排，不是随机样本'] },
}

const { VideoList } = await import(R + 'tk/VideoList.js')
const { VideoDetail } = await import(R + 'tk/VideoDetail.js')
const { CommentReport } = await import(R + 'tk/CommentReport.js')
const { TkPane } = await import(R + 'tk/TkPane.js')
const { Donut, Bars } = await import(R + 'tk/charts.js')

t('VideoList(未分析)', el(VideoList, {
  data: { slug: 's', query: 'camping chair', videos: [tkVideo] },
  done: new Set(), onOpen() {},
}), ['○ 未分析', '种草', 'dyl'])

t('VideoList(已分析)', el(VideoList, {
  data: { slug: 's', query: 'camping chair', videos: [tkVideo] },
  done: new Set(['7610515484366097678']), onOpen() {},
}), ['● 已分析', '只看已分析'])

t('VideoDetail(还没分析)', el(VideoDetail, {
  v: tkVideo, report: null, analyzed: false, busy: false,
  onBack() {}, onAnalyze() {},
}), ['还没分析过', '分析评论', '/cl-tk-comments'])

t('VideoDetail(已分析)', el(VideoDetail, {
  v: tkVideo, report: tkReport, analyzed: true, busy: false,
  onBack() {}, onAnalyze() {},
}), ['他们被什么打动', '他们走到哪一步了'])

// 样本口径必须出现在报告里 —— 少了它，读的人会把「热评里有一簇」
// 读成「用户普遍认为」（SKILL.md §4 的推论）
t('CommentReport', el(CommentReport, { r: tkReport }),
  ['他们被什么打动', '171 条心动', '热度混排'])

t('Donut', el(Donut, { topics: tkReport.audience.topics, hole: ['240', '条'] }),
  ['只说想要', '└ 多少钱'])
t('Bars', el(Bars, { bars: tkReport.audience.bars }), ['英语'])

// TkPane 三态里最容易错的一个：search 还没读回来
t('TkPane(读取中)', el(TkPane, { search: null, analyses: [], onRun() {} }), ['读取中'])
t('TkPane(列表)', el(TkPane, {
  search: { id: 'tksearch_20260917_aaaa', query: 'camping chair', videos: [tkVideo] },
  analyses: [], onRun() {},
}), ['○ 未分析'])

// 账户图标三态 —— 角标是「要不要点我」的唯一提示，画错了新用户就卡住
/**
 * 「没登录」必须走登录页，不能走错误页。
 *
 * 实测踩过：AccountPage 原来靠**匹配中文文案**判断（msg.includes('未登录')），
 * 而 client-api 抛的是「还没登录。请打开右栏…」—— 一个字都没匹配上，
 * 于是新用户看到的是「读不到账户信息」+ 一句让他去点登录的话，
 * 而那个登录入口根本没渲染出来。死锁。
 *
 * 现在靠 host 透传的 `code: 'not_logged_in'`。这里守住整条链的三段。
 */
console.log('\n未登录判定')
{
  const fs = await import('node:fs')
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url).pathname, 'utf8')
  const api = rd('src/client-api.js')
  const host = rd('src/index.js')
  const page = rd('src/client/AccountPage.js')

  const checks = [
    ['client-api 给没 token 打标记', api.includes("e.code = 'not_logged_in'")],
    ['client-api 把 401 也算没登录', api.includes("if (res.status === 401) e.code = 'not_logged_in'")],
    ['host 把 code 透传给面板', host.includes('code: error?.code')],
    ['面板按 code 判定（不是猜文案）', page.includes("d?.code === 'not_logged_in'")],
    ['面板不再匹配中文文案', !page.includes("msg.includes('未登录')")],
  ]
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`)
    if (!ok) fail += 1
  }
}

console.log('\n账户图标')
{
  const shot = (v) => JSON.stringify(accountIcon(56, v))
  const none = shot(null)
  const out = shot(false)
  const inn = shot(true)
  // null 不画角标；false/true 各自有底色
  const okNone = !none.includes('state-success') && !none.includes('state-warning')
  const okOut = out.includes('state-warning')
  const okIn = inn.includes('state-success')
  console.log(`  null  无角标          ${okNone ? '✓' : '✗'}`)
  console.log(`  false 橙色(去登录)    ${okOut ? '✓' : '✗'}`)
  console.log(`  true  绿色(已登录)    ${okIn ? '✓' : '✗'}`)
  if (!okNone || !okOut || !okIn) fail += 1
}

console.log('\n查表')

const igMeta = rowMeta('cl-ig-pain', { pains: 5, high: 2, fetched: 96, saved_at: Date.now() }).filter(Boolean).join(' · ')
const rdMeta = rowMeta('cl-reddit-pain', { pains: 4, posts: 42, saved_at: Date.now() }).filter(Boolean).join(' · ')
console.log(`  rowMeta(ig)     ${igMeta}`)
console.log(`  rowMeta(reddit) ${rdMeta}`)
if (!igMeta.includes('簇') || !igMeta.includes('高频')) { console.log('  ✗ IG 的列表行不对'); fail += 1 }
if (!rdMeta.includes('痛点')) { console.log('  ✗ Reddit 的列表行不对'); fail += 1 }

const names = MODULES.map((m) => `${m.name}(${m.icon})`).join(' ')
console.log(`  MODULES         ${names}`)
if (MODULES.length !== 4) { console.log('  ✗ 期望四格'); fail += 1 }
if (!MODULES.some((m) => m.icon === 'instagram')) { console.log('  ✗ IG 那格没用 instagram 图标'); fail += 1 }
if (!MODULES.some((m) => m.icon === 'tiktok')) { console.log('  ✗ TK 那格没用 tiktok 图标'); fail += 1 }

/**
 * 每格的图标必须**互不相同** —— 宫格是靠图标认路的，两格同图标等于没分开
 * （modules.js 顶部那条约定）。这比数格子更该守：加一格时最容易犯的错
 * 是随手复用一个已有图标，而那个错在截图上不明显。
 *
 * 例外：人群洞察和痛点洞察都是 reddit —— 它们是同一个平台的两个问题，
 * 且是这条约定写下之前就有的形态。所以只查**非 reddit** 的格子不重复。
 */
const nonReddit = MODULES.filter((m) => m.icon !== 'reddit').map((m) => m.icon)
if (new Set(nonReddit).size !== nonReddit.length) {
  console.log('  ✗ 有两格用了同一个图标'); fail += 1
}

const ig = appIcon('instagram', 56)
console.log(`  IG 图标         ${ig.type} · ${String(ig.props.style.background).slice(0, 28)}…`)
if (!String(ig.props.style.background).includes('gradient')) { console.log('  ✗ IG 图标不是渐变'); fail += 1 }
if (appIcon('reddit', 56).type !== 'svg') { console.log('  ✗ Reddit 图标形状变了（full:true 该直接画 logo）'); fail += 1 }
if (BRAND.instagram === undefined) { console.log('  ✗ BRAND 里没有 instagram'); fail += 1 }
if (S.thumb === undefined) { console.log('  ✗ 样式表缺 thumb（IG 封面图要用）'); fail += 1 }

React.useState = realUseState
console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`)
process.exit(fail > 0 ? 1 : 0)
