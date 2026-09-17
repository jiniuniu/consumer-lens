/**
 * TikTok 结果 → 模型能读的紧凑文本。
 *
 * **格式冻结**（DESIGN.md §10 的约定）：SKILL.md 正文依赖头部那几行统计 ——
 * 搜索靠 `engage_rate` 做规则筛，评论靠「高购买意图占比」决定翻几页
 * （那张体检表是省钱的关键）。改格式 = 改 skill。
 *
 * 和 IG 那份的分工不同：IG 的循环燃料是共现标签（免费随帖返回），
 * TK 没有这种东西 —— 它的决策点是**翻页深度**，所以体检数放在最显眼的位置。
 */

/** 文案压到 n 字，去掉换行 —— 一屏要放下几十条，全文会烧光上下文。 */
function squeeze(text, n) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 播放量压成 12.3k / 1.9M —— 一屏几十行，对齐比精确更重要。 */
function human(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}

/**
 * 视频搜索结果。
 *
 * 每行把 SKILL.md §3 规则筛要用的三个数并排打出来（播放 / 互动率 / 评论率），
 * 低于阈值的直接在行尾标出来 —— 那是模型这一步唯一要做的决定。
 *
 * ⚠️ 两个阈值和 SKILL.md 的规则筛是同一套，改这里要一起改：
 *   播放 < 5万      → 声量太小，说明不了问题
 *   互动率 < 0.5%   → 典型「猎奇流量」，很多人划过但没人在意产品
 */
export function renderSearch(videos, stats, limit = 0) {
  const rows = limit > 0 ? videos.slice(0, limit) : videos

  const head = [
    `# tk 搜索「${stats?.keyword ?? '?'}」  命中${videos.length}条`
      + (rows.length !== videos.length ? `  显示${rows.length}` : ''),
  ]

  // 翻页衰减要说明白，免得模型把去重后的结果误判成抓取失败
  if (stats?.note) head.push(`# ${stats.note}`)

  head.push('# 格式: [序号] ▶播放 ♥赞 💬评论 互动率 @作者(粉) 日期 lang | 文案  <aweme_id>')
  head.push('# 规则筛: 播放<5万 或 互动率<0.5% 的直接砍，行尾已标出')
  head.push('# ⚠️ DIY / 自制类不要砍 —— 有人自己动手做，说明市面上买不到合适的，那是选品信号')
  head.push('# ⚠️ 葡语/西语不要直接砍 —— 巴西和墨西哥的 TK 电商很活跃，同款在拉美也在推')

  const body = rows.map((v, i) => {
    const play = v.play_count ?? 0
    const rate = v.engage_rate ?? 0
    let flag = ''
    if (play < 50000) flag = `  ← 播放仅${human(play)}，砍`
    else if (rate < 0.5) flag = `  ← 互动率${rate}%，猎奇流量，砍`

    // padStart 让各列右对齐 —— 这几列是模型逐行比大小的地方，不对齐会读错
    const rateStr = `${rate}%`.padStart(6)
    const fans = v.follower_count ? `(${human(v.follower_count)}粉)` : ''
    return `[${i + 1}] ▶${human(play).padStart(6)} ♥${human(v.digg_count).padStart(6)}`
      + ` 💬${human(v.comment_count).padStart(5)} ${rateStr}`
      + ` @${v.author_name ?? '?'}${fans} ${v.create_time ?? '?'} ${v.lang ?? '?'}`
      + ` | ${squeeze(v.desc, 200)}  <${v.aweme_id}>${flag}`
  })

  return [...head, '', ...body].join('\n')
}

/**
 * 单条视频详情。读评论前先跑这个 —— 评论只有放回视频语境里才读得懂。
 *
 * AI 文章是**第三方视角**，不是「帮你看懂视频」：AI 词全是场景词说明平台也
 * 认为这是氛围内容，有参数/对比词则是讨论向、值得挖深。覆盖率约 4/10，
 * 拿不到是常态 —— 所以缺席要说明白，免得模型以为是调用失败。
 */
