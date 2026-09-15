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

/** 订阅数压成 67.6k / 1.9M —— 一屏几十行，对齐比精确更重要。 */
function human(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}

/**
 * 版块搜索结果（找人群，不是找帖子）。
 *
 * 头部按体量分档统计 —— 模型要的是**分层选取**：小版块信噪比高、
 * 适合挖痛点，大版块适合看声量，两类都要。只按订阅数排序会让模型
 * 一路挑大的，所以这里先把档位摆出来。
 *
 * `desc` 不截断到很短：那是判断「人群对不对得上」的唯一依据，
 * 截狠了模型只能靠版块名猜。
 */
export function renderCommunities(communities, typeahead, stats, limit = 0) {
  const rows = limit > 0 ? communities.slice(0, limit) : communities

  // 分档的边界和 SKILL.md 里的分层选取规则是同一套，改这里要一起改。
  //
  // 最后一档单独切出 <500 是实测逼出来的：`lash` 一次就回了 r/lashblindness(18)、
  // r/LashifyLashifiends(12) 这种建了没人用的空版块，占了 20 条里的一大半。
  // 不切出来的话「小型」这一档会同时装着 8.8k 的活跃垂直版块和 18 人的鬼城，
  // 模型没法从数字上分辨，而那正是它要做分层选取的依据。
  const tiers = [
    ['巨型 >100万', (n) => n >= 1e6],
    ['大型 10~100万', (n) => n >= 1e5 && n < 1e6],
    ['中型 1~10万', (n) => n >= 1e4 && n < 1e5],
    ['小型 500~1万', (n) => n >= 500 && n < 1e4],
    ['过小 <500', (n) => n < 500],
  ]
  const counts = tiers
    .map(([label, hit]) => [label, communities.filter((c) => hit(c.subscribers)).length])
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label}:${n}`)
    .join('  ')

  const head = [
    `# reddit 版块  命中${communities.length}个`
      + (rows.length !== communities.length ? `  显示${rows.length}` : ''),
  ]

  for (const s of stats ?? []) {
    const flag = s.hits === 0 ? '  ← 零命中，换词' : ''
    head.push(`#   ${s.hits}个(新${s.new})  ${s.query}${flag}`)
  }

  if (counts) head.push(`# 体量分档  ${counts}`)
  head.push('# 格式: [序号] 订阅数 r/版块 | 简介')
  head.push('#       挑版块要分层 —— 小版块挖痛点，大版块看声量，别只挑大的')
  head.push('#       <500 的基本是建了没人用的空版块，搜出来也没帖子，别选')
  head.push('#       版块名大小写敏感，回填 cl_reddit_search 的 subreddits 要照抄')

  const body = rows.map((c, i) => {
    const subs = human(c.subscribers).padStart(6)
    return `[${i + 1}] ${subs} ${c.name} | ${squeeze(c.desc, 200)}`
  })

  const tail = []
  if (typeahead?.length) {
    tail.push('')
    tail.push(`# 补充：自动补全里的版块（${typeahead.length}个，无订阅数）`)
    tail.push('#   这些是版块搜索没返回的，常含品牌自建版块 —— 想看体量要单独搜一次')
    tail.push(`#   ${typeahead.map((n) => `r/${n}`).join('  ')}`)
  }

  return [...head, '', ...body, ...tail].join('\n')
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
