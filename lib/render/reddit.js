/**
 * Reddit 结果 → 模型能读的紧凑文本。
 *
 * **格式冻结**（DESIGN.md §10 的约定）：SKILL.md 正文依赖头部那几行统计
 * 和 `[n]` 行格式 —— 模型靠 `hits` 判断这轮检索词猜得准不准、靠 `♥/💬`
 * 决定拉哪几条的评论。改格式 = 改 skill。
 */

/** 正文压到 n 字，去掉换行 —— 一屏要放下几十条，全文会烧光上下文。 */
function squeeze(text, n) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/**
 * 搜索结果。
 *
 * 头部先报每条检索词的命中数 —— 那是**下一轮换什么词**的依据，
 * 比帖子本身更早被用到，所以放最前面。
 */
export function renderSearch(posts, stats, limit = 0) {
  const rows = limit > 0 ? posts.slice(0, limit) : posts

  const head = [
    `# reddit 搜索  命中${posts.length}条`
      + (rows.length !== posts.length ? `  显示${rows.length}` : ''),
  ]

  // 每条检索词一行：准不准一眼看得出来
  for (const s of stats ?? []) {
    const flag = s.hits === 0 ? '  ← 零命中，换词' : ''
    head.push(`#   ${s.hits}条(新${s.new})  ${s.query}${flag}`)
  }

  const subs = {}
  for (const p of posts) subs[p.subreddit] = (subs[p.subreddit] ?? 0) + 1
  const subLine = Object.entries(subs)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
  if (subLine) head.push(`# 版块分布  ${subLine}`)

  head.push('# 格式: [序号] ♥赞 💬评论 版块 日期 | 标题 :: 正文摘要')
  head.push('#       拉评论用 cl_reddit_comments，id 见每条末尾的 <t3_xxx>')

  const body = rows.map((p, i) => {
    const title = squeeze(p.title, 110)
    const bodyTxt = p.body ? `  ::  ${squeeze(p.body, 220)}` : ''
    const flair = p.flair ? ` [${p.flair}]` : ''
    return `[${i + 1}] ♥${p.score} 💬${p.comments} ${p.subreddit}${flair} ${p.created}`
      + ` | ${title}${bodyTxt}  <${p.id}>`
  })

  return [...head, '', ...body].join('\n')
}

/**
 * 评论。
 *
 * 痛点的细节几乎都在这里 —— 标题说「这东西坏了」，评论才说
 * 「第二周密封圈裂了」。所以按帖子分组，保留归属。
 */
export function renderComments(posts, limit = 0) {
  const out = []
  let total = 0
  for (const p of posts) total += p.count ?? 0

  out.push(`# reddit 评论  ${posts.length}个帖子  共${total}条`)
  out.push('# 格式: ♥赞 作者 | 正文')
  out.push('')

  for (const p of posts) {
    out.push(`## ${p.post_id}  ${p.count}条`)
    const rows = limit > 0 ? p.comments.slice(0, limit) : p.comments
    for (const c of rows) {
      out.push(`♥${c.score} ${c.author ?? '?'} | ${squeeze(c.text, 300)}`)
    }
    out.push('')
  }

  return out.join('\n')
}
