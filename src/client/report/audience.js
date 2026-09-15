/**
 * 人群报告 —— 漏斗第一步的产物：这个人群该去哪些社区。
 *
 * 唯一一个**有交互**的报告：版块可以多选，提交后把指令打进对话框
 * （面板自己从不跑分析）。
 */
import { el, useState, useEffect } from '../react.js'
import { S } from '../styles.js'
import { ago } from '../format.js'

/** 订阅数压成 67.6k / 1.9M —— 列表要对齐，精确值没人看。 */
function humanSubs(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}


/** 每个版块的预估额度（搜索 + 拉评论），和 SKILL.md 里的口径一致。 */
const COST_PER_SUB = 9


/**
 * 人群定位报告 —— **唯一一个有输入的报告**。
 *
 * 别的模块是纯只读，这个要收用户勾选的版块。但它仍然不发起任务：
 * 勾完提交 = 往对话框打一条 `/cl-reddit-signal <slug> <版块…>`，
 * 跑不跑、怎么跑、报错怎么办全在对话框里（adding-a-module.md §③）。
 *
 * 勾选状态**故意不落盘**：那是一次性的意图，不是数据。存了就要处理
 * 「上次勾的还算不算数」，而重开面板时用户本来就该重新决定。
 */
function AudienceReport({ r, runId, done = [], onOpen, onSubmit }) {
  const comms = r.communities ?? []
  const skipped = r.skipped ?? []
  const meta = r.meta ?? {}

  /**
   * 已经挖过的版块 → 那次信号运行。
   *
   * ⚠️ 两边的写法不一样，必须规范化后再比：
   * 勾选框的 key 是**裸版块名**（cl-save.js 卡死不许带 r/），
   * 而落盘的 `meta.subreddits` 是模型写的，SKILL.md 的样例里带 `r/`。
   * 直接比字符串会永远不相等 —— 而且是静默的：所有版块都显示成没挖过，
   * 用户照样能提交，只是白花一次额度。
   */
  const bare = (s) => String(s ?? '').replace(/^r\//i, '').toLowerCase()
  const doneBy = new Map()
  for (const run of done) {
    for (const s of run.subreddits ?? []) {
      // 同一个版块挖过多次就留最近那次（list 已按 saved_at 倒序）
      if (!doneBy.has(bare(s))) doneBy.set(bare(s), run)
    }
  }

  // 默认勾选**还没挖过的**：模型已经做过一轮筛选，名单里本来就都是它
  // 推荐的，所以让用户去掉不要的比从零勾起省事；但挖过的不该再默认勾上，
  // 否则最省事的那条路（不改任何勾选直接提交）就是重复挖一遍。
  const fresh = (list) => new Set(
    list.filter((c) => !doneBy.has(bare(c.slug))).map((c) => c.slug))
  const [sel, setSel] = useState(() => fresh(comms))

  // 换一份报告要重置勾选 —— 否则上一次的选择会漏到这一份。
  //
  // 依赖用 runId 而不是 r：对象每次轮询都是新的，用 r 会无限重置。
  // 也不能用 r.slug —— 同一个 slug 现在可以有多次运行，两次之间切换时
  // slug 不变，勾选就不会重置，用户会拿着上一次的选择提交这一次。
  useEffect(() => {
    setSel(fresh(r.communities ?? []))
  }, [runId])

  const toggle = (slug) => setSel((prev) => {
    const next = new Set(prev)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    return next
  })

  // 挖过的不进提交名单，哪怕它在 sel 里（切报告的空隙可能有残留）
  const picked = comms.filter((c) => sel.has(c.slug) && !doneBy.has(bare(c.slug)))

  return el('div', null,
    el('h2', { style: S.h1 }, r.audience ?? r.slug),
    el('p', { style: S.slug },
      el('code', { style: S.code }, r.slug ?? ''),
      r.generated_at ? ` · ${r.generated_at}` : null),

    r.summary
      ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' } }, r.summary)
      : null,

    el('div', { style: S.statRow },
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, comms.length),
        el('span', { style: S.statL }, '候选版块')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, meta.communities_scanned ?? '—'),
        el('span', { style: S.statL }, '扫过')),
    ),

    el('h3', { style: S.layerT }, '选版块'),
    el('div', { style: { ...S.note, marginTop: 4, marginBottom: 8 } },
      '勾上要深挖的，提交后在对话框里接着跑。小版块信噪比高，大版块看声量。'),

    el('div', { style: { ...S.cross, padding: 0 } },
      comms.map((c, i) => {
        const ran = doneBy.get(bare(c.slug))
        return el('label', {
          key: c.slug ?? i,
          style: {
            ...S.pickRow,
            borderTop: i === 0 ? 'none' : S.pickRow.borderTop,
            // 挖过的整行压暗，但**不隐藏** —— 用户要看得见自己挖过什么，
            // 这本身就是「哪些被选中过」的记录
            ...(ran ? S.pickDone : null),
          },
        },
          el('input', {
            type: 'checkbox',
            // 挖过的保持勾着：那是它当初被选中的事实，不是一个可改的输入
            checked: ran ? true : sel.has(c.slug),
            disabled: Boolean(ran),
            onChange: () => toggle(c.slug),
            style: S.pickBox,
          }),
          el('span', { style: S.pickSubs }, humanSubs(c.subscribers)),
          el('span', { style: { flex: 1, minWidth: 0 } },
            el('span', { style: S.xname }, c.name),
            c.brand_owned
              ? el('span', { style: { ...S.xsrc, display: 'inline', marginLeft: 6 } }, '品牌版块')
              : null,
            // 挖过的给一条出路：点「查看」跳到那次信号报告。
            // 这一行同时说明了为什么这个勾选框动不了。
            ran
              ? el('span', { style: { ...S.xsrc, display: 'inline', marginLeft: 6 } },
                  `已挖过 · ${ago(ran.saved_at)}　`,
                  el('a', {
                    href: '#',
                    onClick: (e) => {
                      e.preventDefault()
                      e.stopPropagation()   // 别连带 toggle 了勾选框
                      onOpen?.(ran.id)
                    },
                    style: { color: '#15803d', textDecoration: 'none' },
                  }, '查看 →'))
              : null,
            c.reason ? el('div', { style: S.xverdict }, c.reason) : null,
          ),
        )
      }),
    ),

    // 吸底提交条。预估额度随勾选实时变 —— 用户对「勾一个框」的代价
    // 没有直觉，但对数字有。
    el('div', { style: S.submitBar },
      el('button', {
        type: 'button',
        disabled: picked.length === 0,
        onClick: () => onSubmit(r.slug, picked.map((c) => c.slug)),
        style: { ...S.submitBtn, ...(picked.length === 0 ? S.submitOff : null) },
      }, '挖选品信号'),
      el('span', { style: S.cost },
        picked.length > 0
          ? `已选 ${picked.length} 个 · 预计 ~${picked.length * COST_PER_SUB} 次额度`
          // 全挖过和一个没勾是两回事：前者说「至少选一个」会让人去找
          // 一个根本不存在的可勾项。分开说清楚。
          : comms.every((c) => doneBy.has(bare(c.slug)))
            ? '这份名单里的版块都挖过了'
            : '至少选一个版块'),
    ),

    skipped.length > 0
      ? el('div', { style: { marginTop: 22 } },
          el('h3', { style: S.layerT }, '没选的'),
          el('div', { style: { ...S.note, marginTop: 6 } },
            skipped.map((s, i) =>
              el('div', { key: i, style: { marginBottom: 4 } },
                `${s.name}（${humanSubs(s.subscribers)}）—— ${s.why ?? ''}`),
            ),
          ),
        )
      : null,
  )
}


export { AudienceReport }

