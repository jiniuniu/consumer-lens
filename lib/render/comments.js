/**
 * 把评论排成模型能读的紧凑文本。**格式冻结** —— 它和 SKILL.md 正文死绑，
 * 改这里等于改 skill。反过来，服务端的 JSON 可以随便改，因为只有这里消费它。
 *
 * 去噪和信号标记也在这里 —— 服务端只取数，不替客户端判断哪条评论有价值。
 *
 * **不预设评论区在聊什么。** 评论区可能在讨论痛点，也可能在羡慕、玩梗、质疑、
 * 跑题 —— 都是真实信号，只是指向不同用途。所以这里只做机械清理，
 * 按点赞降序排（唯一不预设主题的排序），聚类交给读这份输出的模型。
 */

/** 纯表情/贴纸/口水话。整条只有这些才算噪声，出现在句子里不算。 */
const NOISE = new RegExp(
  String.raw`^[\s\W_]*(\[sticker\]|\[photo\]|lol|lmao|lmfao|omg|wow|same|this|facts|` +
    String.raw`bro|fr|ikr|yes+|no+|haha+|xd|ur|w|l)?[\s\W_]*$`,
  'i',
)

/**
 * 「用户在讲自己的处境/困难/决策」的语言，不绑任何品类。
 *
 * ⚠️ 这些**只用来打 ! 标记**，不决定排序也不决定去留。
 * 排序一旦按痛点语言来，羡慕/玩梗/质疑这些簇会整体沉底，
 * 读的人会误以为评论区「没东西」。
 */
const SIGNALS = [
  // 第一人称经历：痛点最常见的载体
  /\b(i|my|mine|i'?ve|i'?m)\b.{0,40}\b(have|had|got|bought|tried|use[ds]?|need|want|hate|wish|can'?t|couldn'?t|always|never|keep|kept|struggle\w*)\b/i,
  // 抱怨/故障
  /\b(broke|broken|stopped|died|leak\w*|crack\w*|rust\w*|mold\w*|smell\w*|stain\w*|peel\w*|tangle\w*|jam\w*|doesn'?t|don'?t work|won'?t|useless|waste|annoying|hate|worst|terrible|awful|disappoint\w*|garbage)\b/i,
  // 求推荐/要链接 —— 直接的购买意图
  /\b(where.{0,15}(buy|get)|what|which|who).{0,25}\b(brand|one|model|link|product|is (it|this|that))\b|\b(recommend\w*|link\b|drop the|need this|want this|should i (buy|get))\b/i,
  // 疑问句
  /\?/,
  // 对比/替代方案 —— 说明现有品类没接住需求
  /\b(instead of|vs\b|versus|better than|switched|i just use|i use a|diy|homemade|hack|workaround|alternative|dupe)\b/i,
  // 价格/价值判断
  /(\$\d|\bprice\w*|\bcheap\w*|\bexpensive\b|\bworth it\b|\boverpriced\b|\baffordab\w*|\bbudget\b)/i,
  // 具体数字/单位 —— 有细节的评论通常比空泛感叹有料
  /\b\d+\s?(years?|months?|weeks?|days?|hours?|min\w*|inch\w*|cm|ml|oz|lbs?|kg|cups?|times?)\b/i,
]

const MIN_LEN = 6

/** 剥掉开头的 [Sticker]/[Photo]，后面常跟着真实文本，不能整条丢。 */
function stripSticker(t) {
  return String(t ?? '')
    .replace(/^\s*(\[Sticker\]|\[Photo\])\s*/i, '')
    .trim()
}

/** 机械清理 + 打信号标记 + 按点赞降序。 */
export function clean(comments) {
  return comments
    .map((c) => ({ ...c, text: stripSticker(c.text) }))
    .filter((c) => c.text && !NOISE.test(c.text) && c.text.length >= MIN_LEN)
    .map((c) => ({ ...c, flag: SIGNALS.some((rx) => rx.test(c.text)) }))
    .sort((a, b) => (b.digg_count ?? 0) - (a.digg_count ?? 0))
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '0%')

/**
 * 排成紧凑文本。
 *
 * 头部那几行是**模型的决策输入**，不是装饰 —— 模型看到「高购买意图 33%」
 * 才知道该翻 6 页还是 8 页。
 */
export function render(rows, stats, limit = 0) {
  const out = []

  for (const st of stats) {
    const mine = rows.filter((c) => c.aweme_id === st.aweme_id)
    // 高购买意图按**抓到的**算，不按留下的算 —— 去噪会抬高这个比例，
    // 那会让「评论区是不是在认真讨论」这个判断失真。
    const hpi = st.purchase_intent ?? 0
    out.push(
      `# video ${st.aweme_id}  抓${st.fetched}/平台${st.total_on_platform}` +
        `  留${mine.length}  高购买意图${pct(hpi, st.fetched)}`,
    )
  }

  if (rows.length === 0) {
    out.push('# 无可读评论 —— 确认视频 id 正确、且这条视频有评论')
    return out.join('\n')
  }

  const langs = new Map()
  for (const c of rows) langs.set(c.lang ?? '?', (langs.get(c.lang ?? '?') ?? 0) + 1)
  const langStr = [...langs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  const nFlag = rows.filter((c) => c.flag).length
  const totalDigg = rows.reduce((s, c) => s + (c.digg_count ?? 0), 0)

  out.push(`# 共 ${rows.length} 条待读  总赞 ${totalDigg.toLocaleString('en-US')}  语言 ${langStr}`)
  out.push(`# 其中 ${nFlag} 条(${pct(nFlag, rows.length)}) 带「讲自己处境/决策」的语言(标 !)`)
  out.push('# 多语种 / ! 少 → 多半是氛围向内容，评论区聊的不是产品，按实际主题聚类')
  out.push('# 格式: [序号] ♥点赞 r回复 | 正文   (按点赞降序，不按主题排)\n')

  const sel = limit ? rows.slice(0, limit) : rows
  sel.forEach((c, i) => {
    const mark =
      (c.flag ? '!' : ' ') + (c.purchase_intent ? '💰' : c.author_replied ? '↩' : ' ')
    const text = c.text.replace(/\s+/g, ' ').trim()
    out.push(`[${i + 1}]${mark}♥${c.digg_count} r${c.reply_total} ${c.lang ?? '?'} | ${text}`)
  })

  return out.join('\n')
}
