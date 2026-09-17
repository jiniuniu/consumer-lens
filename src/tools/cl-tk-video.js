/**
 * cl_tk_video —— 单条视频详情。**读评论前必须先跑这个。**
 *
 * 评论只有放回视频语境里才读得懂：一条 `sudden wave might ruin everything`
 * 不看视频你不知道那是在说海边约会的场景风险，还是在说产品防水。
 *
 * AI 文章合进来而不是单开 tool：它覆盖率只有 4/10、失败要静默降级、
 * 且从不单独使用 —— 单开一个 tool 等于把「失败怎么办」推给模型。
 */
import { call } from '../client-api.js'
import { renderVideo } from '../render/tiktok.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_tk_video',
    description:
      '拉一条 TikTok 视频的详情：文案、标签、播放/点赞/评论数、是不是广告、'
      + '有没有挂小黄车、平台有没有标记 AI 生成。'
      + '**分析评论前先跑这个** —— 评论要放回视频语境里才读得懂。'
      + '顺带返回平台自己生成的 SEO 文章（AI 标题/摘要/关键词），那是第三方视角：'
      + 'AI 词全是场景词说明平台也认为这是氛围内容，有参数/对比词则是讨论向。'
      + '消耗 1~2 次额度（带 AI 文章 2 次）。',
    parameters: {
      type: 'object',
      properties: {
        aweme_id: {
          type: 'string',
          description:
            '视频 id，19 位数字。链接里 /video/ 后面那串就是。'
            + '短链（vm.tiktok.com/xxx）要先展开再取。',
        },
        with_ai_article: {
          type: 'boolean',
          description:
            '要不要平台生成的 SEO 文章，默认 true。多花 1 次额度，覆盖率约 4/10，'
            + '拿不到是常态（会静默降级，不报错）。',
        },
      },
      required: ['aweme_id'],
    },
    async execute({ aweme_id: awemeId, with_ai_article: withAi = true }) {
      return call(ctx, config.apiBase, '/v1/tiktok/video-info', {
        aweme_id: awemeId, with_ai_article: withAi,
      }, config.tokenRef)
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        return [{ type: 'text', text: renderVideo(value.video ?? {}, value.ai_article ?? null) }]
      },
    },
  })
}
