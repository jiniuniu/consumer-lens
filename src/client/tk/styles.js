/**
 * TK 专用样式 —— 一张查表，没有逻辑。
 *
 * 和 client/styles.js 的 S 分开：那张表是三个 Reddit/IG 模块共用的，
 * 而 TK 多了封面、播放器、环形图这些别处没有的东西。混在一起会让
 * 「改这条会影响谁」变得难判断。
 *
 * 颜色一律走 `--dsw-*` 设计 token 加字面量兜底 —— 写死颜色就是不跟主题的根因。
 */

/** 几个反复用到的颜色。和 client/styles.js 同一套 token。 */
const C = {
  text: 'var(--dsw-alias-label-primary, #333)',
  dim: 'var(--dsw-alias-label-secondary, #777)',
  faint: 'var(--dsw-alias-label-tertiary, #999)',
  line: 'var(--border, #e5e3df)',
  fill: 'var(--bg-hover, #f0eeea)',
  brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  ok: '#15803d',
}

/**
 * cls → 颜色。**和 SKILL.md 里那六个值一一对应**，改这里要同步改 skill
 * （cl_save 的 checkTkComments 卡的也是这六个）。
 */
const CLS_COLOR = {
  ask: '#2563eb',    // 购买咨询
  gripe: '#dc2626',  // 顾虑与劝退
  rival: '#b45309',  // 竞品提及
  love: '#15803d',   // 成功种草
  noise: '#6b7280',  // 纯娱乐互动
  none: '#c9c6c0',   // 未归类
}
const clsColor = (c) => CLS_COLOR[c] ?? CLS_COLOR.none

