/**
 * Host 半边：注册 tools、skills、面板路由。
 *
 * 三个注册表都是 dsh 对第三方开放的公开 API，顺着走即可 ——
 * 不用自造安装器、不用拷文件、不用自己存 token。
 *
 * 注意用词：**这三个不是 seam。** dsh 的 glossary 里 seam 特指「可替换能力」
 * （Service Definition + 可互换的 Provider + Consumer，范例是 local/sandbox
 * 两种 bash）。`ctx.tools` 是 `Tool registry`、`ctx.skills` 是
 * `Skill provider registry` —— 我们往注册表里加东西，不是替换掉它，
 * 在那套词汇里我们的角色是 Consumer。
 *
 * 真正的 seam 是下面那两个可选依赖：`ctx.credentials`（Credential seam）
 * 和 `ctx.settings`（User-settings seam）—— 它们之所以是 seam，
 * 正是因为可替换（缺了实现也能跑，退回环境变量）。
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'


import { call, callAnon, CL_TOKEN } from './client-api.js'
import { createStore } from './store.js'
import { register as registerSave } from './tools/cl-save.js'
import { register as registerRedditAudience } from './tools/cl-reddit-audience.js'
import { register as registerRedditSearch } from './tools/cl-reddit-search.js'
import { register as registerRedditComments } from './tools/cl-reddit-comments.js'
import { register as registerIgHashtag } from './tools/cl-ig-hashtag.js'
import { register as registerIgComments } from './tools/cl-ig-comments.js'

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
 * 由 cordis.patch.yml 给，这里只兜底。
 */
const DEFAULTS = {
  // 环境变量是唯一的改法（给开发者用）—— 设置页已经不提供这个字段了
  apiBase: process.env.CL_API_BASE || 'http://localhost:8000',
  dataDir: '',
  tokenRef: 'CL_TOKEN',
}

/**
 * **没有 Config schema，也没有设置页 section。**
 *
 * 服务端地址和 token 都不再让用户填：
 *   - 地址是我们定的。填错只会得到「无法连接到 http://localhs:8000」，
 *     而用户很难一眼看出是自己打错字。
 *   - token 是登录的产物，用户不该持有它 —— 登录后由 host 侧直接写进
 *     托管凭证库（见下面的 /auth/verify 路由）。
 *
 * 开发时要指向别的服务端，用 CL_API_BASE 环境变量。
 */

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
    name: 'cl-reddit-audience',
    description:
      '给一个人群或品类，在 Reddit 上找到该去哪些社区 —— 搜版块本身（不是搜帖子），'
      + '按体量分层挑出不超过 5 个，每个给出订阅数、简介和推荐理由。'
      + '结果落盘后面板上可以多选，选完直接接 /cl-reddit-signal 挖选品信号。'
      + '触发词：/cl-reddit-audience、这个人群在哪些社区、该去哪个subreddit、找版块、人群定位。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
  },
  {
    name: 'cl-reddit-signal',
    description:
      '给一批 subreddit，翻它们最近的高评论帖，找出「有人明确想要一个买不到的东西」'
      + '这类选品信号，拉评论看细节，聚类后给出选品建议。'
      + '承接 /cl-reddit-audience 的版块名单，也可以直接给版块名跑。'
      + '触发词：/cl-reddit-signal、这些社区在求什么、挖选品信号、看看最近有什么需求、选品信号。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
  },
  {
    name: 'cl-reddit-pain',
    description:
      '给一个产品或品类，在 Reddit 上循环搜索买家的真实抱怨：先全站搜看落在哪些版块，'
      + '再定向到那些版块换词深挖，拉评论看细节，最后聚成痛点并给出机会判断。'
      + '触发词：/cl-reddit-pain、这个品用户在骂什么、Reddit上怎么说、买家痛点、痛点调研。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
  },
  {
    name: 'cl-ig-pain',
    description:
      '给一个产品词，在 Instagram 上循环挖买家痛点 —— 按标签取帖、看命中率决定弃不弃，'
      + '从高信号帖的共现标签里长出新标签再搜，直到池子挖空；然后把 caption 和评论'
      + '聚成痛点簇，每簇给中文解释 + 逐字原话 + 封面图证据。'
      + '触发词：/cl-ig-pain、挖一下XX在IG上的痛点、IG痛点、Instagram用户在抱怨什么、'
      + 'IG上怎么说、看下这个品类在IG的翻车。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
  },
]

const H = { 'content-type': 'application/json; charset=utf-8' }

