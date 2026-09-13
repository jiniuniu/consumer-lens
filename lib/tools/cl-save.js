/**
 * cl_save —— 把分析结果落到本机。
 *
 * 校验**故意宽松**：只验面板渲染必须的字段，其余透传。
 * SKILL.md 的 schema 里有大量可选字段，模型按情况写；严格校验会频繁打回，
 * 而模型收到校验错误往往不知道怎么改。
 */
export function register(ctx, config, store) {
  ctx.tools.register({
    name: 'cl_save',
    description:
      '把痛点分析结果保存到本机，保存后 Consumer Lens 面板会自动出现这条记录。' +
      '数据只存在用户自己的机器上。不消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['cl-reddit-pain'],
          description: '数据类型',
        },
        id: {
          type: 'string',
          description: '产品 slug，小写英文 + 短横线，如 portable-steamer',
        },
        data: {
          type: 'object',
          description:
            '含 product、summary、pain_points[]（每个有 title 和 evidence[]）、'
            + 'opportunities[]、meta{subreddits,search_terms,posts_scanned,posts_collected}。'
            + '其余字段透传。',
        },
      },
      required: ['kind', 'id', 'data'],
    },
    async execute({ kind, id, data }) {
      // 只验面板渲染必须的那几个字段，其余透传。
      // 错误话术要具体到「哪一条缺什么」—— 模型看到笼统的 422 不知道怎么改。
      const pains = data?.pain_points
      if (!Array.isArray(pains) || pains.length === 0) {
        throw new Error('data.pain_points 必须是非空数组 —— 面板要靠它渲染')
      }
      pains.forEach((p, i) => {
        if (!p?.title) throw new Error(`pain_points[${i}] 缺 title`)
        if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
          throw new Error(`痛点「${p.title}」没有 evidence —— 每个痛点都要挂原帖引文`)
        }
      })
      if (!data?.product) throw new Error('缺 product（产品名，面板标题要用）')

      const path = await store.write(kind, id, data)
      return { saved: true, path, groups: pains.length }
    },
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        return [
          {
            type: 'text',
            text: `已保存 ${value.groups} 条到 ${value.path}\n面板会在几秒内出现这条记录。`,
          },
        ]
      },
    },
  })
}
