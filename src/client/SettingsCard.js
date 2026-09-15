/**
 * 设置页那张卡 —— 服务端地址 + token。
 *
 * **两半配对才出现**：Host 侧注册命名空间（src/index.js），这里注册同 key
 * 的卡片，「插件」标签页把两者配对。只做这半的话卡片永远不会被 dispatch。
 *
 * 样式**照抄官方 CSS module 的数值**，用设计 token 取色 —— 官方那几个组件
 * 都没导出，第三方拿不到，能共享的只有全局 CSS 变量。
 */
import { el, useState, useEffect, useCallback, useRef } from './react.js'
import { NAMESPACE, CL_TOKEN } from './constants.js'

/** 服务端地址的固定选项。加一个环境就在这儿加一行。 */
const API_CHOICES = [
  { value: 'http://localhost:8000', label: '本地服务端（开发用）' },
  { value: 'https://api.consumer-lens.com', label: '线上服务端' },
]
const CUSTOM = '__custom__'

/**
 * 设置卡片的样式 —— **照抄官方 CSS module 的数值**，用设计 token 取色。
 *
 * 为什么是内联样式而不是 import css：
 * `@deepseek-ai/dsh-client-ui-settings-plugins` 的 `files` 只发
 * `lib/index.js` / `lib/client.js` / `*.d.ts` —— PluginCard、ValueField、
 * SecretField 和它们的 `.module.css` **都没导出**，第三方拿不到。
 * 能共享的只有**全局 CSS 变量**，那才是真正的对齐机制。
 *
 * token 定义在 ui-theme/src/styles/design-platform.css，挂在 `body` 上
 * （深色是 `body[data-ds-dark-theme]`），所以内联 var() 会继承、
 * 并且跟着主题自动切换。原来写死 #15803d / #b45309 就是不跟主题的根因。
 *
 * ⚠️ 官方 CSS 里的 `--dsw-alias-label-error` **不存在**（主题里从没定义，
 * 他们那行其实是静默回退到继承色）。真名是 `--dsw-alias-state-error-primary`，
 * 这里用它，并带一个字面量兜底。
 *
 * 数值全部对齐 PluginCard.module.css / fields.module.css，改之前先去那两个
 * 文件对一眼，别在这里自己发明间距。
 */
const ERR = 'var(--dsw-alias-state-error-primary, #ec1313)'
const CARD = {
  card: {
    listStyle: 'none',
    border: '0.5px solid var(--dsw-alias-border-l4)',
    borderRadius: 16,
    background: 'var(--dsw-alias-bg-layer-3)',
  },
  cardOpen: {
    background: 'var(--dsw-alias-bg-layer-2)',
    borderColor: 'var(--dsw-alias-label-dimmed)',
  },
  header: {
    width: '100%',
    appearance: 'none',
    border: 0,
    background: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 12,
  },
  headText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  name: {
    fontSize: 15, fontWeight: 600, lineHeight: 1.4,
    color: 'var(--dsw-alias-label-primary)',
  },
  description: {
    fontSize: 13, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  chevron: {
    flex: 'none', color: 'var(--dsw-alias-label-tertiary)',
    transition: 'transform .16s', display: 'block',
  },
  pending: {
    flex: 'none', borderRadius: 999, padding: '1px 8px',
    fontSize: 11, lineHeight: '17px', fontWeight: 500, whiteSpace: 'nowrap',
    background: 'var(--dsw-alias-bg-module-platform)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  body: {
    borderTop: '0.5px solid var(--dsw-alias-border-l2)',
    margin: '0 16px',
    paddingBottom: 8,
  },
  readOnly: {
    margin: '12px 0 0', fontSize: 12, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  // fields.module.css .field
  field: { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0' },
  fieldSep: { borderTop: '0.5px solid var(--dsw-alias-border-l2)' },
  head: { display: 'flex', alignItems: 'center', gap: 8 },
  label: {
    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-primary)',
  },
  badge: {
    borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '17px',
    whiteSpace: 'nowrap', fontWeight: 500,
    background: 'var(--dsw-alias-bg-module-platform)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  badgeMuted: {
    borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '17px',
    whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-tertiary)',
  },
  input: {
    height: 34, padding: '0 12px',
    border: '0.5px solid var(--dsw-alias-border-l4)',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-3)',
    font: 'inherit', fontSize: 13, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-primary)',
    boxSizing: 'border-box',
    width: '100%',
  },
  hint: {
    margin: 0, fontSize: 12, lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },
  invalid: { margin: 0, fontSize: 12, lineHeight: 1.5, color: ERR },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
    padding: '12px 0 4px',
    borderTop: '0.5px solid var(--dsw-alias-border-l2)',
  },
  btn: {
    appearance: 'none', border: '1px solid transparent', borderRadius: 8,
    padding: '5px 14px', font: 'inherit', fontSize: 13, lineHeight: 1.5,
    cursor: 'pointer',
  },
  discard: {
    borderColor: 'var(--dsw-alias-border-l2)',
    background: 'none',
    color: 'var(--dsw-alias-label-secondary)',
  },
  save: {
    background: 'var(--dsw-alias-label-primary)',
    color: 'var(--dsw-alias-bg-layer-3)',
  },
  disabled: { opacity: 0.4, cursor: 'default' },
}