export function apply(ctx, userConfig) {
  // tools 闭包捕获的是这个对象的**引用**，所以用户改配置时必须
  // 原地更新（Object.assign），不能换成新对象 —— 换引用的话
  // 已注册的 tool 还读着旧的那份。
  const config = { ...DEFAULTS, ...userConfig }
  const store = createStore(config)

  // ① tools —— 模型调
  registerRedditAudience(ctx, config)
  registerRedditSearch(ctx, config)
  registerRedditComments(ctx, config)
  registerIgHashtag(ctx, config)
  registerIgComments(ctx, config)
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

          /**
           * 登录 —— 面板上**仅有的两条写路由**，破了「面板只读」的例外。
           *
           * 例外是必要的：登录必须发 POST，而它又不能走 call()（那个的第一件
           * 事是「没有 token 就报错」，正好是登录的前提）。所以走 callAnon()。
           *
           * 走 host 代理的理由和 /account 一样，而且更强：verify 的响应里
           * **带着明文 token**，它必须在这里被消费掉（写进凭证库），
           * 绝不能过线回浏览器。浏览器只会收到 { ok, phone, remaining }。
           */
          if (p.endsWith('/auth/send-code')) {
            const body = await readBody(req)
            try {
              return send(res, 200, await callAnon(config.apiBase, '/v1/auth/send-code', body))
            } catch (error) {
              return send(res, 400, {
                error: String(error?.message ?? error),
                retryAfter: error?.retryAfter,
              })
            }
          }

          if (p.endsWith('/auth/verify')) {
            const body = await readBody(req)
            let out
            try {
              out = await callAnon(config.apiBase, '/v1/auth/verify', body)
            } catch (error) {
              return send(res, 400, { error: String(error?.message ?? error) })
            }

            // ★ token 在这里就地消费掉，不回浏览器。
            const credentials = ctx.get('credentials')
            if (credentials === undefined) {
              return send(res, 501, {
                error: '凭证服务不可用，无法保存登录状态。请用下面的「手动填入 Token」。',
              })
            }
            try {
              // set() 在只读源遮蔽时会 reject（credentials/src/index.ts:201）——
              // 写入会「看起来成功了」但 resolve 仍返回被遮蔽的值。
              // 我们自己就可能是 CL_TOKEN=… dsh 起的，所以这条必须接住。
              await credentials.set(CL_TOKEN, out.token)
            } catch (error) {
              return send(res, 409, {
                error:
                  'CL_TOKEN 已由更高优先级的来源（如启动时的环境变量）提供，无法保存登录状态。'
                  + '请去掉那个环境变量后重试。'
                  + `（${String(error?.message ?? error)}）`,
              })
            }
            return send(res, 200, {
              ok: true,
              phone: out.phone,
              remaining: out.remaining,
              isNew: out.is_new,
            })
          }

          if (p.endsWith('/auth/logout')) {
            const credentials = ctx.get('credentials')
            if (credentials === undefined) return send(res, 200, { ok: true })
            try {
              // 空值不能用 set()，那会抛（credentials-local/src/index.ts:642）
              await credentials.unset(CL_TOKEN)
            } catch (error) {
              return send(res, 409, { error: String(error?.message ?? error) })
            }
            return send(res, 200, { ok: true })
          }

          /**
           * 余额 —— **这是唯一一条会出网的面板路由**，其余都只读本地文件。
           *
           * 走 host 代理而不是让浏览器直接打服务端，是为了守住一条约束：
           * token 的值永不过线到浏览器。这里复用 client-api 的 call()，
           * 于是 token 解析、错误翻译、连不上时回显地址全都是同一套，
           * 不用在面板那边再写一份（也就不会再写出一份带 bug 的）。
           *
           * 不缓存：余额是钱，显示一个过期的数字比慢一点更糟。
           * 服务端这个端点自己不计费。
           */
          if (p.endsWith('/account')) {
            try {
              return send(res, 200, await call(ctx, config.apiBase, '/v1/account'))
            } catch (error) {
              // 把原文交给面板显示 —— call() 的错误已经是给人读的中文，
              // 翻成 500 会把「token 没配」说成「服务器故障」。
              // code 一起带过去：面板靠它把「没登录」显示成登录页而不是错误页。
              return send(res, 502, {
                error: String(error?.message ?? error),
                code: error?.code,
              })
            }
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

/** 读完整个请求体再解析。登录是面板上唯一会发 POST 的地方。 */
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    // 手动拼字符串而不是 Buffer.concat —— 不依赖 Buffer 这个 Node 全局，
    // 和这份文件其余部分保持同一套 ESM 约定。
    return JSON.parse(chunks.map((c) => c.toString('utf8')).join(''))
  } catch {
    return {}
  }
}
