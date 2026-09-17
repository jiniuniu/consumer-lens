/**
 * 存储层 —— **唯一碰文件系统的地方**。
 *
 * 一堆 JSON 平铺在目录里，文件名就是主键：
 *   <dataDir>/cl-reddit-pain/<slug>.json
 *
 * 所以「这条视频分析过没有」=「那个文件在不在」，不用查询，
 * 文件系统本身就是索引。
 *
 * 数据存本地是刻意的：云端看得到调用量，看不到用户在研究什么。
 * 对卖家这是卖点 —— 他的选品调研不用交给别人。
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * 文件名白名单 —— 这是**唯一**一道防线，不能省。
 *
 * 插件路由走 ctx.webServer 的前缀注册，跟 /api 是两条平行的路，
 * 不继承那道 Host 信任围栏。只听 127.0.0.1，但本机任何进程都够得着。
 */
/**
 * 运行 id —— **文件名，由代码生成，永不复用**。
 *
 * 形如 `pain_20260914_a3f2`：日期让 `ls` 一眼看出什么时候跑的，
 * 随机四位防同一天多次跑撞车。不用 UUID 是因为它在文件名里读不出东西。
 *
 * 这一条正则仍然是**唯一**那道防线（路由走 ctx.webServer 前缀注册，
 * 不继承 /api 的信任围栏），所以它卡的是文件名，不是业务标识。
 */
const RUN_ID = /^[a-z]+_[0-9]{8}_[a-z0-9]{4}$/

/**
 * 线索 slug —— **内容里的一个字段，不是文件名**，可以重复。
 *
 * 同一个 slug 可以有多次运行：换个角度重跑、两周后再跑看变化，
 * 都是新建一条而不是覆盖。面板按 slug 聚合、按时间排序。
 *
 * （旧版本拿 slug 当文件名，于是重跑会静默盖掉上一份；而模型编的 slug
 * 又不稳定，同一个产品这次叫 portable-steamer、下次叫 travel-steamer，
 * 「以为会覆盖的没覆盖、以为是新的却盖了旧的」两个方向都会错。）
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/

/** 每个 kind 的 id 前缀 —— 文件名一眼看得出是哪种数据。 */
const KINDS = {
  'cl-reddit-audience': 'aud',
  'cl-reddit-signal': 'sig',
  'cl-reddit-pain': 'pain',
  'cl-ig-pain': 'igpain',
  'cl-tk-search': 'tksearch',
  'cl-tk-comments': 'tkcmt',
}

/**
 * 生成一个运行 id。**由代码生成，模型不参与** —— 这和 slug 那条正则
 * 同一个道理：规则必须由代码保证，不能靠模型自觉。
 */
