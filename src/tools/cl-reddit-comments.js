/**
 * cl_reddit_comments —— 批量拉帖子评论。
 *
 * 痛点的细节几乎都在评论里：标题说「这东西坏了」，评论才说
 * 「第二周密封圈裂了」。搜完一定要再拉一轮评论才聚得出真痛点。
 */
import { call } from '../client-api.js'
import { renderComments } from '../render/reddit.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_reddit_comments',
    description:
      '拉 Reddit 帖子的评论（顶层，按赞降序）。id 用 cl_reddit_search 输出里 <> 中那串，'
      + '已带 t3_ 前缀直接传。每个帖子消耗 1 次额度 —— 先挑评论数多、和主题最相关的十来条，'
      + '不要把搜到的帖子全拉一遍。',
    parameters: {
      type: 'object',
      properties: {
        post_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '帖子 id，1~25 个，形如 t3_1v0qqqb。',
        },
        sort: {
          type: 'string',
          description: 'TOP / NEW / CONTROVERSIAL。默认 TOP。',
        },
        limit: {
          type: 'integer',
          description: '每个帖子最多取几条评论。默认 40。',
        },
      },
      required: ['post_ids'],
    },
    async execute({ post_ids, sort = 'TOP', limit = 40 }) {
      return call(ctx, config.apiBase, '/v1/reddit/comments', { post_ids, sort, limit }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        return [{ type: 'text', text: renderComments(value.posts ?? [], 0) }]
      },
    },
  })
}