/**
 * 凭证**在哪一层**，决定了该说什么 —— 不能笼统说「存在托管凭证库里」。
 *
 * credentials-local 按信任度分四层（credentials-local/src/index.ts:1）：
 *
 *   继承来的进程环境        只读，优先级最高
 *   > $DSH_HOME/.credentials.yaml   provider 托管，可写
 *   > <启动目录>/.env       只读兜底
 *   > $DSH_HOME/.env        只读兜底
 *
 * 我们自己是 `CL_TOKEN=… dsh --profile lens` 起的，所以命中第一层，
 * 托管库里其实**什么都没有** —— 说「存在托管凭证库里」是假的，
 * 而且和上面那个 source 徽章自相矛盾。
 *
 * 真正的保证只有一条：**设置文档里只存引用（一个环境变量名），
 * 不存值**；值由 provider owns。加上 describe() 只回
 * {configured, source, writable}，值永远不过线回浏览器。
 */
// 四个 source 字面量来自 credentials-local 的 resolve/describe：
// 'env' | 'file' | 'project-env' | 'user-env'（后两个是 .env 兜底层）。
const SOURCE_HINT = {
  env: '由启动时的进程环境变量提供，优先级最高，不能从这里改 —— 要换就改启动命令。',
  file: '存在 dsh 托管的凭证库（$DSH_HOME/.credentials.yaml）里。'
    + '设置文档只记这个引用名，不记值。',
  'project-env': '来自启动目录的 .env；在这里保存会写进托管凭证库并盖住它。',
  'user-env': '来自 $DSH_HOME/.env；在这里保存会写进托管凭证库并盖住它。',
  unset: '填进来会存到 dsh 托管的凭证库，设置文档只记引用名、不记值，值也不会回到浏览器。',
}

/** 徽章上别露 provider 的内部字面量（'env' / 'project-env'）。 */
const SOURCE_LABEL = {
  env: '环境变量',
  file: '凭证库',
  'project-env': '项目 .env',
  'user-env': '用户 .env',
}

/** 官方那个 chevron 是 IconChevronDownOutline14，没导出，这里画一个同尺寸的。 */
const chevron = (open) =>
  el('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': true,
    style: { ...CARD.chevron, transform: open ? 'rotate(180deg)' : 'none' },
  }, el('path', { d: 'M6 9l6 6 6-6' }))


