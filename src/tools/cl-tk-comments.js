/**
 * cl_tk_comments —— 抓一条视频的评论区。
 *
 * 流程是**先 1 页体检再决定翻几页** —— 输出头部的「高购买意图占比」就是
 * 那个体检数（见 render/tiktok.js 的格式冻结说明）。服务端按
 * (aweme_id, cursor) 缓存，所以第二次翻深时第一页不重复计费。
 *
 * 收数组是为了配额预检能一次算准 len × pages，但实际用法几乎总是一条 ——
 * 一条视频一份分析。
 */
import { call } from '../client-api.js'
import { renderComments } from '../render/tiktok.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_tk_comments',
    description:
      '抓 TikTok 视频的评论区（每页约 50 条）。'
      + '**先用 pages=1 体检** —— 输出头部会报「高购买意图占比」，'
      + '<10% 说明是娱乐/氛围向别再翻了，10~30% 翻 6 页，≥30% 翻 8 页。'
      + '⚠️ 占比 0% 是真实结果不是工具故障，不要重试（爆火的氛围内容就是这样）。'
      + '每页消耗 1 次额度。',
    parameters: {
      type: 'object',
      properties: {
        aweme_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '视频 id，19 位数字。通常只给一条 —— 一条视频一份分析。',
        },
        pages: {
          type: 'integer',
          description:
            '每条视频翻几页，每页约 50 条。默认 1（体检）。'
            + '⚠️ 一页顶多 50 条，3 页只有 150 条，拆二级话题根本不够分 —— '
            + '要聚出「给妈买」「露营用」这种二级话题得翻到 8 页（300+ 条）。'
            + '翻页有衰减：第 3 页起平台给重复的（已按 cid 去重），'
            + '实测 49/49/30/38 递减，8 页拿到 250~320 条是正常的，不是抓失败。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 条。评论多到烧上下文时用，0=全打。',
        },
      },
      required: ['aweme_ids'],
    },
    async execute({ aweme_ids: awemeIds, pages = 1 }) {
      return call(ctx, config.apiBase, '/v1/tiktok/comments', {
        aweme_ids: awemeIds, pages,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      /**
       * 纯投影。**格式冻结** —— 头部那两行体检数是 SKILL.md 决策表的输入。
       */
      render(args, value) {
        return [{
          type: 'text',
          text: renderComments(value.comments ?? [], value.stats ?? [], args?.limit ?? 0),
        }]
      },
    },
  })
}
