/**
 * 评论聚类报告 —— 画像（数字 + 图）在上，分组原话在下。
 *
 * 顺序是刻意的：**占比比内容更重要**（SKILL.md §5）。一个 40% 是
 * 「向往/代入」的评论区和一个 40% 是「将就方案」的评论区，是两种完全不同的
 * 东西 —— 所以先让人看到构成，再读原话。
 */
import { el, useState } from '../react.js'
import { TK } from './styles.js'
import { Donut, Bars } from './charts.js'

/** 一条引用：原文 + 中译 + 赞数。 */
function Quote({ q }) {
  return el('div', { style: TK.quote },
    el('div', { style: TK.quoteText }, `“${q.text}”`),
    // zh 是必填（cl_save 卡的），但老数据可能没有，所以仍然条件渲染
    q.zh ? el('div', { style: TK.quoteZh }, q.zh) : null,
    typeof q.likes === 'number' && q.likes > 0
      ? el('div', { style: TK.quoteLikes }, `♥ ${q.likes.toLocaleString()}`)
      : null,
  )
}

/** 一个话题：默认收起，点开看引用 —— 一个组下面可能有 20 条引用。 */
function Topic({ t }) {
  const [open, setOpen] = useState(false)
  const quotes = Array.isArray(t.quotes) ? t.quotes : []

  return el('div', { style: TK.topic },
    el('button', {
      type: 'button',
      style: TK.topicHead,
      onClick: () => { setOpen((x) => !x) },
    },
      el('span', { style: TK.caret }, open ? '▾' : '▸'),
      el('span', { style: TK.topicName }, t.name),
      el('span', { style: TK.topicMeta },
        typeof t.count === 'number' ? `${t.count} 条` : '',
        typeof t.likes === 'number' && t.likes > 0 ? ` · ♥${t.likes.toLocaleString()}` : '',
      ),
    ),
    open
      ? el('div', { style: TK.quotes }, quotes.map((q, i) => el(Quote, { key: i, q })))
      : null,
  )
}

/** 一组：标题 + 那句判断 + 若干话题。 */
function Group({ g }) {
  const topics = Array.isArray(g.topics) ? g.topics : []
  return el('div', { style: TK.group },
    el('div', { style: TK.groupHead },
      el('span', { style: TK.groupTitle }, g.title ?? '(无标题)'),
      typeof g.count === 'number'
        ? el('span', { style: TK.groupCount }, `${g.count} 条`) : null,
    ),
    // hint 是模型写的判断，比标题有用得多，别藏起来
    g.hint ? el('div', { style: TK.groupHint }, g.hint) : null,
    topics.map((t, i) => el(Topic, { key: i, t })),
  )
}

/**
 * 整份报告。
 *
 * 所有字段都条件渲染 —— cl_save 的校验是宽松的，只保证 video.id、groups
 * 和每条 quote 的 text/zh 在，其余（stats、topics、bars、reads）
 * 都是模型按情况写的，缺了就少显示一块，不能让整个报告崩掉。
 */
function CommentReport({ r }) {
  const groups = Array.isArray(r.groups) ? r.groups : []
  const a = r.audience ?? {}
  const stats = a.stats
  const caveats = r.data_note?.caveats ?? []

  return el('div', null,
    Array.isArray(stats) && stats.length > 0
      ? el('div', { style: TK.stats }, stats.map((st, i) =>
          el('div', { key: i, style: TK.stat },
            el('div', { style: TK.statN }, st.n),
            el('div', { style: TK.statLabel }, st.label),
            st.sub ? el('div', { style: TK.statSub }, st.sub) : null,
          )))
      : null,

    // 人群构成：默认画环；topics_pie === false 才退回条形
    // （分档通常 4-6 档，环形读得出占比；只有明确说不适合才用条）
    Array.isArray(a.topics) && a.topics.length > 0
      ? el('div', { style: TK.block },
          el('div', { style: TK.blockTitle }, a.topics_title ?? '他们走到哪一步了'),
          a.topics_pie === false
            ? el(Bars, { bars: a.topics })
            : el(Donut, { topics: a.topics, hole: a.topics_hole }))
      : null,

    // 语种/参与度这类长尾，用条形
    Array.isArray(a.bars) && a.bars.length > 0
      ? el('div', { style: TK.block },
          el('div', { style: TK.blockTitle }, a.bars_title ?? '分布'),
          el(Bars, { bars: a.bars }))
      : null,

    // reads 是模型写的几句判读，比图更值钱
    Array.isArray(a.reads) && a.reads.length > 0
      ? el('ul', { style: TK.reads },
          a.reads.map((x, i) => el('li', { key: i }, x)))
      : null,

    groups.map((g, i) => el(Group, { key: i, g })),

    /**
     * 样本口径 —— 放在最后但不能省。
     *
     * 平台给的是热度混排，这批不是随机样本。少了这一段，读的人会把
     * 「热评里有一簇在说 X」读成「用户普遍认为 X」（SKILL.md §4 的推论）。
     */
    caveats.length > 0
      ? el('div', { style: { fontSize: 11, opacity: 0.5, marginTop: 18, lineHeight: 1.7 } },
          caveats.map((c, i) => el('div', { key: i }, `· ${c}`)))
      : null,
  )
}

export { CommentReport }
