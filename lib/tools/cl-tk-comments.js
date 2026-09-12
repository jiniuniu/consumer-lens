/**
 * cl_tk_comments —— 抓评论，去噪，排成模型能读的紧凑文本。
 *
 * 去噪和排序在 render 里做（客户端），服务端只取数。
 */
import { call } from '../client-api.js'
import { clean, render } from '../render/comments.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_tk_comments',
    description:
      '抓 TikTok 视频的评论区，清掉纯表情/贴纸噪声，按点赞降序排成紧凑文本。' +
      '输出头部给出「高购买意图占比」——这是评论区是不是在认真讨论的指标，' +
      '先跑 pages=1 体检，再决定翻几页。每页消耗 1 次额度。',
    parameters: {
      type: 'object',
      properties: {
        aweme_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '一个或多个视频 id。多条会合并成一份输出。',
        },
        pages: {
          type: 'integer',
          description:
            '每条视频翻几页（每页约 50 条）。先用 1 体检；高购买意图 10~30% 翻 6 页，≥30% 翻 8 页。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 条（按点赞降序）。评论多到烧上下文时用，0=全打。',
        },
      },
      required: ['aweme_ids'],
    },
    async execute({ aweme_ids, pages = 1 }) {
      return call(ctx, config.apiBase, '/v1/tiktok/comments', { aweme_ids, pages })
    },
    output: {
      schema: { type: 'object' },
      /**
       * 纯投影。**格式冻结** —— 头部那几行是模型的决策输入，不是装饰。
       */
      render(args, value) {
        const rows = clean(value.comments ?? [])
        return [{ type: 'text', text: render(rows, value.stats ?? [], args?.limit ?? 0) }]
      },
    },
  })
}
