/**
 * cl_reddit_search —— 一轮循环搜索。
 *
 * 收**一批**检索词而不是一条：这个模块的用法是循环逼近 —— 模型猜几个词，
 * 看回来的准不准，不准就换一批再来。一次过线跑完一轮比来回打省往返。
 *
 * subreddit 的选择本身就是检索策略的一部分，所以 subreddits 是一等参数。
 */
import { call } from '../client-api.js'
import { renderSearch } from '../render/reddit.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_reddit_search',
    description:
      '在 Reddit 上搜帖子。一次可以给多个检索词 × 多个版块，跑完一轮返回去重后的帖子，'
      + '并逐条报告每个检索词命中几条 —— 零命中说明那个词或版块选错了，下一轮换掉。'
      + '每个「检索词 × 版块 × 页」消耗 1 次额度，所以先用 pages=1 试水再决定翻页。',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            '检索词，1~8 个。用买家自己会说的话，不要用品类术语 —— '
            + '「steamer leaks」比「garment steamer quality issue」召回好得多。',
        },
        subreddits: {
          type: 'array',
          items: { type: 'string' },
          description:
            '限定版块（不带 r/ 前缀也行），最多 10 个。留空=全站搜。'
            + '注意：传 N 个版块 = N 倍调用次数。先全站搜一轮看帖子落在哪些版块，再定向。',
        },
        pages: {
          type: 'integer',
          description: '每个检索词翻几页（每页约 7 条）。默认 1。',
        },
        sort: {
          type: 'string',
          description: 'TOP / HOT / NEW / COMMENTS / RELEVANCE。默认 TOP。找痛点用 TOP。',
        },
        time_range: {
          type: 'string',
          description: 'hour/day/week/month/year/all。默认 year。产品类痛点用 year 或 all。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 条。帖子多到烧上下文时用，0=全打。',
        },
      },
      required: ['queries'],
    },
    async execute({ queries, subreddits = [], pages = 1, sort = 'TOP', time_range = 'year' }) {
      return call(ctx, config.apiBase, '/v1/reddit/search', {
        queries, subreddits, pages, sort, time_range,
      })
    },
    output: {
      schema: { type: 'object' },
      /** 纯投影。**格式冻结** —— 头部的命中统计是模型换词的决策输入。 */
      render(args, value) {
        return [{
          type: 'text',
          text: renderSearch(value.posts ?? [], value.stats ?? [], args?.limit ?? 0),
        }]
      },
    },
  })
}
