/**
 * cl_ig_hashtag —— 一轮标签搜索。
 *
 * 收**一批**标签而不是一个：IG 上的循环靠**标签共现**推进 —— 每轮返回的
 * 帖子自带真实共现标签（实测覆盖 22/24），下一轮直接拿它们传回来，
 * 比先花一次调用去猜一批准得多。
 *
 * ⚠️ **标签池是 IG 上唯一可靠的召回入口。** 自由文本搜索看起来更直接，
 * 实测更差（同样 $0.002 一次）：搜 "press on nails fell off" 会返回海贼王
 * 和 Jennifer Lawrence，一次只给 8-12 条且切题且有痛点的 0 条；
 * 而 #pressonnailreview 给 24 条、6 条有痛点。所以这个 tool 只收标签。
 */
import { call } from '../client-api.js'
import { renderHashtag } from '../render/instagram.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_ig_hashtag',
    description:
      '在 Instagram 上按标签取帖子。一次可以给多个标签，跑完一轮返回去重后的帖子，'
      + '并逐个报告每个标签命中几条、其中多少有痛点语言（命中率）—— '
      + '标签太小（<12 条）或命中率 <15% 就该弃掉，换下一批。'
      + '同时返回「共现标签」：从高信号帖的 caption 里长出来的真实相关标签，'
      + '那是下一轮的候选，免费带回来的，不用另外花调用去找标签。'
      + '每个「标签 × 页」消耗 1 次额度，先用 pages=1 试水（第一页就是探针）。',
    parameters: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            '标签，1~8 个。带不带 # 都行，大小写不敏感（服务端会规范化去重）。'
            + '首选「品类+review/reviews」—— 测评标签里天然混着差评，实测命中率最高；'
            + '其次「品类+fails/mistakes」（只有大品类才有这种标签）、'
            + '「品类+haul/tryon」（开箱试用，翻车藏在里面）、卖家标签（如 sheinnails）。'
            + '纯品类词（skincare）或审美词（cutenails）全是种草，命中率 4-8%，别用。',
        },
        pages: {
          type: 'integer',
          description:
            '每个标签翻几页（每页 24-30 条）。默认 1。'
            + '第一页就是探针：标签太小或没痛点语言时立刻弃掉，先翻页等于先花钱。'
            + '确认命中率高（>25%）之后再对那个标签单独翻 2-3 页。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 条（已按痛点信号强度排序）。帖子多到烧上下文时用，0=全打。',
        },
      },
      required: ['tags'],
    },
    async execute({ tags, pages = 1 }) {
      return call(ctx, config.apiBase, '/v1/instagram/hashtag', {
        tags, pages,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      /** 纯投影。**格式冻结** —— 头部的命中率和共现标签是模型换词的决策输入。 */
      render(args, value) {
        return [{
          type: 'text',
          text: renderHashtag(
            value.posts ?? [],
            value.stats ?? [],
            value.cooccurring ?? [],
            value.signal ?? 0,
            args?.limit ?? 0,
          ),
        }]
      },
    },
  })
}
