/**
 * 手机号登录 —— 设置卡的主入口。
 *
 * **用户永远不会看见 token。** 验证通过后服务端签发的那串东西在 host 侧就被
 * 写进托管凭证库了（src/index.js 的 /auth/verify 路由），浏览器只收到
 * { ok, phone, remaining }。所以这个组件里没有任何 token 字样。
 *
 * 注册即登录：新手机号自动建账号并送免费额度，不需要邀请码。
 */
import { el, useState, useEffect, useCallback, useRef } from './react.js'
import { API } from './constants.js'

/** 表单控件的几个数值，对齐官方 fields.module.css。 */
const L = {
  row: { display: 'flex', gap: 8, alignItems: 'stretch' },
  input: {
    flex: 1, minWidth: 0, appearance: 'none',
    border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
    padding: '7px 10px', font: 'inherit', fontSize: 13, lineHeight: 1.5,
  },
  btn: {
    appearance: 'none', border: '1px solid transparent', borderRadius: 8,
    padding: '5px 14px', font: 'inherit', fontSize: 13, lineHeight: 1.5,
    cursor: 'pointer', whiteSpace: 'nowrap',
    background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-layer-3)',
    // 点亮/变灰要看得出是同一个按钮在变，不是闪一下换了个东西
    transition: 'opacity .15s ease, background .15s ease, border-color .15s ease',
  },
  ghost: {
    borderColor: 'var(--dsw-alias-border-l2)', background: 'none',
    color: 'var(--dsw-alias-label-secondary)',
  },
  /** 次级按钮**可用**时也要有存在感 —— 否则和 disabled 看着一样。 */
  ghostOn: {
    borderColor: 'var(--dsw-alias-label-dimmed)',
    color: 'var(--dsw-alias-label-primary)',
  },
  disabled: { opacity: 0.35, cursor: 'default' },
  /** 输入框合法时给一点正反馈 —— 用户才知道「可以往下走了」。 */
  inputOk: { borderColor: 'var(--dsw-alias-label-dimmed)' },
  hint: {
    margin: '8px 0 0', fontSize: 12, lineHeight: 1.6,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  err: {
    margin: '8px 0 0', fontSize: 12, lineHeight: 1.6,
    color: 'var(--dsw-alias-state-error-primary, #ec1313)',
  },
  who: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  sub: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 },
}

async function post(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(d?.error ?? `HTTP ${r.status}`)
    e.retryAfter = d?.retryAfter
    throw e
  }
  return d
}

/**
 * @param props.configured  凭证里已经有 token 了吗（来自 describe）
 * @param props.onChanged   登录/登出后通知外层回读凭证状态
 */
function LoginPanel(props) {
  const { configured, onChanged } = props
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [left, setLeft] = useState(0)        // 重发倒计时
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(null)         // { phone, remaining, isNew }
  const timer = useRef(null)

  // 倒计时。秒数**来自服务端**（send-code 的 retry_after / 429 的 retryAfter），
  // 不在前端自己定 —— 节流的权威在服务端，两边各算一份迟早会不一致。
  useEffect(() => {
    if (left <= 0) return undefined
    timer.current = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(timer.current)
  }, [left])

  const sendCode = useCallback(async () => {
    setErr('')
    setSending(true)
    try {
      const d = await post('/auth/send-code', { phone })
      setLeft(d.retry_after ?? 60)
    } catch (e) {
      setErr(String(e?.message ?? e))
      // 服务端说还要等多久就等多久 —— 换个客户端刷新也绕不过去
      if (typeof e?.retryAfter === 'number') setLeft(e.retryAfter)
    }
    setSending(false)
  }, [phone])

  const verify = useCallback(async () => {
    setErr('')
    setVerifying(true)
    try {
      const d = await post('/auth/verify', { phone, code })
      setOk({ phone: d.phone, remaining: d.remaining, isNew: d.isNew })
      setCode('')
      onChanged?.()
    } catch (e) {
      setErr(String(e?.message ?? e))
    }
    setVerifying(false)
  }, [phone, code, onChanged])

  const logout = useCallback(async () => {
    setErr('')
    try {
      await post('/auth/logout')
      setOk(null)
      setPhone('')
      onChanged?.()
    } catch (e) {
      setErr(String(e?.message ?? e))
    }
  }, [onChanged])

  // 已登录态：这一轮刚登录成功，或者凭证里本来就有
  if (ok || configured) {
    return el('div', null,
      el('div', { style: L.row },
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: L.who }, ok ? `已登录 ${ok.phone}` : '已登录'),
          el('div', { style: L.sub },
            ok
              ? `${ok.isNew ? '注册成功，赠送 ' : '余额 '}${ok.remaining} 次`
              : '余额和用量见面板的「我的」页面'),
        ),
        el('button', {
          type: 'button', onClick: logout,
          style: { ...L.btn, ...L.ghost },
        }, '退出登录'),
      ),
      ok?.isNew
        ? el('p', { style: L.hint }, '可以开始用了。在对话框里跑 /cl-reddit-pain 试试。')
        : null,
      err ? el('p', { style: L.err, role: 'alert' }, err) : null,
    )
  }

  const phoneOk = /^1[3-9]\d{9}$/.test(phone)
  const canSend = phoneOk && !sending && left === 0
  // 码是 6 位定长 —— 满 6 位才点亮，省掉一次必然失败的往返
  const canVerify = phoneOk && code.length === 6 && !verifying
  // 发过码之后验证码框才有意义，之前灰着并说明原因
  const codeReady = left > 0 || Boolean(ok) || code.length > 0

  return el('div', null,
    el('div', { style: L.row },
      el('input', {
        type: 'tel', inputMode: 'numeric', autoComplete: 'tel',
        placeholder: '手机号', value: phone,
        maxLength: 11,
        onChange: (e) => setPhone(e.target.value.replace(/\D/g, '')),
        // 填够 11 位合法号就描边变深 —— 和右边按钮同时点亮
        style: { ...L.input, ...(phoneOk ? L.inputOk : null) },
      }),
      el('button', {
        type: 'button', disabled: !canSend, onClick: sendCode,
        style: {
          ...L.btn, ...L.ghost,
          ...(canSend ? L.ghostOn : L.disabled),
        },
      }, left > 0 ? `重新发送 (${left}s)` : sending ? '发送中…' : '获取验证码'),
    ),

    el('div', { style: { ...L.row, marginTop: 8 } },
      el('input', {
        type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code',
        placeholder: codeReady ? '6 位验证码' : '先获取验证码',
        value: code,
        maxLength: 6,
        onChange: (e) => setCode(e.target.value.replace(/\D/g, '')),
        style: {
          ...L.input,
          ...(code.length === 6 ? L.inputOk : null),
          ...(codeReady ? null : { opacity: 0.55 }),
        },
      }),
      el('button', {
        type: 'button', disabled: !canVerify, onClick: verify,
        style: { ...L.btn, ...(canVerify ? null : L.disabled) },
      }, verifying ? '登录中…' : '登录 / 注册'),
    ),

    err
      ? el('p', { style: L.err, role: 'alert' }, err)
      : el('p', { style: L.hint }, '新手机号自动注册，赠送免费额度。'),
  )
}

export { LoginPanel }
