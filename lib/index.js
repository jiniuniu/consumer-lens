/**
 * Host 半边：注册 tools、skills、面板路由。
 *
 * 三个 seam 都是 dsh 对第三方开放的公开 API，顺着走即可 ——
 * 不用自造安装器、不用拷文件、不用自己存 token。
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStore } from './store.js'
import { register as registerSave } from './tools/cl-save.js'
import { register as registerRedditSearch } from './tools/cl-reddit-search.js'
import { register as registerRedditComments } from './tools/cl-reddit-comments.js'

export const name = 'consumer-lens'

/**
 * 命名约定：`cl-<平台>-<动作>`。
 *
 * 平台段不能省 —— 评论、搜索这些动作在每个平台都有一份，而它们的数据语义
 * 完全不同：视频评论的负面是**怀疑**（还没买），商品差评的负面是**失望**
 * （买了之后）。叫 `cl-comments` 会让人以为是同一件事。
 *
 *   skill   cl-reddit-pain        cl-tk-comments       cl-shop-reviews
 *   tool    cl_reddit_search      cl_tk_comments       cl_shop_reviews
 *   目录     data/cl-reddit-pain/  data/cl-tk-comments/
 *
 * 平台无关的工具不带平台段：`cl_save` 对所有平台是同一件事。
 */

/**
 * 只有 tools 和 skills 是硬依赖 —— 它们是这个插件存在的理由。
 *
 * **webServer 不在这里**：它只用来挂面板的只读路由。没有它，面板读不到数据，
 * 但 /cl-reddit-pain 整条链照样跑得完。让取数能力去赌一个 UI 依赖不划算。
 *
 * **credentials 也不在这里**：它是可选的，用法是在使用处 ctx.get('credentials')，
 * 没有就退回环境变量。写进 inject 会让插件在缺它时永远 pending。
 *
 * 判断标准：**缺了它这个插件还有意义吗？** 有 → 不写进 inject。
 */
export const inject = ['tools', 'skills']

/**
 * 配置默认值。
 *
 * 不导出 Schemastery 的 Config schema —— 那会让这个包多一个运行时依赖，
 * 而 peerDependency 在 link: 安装下解析不到（发 npm 后才由宿主提供）。
 * 两个值都由 cordis.patch.yml 给，这里只兜底。
 */
const DEFAULTS = {
  apiBase: 'http://localhost:8000',
  dataDir: '',
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = join(HERE, '..', 'skills')

/** 这个 provider 在 ctx.skills 注册表里的名字。 */
const PROVIDER = 'consumer-lens'

/** 去掉 YAML frontmatter —— 那是给 provider 读的元数据，不该进模型上下文。 */
function stripFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return m === null ? text : text.slice(m[0].length)
}

/**
 * 打进包里的 skill —— 作为包资源，不落用户文件系统。
 *
 * `invocation` 两个都开：模型能自己调用，用户也能在对话框敲 /cl-reddit-pain。
 * 少了它 skill 不会出现在任何目录里。
 */
const SKILLS = [
  {
    name: 'cl-reddit-pain',
    description:
      '给一个产品或品类，在 Reddit 上循环搜索买家的真实抱怨：先全站搜看落在哪些版块，'
      + '再定向到那些版块换词深挖，拉评论看细节，最后聚成痛点并给出机会判断。'
      + '触发词：/cl-reddit-pain、这个品用户在骂什么、Reddit上怎么说、买家痛点、痛点调研。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
  },
]

const H = { 'content-type': 'application/json; charset=utf-8' }

export function apply(ctx, userConfig) {
  const config = { ...DEFAULTS, ...userConfig }
  const store = createStore(config)

  // ① tools —— 模型调
  registerRedditSearch(ctx, config)
  registerRedditComments(ctx, config)
  registerSave(ctx, config, store)

  // ② skill provider —— SKILL.md 作为包资源打进去，npm 装完自动出现在目录里
  //
  // SkillProvider 的契约是三件套：name（注册表里的唯一名）、list()、get()。
  // list 返回 SkillCandidate（要带 rank / locator / provider），
  // get 拿着那个 locator 回来读正文，返回 SkillDefinition（要带 content）。
  ctx.effect(() =>
    ctx.skills.registerProvider(() => ({
      name: PROVIDER,

      async list() {
        return SKILLS.map((meta) => ({
          ...meta,
          provider: PROVIDER,
          // 越小越优先。给 0 会压过用户自己写的同名 skill，不礼貌；
          // 100 表示「没人跟我重名时我才出现」。
          rank: 100,
          locator: meta.name,
          resourceBase: { kind: 'directory', path: join(SKILLS_DIR, meta.name) },
        }))
      },

      async get(candidate) {
        const meta = SKILLS.find((s) => s.name === candidate.locator)
        if (meta === undefined) return undefined
        // 正文读不到就返回 undefined，让注册表当这条不存在 ——
        // 比抛异常好：一个坏 skill 不该让整个目录查询失败。
        try {
          const content = await readFile(join(SKILLS_DIR, meta.name, 'SKILL.md'), 'utf8')
          return { ...meta, provider: PROVIDER, content: stripFrontmatter(content) }
        } catch {
          return undefined
        }
      },
    })),
  )

  // ③ 面板路由 —— 全是 GET，面板从不写数据。
  //    写是 skill 的事（用户在对话框里跑 /cl-reddit-pain），面板只读 + 发指令。
  //    webServer 缺席时这一段整个不挂，前两项不受影响。
  ctx.inject(['webServer'], (sub) =>
    sub.effect(() =>
    sub.webServer.register({
      kind: 'prefix',
      path: '/consumer-lens/api',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const p = url.pathname

          // 面板 4s 轮询这个
          if (p.endsWith('/stat')) {
            return send(res, 200, { mtime: await store.stat() })
          }

          // kind 决定读哪个模块的数据。第一版只有 Reddit，所以它是默认值。
          const kind = url.searchParams.get('kind') ?? 'cl-reddit-pain'

          if (p.endsWith('/list')) {
            return send(res, 200, await store.list(kind))
          }

          if (p.endsWith('/item')) {
            const id = url.searchParams.get('id') ?? ''
            // kind/id 来自查询串，非法值是「没有这条」而不是服务器故障 ——
            // store 对未知 kind 和非法 id 都抛，这里翻译成 404。
            let d
            try {
              d = await store.read(kind, id)
            } catch {
              return send(res, 404, { error: 'not analyzed' })
            }
            if (d === null) return send(res, 404, { error: 'not analyzed' })
            return send(res, 200, d)
          }

          send(res, 404, { error: 'unknown route' })
        } catch (error) {
          send(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
    ),
  )
}

function send(res, code, body) {
  res.writeHead(code, H)
  res.end(JSON.stringify(body))
}
