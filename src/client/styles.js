/**
 * 样式表 —— 一张查表，没有逻辑。
 *
 * 全部用 `--dsw-*` 设计 token 加字面量兜底：token 定义在
 * ui-theme/src/styles/design-platform.css，挂在 body 上（深色是
 * `body[data-ds-dark-theme]`），所以内联 var() 会继承、并跟着主题自动切换。
 * 写死颜色就是不跟主题的根因。
 */
const S = {
  // height:100% 会在「父级没有确定高度」时塌成 0 —— 原生 seat 的容器
  // 不保证给高度（旧的 better-sidebar 给）。用 flex:1 + minHeight 兜底：
  // 父级是 flex 就撑满，不是 flex 就用 minHeight 保证看得见。
  wrap: {
    display: 'flex', flex: 1, minHeight: 320, height: '100%',
    fontSize: 13, overflow: 'hidden',
  },
  // 右栏本来就窄，list 给 168 就够：一行一个品名 + 一行摘要。
  side: {
    width: 168, flex: 'none', borderRight: '1px solid var(--border, #e5e3df)',
    overflowY: 'auto', padding: '0 0 8px',
  },
  sideHead: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 8px',
    borderBottom: '1px solid var(--border, #e5e3df)', marginBottom: 4,
    position: 'sticky', top: 0, background: 'var(--bg, transparent)',
  },
  backBtn: {
    border: '1px solid var(--border, #e5e3df)', borderRadius: 5,
    background: 'transparent', color: 'inherit', font: 'inherit',
    cursor: 'pointer', padding: '1px 7px', fontSize: 12, flex: 'none',
  },
  main: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  row: {
    padding: '8px 12px', cursor: 'pointer', borderLeft: '2px solid transparent',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  rowOn: { background: 'var(--bg-hover, #f0eeea)', borderLeftColor: '#15803d' },
  rowName: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 11, opacity: 0.6 },
  // IG 证据的封面图。固定宽高比避免加载时抖动；签名过期就是空位，
  // 所以 onError 之后直接隐藏，不占位、不显示碎图标。
  thumb: {
    width: 56, height: 56, objectFit: 'cover', borderRadius: 4,
    flex: 'none', background: 'var(--bg-hover, #f0eeea)',
  },
  evRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },

  // ── IG 内嵌原帖 ──────────────────────────────────────────────
  /** 「▸ 看原帖」/「▾ 收起」—— 轻量，不抢证据正文的注意力。 */
  igToggle: {
    appearance: 'none', border: 0, background: 'none', padding: 0,
    marginTop: 6, font: 'inherit', fontSize: 11.5, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary, #888)', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  igLink: {
    fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary, #888)',
    whiteSpace: 'nowrap',
  },
  /**
   * iframe 的容器。**固定高度**：IG embed 自己的高度由内容决定，
   * 而跨域拿不到它的 scrollHeight，所以只能给一个够用的定值。
   * 540 能完整显示方图 + 作者行；竖图会裁掉一点，可以接受。
   */
  igFrameWrap: {
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e3df)',
    borderRadius: 8, overflow: 'hidden',
    background: 'var(--bg-hover, #f0eeea)',
    maxWidth: 400,
  },
  igFrame: {
    width: '100%', height: 540, border: 0, display: 'block',
  },
  /** 兜底那行 —— 白屏检测不到，所以这行常驻。 */
  igFoot: {
    display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400,
    marginTop: 4, fontSize: 11.5, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary, #888)',
  },
  // 中文意思 —— 卖家要抄进详情页的就是这句，所以它不能比原文更弱。
  zhText: { fontSize: 12.5, opacity: 0.85, lineHeight: 1.6, marginTop: 3 },
  empty: { padding: 24, opacity: 0.6, lineHeight: 1.8 },
  warn: {
    border: '1px solid rgba(180,112,14,0.45)', background: 'rgba(180,112,14,0.08)',
    borderRadius: 6, padding: '11px 13px', marginBottom: 14, fontSize: 12.5,
  },
  h1: { fontSize: 17, fontWeight: 600, margin: '0 0 4px' },
  statRow: { display: 'flex', gap: 20, flexWrap: 'wrap', margin: '0 0 20px' },
  statBox: { display: 'flex', flexDirection: 'column', gap: 2 },
  statV: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  statL: { fontSize: 11, opacity: 0.6 },
  topic: {
    margin: '0 0 12px', paddingLeft: 12,
    borderLeft: '2px solid var(--border, #e5e3df)',
  },
  qText: { fontStyle: 'italic' },
  note: { fontSize: 11, opacity: 0.5, marginTop: 20, lineHeight: 1.7 },

  // ── 宫格 ──
  // 三级导航都是单栏（grid / list / report 各占满宽），不再左右分栏：
  // 右栏本来就窄，再切一刀两边都不够用。
  single: { flex: 1, minHeight: 320, height: '100%', overflowY: 'auto', padding: '16px 18px', fontSize: 13 },
  slug: { fontSize: 12, opacity: 0.6, margin: '0 0 20px' },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
  layer: { margin: '0 0 20px' },
  layerT: { fontSize: 14, fontWeight: 600 },
  // app 图标网格：92px 一格，窄面板也能并排放下三四个
  grid: { display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' },
  appCell: {
    border: 'none', background: 'transparent', color: 'inherit', font: 'inherit',
    cursor: 'pointer', padding: '12px 4px', borderRadius: 10,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
  },
  appName: {
    fontSize: 12, fontWeight: 500, textAlign: 'center', lineHeight: 1.3,
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cell: {
    border: '1px solid var(--border, #e5e3df)', borderRadius: 8,
    padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7,
    minHeight: 84, textAlign: 'left', font: 'inherit', color: 'inherit',
    background: 'transparent', cursor: 'pointer',
  },
  cellOff: { opacity: 0.45, cursor: 'not-allowed' },
  cross: { border: '1px solid var(--border, #e5e3df)', borderRadius: 8, padding: '2px 0' },
  xrow: { display: 'flex', gap: 9, padding: '9px 13px', alignItems: 'flex-start' },
  xname: { fontWeight: 500 },
  xsrc: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  xverdict: { fontSize: 11.5, marginTop: 3 },

  // ── 版块多选 ──
  pickRow: {
    display: 'flex', gap: 9, padding: '9px 11px', alignItems: 'flex-start',
    cursor: 'pointer', borderTop: '1px solid var(--border, #e5e3df)',
  },
  pickBox: { marginTop: 2, flex: 'none', cursor: 'pointer' },
  pickSubs: {
    fontSize: 11, opacity: 0.6, fontVariantNumeric: 'tabular-nums',
    flex: 'none', minWidth: 42, textAlign: 'right',
  },
  // 提交条吸底：版块多时用户滚到一半就想提交，不该再滚回去找按钮
  submitBar: {
    position: 'sticky', bottom: 0, marginTop: 14, padding: '10px 0 4px',
    background: 'var(--bg, #faf9f7)',
    borderTop: '1px solid var(--border, #e5e3df)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  submitBtn: {
    border: 'none', borderRadius: 6, padding: '7px 14px',
    background: '#15803d', color: '#fff', font: 'inherit', fontWeight: 500,
    cursor: 'pointer', flex: 'none',
  },
  submitOff: { opacity: 0.4, cursor: 'not-allowed' },
  cost: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.5 },
  /**
   * 信号条目里的「接着挖痛点」。
   *
   * 深色实心 —— 它是漏斗第三步的入口，是这一屏最该被点的东西。
   * 早先做成描边是怕它跟人群页的主按钮抢，但那两个按钮不同屏，
   * 抢不起来；在信号页上它反而被淹没了。
   */
  digBtn: {
    marginTop: 8, padding: '6px 12px', borderRadius: 6,
    border: 'none', background: '#9a3412', color: '#fff',
    font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  // 已挖过 —— 压平成描边灰字，一眼区别于可点的那个，但仍能点进去看
  digDone: {
    marginTop: 8, padding: '6px 12px', borderRadius: 6,
    border: '1px solid var(--border, #d9d5cf)', background: 'transparent',
    font: 'inherit', fontSize: 12, cursor: 'pointer', opacity: 0.65,
    color: 'inherit',
  },
  // 已挖过的版块行：压暗但不隐藏 —— 它是「当初选了哪些」的记录
  pickDone: { opacity: 0.5 },
}

export { S }
