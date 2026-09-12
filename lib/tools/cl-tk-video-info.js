/**
 * cl_tk_video_info —— 单条视频详情。读评论前先跑这个。
 */
import { call } from '../client-api.js'
import { render } from '../render/video-info.js'

export function register(ctx, config) {
  ctx.tools.register({
    name: 'cl_tk_video_info',
    description:
      '拉一条 TikTok 视频的详情（作者、播放/评论数、hashtag、是否广告、平台生成的 AI 关键词）。' +
      '读评论前先跑这个 —— 评论只有放回视频语境里才读得懂。消耗 1-2 次额度。',
    parameters: {
      type: 'object',
      properties: {
        aweme_id: {
          type: 'string',
          description: 'TikTok 视频 id，URL 里 /video/ 后面那串数字',
        },
        with_ai_article: {
          type: 'boolean',
          description:
            '是否顺带取平台为 SEO 生成的关键词（覆盖率约 4/10，多花 1 次额度）。默认 true',
        },
      },
      required: ['aweme_id'],
    },
    async execute({ aweme_id, with_ai_article = true }) {
      return call(ctx, config.apiBase, '/v1/tiktok/video-info', {
        aweme_id,
        with_ai_article,
      })
    },
    output: {
      schema: { type: 'object' },
      /** 纯投影：把数据排成模型能读的样子。格式冻结。 */
      render(_args, value) {
        return [{ type: 'text', text: render(value.video, value.ai_article) }]
      },
    },
  })
}