export function makeRunId(kind, now = new Date()) {
  const prefix = KINDS[kind]
  if (!prefix) throw new Error(`未知的数据类型: ${kind}`)
  const d = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${prefix}_${d}_${rand}`
}

/** 取目录 mtime；不存在当 0，不抛。 */
async function dirMtime(dir) {
  try {
    return (await stat(dir)).mtimeMs
  } catch {
    return 0
  }
}

/** 读一个 JSON，坏文件返回 null —— 一份坏的不该毁掉整个列表。 */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

export function createStore(config) {
  const dataDir = config.dataDir ?? ''

  // 配置缺失要明确报错，不要静默返回空 —— 面板一片空白是最差的失败模式
  if (!dataDir) {
    throw new Error('Consumer Lens: dataDir 未配置，插件无法启动')
  }

  const dirOf = (kind) => join(dataDir, kind)

  const pathOf = (kind, id) => {
    if (!KINDS[kind]) throw new Error(`未知的数据类型: ${kind}`)
    // 迁移期同时认旧的 slug 文件名 —— 老数据还躺在磁盘上，
    // 拒绝它们等于让用户打开面板看到自己的历史凭空消失。
    if (!RUN_ID.test(id) && !SLUG.test(id)) throw new Error(`非法的 id: ${id}`)
    return join(dirOf(kind), `${id}.json`)
  }

  return {
    /** 面板 4s 轮询这个 —— 变了说明 skill 写了新结果。 */
    async stat() {
      const times = await Promise.all(Object.keys(KINDS).map((k) => dirMtime(dirOf(k))))
      return Math.max(0, ...times)
    },

    /**
     * 列出某类的全部运行（只读摘要，不带正文 —— 那是几十 KB）。
     *
     * 一个 slug 可以有多次运行，这里**每次运行一行**，不折叠 ——
     * 折叠是面板的展示决定，store 只负责如实报告磁盘上有什么。
     */
    async list(kind) {
      if (!KINDS[kind]) return []
      let names
      try {
        names = await readdir(dirOf(kind))
      } catch {
        return []
      }
      const ids = names
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter((id) => RUN_ID.test(id) || SLUG.test(id))

      const rows = await Promise.all(
        ids.map(async (id) => {
          const d = await readJson(pathOf(kind, id))
          if (d === null) return null

          // slug 从内容里读；老数据没有这个字段，退回文件名 ——
          // 那时文件名恰好就是当初那个 slug。
          const slug = d.slug ?? id
          const base = { id, slug, saved_at: d.saved_at ?? null }

          // 摘要按 kind 提取 —— 加平台时在这里多一个分支，
          // 不要硬凑成同一组字段：不同平台的数据语义不一样。
          if (kind === 'cl-reddit-audience') {
            const comms = d.communities ?? []
            return {
              ...base,
              name: d.audience ?? slug,
              // 面板列表只显示条数；订阅总量是报告里的事
              comms: comms.length,
            }
          }

          if (kind === 'cl-reddit-signal') {
            const signals = d.signals ?? []
            return {
              ...base,
              name: d.audience ?? slug,
              signals: signals.length,
              // 「空白」那档是用户最关心的 —— 列表上就要看得见
              blank: signals.filter((s) => s.status === '空白').length,
              // 这次信号是从哪次人群运行接下来的，没有就是独立跑的
              from_run: d.from_run ?? null,
              // 这次挖了哪些版块 —— 人群报告靠它把已挖过的版块置灰，
              // 避免同一批版块重复挖（那是纯粹的额度浪费，而且是静默的：
              // 跑出来的报告看着正常，只是内容跟上次几乎一样）。
              subreddits: d.meta?.subreddits ?? [],
            }
          }

          /**
           * 一次搜索。videos[] 不带出来 —— 那是几十 KB，左列用不上，
           * 展开时走 read() 拿全文。
           */
          if (kind === 'cl-tk-search') {
            const videos = d.videos ?? []
            return {
              ...base,
              name: d.query ?? slug,
              total: videos.length,
              // 搜了哪几个词 —— 重跑时避免重复搜同一批
              terms: d.terms ?? [],
            }
          }

          /**
           * 一份评论分析。
           *
           * ★ `aweme_id` 是这条投影存在的理由：面板靠它给视频列表标 ●/○。
           *
           * 老 tk-studio 用 `<aweme_id>.json` 当文件名，于是「分析过没有」
           * = 文件在不在，一次 readdir 求交集就出来了。这里文件名是 run_id
           * （永远新建、从不覆盖，见上面 write() 的注释），那条捷径没了 ——
           * 所以必须把 aweme_id 投影出来，让面板在内存里求交集。
           * 漏掉这个字段的话，树连不起来，而且是静默的：列表是好的，
           * 只是每条视频都显示「未分析」。
           */
          if (kind === 'cl-tk-comments') {
            const groups = d.groups ?? []
            return {
              ...base,
              name: d.video?.name ?? slug,
              aweme_id: d.video?.id ?? null,
              groups: groups.length,
              // 这份分析读了多少条评论 —— 判断覆盖面
              comments: d.audience?.stats?.[0]?.n ?? null,
              from_run: d.from_run ?? null,
            }
          }

          if (kind === 'cl-ig-pain') {
            // IG 的痛点簇字段叫 pains（不是 pain_points）—— 两个平台的
            // 数据语义不同，不硬凑成同一组字段（store 顶部注释的约定）。
            const pains = d.pains ?? []
            return {
              ...base,
              name: d.product ?? slug,
              pains: pains.length,
              // 「高频」那档是用户最关心的 —— 列表上就要看得见
              high: pains.filter((p) => p.frequency === 'high').length,
              // 扫了多少帖、其中多少高信号：判断这份报告的覆盖面
              fetched: d.stats?.fetched ?? 0,
              signal: d.stats?.signal ?? 0,
              // 这次走过哪些标签 —— 重跑时避免重复搜同一批池子
              tags: d.stats?.tags_tried ?? [],
              from_run: d.from_run ?? null,
            }
          }

          const pains = d.pain_points ?? []
          return {
            ...base,
            name: d.product ?? slug,
            pains: pains.length,
            posts: d.meta?.posts_collected ?? 0,
            subs: (d.meta?.subreddits ?? []).length,
            from_run: d.from_run ?? null,
          }
        }),
      )
      return rows.filter(Boolean).sort((a, b) => (b.saved_at ?? 0) - (a.saved_at ?? 0))
    },

    /** 读一份完整分析。null = 还没分析过，是正常状态不是错误。 */
    async read(kind, id) {
      return readJson(pathOf(kind, id))
    },

    /**
     * 写一次运行。目录不存在就建。
     *
     * **永远新建，从不覆盖** —— id 由 makeRunId() 生成，每次都不一样。
     * 重跑（换角度、隔两周再看变化）是新增一条，不是替换上一条：
     * 这类研究本来就有时间维度，覆盖掉就再也看不到「上次怎么说的」。
     *
     * `wx` 标志让「id 撞车」变成显式失败而不是静默覆盖 —— 随机四位撞车
     * 的概率很低，但真撞上时丢数据是不可接受的，宁可报错让调用方重试。
     */
    async write(kind, id, data) {
      const path = pathOf(kind, id)
      await mkdir(dirname(path), { recursive: true })
      const body = { ...data, saved_at: Date.now() }
      await writeFile(path, JSON.stringify(body, null, 2), { encoding: 'utf8', flag: 'wx' })
      return path
    },
  }
}
