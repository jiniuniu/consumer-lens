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
      '把评论分析结果保存到本机，保存后 Consumer Lens 面板会自动出现这条记录。' +
      '数据只存在用户自己的机器上。不消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['cl-tk-comments'],
          description: '数据类型',
        },
        id: { type: 'string', description: '视频 id' },
        data: {
          type: 'object',
          description:
            '分析结果。必须含 video.name 和 groups[]，每个 group 有 title 和 topics[]，' +
            '每个 topic 有 name 和 quotes[]。其余字段透传。',
        },
      },
      required: ['kind', 'id', 'data'],
    },
    async execute({ kind, id, data }) {
      // 只验面板渲染必须的，其余不管
      const groups = data?.groups
      if (!Array.isArray(groups) || groups.length === 0) {
        throw new Error('data.groups 必须是非空数组 —— 面板要靠它渲染')
      }
      for (const g of groups) {
        if (!g?.title) throw new Error('每个 group 必须有 title')
        for (const t of g.topics ?? []) {
          if (!t?.name) throw new Error(`group「${g.title}」里有 topic 缺 name`)
        }
      }

      const path = await store.write(kind, id, data)
      return { saved: true, path, groups: groups.length }
    },
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        return [
          {
            type: 'text',
            text: `已保存 ${value.groups} 个分组到 ${value.path}\n面板会在几秒内出现这条记录。`,
          },
        ]
      },
    },
  })
}
