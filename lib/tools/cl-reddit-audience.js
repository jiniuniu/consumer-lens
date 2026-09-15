/**
 * cl_reddit_audience —— 找版块，不是找帖子。
 *
 * 人群定位的第一步：先回答「该去哪些社区」，再谈在那些社区里搜什么。
 * 和 cl_reddit_search 的分工是死的 —— 这个搜**版块本身**，那个搜版块里的帖子。
 *
 * 收一批检索词的理由和 search 一样：一个人群往往要换几个说法才找得全
 * （"lash serum" / "eyelash growth" / "lash extensions"）。
 */
import { call } from '../client-api.js'
import { renderCommunities } from '../render/reddit.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_reddit_audience',
    description:
      '在 Reddit 上找**版块**（不是找帖子）—— 给一个人群或品类描述，返回相关社区'
      + '及其订阅数和简介，用来决定「该去哪些社区挖」。'
      + '每个「检索词 × 页」消耗 1 次额度；开 typeahead 每个检索词再加 1 次。'
      + '找到版块之后用 cl_reddit_search 去里面搜帖子。',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            '检索词，1~8 个。用人群会自称的说法和品类词都试试 —— '
            + '「lash serum」「eyelash extensions」召回的版块不一样。',
        },
        pages: {
          type: 'integer',
          description: '每个检索词翻几页（每页 10 个版块）。默认 1。',
        },
        typeahead: {
          type: 'boolean',
          description:
            '是否顺带查自动补全（默认 true）。它能捞到版块搜索返回不了的'
            + '**品牌自建版块**，但每个检索词多花 1 次额度。'
            + '⚠️ 只对**单个词**有效 —— 传词组（如 "lash serum"）拿不到任何版块，'
            + '那时应该关掉它省额度。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 个。版块多到烧上下文时用，0=全打。',
        },
      },
      required: ['queries'],
    },
    async execute({ queries, pages = 1, typeahead = true }) {
      return call(ctx, config.apiBase, '/v1/reddit/communities', {
        queries, pages, typeahead,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      /** 纯投影。**格式冻结** —— 头部的体量分档是模型分层选取的决策输入。 */
      render(args, value) {
        return [{
          type: 'text',
          text: renderCommunities(
            value.communities ?? [],
            value.typeahead ?? [],
            value.stats ?? [],
            args?.limit ?? 0,
          ),
        }]
      },
    },
  })
}
