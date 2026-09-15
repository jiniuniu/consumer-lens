/**
 * cl_ig_comments —— 拉帖子评论，**交叉验证用，不是主力信号**。
 *
 * 这是全流程最贵的一段。实测 press-on-nails 那次：搜索 19 次花 $0.038，
 * 评论 12 次花 $0.096 —— 占总成本 72%。要省钱先砍这里，不是砍标签探测
 * （标签探测看着「跑了 10 个标签很浪费」，其实全部加起来才 1/3 的钱）。
 *
 * 而且买不到多少东西：单价是帖子的 4 倍，一次只拿回 ~11 条
 * （`has_more` 恒 False，一条 216 评论的帖子只给 14 条），
 * 单条信息成本是 caption 的 10 倍。所以主力信号走 caption。
 */
import { call } from '../client-api.js'
import { renderComments } from '../render/instagram.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_ig_comments',
    description:
      '拉 Instagram 帖子的评论（平台挑的热评，一次约 11 条）。'
      + 'code 用 cl_ig_hashtag 输出里 <> 中那串。'
      + '⚠️ 这是最贵的一步：单价是取帖的 4 倍，而且一次只给 ~11 条、拿不全。'
      + '只对「评论数 ≥30 且确实是核心证据」的帖子拉，一次别超过 8 个 —— '
      + '主力信号应该来自 caption（覆盖率 100%），评论只做交叉验证。'
      + '转发帖不用拉（评论区和原帖重复）。',
    parameters: {
      type: 'object',
      properties: {
        codes: {
          type: 'array',
          items: { type: 'string' },
          description:
            '帖子短码，1~8 个，形如 CfwRnTrprxx。'
            + '挑的时候看两个数：评论数 ≥30（太少的清掉表情后只剩 1-2 条，买不到东西）、'
            + '痛点分高或互动量大。不要把搜到的帖子全拉一遍。',
        },
        limit: {
          type: 'integer',
          description: '每个帖子最多取几条评论。默认 0（全给）—— 本来也只有 ~11 条。',
        },
      },
      required: ['codes'],
    },
    async execute({ codes, limit = 0 }) {
      return call(ctx, config.apiBase, '/v1/instagram/comments', {
        codes, limit,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        return [{
          type: 'text',
          text: renderComments(value.posts ?? [], value.empty_comment_posts ?? [], 0),
        }]
      },
    },
  })
}
