/**
 * Instagram 结果 → 模型能读的紧凑文本。
 *
 * **格式冻结**（DESIGN.md §10 的约定）：SKILL.md 正文依赖头部那几行统计 ——
 * 模型靠每个标签的 `条数/命中率` 判断这个标签该不该弃（那就是「标签探针」，
 * 省钱的关键）、靠共现标签决定下一轮搜什么、靠高信号计数决定够不够聚类。
 * 改格式 = 改 skill。
 *
 * 和 Reddit 那份的分工不同：Reddit 的循环燃料是模型换检索词，IG 的燃料是
 * **共现标签**（免费随帖返回），所以这里把它单列一段放在最显眼的位置。
 */

/** caption 压到 n 字，去掉换行 —— 一屏要放下几十条，全文会烧光上下文。 */
function squeeze(text, n) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 互动量压成 12.3k / 1.9M —— 一屏几十行，对齐比精确更重要。 */
function human(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}

/**
 * 标签搜索结果。
 *
 * 头部先报每个标签的命中统计 —— 那是**下一轮搜什么**的依据，比帖子本身
 * 更早被用到，所以放最前面。
 *
 * ⚠️ 两个阈值和 SKILL.md 里的探针规则是同一套，改这里要一起改：
 *   第一页 <12 条  → 标签太小（实测 #pressonnailsfail 全站 3 帖）
 *   命中率 <15%    → 几乎没痛点语言（纯品类词/审美词的典型表现）
 */
export function renderHashtag(posts, stats, cooccurring, signal, limit = 0) {
  const rows = limit > 0 ? posts.slice(0, limit) : posts

  const head = [
    `# ig 标签  命中${posts.length}条  高信号${signal ?? 0}`
      + (rows.length !== posts.length ? `  显示${rows.length}` : ''),
  ]

  // 每个标签一行：准不准一眼看得出来。
  // 弃用建议直接打在行尾 —— 那是模型这一步唯一要做的决定。
  for (const s of stats ?? []) {
    // padStart(4) 让 `0%` / `7%` / `29%` / `100%` 右对齐成一列 ——
    // 这一列是模型逐行比大小的地方，不对齐会读错
    const rate = `${Math.round((s.rate ?? 0) * 100)}%`.padStart(4)
    let flag = ''
    if (s.hits === 0) flag = '  ← 空标签，弃'
    else if (s.hits < 12) flag = `  ← 标签太小(${s.hits}条)，弃`
    else if ((s.rate ?? 0) < 0.15) flag = '  ← 几乎没痛点语言，弃'
    // `(新N)` 是变宽的，不垫的话把后面的命中率挤得参差不齐
    const fresh = `(新${s.new})`.padEnd(7)
    head.push(`#   ${String(s.hits).padStart(3)}条${fresh}命中率${rate}  #${s.tag}${flag}`)
  }

  // 循环的燃料。只来自高信号帖，已滤掉通用词和这轮搜过的。
  if (cooccurring?.length) {
    const line = cooccurring.map((c) => `#${c.tag}:${c.n}`).join('  ')
    head.push(`# 共现标签（高信号帖里长出来的，下一轮的候选）  ${line}`)
  } else {
    head.push('# 共现标签  无 —— 高信号帖里没长出新词，池子可能挖空了')
  }

  head.push('# 格式: [序号] ♥赞 💬评论 ▶播放 类型 @作者 痛点分 | caption  <code>')
  head.push('#       痛点分只是排序信号（正则命中数），不是判定 —— 0 分也可能是真痛点，自己读')
  head.push('#       reel 的 caption 是为算法写的，语气更夸张；post 更接近真人说话')
  head.push('#       拉评论用 cl_ig_comments，code 见每条末尾的 <>')

  const body = rows.map((p, i) => {
    const kind = (p.media_name ?? '?').padEnd(5)
    const paid = p.is_paid_partnership ? ' 💰投放' : ''
    const repost = p.repost_of ? ` ↻转发自${p.repost_of}` : ''
    const play = p.play_count ? ` ▶${human(p.play_count)}` : ''
    return `[${i + 1}] ♥${human(p.like_count)} 💬${human(p.comment_count)}${play}`
      + ` ${kind} @${p.username ?? '?'} 痛${p.pain ?? 0}${paid}${repost}`
      + ` | ${squeeze(p.caption, 260)}  <${p.code}>`
  })

  return [...head, '', ...body].join('\n')
}

/**
 * 评论。
 *
 * 只做交叉验证：单价是帖子的 4 倍、单条信息成本是 caption 的 10 倍，
 * 而且一次只拿回 ~11 条。所以这里要如实报告「买到了多少」——
 * `原始N 留下0` 是互赞团刷屏，不是抓取失败，模型看到不该重试。
 */
export function renderComments(posts, empty, limit = 0) {
  const out = []
  let total = 0
  for (const p of posts ?? []) total += p.count ?? 0

  out.push(`# ig 评论  ${(posts ?? []).length}个帖子  共${total}条`)
  out.push('# 格式: ♥赞 @作者 痛点分 | 正文')
  if (empty?.length) {
    out.push(`# ⚠️ 这些帖子的评论区全是刷屏表情，收了钱但一条可用的都没有：${empty.join(' ')}`)
    out.push('#    这不是抓取失败，别重试 —— 那个评论区本来就没东西')
  }
  out.push('')

  for (const p of posts ?? []) {
    const note = p.raw && !p.count ? '  ← 全是刷屏，无可用内容' : ''
    out.push(`## ${p.code}  原始${p.raw ?? '?'} 留下${p.count ?? 0}${note}`)
    const rows = limit > 0 ? (p.comments ?? []).slice(0, limit) : (p.comments ?? [])
    for (const c of rows) {
      out.push(`♥${human(c.likes)} @${c.username ?? '?'} 痛${c.pain ?? 0} | ${squeeze(c.text, 300)}`)
    }
    out.push('')
  }

  return out.join('\n')
}