const TK = {
  // ── 视频列表 ──
  bar: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: '0 0 10px', marginBottom: 4,
    borderBottom: `1px solid ${C.line}`,
  },
  select: {
    font: 'inherit', color: 'inherit', background: 'transparent',
    border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 5px',
  },
  tabs: { display: 'flex', gap: 3 },
  tab: {
    border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit',
    color: C.dim, padding: '3px 8px', borderRadius: 5, fontSize: 12,
  },
  tabOn: { background: C.fill, color: C.text, fontWeight: 600 },
  check: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    color: C.dim, cursor: 'pointer', marginLeft: 'auto', fontSize: 12,
  },

  row: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '11px 0', borderBottom: `1px solid ${C.line}`, cursor: 'pointer',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowAuthor: { fontSize: 11, color: C.dim },
  rowFans: { fontSize: 11, color: C.faint },
  // 英文文案两行截断 —— 单行太短读不出内容，不截又会把行撑得很高
  rowDesc: {
    marginTop: 5, lineHeight: 1.5, fontSize: 12.5,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  // note 是模型写的判断，比文案值钱，给背景块托一下
  rowNote: {
    marginTop: 5, padding: '5px 8px', borderRadius: 5, background: C.fill,
    fontSize: 11.5, color: C.dim, lineHeight: 1.55,
  },
  rowStats: {
    fontSize: 11, color: C.dim, marginTop: 6,
    display: 'flex', gap: 10, flexWrap: 'wrap',
    fontVariantNumeric: 'tabular-nums',
  },
  rate: { color: C.ok },
  badgeOn: { fontSize: 11, color: C.ok, flex: 'none' },
  badgeOff: { fontSize: 11, color: C.faint, flex: 'none' },
  tag: {
    fontSize: 10.5, padding: '1px 6px', borderRadius: 4,
    background: C.fill, color: C.dim, flex: 'none',
  },

  // ── 封面 ──
  thumb: {
    width: 62, height: 82, borderRadius: 5, flex: 'none',
    background: C.fill, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbDead: { fontSize: 16, color: C.faint },

  // ── 播放器 ──
  playerWrap: { marginBottom: 10 },
  /**
   * TikTok 的 embed 自己有最小宽度，窄面板里会出横向滚动条；
   * 高度给定值 —— 跨域拿不到它的 scrollHeight。
   */
  iframe: {
    width: '100%', height: 560, border: 0, display: 'block',
    borderRadius: 8, background: C.fill,
  },
  playerFoot: {
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
    fontSize: 11.5, color: C.faint,
  },
  link: { color: 'inherit' },

  // ── 评论报告 ──
  stats: { display: 'flex', gap: 18, flexWrap: 'wrap', margin: '0 0 18px' },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statN: { fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: 11, opacity: 0.6 },
  statSub: { fontSize: 10.5, opacity: 0.45 },

  block: { margin: '0 0 18px' },
  blockTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },

  // 环形图 + 图例
  donutWrap: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  legend: { flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 3 },
  legendRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 },
  legendSub: { opacity: 0.7, paddingLeft: 12 },
  legendLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  legendN: { opacity: 0.6, fontVariantNumeric: 'tabular-nums', flex: 'none' },
  dot: { width: 8, height: 8, borderRadius: 2, flex: 'none', display: 'inline-block' },

  // 条形图
  barRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11.5 },
  barLabel: {
    width: 76, flex: 'none', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  barTrack: { flex: 1, height: 9, borderRadius: 3, background: C.fill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barN: { flex: 'none', opacity: 0.6, fontVariantNumeric: 'tabular-nums', minWidth: 52 },

  // reads：模型写的几句判读，比图值钱
  reads: { margin: '0 0 18px', paddingLeft: 18, fontSize: 12, lineHeight: 1.75, opacity: 0.85 },

  // 分组 / 话题 / 引用
  group: { marginBottom: 16 },
  groupHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  groupTitle: { fontSize: 13.5, fontWeight: 600 },
  groupCount: { fontSize: 11, opacity: 0.55 },
  groupHint: { fontSize: 12, opacity: 0.75, lineHeight: 1.6, marginBottom: 8 },
  topic: {
    marginBottom: 6, borderLeft: `2px solid ${C.line}`, paddingLeft: 10,
  },
  topicHead: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    border: 'none', background: 'transparent', color: 'inherit', font: 'inherit',
    cursor: 'pointer', padding: '4px 0', textAlign: 'left',
  },
  caret: { opacity: 0.5, flex: 'none', fontSize: 10 },
  topicName: { flex: 1, fontSize: 12.5, fontWeight: 500 },
  topicMeta: { fontSize: 11, opacity: 0.55, flex: 'none' },
  quotes: { padding: '2px 0 6px' },
  quote: { marginBottom: 8 },
  quoteText: { fontSize: 12.5, fontStyle: 'italic', lineHeight: 1.55 },
  // 中文是卖家要抄进详情页的那句，不能比原文更弱
  quoteZh: { fontSize: 12, opacity: 0.85, lineHeight: 1.55, marginTop: 2 },
  quoteLikes: { fontSize: 10.5, opacity: 0.5, marginTop: 2 },

  // ── 未分析态 ──
  notYet: {
    padding: '28px 16px', textAlign: 'center', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 10,
  },
  notYetDot: { fontSize: 22, opacity: 0.35 },
  notYetHint: { fontSize: 11.5, opacity: 0.55, lineHeight: 1.6 },
  btn: {
    border: 'none', borderRadius: 6, padding: '7px 14px',
    background: '#000', color: '#fff', font: 'inherit', fontSize: 12,
    fontWeight: 500, cursor: 'pointer',
  },
  btnBusy: { opacity: 0.45, cursor: 'wait' },

  // ── 详情页头 ──
  detailHead: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  back: {
    border: `1px solid ${C.line}`, borderRadius: 5, background: 'transparent',
    color: 'inherit', font: 'inherit', cursor: 'pointer',
    padding: '1px 7px', fontSize: 12, flex: 'none',
  },
  vMeta: { fontSize: 11.5, color: C.dim, lineHeight: 1.7, marginBottom: 14 },
}

export { TK, C, CLS_COLOR, clsColor }
