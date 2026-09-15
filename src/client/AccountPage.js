/**
 * 「我的」—— 余额和用量。不产生数据、没有 list、不吃额度。
 *
 * 这是面板上**唯一一条会出网的路由**（走 host 代理，token 不过线到浏览器）。
 */
import { el, useState, useEffect, useCallback, Fragment } from './react.js'
import { API } from './constants.js'
import { S } from './styles.js'

/** 平台段翻译。服务端按平台分组计费，键是英文 slug。 */
const PLATFORM_LABEL = { reddit: 'Reddit', tiktok: 'TikTok' }


/**
 * 账户页 —— 余额、用量、按平台分摊。
 *
 * 每次进来重新取，不缓存也不轮询：余额是钱，显示一个过期的数字比
 * 慢半秒更糟；而它只在用户主动点进来时才变（跑分析会扣），
 * 所以 4s 轮询纯属浪费。
 */
function AccountPage() {
  const [acc, setAcc] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await fetch(`${API}/account`)
      const d = await r.json()
      // host 把 call() 的中文错误原样放在 error 里（502），直接显示
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      setAcc(d)
    } catch (e) {
      setAcc(null)
      setErr(String(e?.message ?? e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return el('div', { style: S.empty }, '读取中…')

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
  // 余额是「次」，服务端按 1 次 = $0.001 计；换算成钱让用户有体感
  const usd = ((acc?.remaining ?? 0) / 1000).toFixed(3)

  return el('div', null,
    el('h2', { style: S.h1 }, '我的'),
    el('p', { style: S.slug }, acc?.email ?? `user ${acc?.user_id ?? '—'}`),

    el('div', { style: S.statRow },
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, acc?.remaining ?? '—'),
        el('span', { style: S.statL }, `剩余次数 · ≈$${usd}`)),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, acc?.total_calls ?? '—'),
        el('span', { style: S.statL }, '累计调用')),
      el('div', { style: S.statBox },
        el('span', { style: S.statV }, `$${acc?.total_spent_usd ?? 0}`),
        el('span', { style: S.statL }, '累计花费')),
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
                  `${v.calls} 次 · $${v.spent_usd}`),
              ),
            ),
          ),
        )
      : el('div', { style: { ...S.note, marginTop: 18 } },
          '还没有用量记录 —— 跑一次分析就会出现在这里。'),

    el('div', { style: { ...S.note, marginTop: 18 } },
      '额度不足时找管理员充值。数据只存在你自己的机器上，'
      + '服务端只记调用次数，看不到你在研究什么。'),

    el('button', {
      type: 'button', onClick: load,
      style: { ...S.backBtn, marginTop: 16, padding: '4px 12px', width: 'auto' },
    }, '刷新'),
  )
}

/** 报告正文 —— 面板读 JSON 自己渲染，不嵌 iframe。 */

export { AccountPage }

