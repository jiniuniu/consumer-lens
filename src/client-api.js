/**
 * 唯一碰网络的地方 —— token 解析、请求、错误翻译。
 *
 * 这一层不知道上游是谁。它只知道自家服务端的四个端点，所以读这份开源代码
 * 的人也不知道数据从哪来。
 *
 * **错误必须翻译成模型能读懂的话。** tool 的调用方是模型，它撞上一个看不懂的
 * 错误时会瞎试；给它一句可执行的话，它会直接转达给用户。
 */

/** 存 token 的凭证名。值在托管存储里，配置文件里只有这个名字。 */
export const CL_TOKEN = 'CL_TOKEN'

/** 客户端版本，随请求带上 —— 服务端据此判断要不要让用户升级。 */
export const CLIENT_VERSION = '0.1.0'

/**
 * 打一个业务端点。
 *
 * @param ctx      cordis context，用来解析凭证
 * @param apiBase  服务端地址，用户可在设置页改
 * @param path     '/v1/tiktok/comments' 这样的业务路径
 * @param body     null 表示 GET
 */
export async function call(ctx, apiBase, path, body = null, tokenRef = CL_TOKEN) {
  // 每次调用重新解析，不缓存 —— 用户换 key 不用重启 dsh
  const token = await resolveToken(ctx, tokenRef)
  if (!token) {
    // ★ 带一个机器可读的标记。面板靠它区分「没登录」和「真故障」——
    // 靠匹配中文文案是脆的：改一个字面板就会把登录页显示成错误页。
    const e = new Error(
      '还没登录。请打开右栏的 Consumer Lens 面板，点「登录」用手机号登录。',
    )
    e.code = 'not_logged_in'
    throw e
  }

  const base = (apiBase || '').replace(/\/+$/, '')
  if (!base) {
    throw new Error('API 地址未配置。请设 CL_API_BASE 环境变量。')
  }

  let res
  try {
    res = await fetch(base + path, {
      method: body === null ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-cl-client': CLIENT_VERSION,
      },
      body: body === null ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    // 连不上是最常见的失败，而且模型完全猜不出原因 —— 把地址回显出来
    throw new Error(
      `无法连接到 ${base}。请确认服务端在运行。（${String(error?.message ?? error)}）`,
    )
  }

  if (res.ok) return res.json()

  // 服务端的错误已经是给模型写的了，原样转达
  let detail = null
  try {
    detail = (await res.json())?.detail
  } catch {
    /* 非 JSON 响应，往下走通用文案 */
  }
  if (detail?.message) {
    const e = new Error(detail.message)
    // 服务端说 401 就是没登录（token 被轮换掉、或库被清了）
    if (res.status === 401) e.code = 'not_logged_in'
    throw e
  }

  throw new Error(`服务端返回 HTTP ${res.status}。稍后重试；持续失败说明服务端需要修复。`)
}

/**
 * 解析 token。
 *
 * 凭证是**每次操作重新解析**的，不能跨操作缓存 —— 那个按次读取正是
 * 「换了 key 无需重启就能生效」的原因。
 */
async function resolveToken(ctx, ref = CL_TOKEN) {
  // ctx.get() 不走 proxy 的 get trap —— 服务不在时返回 undefined 而不是抛。
  // 这正是「可选服务」的用法：不进 inject，在使用处查询。
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      // ⚠️ resolve() 返回的是 **{ value, source } 对象**，不是字符串
      //（credentials/src/index.ts:118）。写 `if (v) return v` 会把整个对象
      // 当 token 返回 —— 对象永远真，于是请求头变成 `Bearer [object Object]`，
      // 服务端回 401，错误文案却说「未配置」，指向完全错误的方向。
      const v = await credentials.resolve(ref)
      if (v?.value) return v.value
    } catch {
      /* 解析失败时退回环境变量 */
    }
  }
  return process.env[ref] ?? ''
}

/**
 * 打一个**不需要 token** 的端点 —— 登录用。
 *
 * 和 call() 分开而不是加个参数，因为两者的前提相反：call() 的第一件事是
 * 「没有 token 就报错」，而这里的前提正是还没有 token。混在一起会让那句
 * 「请先登录」的错误在登录请求自己身上触发。
 *
 * 错误文案的读者也不同：这些显示在设置卡上给**人**看，不经过模型。
 */
export async function callAnon(apiBase, path, body) {
  const base = (apiBase || '').replace(/\/+$/, '')
  if (!base) {
    throw new Error('API 地址未配置。请设 CL_API_BASE 环境变量。')
  }

  let res
  try {
    res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cl-client': CLIENT_VERSION },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new Error(
      `无法连接到 ${base}。请确认服务端在运行。（${String(error?.message ?? error)}）`,
    )
  }

  if (res.ok) return res.json()

  let detail = null
  try {
    detail = (await res.json())?.detail
  } catch {
    /* 非 JSON 响应，往下走通用文案 */
  }
  if (detail?.message) {
    // 节流要把 retry_after 带出去 —— 倒计时的权威在服务端，前端不自己算
    const err = new Error(detail.message)
    if (typeof detail.retry_after === 'number') err.retryAfter = detail.retry_after
    throw err
  }

  throw new Error(`服务端返回 HTTP ${res.status}。稍后重试；持续失败说明服务端需要修复。`)
}
