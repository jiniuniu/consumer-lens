/**
 * 面板碰外界的两个口子 —— host 路由和对话框。
 *
 * 两个都很短但都有坑，所以单独一份：`call` 把 404 当正常状态，
 * `sendToConversation` 踩的是 cordis 的裸属性访问铁律（见函数注释）。
 */
import { API } from './constants.js'

/** 打 host 路由。404 返回 null —— 「还没分析」是正常状态不是错误。 */
async function call(path) {
  const r = await fetch(API + path)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/**
 * 往对话框发一条指令，等价于用户自己敲了回车。
 *
 * conversation 是 scope-addressed 服务 —— 必须先 ctx.sessions.scope(id)。
 * cordis 铁律：裸属性访问 ctx.foo 必须在 inject 里，否则 proxy 的 get trap
 * 直接抛；ctx.get('foo') 不过 trap，拿不到返回 undefined。
 */
async function sendToConversation(ctx, sessionId, text) {
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined || actx === null) return false
  const conversation = ctx.get('conversation')
  if (conversation === undefined) return false
  conversation.input.for(actx).setDraft('')
  await actx.get('conversation').send(text)
  return true
}

export { call, sendToConversation }
