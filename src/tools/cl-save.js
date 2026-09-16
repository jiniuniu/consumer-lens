/**
 * cl_save —— 把分析结果落到本机。
 *
 * 校验**故意宽松**：只验面板渲染必须的字段，其余透传。
 * SKILL.md 的 schema 里有大量可选字段，模型按情况写；严格校验会频繁打回，
 * 而模型收到校验错误往往不知道怎么改。
 */
import { makeRunId } from '../store.js'

/** 线索 slug：模型生成，所以规则必须由代码保证，不能靠模型自觉。 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/

/** 痛点报告：面板靠 pain_points 渲染，每条要挂得住原文。 */
function checkPain(data) {
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
  return pains.length
}

/**
 * 人群报告：面板要把 communities 渲染成多选项，勾完回填给下一个 skill。
 *
 * `slug` 卡得比别的字段紧 —— 它是**裸版块名**，要原样回填给
 * cl_reddit_search 的 subreddits（大小写敏感）。带了 `r/` 前缀的话
 * 下一步会搜 `subreddit:r/xxx`，实测那样是 0 条，而且是静默的空结果，
 * 到时候没人知道是这里写错了。
 */
function checkAudience(data) {
  const comms = data?.communities
  if (!Array.isArray(comms) || comms.length === 0) {
    throw new Error('data.communities 必须是非空数组 —— 面板要靠它渲染多选项')
  }
  comms.forEach((c, i) => {
    if (!c?.name) throw new Error(`communities[${i}] 缺 name`)
    if (!c?.slug) {
      throw new Error(`版块「${c.name}」缺 slug —— 要填裸版块名（不带 r/），下一步要用它检索`)
    }
    if (String(c.slug).startsWith('r/')) {
      throw new Error(
        `版块「${c.name}」的 slug 不能带 r/ 前缀 —— 填 "${String(c.slug).slice(2)}"，`
        + '大小写照抄搜索结果',
      )
    }
    if (!c?.reason) {
      throw new Error(`版块「${c.name}」缺 reason —— 每个版块都要说清为什么选它`)
    }
  })
  if (!data?.audience) throw new Error('缺 audience（人群描述，面板标题要用）')
  return comms.length
}

/**
 * 选品信号报告。
 *
 * `category` 卡得最紧 —— 它是「能去 1688 搜的品类词」。填不出来说明这条
 * 根本不是选品信号（多半是情感型帖或泛化求助，那两类按评论数排会冲到最前，
 * 是这个模块最容易误收的东西）。宁可在这里打回，也不要让它进报告。
 */
function checkSignal(data) {
  const signals = data?.signals
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new Error('data.signals 必须是非空数组 —— 面板要靠它渲染')
  }
  signals.forEach((s, i) => {
    if (!s?.title) throw new Error(`signals[${i}] 缺 title`)
    if (!s?.category) {
      throw new Error(
        `信号「${s.title}」缺 category —— 要填一个能去 1688 搜的品类词。`
        + '填不出来说明这条不是选品信号（情感型帖 / 泛化求助），应该删掉而不是硬凑',
      )
    }
    if (!Array.isArray(s.evidence) || s.evidence.length === 0) {
      throw new Error(`信号「${s.title}」没有 evidence —— 每条信号都要挂原帖引文`)
    }
  })
  if (!data?.audience) throw new Error('缺 audience（人群描述，面板标题要用）')
  return signals.length
}

/**
 * IG 痛点报告。
 *
 * 字段叫 `pains` 而不是 `pain_points` —— 两个平台的数据语义不同：
 * Reddit 的痛点是「买了之后的失望」并要求说清机制，IG 的是「刷到时的
 * 反应 + 买前顾虑」，证据带封面图。不硬凑成同一组字段。
 *
 * `zh` 卡成必填是**实测逼出来的**：读面板的人不一定看得懂英文，而这些原话
 * 正是卖家要抄进详情页的东西 —— 看不懂就用不上。英文原话也要给中文。
 */
function checkIgPain(data) {
  const pains = data?.pains
  if (!Array.isArray(pains) || pains.length === 0) {
    throw new Error('data.pains 必须是非空数组 —— 面板要靠它渲染（注意不叫 pain_points）')
  }
  const FREQ = ['high', 'medium', 'low']
  pains.forEach((p, i) => {
    if (!p?.title) throw new Error(`pains[${i}] 缺 title`)
    if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
      throw new Error(`痛点「${p.title}」没有 evidence —— 每簇都要挂逐字原话`)
    }
    if (p.frequency && !FREQ.includes(p.frequency)) {
      throw new Error(
        `痛点「${p.title}」的 frequency 是「${p.frequency}」—— 只能填 high / medium / low，面板按它上色`,
      )
    }
    p.evidence.forEach((e, j) => {
      if (!e?.text) throw new Error(`痛点「${p.title}」的 evidence[${j}] 缺 text（逐字原话）`)
      if (!e?.zh) {
        throw new Error(
          `痛点「${p.title}」的 evidence[${j}] 缺 zh —— 中文意思是必填的，`
          + '英文原话也要给（读面板的人不一定看得懂英文，而这些原话是要抄进详情页的）',
        )
      }
      if (!e?.code) {
        throw new Error(
          `痛点「${p.title}」的 evidence[${j}] 缺 code —— 要填帖子短码，`
          + '面板靠它生成链接；必须来自工具输出，不能凭印象写（编的 code 会 404）',
        )
      }
    })
  })
  if (!data?.product) throw new Error('缺 product（产品名，面板标题要用）')

  /**
   * 封面图**整批都缺**才打回 —— 这是实测踩过的坑：一次真实运行的
   * 48 条证据里 thumbnail_url 一条都没带，而 SKILL.md 里它是「可选」，
   * 于是静默通过，面板上一张图都没有。IG 是图像平台，那张图常常
   * 就是痛点本身。
   *
   * **不逐条卡**：评论类证据和 album（轮播，实测 0/9）本来就没有封面，
   * 逐条卡会把正常情况也打回。只在「一条都没有」时报错 —— 那必然是
   * 透传时整个字段被漏掉了，不是数据本身没有。
   */
  const ev = pains.flatMap((p) => p.evidence ?? [])
  const posts = ev.filter((e) => e?.source_type !== 'comment')
  if (posts.length > 0 && posts.every((e) => !e?.thumbnail_url)) {
    throw new Error(
      `${posts.length} 条帖子证据里一条都没有 thumbnail_url —— 这个字段要从`
      + ' cl_ig_hashtag / cl_ig_comments 的输出里逐条透传，面板靠它渲染封面图。'
      + '（评论类证据和 album 轮播没有封面是正常的，但不可能整批都没有。）'
      + ' 回到工具输出里把每条证据对应的 thumbnail_url 补上再存。',
    )
  }
  return pains.length
}

