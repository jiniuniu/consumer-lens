/**
 * 「我的」—— 登录 + 余额 + 用量。**账号相关的一切都在这一页**。
 *
 * 设置页那张卡已经撤掉：服务端地址和 token 都不该让用户填 —— 地址是我们定的，
 * token 是登录的产物。留着那张卡等于把「怎么填对」这个问题丢回给用户。
 *
 * 没登录时这一页就是登录页，登录完原地变成账户页 —— 不跳转，因为用户点进来
 * 的意图（「我的账户」）没变。
 *
 * 出网的路由都走 host 代理，token 不过线到浏览器。
 */
import { el, useState, useEffect, useCallback, Fragment } from './react.js'
import { API } from './constants.js'
import { S } from './styles.js'
import { LoginPanel } from './LoginPanel.js'

/** 平台段翻译。服务端按平台分组计费，键是英文 slug。 */
const PLATFORM_LABEL = { reddit: 'Reddit', tiktok: 'TikTok' }


/**
 * 账户页 —— 余额、用量、按平台分摊。
 *
 * 每次进来重新取，不缓存也不轮询：余额是钱，显示一个过期的数字比
 * 慢半秒更糟；而它只在用户主动点进来时才变（跑分析会扣），
 * 所以 4s 轮询纯属浪费。
 */
function AccountPage(props) {
  const [acc, setAcc] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  // 未登录不是错误状态 —— 401 走登录页，不走那段「读不到账户信息」
  const [needLogin, setNeedLogin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await fetch(`${API}/account`)
      const d = await r.json()
      if (!r.ok) {
        // 没登录不是故障 —— 转登录页。
        // 靠 host 带过来的 code，不靠匹配中文文案（改一个字就会失效）。
        if (d?.code === 'not_logged_in') {
          setNeedLogin(true)
          setAcc(null)
          setLoading(false)
          return
        }
        throw new Error(d?.error ?? `HTTP ${r.status}`)
      }
      setNeedLogin(false)
      setAcc(d)
    } catch (e) {
      setAcc(null)
      setErr(String(e?.message ?? e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return el('div', { style: S.empty }, '读取中…')

  // 未登录 —— 这一页就是登录页
  if (needLogin) {
    return el('div', null,
      el('h2', { style: S.h1 }, '我的'),
      el('p', { style: { ...S.note, marginTop: 4, marginBottom: 18 } },
        '用手机号登录后开始使用。新用户自动注册，赠送免费额度。'),
      el(LoginPanel, {
        configured: false,
        onChanged: () => { props?.onAuthChanged?.(); load() },
      }),
    )
  }

  if (err) {
    return el('div', { style: S.empty },
      el('div', { style: { marginBottom: 10 } }, '读不到账户信息。'),
      el('div', { style: { opacity: 0.75, lineHeight: 1.7, fontSize: 12.5 } }, err),
      el('button', {
        type: 'button', onClick: load,
        style: { ...S.backBtn, marginTop: 14, padding: '4px 12px', width: 'auto' },
      }, '重试'),
    )
  }

  const by = Object.entries(acc?.by_platform ?? {})

  /**
   * 对用户只讲**积分**，不讲钱 —— 1 积分 = $0.001 成本。
   *
   * 不能拿 calls 当积分：单价按平台分档（IG 的两个端点是 $0.002 和 $0.008，
   * 是 Reddit/TK 的 2～8 倍），同样「1 次调用」花掉的积分不一样。
   * 所以积分一律从**花费**换算，那才是用户真正被扣的东西。
   */
  const credits = (usd) => Math.round((usd ?? 0) * 1000)

  return el('div', null,
    el('h2', { style: S.h1 }, '我的'),
    el('p', { style: S.slug }, acc?.phone ?? acc?.email ?? `user ${acc?.user_id ?? '—'}`),

    el('div', { style: S.statRow },
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, acc?.remaining ?? '—'),
        el('span', { style: S.statL }, '剩余积分')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, credits(acc?.total_spent_usd)),
        el('span', { style: S.statL }, '累计消耗')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, acc?.total_calls ?? '—'),
        el('span', { style: S.statL }, '累计查询')),
    ),

    by.length > 0
      ? el(Fragment, null,
          el('h3', { style: S.layerT }, '按平台'),
          el('div', { style: { ...S.cross, marginTop: 10 } },
            by.map(([k, v], i) =>
              el('div', {
                key: k,
                style: {
                  ...S.xrow,
                  borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)',
                },
              },
                el('span', { style: { ...S.xname, flex: 1 } }, PLATFORM_LABEL[k] ?? k),
                el('span', { style: { fontSize: 12, opacity: 0.75 } },
                  `${v.calls} 次查询 · ${credits(v.spent_usd)} 积分`),
              ),
            ),
          ),
        )
      : el('div', { style: { ...S.note, marginTop: 18 } },
          '还没有用量记录 —— 跑一次分析就会出现在这里。'),

    el('div', { style: { ...S.note, marginTop: 18 } },
      '数据只存在你自己的机器上，服务端只记调用次数，看不到你在研究什么。'),

    el('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
      el('button', {
        type: 'button', onClick: load,
        style: { ...S.backBtn, padding: '4px 12px', width: 'auto' },
      }, '刷新'),
      // 退出登录复用 LoginPanel 的已登录态里那个按钮走的同一条路由
      el('button', {
        type: 'button',
        onClick: async () => {
          await fetch(`${API}/auth/logout`, { method: 'POST' })
          props?.onAuthChanged?.()
          setNeedLogin(true)
          setAcc(null)
        },
        style: { ...S.backBtn, padding: '4px 12px', width: 'auto' },
      }, '退出登录'),
    ),
  )
}

/** 报告正文 —— 面板读 JSON 自己渲染，不嵌 iframe。 */

export { AccountPage }

