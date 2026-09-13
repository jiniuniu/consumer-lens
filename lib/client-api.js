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
    throw new Error(
      `${tokenRef} 未配置。请在 dsh 的 设置 → 插件 → Consumer Lens 里填入 token。`,
    )
  }

  const base = (apiBase || '').replace(/\/+$/, '')
  if (!base) {
    throw new Error(
      'API 地址未配置。请在 设置 → 插件 → Consumer Lens 里填写，或设 CL_API_BASE 环境变量。',
    )
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
      `无法连接到 ${base}。请确认服务端在运行，或在 设置 → 插件 → Consumer Lens ` +
        `检查 API 地址。（${String(error?.message ?? error)}）`,
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
  if (detail?.message) throw new Error(detail.message)

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
      const v = await credentials.resolve(ref)
      if (v) return v
    } catch {
      /* 解析失败时退回环境变量 */
    }
  }
  return process.env[ref] ?? ''
}
