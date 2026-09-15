/**
 * Reddit 痛点报告 —— 买过并用过的人在骂什么，产出是「产品该改什么」。
 */
import { el } from '../react.js'
import { S } from '../styles.js'

function Report({ r }) {
  // 可选字段缺了就少显示一块，不能让整个报告崩掉 ——
  // cl_save 的校验是宽松的，只保证 product 和 pain_points 在。
  const meta = r.meta ?? {}
  const subs = meta.subreddits ?? []
  const terms = meta.search_terms ?? []
  const pains = r.pain_points ?? []
  const opps = r.opportunities ?? []

  return el('div', null,
    el('h2', { style: S.h1 }, r.product),
    el('p', { style: S.slug },
      el('code', { style: S.code }, r.slug ?? ''),
      r.generated_at ? ` · ${r.generated_at}` : null),

    r.summary ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 12px' } }, r.summary) : null,
    r.demand_validation
      ? el('p', { style: { fontSize: 12.5, opacity: 0.75, lineHeight: 1.7, margin: '0 0 18px' } },
          r.demand_validation)
      : null,

    el('div', { style: S.statRow },
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, meta.posts_collected ?? '—'),
        el('span', { style: S.statL }, '高价值帖')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, meta.posts_scanned ?? '—'),
        el('span', { style: S.statL }, '扫过')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, subs.length),
        el('span', { style: S.statL }, 'subreddit')),
    ),

    // 检索策略要看得见 —— subreddit 的选择本身就是策略的一部分
    (terms.length > 0 || subs.length > 0)
      ? el('div', { style: { ...S.note, marginTop: 0, marginBottom: 20 } },
          terms.length ? el('div', null, '检索词：', terms.join('  /  ')) : null,
          subs.length ? el('div', null, subs.join('　')) : null,
        )
      : null,

    el('h3', { style: S.layerT }, '痛点'),
    pains.map((p, i) =>
      el('section', { key: i, style: { margin: '10px 0 18px' } },
        el('div', { style: { fontWeight: 600, marginBottom: 3 } }, `${i + 1}. ${p.title}`),
        el('div', { style: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.65, marginBottom: 8 } },
          p.description),
        (p.evidence ?? []).map((e, j) =>
          el('div', { key: j, style: S.topic },
            el('div', { style: S.qText }, `“${e.text}”`),
            el('div', { style: { ...S.rowMeta, marginTop: 3 } },
              el('a', {
                href: e.post_url, target: '_blank', rel: 'noreferrer',
                style: { color: 'inherit' },
              }, e.post_title),
              `　·　${e.subreddit}　·　♥${e.score}`),
          ),
        ),
      ),
    ),

    opps.length > 0 ? el('h3', { style: S.layerT }, '机会') : null,
    opps.length > 0 ? el('div', { style: { ...S.cross, marginTop: 10 } },
      opps.map((o, i) =>
        el('div', {
          key: i,
          style: { ...S.xrow, borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)' },
        },
          el('span', null, o.feasibility === 'high' ? '✅' : '🟡'),
          el('span', null,
            el('span', { style: S.xname }, o.title),
            el('div', { style: S.xsrc }, `可行性 ${o.feasibility}`),
            el('div', { style: S.xverdict }, o.note),
          ),
        ),
      ),
    ) : null,
  )
}


export { Report }

