/**
 * 视频详情排版。**格式冻结。**
 *
 * 读评论前先跑这个 —— 评论只有放回视频语境里才读得懂。
 * 一条 `sudden wave might ruin everything` 的评论，不看视频你不知道那是在说
 * 海边约会的场景风险，还是在说产品防水。
 */

const n = (x) => (x ?? 0).toLocaleString('en-US')

export function render(video, article) {
  const out = []

  out.push(`作者   : @${video.author_id} (${video.author_name ?? ''})`)
  out.push(
    `发布   : ${video.create_time}  时长 ${video.duration_s}s  ` +
      `区域 ${video.region ?? '?'}  语言 ${video.lang ?? '?'}`,
  )
  out.push(
    `数据   : ▶${n(video.play_count)} ♥${n(video.digg_count)} ` +
      `💬${n(video.comment_count)} ↗${n(video.share_count)} 🔖${n(video.collect_count)}`,
  )
  // 评论率低 = 看完就划走，评论区多半挖不出东西
  out.push(
    `评论率 : ${video.comment_rate}%` +
      (video.comment_rate < 0.05 ? '   ← 偏低，多半是看完就划走的氛围内容' : ''),
  )
  out.push(`标签   : ${(video.hashtags ?? []).map((h) => '#' + h).join(' ') || '无'}`)
  out.push(
    `广告   : ${video.is_ad ? '是 ← 评论区通常在评氛围，不在评产品' : '否'}` +
      `   带货组件: ${video.has_shop ? '有' : '无'}` +
      `   平台标AI: ${video.created_by_ai ? '是' : '否'}`,
  )
  out.push(`链接   : ${video.url}`)
  out.push('')
  out.push(`文案   : ${video.desc ?? ''}`)

  if (!article) {
    out.push('')
    out.push('AI文章 : 无（覆盖率约 4/10，户外/生活类偏低）')
  } else {
    out.push('')
    out.push(`AI标题 : ${article.title ?? ''}`)
    out.push(`AI摘要 : ${article.desc ?? ''}`)
    // 这些词是平台自己判定的「这条视频在讲什么」，和作者文案是两回事。
    // 全是场景词而没有产品参数词，说明平台也认为这是氛围内容 ——
    // 和评论区的表现互相印证。
    out.push('AI词   : ' + (article.keywords ?? []).join(' / '))
  }

  return out.join('\n')
}
