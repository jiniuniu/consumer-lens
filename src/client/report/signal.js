/**
 * 选品信号报告 —— 「有人明确想要一个买不到的东西」。
 *
 * 「空白」那一档是用户真正在找的东西，所以状态图标和颜色单列一张表。
 */
import { el } from '../react.js'
import { S } from '../styles.js'
import { ago } from '../format.js'

/** 信号状态 → 颜色和图标。「空白」是用户最关心的那档，给最强的视觉。 */
const SIGNAL_STATUS = {
  空白: { icon: '🟢', note: '没人答得上来' },
  不满: { icon: '🟡', note: '有货但在被骂' },
  已满足: { icon: '⚪', note: '已有认可的品牌' },
}


/**
 * 选品信号报告 —— 纯只读，没有输入。
 *
 * 排序不在这里做：模型落盘时是按它的判断排的，面板再排一次会让
 * 「为什么这条在最前」变得不可解释。
 */
function SignalReport({ r, done = [], onOpen, onDig }) {
  const meta = r.meta ?? {}
  const signals = r.signals ?? []
  const picks = r.picks ?? []
  const subs = meta.subreddits ?? []

  /**
   * 已经挖过痛点的品类 → 那次痛点运行。
   *
   * 按**品类词**认，因为那正是点按钮时打进去的参数（`s.category`）。
   * 痛点报告落盘的 `product` 是模型写的，多半就是这个词，但它可能顺手
   * 改写（「耐高温硅胶戒指」→「耐高温硅胶戒指（焊工用）」），所以用
   * 包含匹配兜一层，比严格相等鲁棒 —— 认不出来最多是按钮没变成「查看」，
   * 不会误把两个不同的品当成同一个。
   */
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  const doneFor = (category) => {
    const c = norm(category)
    if (!c) return null
    return done.find((p) => {
      const n = norm(p.name)
      return n === c || n.includes(c) || c.includes(n)
    }) ?? null
  }

  return el('div', null,
    el('h2', { style: S.h1 }, r.audience ?? r.slug),
    el('p', { style: S.slug },
      el('code', { style: S.code }, r.slug ?? ''),
      r.generated_at ? ` · ${r.generated_at}` : null),

    r.summary
      ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 12px' } }, r.summary)
      : null,

    el('div', { style: S.statRow },
      el('div', { style: S.statBox },
        el('span', { style: S.statV },
          signals.filter((s) => s.status === '空白').length),
        el('span', { style: S.statL }, '空白')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, signals.length),
        el('span', { style: S.statL }, '条信号')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, meta.posts_picked ?? '—'),
        el('span', { style: S.statL }, '有信号帖')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, meta.posts_scanned ?? '—'),
        el('span', { style: S.statL }, '扫过')),
    ),

    (subs.length > 0 || meta.time_range)
      ? el('div', { style: { ...S.note, marginTop: 0, marginBottom: 20 } },
          subs.length ? el('div', null, subs.join('　')) : null,
          meta.time_range ? el('div', null, `时间范围：${meta.time_range}`) : null,
        )
      : null,

    el('h3', { style: S.layerT }, '信号'),
    signals.map((s, i) => {
      const st = SIGNAL_STATUS[s.status] ?? { icon: '·', note: s.status ?? '' }
      return el('section', { key: i, style: { margin: '10px 0 18px' } },
        el('div', { style: { fontWeight: 600, marginBottom: 3 } },
          `${st.icon} ${s.title}`),
        el('div', { style: { ...S.xsrc, marginBottom: 5 } },
          // category 是能去 1688 搜的品类词 —— 报告里要突出，用户会直接拿去用
          el('code', { style: S.code }, s.category ?? ''),
          st.note ? `　·　${st.note}` : null),
        s.description
          ? el('div', {
              style: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.65, marginBottom: 8 },
            }, s.description)
          : null,
        s.existing
          ? el('div', { style: { ...S.xsrc, marginBottom: 8 } }, `现有：${s.existing}`)
          : null,
        (s.evidence ?? []).map((e, j) =>
          el('div', { key: j, style: S.topic },
            el('div', { style: S.qText }, `“${e.text}”`),
            el('div', { style: { ...S.rowMeta, marginTop: 3 } },
              el('a', {
                href: e.post_url, target: '_blank', rel: 'noreferrer',
                style: { color: 'inherit' },
              }, e.post_title),
              `　·　${e.subreddit ?? ''}　·　💬${e.comments ?? 0}`),
          ),
        ),

        /**
         * 接着挖这个品的痛点 —— 漏斗的第三步入口。
         *
         * **「已满足」那档不给按钮**：站内已有认可的品牌，挖痛点是把额度
         * 花在一个已经没有空位的品上。这个判断 status 字段已经做了，
         * UI 照着它走就行，不要让用户自己再判一次。
         */
        (() => {
          if (!s.category || s.status === '已满足') return null
          const ran = doneFor(s.category)
          // 挖过的：按钮变「查看」，不再给重跑的入口 —— 重跑一个已经有
          // 结果的品是纯粹的额度浪费，而按钮长得一样的话用户分不出来。
          if (ran) {
            return el('button', {
              type: 'button',
              onClick: () => onOpen?.(ran.id),
              style: S.digDone,
            }, `已挖过 ${ran.pains ?? 0} 个痛点 · ${ago(ran.saved_at)} · 查看 →`)
          }
          return onDig
            ? el('button', {
                type: 'button',
                onClick: () => onDig(s.category),
                style: S.digBtn,
              }, `💢 挖「${s.category}」的痛点 →`)
            : null
        })(),
      )
    }),

    picks.length > 0 ? el('h3', { style: S.layerT }, '建议') : null,
    picks.length > 0
      ? el('div', { style: { ...S.cross, marginTop: 10 } },
          picks.map((p, i) =>
            el('div', {
              key: i,
              style: {
                ...S.xrow,
                borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)',
              },
            },
              el('span', null, '→'),
              el('span', null,
                el('span', { style: S.xname }, p.title),
                el('div', { style: S.xverdict }, p.why),
              ),
            ),
          ),
        )
      : null,
  )
}


export { SignalReport }