/**
 * 设置卡片 —— 用户贴 token、改 API 地址的正规入口。
 *
 * 两个值走**两条不同的通道**，这不是随意的：
 *   CL_TOKEN  → remote.credentials，值只朝一个方向过线，UI 永远显示不出来
 *   apiBase   → settingsScope 普通配置，明文可见可改
 *
 * token 用 credentials 是对的；apiBase 用它就坏了 —— 用户配错了地址，
 * 界面上只能告诉他「已配置」，看不见配的是什么，排查全靠猜。
 */
function SettingsCard(props) {
  const ctx = props.ctx
  const [info, setInfo] = useState(null)     // { configured, source, writable }
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState('')
  const [base, setBase] = useState('')
  // 设置命名空间的镜像状态 —— loading / ready / unavailable + 能不能写
  const [scopeState, setScope] = useState({ status: 'loading', writable: true })
  const refRef = useRef(CL_TOKEN)

  // 折叠是卡片自己的状态 —— 官方 PluginCard 也是 useState，
  // 「用户展开了哪张卡」是阅读动作，Host 和 section 都不关心。
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // 已落盘的地址。和 base（草稿）比较得出 dirty —— 官方卡片是
  // **暂存后一次性保存**，不是每个控件各自写：一次编辑不该变成
  // 用户没要求、也没法预览的写入。
  const [saved, setSaved] = useState('')
  // pull 是订阅回调，拿不到最新的 saved state，所以用 ref 传递
  const savedRef = useRef('')

  /**
   * 读凭证状态。响应可能乱序，所以答案要连同它描述的 ref 一起存。
   *
   * ⚠️ remote 方法的两个契约，踩错任何一个都是「静默拿不到数据」：
   *
   * ① 返回 **Result 信封** `{ ok: true, value } | { ok: false, error }`，
   *    而不是裸值。载体故障被折进 error 分支 —— 也就是说**它不 throw**，
   *    try/catch 是死代码（只有 arity 不对之类的装配错误才 reject）。
   *
   * ② `describe(refs)` 的 value 是**按 ref 名 keyed 的对象**，不是数组。
   *    写 `value[0]` 永远是 undefined，徽章就永远停在「未配置」。
   *
   * 对照样板：ui-settings-plugins/src/client/web-search-card-controller.ts
   * 的 readCredential()。
   */
  const refresh = useCallback(async () => {
    const ref = refRef.current
    const res = await ctx.remote.credentials.describe([ref])
    if (refRef.current !== ref) return            // ref 变了，这条答案作废
    if (res?.ok !== true) return setInfo(null)
    setInfo(res.value?.[ref] ?? null)
  }, [ctx])

  useEffect(() => {
    refresh()
    // key 可能从别处被改（进程环境、另一个界面）—— 不听这个事件，
    // 徽章会一直显示一个 Host 早就替换掉的状态。
    // 事件走 remote 通道，用 ctx.remote.$on 而不是 ctx.on。
    const off = ctx.remote?.$on?.('credentials/reference-updated', refresh)
    return () => { if (typeof off === 'function') off() }
  }, [ctx, refresh])

  /**
   * scope 是**同步的响应式镜像**，不是异步 getter。
   *
   * ⚠️ `SettingsScope` 上**没有 get()**（契约只有 getSnapshot / subscribe /
   * set / unset / mutate）。原来写的 `scope?.get?.('apiBase')` 被可选调用
   * 吞掉 —— 不报错、永远 undefined，输入框就永远空着。
   *
   * 而且必须 subscribe：首帧 status 是 'loading'（value 还是 undefined），
   * Host 的 section 到了之后才变 'ready'。只读一次就会把「还没到」
   * 当成「没配过」。
   *
   * 契约见 ui-settings/src/client/settings-contract.ts:54。
   */
  useEffect(() => {
    const scope = ctx.settingsScope?.bind({ namespace: NAMESPACE })
    if (scope === undefined) return

    const pull = () => {
      const snap = scope.getSnapshot()
      // status: 'unavailable' = 这个命名空间根本没暴露给本客户端，
      // 或者连接是 memory 模式 —— 那种情况下写入永远落不了盘，
      // 得让界面说出来，而不是给一个存不进去的表单。
      setScope({ status: snap.status, writable: snap.writable })

      if (snap.status !== 'ready') return
      // 没配过时落到默认那一项，而不是「自定义 + 空框」
      const next = snap.value?.apiBase || API_CHOICES[0].value
      setSaved(next)
      // 只在没有未保存草稿时跟随镜像 —— 否则别处的一次提交
      // 会把用户手上正在改的地址覆盖掉。
      setBase((cur) => (cur === '' || cur === savedRef.current ? next : cur))
      savedRef.current = next
    }

    pull()
    return scope.subscribe(pull)
  }, [ctx])

  // 当 key 由进程环境提供时写入会被 seam 拒绝，UI 要提前渲染成只读
  const tokenWritable = info?.writable !== false
  const configured = info?.configured === true

  // 地址那半能不能存，取决于设置文档 —— 和 token 那半是两条独立通道：
  // credentials 接受写入时 settings 文档可能仍是只读的，两边各自拒绝。
  const baseWritable = scopeState.status === 'ready' && scopeState.writable !== false
  const unavailable = scopeState.status === 'unavailable'

  // 一次保存覆盖卡片上所有暂存的东西 —— 和官方 CardForm 一致
  const dirty = (draft !== '') || (base !== saved && base !== '')
  const blocked = !dirty || saving

  const saveAll = useCallback(async () => {
    setSaving(true)
    setMsg('')
    const errs = []

    if (draft !== '') {
      // set 同样走 Result 信封：失败在 res.ok === false，不是异常。
      // 原来靠 try/catch 判断，所以 Host 拒绝时 UI 照样显示「已保存」。
      const res = await ctx.remote.credentials.set(CL_TOKEN, draft)
      if (res?.ok !== true) errs.push(`token：${String(res?.error?.message ?? '被拒绝')}`)
      else {
        setDraft('')
        // 必须回读 —— Host 是「这个 key 现在存不存在」的唯一权威。
        await refresh()
      }
    }

    if (base !== saved && base !== '') {
      const scope = ctx.settingsScope?.bind({ namespace: NAMESPACE })
      if (scope === undefined) errs.push('地址：设置服务未就绪')
      else {
        // 和 remote 方法相反：scope.set 是**会 reject 的** promise
        // （revision 冲突、校验失败、文档只读），所以这里 try/catch 是对的。
        try {
          await scope.set('apiBase', base)
          setSaved(base)
          savedRef.current = base
        } catch (error) {
          errs.push(`地址：${String(error?.message ?? error)}`)
        }
      }
    }

    setSaving(false)
    setMsg(errs.length > 0 ? errs.join('；') : '已保存，下次调用生效')
  }, [ctx, draft, base, saved, refresh])

  const discard = useCallback(() => {
    setDraft('')
    setBase(saved)
    setMsg('')
  }, [saved])

  const custom = !API_CHOICES.some((o) => o.value === base)

  // 结构照 PluginCard：<li> + header 按钮 + 展开的 body + footer 两个按钮。
  // 外层是 <li> 因为 ConfigurablePluginsTab 把卡片渲染进一个列表里 ——
  // 用 <div> 会在 <ul> 里变成非法子元素，间距也跟邻居对不上。
  return el('li', {
    style: { ...CARD.card, ...(open ? CARD.cardOpen : null) },
  },
    el('button', {
      type: 'button',
      style: CARD.header,
      'aria-expanded': open,
      onClick: () => setOpen(!open),
    },
      el('span', { style: CARD.headText },
        el('span', { style: CARD.name }, 'Consumer Lens'),
        el('span', { style: CARD.description },
          '消费者洞察：Reddit 买家痛点。数据只存在你自己的机器上。'),
      ),
      // 折叠起来也要说出「这张卡有未保存的改动」
      dirty ? el('span', { style: CARD.pending }, '未保存') : null,
      chevron(open),
    ),

    open
      ? el('div', { style: CARD.body },
          unavailable
            ? el('p', { style: CARD.readOnly, role: 'status' },
                '设置文档不可用：地址改动不会被保存（token 仍可保存）。')
            : null,

          // ── CL_TOKEN ──────────────────────────────────────────
          el('div', { style: CARD.field },
            el('div', { style: CARD.head },
              el('label', { style: CARD.label, htmlFor: 'cl-token-input' }, '访问令牌'),
              el('span', {
                style: configured ? CARD.badge : CARD.badgeMuted,
              }, configured
                ? `已配置${SOURCE_LABEL[info?.source] ? `（${SOURCE_LABEL[info.source]}）` : ''}`
                : '未配置'),
            ),
            el('input', {
              id: 'cl-token-input',
              type: 'password',
              autoComplete: 'off',
              value: draft,
              disabled: !tokenWritable,
              onChange: (e) => setDraft(e.target.value),
              style: { ...CARD.input, ...(tokenWritable ? null : CARD.disabled) },
            }),
            el('p', { style: CARD.hint }, SOURCE_HINT[info?.source] ?? SOURCE_HINT.unset),
          ),

          // ── API 地址 ──────────────────────────────────────────
          // 下拉而不是自由输入：地址打错时工具报的是「无法连接到
          // http://localhs:8000」，用户很难一眼看出是自己少打了个字母。
          el('div', { style: { ...CARD.field, ...CARD.fieldSep } },
            el('div', { style: CARD.head },
              el('label', { style: CARD.label, htmlFor: 'cl-base-input' }, '服务端地址'),
              base !== saved && base !== ''
                ? el('span', { style: CARD.badge }, '已修改')
                : null,
            ),
            el('select', {
              id: 'cl-base-input',
              value: custom ? CUSTOM : base,
              disabled: !baseWritable,
              onChange: (e) => setBase(e.target.value === CUSTOM ? '' : e.target.value),
              style: { ...CARD.input, ...(baseWritable ? null : CARD.disabled) },
            },
              API_CHOICES.map((o) =>
                el('option', { key: o.value, value: o.value }, o.label)),
              el('option', { value: CUSTOM }, '自定义…'),
            ),
            // 选了「自定义」才出现输入框 —— 平时不占地方，需要时又跑得掉
            custom
              ? el('input', {
                  id: 'cl-base-custom',
                  type: 'text',
                  value: base,
                  placeholder: 'https://…',
                  disabled: !baseWritable,
                  onChange: (e) => setBase(e.target.value),
                  style: { ...CARD.input, ...(baseWritable ? null : CARD.disabled) },
                })
              : null,
            el('p', { style: CARD.hint }, '取数和计费都走这个地址。'),
          ),

          // ── footer ────────────────────────────────────────────
          el('div', { style: CARD.footer },
            msg
              ? el('p', {
                  style: {
                    flex: 1, minWidth: 0, margin: 0, fontSize: 12, lineHeight: 1.5,
                    color: msg.startsWith('已保存')
                      ? 'var(--dsw-alias-label-tertiary)'
                      : ERR,
                  },
                  role: 'status',
                }, msg)
              : null,
            el('button', {
              type: 'button',
              disabled: blocked,
              onClick: discard,
              style: { ...CARD.btn, ...CARD.discard, ...(blocked ? CARD.disabled : null) },
            }, '放弃'),
            el('button', {
              type: 'button',
              disabled: blocked,
              onClick: saveAll,
              style: { ...CARD.btn, ...CARD.save, ...(blocked ? CARD.disabled : null) },
            }, saving ? '保存中…' : '保存'),
          ),
        )
      : null,
  )
}


export { SettingsCard }