export function register(ctx, config, store) {
  ctx.tools.register({
    name: 'cl_save',
    description:
      '把分析结果保存到本机，保存后 Consumer Lens 面板会自动出现这条记录。' +
      '数据只存在用户自己的机器上。不消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['cl-reddit-audience', 'cl-reddit-signal', 'cl-reddit-pain', 'cl-ig-pain'],
          description:
            '数据类型 —— 人群定位用 cl-reddit-audience，选品信号用 cl-reddit-signal，'
            + 'Reddit 痛点用 cl-reddit-pain，Instagram 痛点用 cl-ig-pain',
        },
        slug: {
          type: 'string',
          description:
            '线索标识，小写英文 + 短横线，如 portable-steamer / saltwater-anglers。'
            + '**不是文件名** —— 同一个 slug 重跑会新增一条运行记录，不会覆盖上一次，'
            + '所以重跑同一个东西就用同一个 slug，面板会把它们聚在一起看变化。',
        },
        from_run: {
          type: 'string',
          description:
            '可选。这次分析是从哪次运行接下来的（上一步工具返回的 run_id）。'
            + '比如从人群信号里挖到一个品、接着跑它的痛点，就把那次信号的 run_id 填这里，'
            + '面板才能把「这个品是从哪个人群挖出来的」串起来。独立跑的不填。',
        },
        data: {
          type: 'object',
          description:
            'cl-reddit-pain：含 product、summary、pain_points[]（每个有 title 和 evidence[]）、'
            + 'opportunities[]、meta{subreddits,search_terms,posts_scanned,posts_collected}。'
            + ' cl-reddit-audience：含 audience、summary、communities[]'
            + '（每个有 name、slug、subscribers、reason）、skipped[]、meta{search_terms,…}。'
            + ' cl-reddit-signal：含 audience、summary、signals[]'
            + '（每个有 title、category、status、evidence[]）、picks[]、meta{subreddits,…}。'
            + ' cl-ig-pain：含 product、pains[]（每簇有 title、description、frequency、'
            + 'evidence[]，每条证据要有 text 逐字原话 + zh 中文 + code + url + thumbnail_url）、'
            + 'stats（把工具输出的统计原样抄过来）、caveats[]。'
            + '其余字段透传。',
        },
      },
      required: ['kind', 'slug', 'data'],
    },
    async execute({ kind, slug, from_run: fromRun, data }) {
      // 只验面板渲染必须的那几个字段，其余透传。
      // 错误话术要具体到「哪一条缺什么」—— 模型看到笼统的 422 不知道怎么改。
      //
      // 按 kind 分支：两种数据的形状完全不同，用同一套必填字段会互相打架。
      const check = {
        'cl-reddit-audience': checkAudience,
        'cl-reddit-signal': checkSignal,
        'cl-ig-pain': checkIgPain,
      }[kind] ?? checkPain
      const groups = check(data)

      if (!SLUG.test(String(slug ?? ''))) {
        throw new Error(
          `slug「${slug}」不合法 —— 要小写英文 + 短横线，如 portable-steamer`,
        )
      }

      // id 由代码生成，模型不参与 —— 和 slug 那条正则同一个道理：
      // 规则必须由代码保证。让模型编 id 会重蹈 slug 的覆辙
      //（同一个东西这次叫 portable-steamer、下次叫 travel-steamer）。
      const runId = makeRunId(kind)
      // slug 和 from_run 落进内容里 —— 文件名只是 id，线索关系在数据里
      const body = { ...data, slug, ...(fromRun ? { from_run: fromRun } : null) }

      const path = await store.write(kind, runId, body)
      return { saved: true, path, groups, run_id: runId, slug }
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        const unit = {
          'cl-reddit-audience': '个版块',
          'cl-reddit-signal': '条信号',
          'cl-ig-pain': '簇痛点',
        }[args?.kind] ?? '条痛点'
        const next = args?.kind === 'cl-reddit-audience'
          ? '\n告诉用户：面板上勾选要深挖的版块，提交后接着跑 /cl-reddit-signal。'
          : ''
        return [
          {
            type: 'text',
            text: `已保存 ${value.groups} ${unit}到 ${value.path}\n`
              + `run_id: ${value.run_id}　slug: ${value.slug}\n`
              // run_id 要回显：接着跑下一步时把它填进 from_run，
              // 面板才能把「这个品是从哪次研究挖出来的」串起来
              + `面板会在几秒内出现这条记录。${next}`,
          },
        ]
      },
    },
  })
}
