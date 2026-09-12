/**
 * 存储层 —— **唯一碰文件系统的地方**。
 *
 * 一堆 JSON 平铺在目录里，文件名就是主键：
 *   <dataDir>/cl-tk-comments/<aweme_id>.json
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
const AWEME = /^\d{10,25}$/

const KINDS = { 'cl-tk-comments': AWEME }

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
    const re = KINDS[kind]
    if (!re) throw new Error(`未知的数据类型: ${kind}`)
    if (!re.test(id)) throw new Error(`非法的 id: ${id}`)
    return join(dirOf(kind), `${id}.json`)
  }

  return {
    /** 面板 4s 轮询这个 —— 变了说明 skill 写了新结果。 */
    async stat() {
      const times = await Promise.all(Object.keys(KINDS).map((k) => dirMtime(dirOf(k))))
      return Math.max(0, ...times)
    },

    /** 列出某类的全部条目（只读摘要，不带正文 —— 那是几十 KB）。 */
    async list(kind) {
      const re = KINDS[kind]
      if (!re) return []
      let names
      try {
        names = await readdir(dirOf(kind))
      } catch {
        return []
      }
      const ids = names
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter((id) => re.test(id))

      const rows = await Promise.all(
        ids.map(async (id) => {
          const d = await readJson(pathOf(kind, id))
          if (d === null) return null
          return {
            id,
            name: d.video?.name ?? id,
            author: d.video?.author ?? '',
            url: d.video?.url ?? '',
            groups: (d.groups ?? []).length,
            quotes: (d.groups ?? []).reduce(
              (s, g) => s + (g.topics ?? []).reduce((t, x) => t + (x.quotes ?? []).length, 0),
              0,
            ),
            saved_at: d.saved_at ?? null,
          }
        }),
      )
      return rows.filter(Boolean).sort((a, b) => (b.saved_at ?? 0) - (a.saved_at ?? 0))
    },

    /** 读一份完整分析。null = 还没分析过，是正常状态不是错误。 */
    async read(kind, id) {
      return readJson(pathOf(kind, id))
    },

    /** 写一份分析。目录不存在就建。 */
    async write(kind, id, data) {
      const path = pathOf(kind, id)
      await mkdir(dirname(path), { recursive: true })
      const body = { ...data, saved_at: Date.now() }
      await writeFile(path, JSON.stringify(body, null, 2), 'utf8')
      return path
    },
  }
}