export function renderVideo(video, article) {
  const v = video ?? {}
  const out = [
    `# tk 视频 ${v.aweme_id ?? '?'}  @${v.author_name ?? '?'}  ${v.create_time ?? '?'}`,
    `▶${human(v.play_count)} ♥${human(v.digg_count)} 💬${human(v.comment_count)}`
      + ` ↗${human(v.share_count)} ☆${human(v.collect_count)}`
      + `  评论率${v.comment_rate ?? 0}%  ${v.duration_s ?? '?'}s  ${v.region ?? '?'}/${v.lang ?? '?'}`,
  ]

  // 这三个标记直接改变判读方式，单独一行不要埋进上面的数字堆里
  const marks = []
  // 广告的评论区通常在评「氛围」不在评产品
  if (v.is_ad) marks.push('💰 广告/恰饭内容 —— 评论区可能在评氛围，不在评产品')
  if (v.has_shop) marks.push('🛒 挂了小黄车')
  // 评论区出现 "this is fake" / "C'est IA" 时，用这个字段直接证伪或证实
  if (v.created_by_ai) marks.push('🤖 平台标记 AI 生成 —— 可直接回答评论区「这是不是 AI」的质疑')
  if (marks.length) out.push(...marks.map((m) => `# ${m}`))

  // 评论率低 = 看完就划走，没引发讨论，评论区多半挖不出东西
  if ((v.comment_rate ?? 0) < 0.03 && (v.play_count ?? 0) > 1e6) {
    out.push(`# ⚠️ ${human(v.play_count)} 播放才 ${human(v.comment_count)} 评论 —— 看完就划走的氛围内容`)
  }

  out.push('')
  out.push(`文案: ${squeeze(v.desc, 600)}`)
  if (v.hashtags?.length) out.push(`标签: ${v.hashtags.map((h) => `#${h}`).join(' ')}`)
  if (v.url) out.push(`链接: ${v.url}`)

  out.push('')
  if (article) {
    out.push('## 平台自己生成的 SEO 文章（第三方视角，覆盖率约 4/10）')
    if (article.title) out.push(`AI标题: ${article.title}`)
    if (article.desc) out.push(`AI摘要: ${squeeze(article.desc, 400)}`)
    if (article.keywords?.length) out.push(`AI词: ${article.keywords.join(' · ')}`)
    out.push('# AI 词全是场景词 → 平台也认为这是氛围内容；有参数/对比词 → 讨论向，值得挖深')
    out.push('# ⚠️ 文章正文里的产品原理是 AI 推测的（会写 "likely"），不能当事实引用')
  } else {
    out.push('# 没有 AI 文章 —— 覆盖率约 4/10，这是常态，不是调用失败')
  }

  return out.join('\n')
}

/**
 * 视频评论。
 *
 * 头部那两个数是**这个 render 存在的理由**：SKILL.md 的「1 页体检 → 翻几页」
 * 决策表读的就是它们。改这两行 = 改 skill。
 *
 *   高购买意图占比 <10% → 别翻了，换视频 ／ 10~30% → 6 页 ／ ≥30% → 8 页
 *
 * ⚠️ 占比 0% 是**真实结果，不是坏了**（实测一条 656 万播放的 ADHD 吊椅视频
 * 整整 50 条一个都没命中 —— 那是爆火的氛围内容，没人在谈购买）。所以它旁边
 * 必须写清「这条本身就是结论」，否则模型会当成工具故障去重试。
 *
 * 排序是平台的热度混排，**不是按赞降序，也没有任何排序参数**（传了被静默
 * 忽略）。这一条要如实说 —— 它决定了结论里不能写「用户普遍认为」。
 */
export function renderComments(comments, stats, limit = 0) {
  const out = []

  for (const s of stats ?? []) {
    const n = s.fetched ?? 0
    const pi = s.purchase_intent ?? 0
    const pct = n > 0 ? Math.round((pi / n) * 100) : 0

    out.push(`# tk 评论 ${s.aweme_id}  头部${n}条  平台共${s.total_on_platform ?? '?'}条`)
    out.push(`# 高购买意图 ${pi}/${n} = ${pct}%  ← 体检数，决定翻几页`)

    // 建议直接打出来，和 IG 那份的弃标签建议同一个道理：
    // 这是模型这一步唯一要做的决定，让它自己换算容易出错
    if (n === 0) {
      out.push('#   ⚠️ 一条都没抓到 —— 评论区可能被关闭了')
    } else if (pct < 10) {
      out.push('#   → <10%：娱乐/氛围向，别再翻页了。')
      out.push('#     但这不代表「没价值」—— 一个 40% 的人在喊 I need this 的评论区，')
      out.push('#     告诉你的是这条片子卖的是向往感，那是内容/投放层面的结论。')
      out.push('#     ⚠️ 0% 是真实结果，不是工具坏了，不要重试。')
    } else if (pct < 30) {
      out.push('#   → 10~30%：值得翻深，建议 6 页')
    } else {
      out.push('#   → ≥30%：讨论很密，建议 8 页')
    }
  }

  const rows = limit > 0 ? comments.slice(0, limit) : comments
  const langs = {}
  for (const c of comments ?? []) {
    const k = c.lang ?? '?'
    langs[k] = (langs[k] ?? 0) + 1
  }
  const langLine = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ')
  // 单一语种多半在认真讨论；多语种混杂说明是靠画面传播的氛围内容
  out.push(`# 语种 ${langLine}`)

  out.push('# 格式: [序号] ♥赞 💬回复 💰购买意图 lang @作者 | 正文  <cid>')
  out.push('# ⚠️ 排序是平台热度混排，不是按赞降序，也没有任何排序参数 ——')
  out.push('#    所以结论只能写「热评里有一簇在说 X」，不能写「用户普遍认为 X」')
  out.push('# ⚠️ 💰 是平台的分类器，聚合看可信、单条看不可信，别拿它挑评论')
  out.push('')

  for (const [i, c] of rows.entries()) {
    const pi = c.purchase_intent ? ' 💰' : ''
    const reply = c.reply_total ? ` 💬${c.reply_total}` : ''
    // 作者点赞/回复过的评论，说明作者自己也认为这条重要
    const au = c.author_digged ? ' ⭐作者赞' : (c.author_replied ? ' ↩作者回' : '')
    out.push(
      `[${i + 1}] ♥${String(c.digg_count ?? 0).padStart(5)}${reply}${pi}`
      + ` ${c.lang ?? '?'} @${c.user_id ?? '?'}${au} | ${squeeze(c.text, 300)}  <${c.cid}>`,
    )
  }

  return out.join('\n')
}
