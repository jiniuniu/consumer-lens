/**
 * cl_tk_search —— 搜一个品类在 TikTok 上的视频。
 *
 * 一次一个词，不收数组：和 IG/Reddit 相反。那两个的循环靠「换一批词再搜」
 * 推进，一次过线省往返；TK 的循环是**先搜一个词、读完再决定下一个词搜什么**
 * （§1 拆词表里的四个角度是并列的，不是迭代的），而且单次响应 837KB、
 * 一个词 2 页就 40 条要逐条读 —— 一次给四个词回来 160 条，模型读不完。
 */
import { call } from '../client-api.js'
import { renderSearch } from '../render/tiktok.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_tk_search',
    description:
      '在 TikTok 上搜一个品类的视频，返回去重后的列表，每条带播放/点赞/评论/互动率。'
      + '用英文词搜（TikTok 是英文语境，中文词召回极窄）。'
      + '一次搜一个词，读完再决定下一个词搜什么。每页约 20 条，每页消耗 1 次额度，'
      + '2 页够了 —— 后面每条都要你读，别贪多。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description:
            '英文搜索词。从四个角度各取一个，分几次搜：品类通用词（camping lantern）、'
            + '使用场景词（tent light）、卖点/形态词（solar lantern）、人群词（van life lighting）。'
            + '避免太宽的词（camping）、太窄的长尾（3-in-1 solar camping lantern with fan）、中文词。',
        },
        pages: {
          type: 'integer',
          description:
            '翻几页，每页约 20 条。默认 2（= 40 条）。'
            + '⚠️ 第 3 页起结果严重重叠，翻满也常拿不到 pages×20 条，翻超过 3 页基本是浪费额度。',
        },
        sort: {
          type: 'integer',
          description:
            '1 = 按点赞排（找爆款用这个，默认）；0 = 按相关度排（摸品类全貌用这个）。'
            + '两者结果差别很大。',
        },
        days: {
          type: 'integer',
          description:
            '只要最近 N 天的：0（不限，默认）/1/7/30/90/180。'
            + 'TikTok 爆款一周换一批，做内容选题时用 30 或 90。',
        },
        region: {
          type: 'string',
          description: '地区码，默认 US。',
        },
        limit: {
          type: 'integer',
          description: '只输出前 N 条。视频多到烧上下文时用，0=全打。',
        },
      },
      required: ['keyword'],
    },
    async execute({ keyword, pages = 2, sort = 1, days = 0, region = 'US' }) {
      return call(ctx, config.apiBase, '/v1/tiktok/video-search', {
        keyword, pages, sort, days, region,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      /** 纯投影。**格式冻结** —— 头部的互动率列是模型做规则筛的决策输入。 */
      render(args, value) {
        return [{
          type: 'text',
          text: renderSearch(value.videos ?? [], value.stats ?? {}, args?.limit ?? 0),
        }]
      },
    },
  })
}
