/**
 * Consumer Lens —— 侧栏一个 tab + 设置页一张卡片。
 *
 * 面板**只读 + 一个动作**：不自己跑分析，只在用户点「分析评论」时往对话框发
 * 一条 /cl-tk-comments <id>，剩下的交给 skill。这样耗时操作、报错、中途追问
 * 全在对话框里，面板永远不用处理「正在跑」以外的状态。
 */
window.__ModuleLoader__.load({
  id: '@consumer-lens/lens',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect, useCallback, useRef } = React
    const el = React.createElement

    const API = '/consumer-lens/api'
    const NAMESPACE = 'consumer-lens'
    const CL_TOKEN = 'CL_TOKEN'
    const POLL_MS = 4000

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

    const CLS_COLOR = {
      ask: '#2563eb', gripe: '#dc2626', rival: '#b45309',
      love: '#15803d', noise: '#6b7280', none: '#c9c6c0',
    }
    const clsColor = (c) => CLS_COLOR[c] ?? CLS_COLOR.none

    const human = (n) => {
      if (typeof n !== 'number' || !isFinite(n)) return '—'
      if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
      if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}万`
      return String(n)
    }

    const S = {
      wrap: { display: 'flex', height: '100%', fontSize: 13, overflow: 'hidden' },
      side: {
        width: 240, flex: 'none', borderRight: '1px solid var(--border, #e5e3df)',
        overflowY: 'auto', padding: '8px 0',
      },
      main: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
      row: {
        padding: '8px 12px', cursor: 'pointer', borderLeft: '2px solid transparent',
        display: 'flex', flexDirection: 'column', gap: 2,
      },
      rowOn: { background: 'var(--bg-hover, #f0eeea)', borderLeftColor: '#15803d' },
      rowName: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      rowMeta: { fontSize: 11, opacity: 0.6 },
      empty: { padding: 24, opacity: 0.6, lineHeight: 1.8 },
      h1: { fontSize: 17, fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: 12, opacity: 0.6, margin: '0 0 20px' },
      statRow: { display: 'flex', gap: 20, flexWrap: 'wrap', margin: '0 0 20px' },
      statBox: { display: 'flex', flexDirection: 'column', gap: 2 },
      statV: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      statL: { fontSize: 11, opacity: 0.6 },
      group: { margin: '0 0 24px' },
      groupH: { display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 10px' },
      groupT: { fontSize: 15, fontWeight: 600 },
      groupHint: { fontSize: 12, opacity: 0.55 },
      topic: {
        margin: '0 0 12px', paddingLeft: 12,
        borderLeft: '2px solid var(--border, #e5e3df)',
      },
      topicH: { fontSize: 13, fontWeight: 500, marginBottom: 6 },
      topicN: { fontSize: 11, opacity: 0.5, fontWeight: 400, marginLeft: 6 },
      quote: { margin: '0 0 8px', lineHeight: 1.55 },
      qText: { fontStyle: 'italic' },
      qZh: { opacity: 0.65, fontSize: 12 },
      qLikes: { opacity: 0.45, fontSize: 11, marginLeft: 6, fontVariantNumeric: 'tabular-nums' },
      bar: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', margin: '0 0 8px' },
      legend: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, margin: '0 0 20px' },
      dot: { width: 8, height: 8, borderRadius: 2, display: 'inline-block', marginRight: 5 },
      note: { fontSize: 11, opacity: 0.5, marginTop: 20, lineHeight: 1.7 },
    }

    /** 意图分布条 —— 一根横条切成几段，比环形图省地方。 */
    function TopicBar({ topics }) {
      const top = (topics ?? []).filter((t) => t.sub !== true)
      const total = top.reduce((s, t) => s + (t.n ?? 0), 0)
      if (total === 0) return null

      return el(React.Fragment, null,
        el('div', { style: S.bar },
          top.map((t, i) =>
            el('div', {
              key: i,
              title: `${t.label} ${t.n}`,
              style: { flex: t.n ?? 0, background: clsColor(t.cls) },
            }),
          ),
        ),
        el('div', { style: S.legend },
          top.map((t, i) =>
            el('span', { key: i },
              el('span', { style: { ...S.dot, background: clsColor(t.cls) } }),
              `${t.label} ${t.n}`,
            ),
          ),
        ),
      )
    }

    function Detail({ data }) {
      const v = data.video ?? {}
      const a = data.audience ?? {}

      return el('div', null,
        el('h2', { style: S.h1 }, v.name ?? v.id ?? '未命名'),
        el('p', { style: S.sub },
          [v.author, v.play ? `▶${human(v.play)}` : null, v.comment ? `💬${human(v.comment)}` : null]
            .filter(Boolean).join('  ·  '),
          v.url ? el('a', {
            href: v.url, target: '_blank', rel: 'noreferrer',
            style: { marginLeft: 10, opacity: 0.7 },
          }, '打开视频 ↗') : null,
        ),

        (a.stats ?? []).length > 0 && el('div', { style: S.statRow },
          a.stats.map((s, i) =>
            el('div', { key: i, style: S.statBox },
              el('span', { style: S.statV }, s.value),
              el('span', { style: S.statL }, s.label),
            ),
          ),
        ),

        el(TopicBar, { topics: a.topics }),

        (data.groups ?? []).map((g, gi) =>
          el('section', { key: gi, style: S.group },
            el('div', { style: S.groupH },
              el('span', { style: S.groupT }, g.title),
              g.count ? el('span', { style: S.groupHint }, `${g.count} 条`) : null,
              g.hint ? el('span', { style: S.groupHint }, g.hint) : null,
            ),
            (g.topics ?? []).map((t, ti) =>
              el('div', { key: ti, style: S.topic },
                el('div', { style: S.topicH },
                  t.name,
                  el('span', { style: S.topicN },
                    [t.count ? `${t.count} 条` : null, t.likes ? `♥${human(t.likes)}` : null]
                      .filter(Boolean).join('  '),
                  ),
                ),
                (t.quotes ?? []).map((q, qi) =>
                  el('div', { key: qi, style: S.quote },
                    el('div', null,
                      el('span', { style: S.qText }, `“${q.text}”`),
                      q.likes ? el('span', { style: S.qLikes }, `♥${q.likes}`) : null,
                    ),
                    q.zh ? el('div', { style: S.qZh }, q.zh) : null,
                  ),
                ),
              ),
            ),
          ),
        ),

        (a.reads ?? []).length > 0 && el('div', { style: S.note },
          a.reads.map((r, i) => el('div', { key: i }, r)),
        ),
        data.data_note ? el('div', { style: S.note }, data.data_note) : null,
      )
    }

    function LensTab(props) {
      const ctx = props.ctx
      // TabComponentProps 给的是 scope，不是裸的 sessionId
      const sessionId = props.scope?.sessionId
      const [items, setItems] = useState([])
      const [sel, setSel] = useState(null)
      const [detail, setDetail] = useState(null)
      const mtimeRef = useRef(0)

      const reload = useCallback(async () => {
        try {
          setItems(await call('/list') ?? [])
        } catch {
          /* host 还没起来，下一轮再试 */
        }
      }, [])

      // 4s 轮询目录 mtime —— 变了说明 skill 写了新结果
      useEffect(() => {
        let alive = true
        reload()
        const timer = setInterval(async () => {
          try {
            const s = await call('/stat')
            if (!alive || !s) return
            if (s.mtime !== mtimeRef.current) {
              mtimeRef.current = s.mtime
              reload()
            }
          } catch {
            /* 忽略 */
          }
        }, POLL_MS)
        return () => { alive = false; clearInterval(timer) }
      }, [reload])

      useEffect(() => {
        if (sel === null) { setDetail(null); return }
        let alive = true
        call(`/item?id=${encodeURIComponent(sel)}`)
          .then((d) => { if (alive) setDetail(d) })
          .catch(() => { if (alive) setDetail(null) })
        return () => { alive = false }
      }, [sel])

      const analyze = useCallback(() => {
        const id = window.prompt('视频 id 或链接')
        if (!id) return
        const m = String(id).match(/\d{10,25}/)
        if (!m || !sessionId) return
        sendToConversation(ctx, sessionId, `/cl-tk-comments ${m[0]}`)
      }, [ctx, sessionId])

      return el('div', { style: S.wrap },
        el('div', { style: S.side },
          el('div', {
            style: { ...S.row, opacity: 0.75, borderBottom: '1px solid var(--border, #e5e3df)' },
            onClick: analyze,
          }, el('span', { style: S.rowName }, '+ 分析一条视频')),

          items.length === 0
            ? el('div', { style: { ...S.empty, fontSize: 12 } },
                '还没有分析结果。',
                el('br'), el('br'),
                '在对话框里跑 ',
                el('code', null, '/cl-tk-comments <视频id>'),
                ' ，结果会自动出现在这里。')
            : items.map((it) =>
                el('div', {
                  key: it.id,
                  style: { ...S.row, ...(sel === it.id ? S.rowOn : null) },
                  onClick: () => setSel(it.id),
                },
                  el('span', { style: S.rowName }, it.name),
                  el('span', { style: S.rowMeta },
                    [it.author, `${it.groups} 组`, `${it.quotes} 条引用`]
                      .filter(Boolean).join('  ·  ')),
                ),
              ),
        ),

        el('div', { style: S.main },
          detail
            ? el(Detail, { data: detail })
            : el('div', { style: S.empty },
                items.length === 0
                  ? '左边点「分析一条视频」，或在对话框里跑 /cl-tk-comments。'
                  : '选左边一条看详情。'),
        ),
      )
    }

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
      const refRef = useRef(CL_TOKEN)

      /** 读凭证状态。响应可能乱序，所以答案要连同它描述的 ref 一起存。 */
      const refresh = useCallback(async () => {
        const ref = refRef.current
        try {
          const list = await ctx.remote.credentials.describe([ref])
          if (refRef.current !== ref) return          // ref 变了，这条答案作废
          setInfo(list?.[0] ?? null)
        } catch {
          setInfo(null)
        }
      }, [ctx])

      useEffect(() => {
        refresh()
        // key 可能从别处被改（进程环境、另一个界面）—— 不听这个事件，
        // 徽章会一直显示一个 Host 早就替换掉的状态。
        // 事件走 remote 通道，用 ctx.remote.$on 而不是 ctx.on。
        const off = ctx.remote?.$on?.('credentials/reference-updated', refresh)
        return () => { if (typeof off === 'function') off() }
      }, [ctx, refresh])

      useEffect(() => {
        const scope = ctx.settingsScope?.bind({ namespace: NAMESPACE })
        Promise.resolve(scope?.get?.('apiBase'))
          .then((v) => setBase(v ?? ''))
          .catch(() => {})
      }, [ctx])

      const saveToken = useCallback(async () => {
        if (!draft) return
        setMsg('保存中…')
        try {
          await ctx.remote.credentials.set(CL_TOKEN, draft)
          setDraft('')
          // 必须回读 —— Host 是「这个 key 现在存不存在」的唯一权威，
          // 拒绝是通过回读体现的，不是靠返回值
          await refresh()
          setMsg('已保存')
        } catch (error) {
          setMsg(`保存失败：${String(error?.message ?? error)}`)
        }
      }, [ctx, draft, refresh])

      const saveBase = useCallback(async () => {
        const scope = ctx.settingsScope?.bind({ namespace: NAMESPACE })
        try {
          await scope?.set?.('apiBase', base)
          setMsg('地址已保存，下次调用生效')
        } catch (error) {
          setMsg(`保存失败：${String(error?.message ?? error)}`)
        }
      }, [ctx, base])

      // 当 key 由进程环境提供时写入会被 seam 拒绝，UI 要提前渲染成只读
      const writable = info?.writable !== false
      const configured = info?.configured === true

      const field = { width: '100%', padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        el('div', null,
          el('div', { style: { fontWeight: 600, marginBottom: 2 } }, 'Consumer Lens'),
          el('div', { style: { fontSize: 12, opacity: 0.6 } },
            '消费者洞察。数据只存在你自己的机器上。'),
        ),

        el('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          el('span', { style: { fontSize: 12 } },
            'CL_TOKEN　',
            el('span', { style: { color: configured ? '#15803d' : '#b45309' } },
              configured ? `已配置 ✓${info?.source ? `（${info.source}）` : ''}` : '未配置'),
          ),
          el('input', {
            id: 'cl-token-input',
            type: 'password',
            value: draft,
            disabled: !writable,
            placeholder: writable
              ? (configured ? '重新填写以替换' : 'cl_…')
              : '由环境变量提供，不可修改',
            onChange: (e) => setDraft(e.target.value),
            style: field,
          }),
        ),
        writable ? el('button', { onClick: saveToken, disabled: !draft }, '保存 token') : null,

        el('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          el('span', { style: { fontSize: 12 } }, 'API 地址'),
          el('input', {
            id: 'cl-base-input',
            type: 'text',
            value: base,
            placeholder: 'http://localhost:8000',
            onChange: (e) => setBase(e.target.value),
            style: field,
          }),
        ),
        el('button', { onClick: saveBase }, '保存地址'),

        msg ? el('div', { style: { fontSize: 12, opacity: 0.7 } }, msg) : null,
      )
    }

    /**
     * 侧栏图标。
     *
     * descriptor 的 `icon` 类型是 `ReactNode | ((size) => ReactNode)` ——
     * **不是组件**。传组件函数会让 React 拿它当元素类型渲染，报 #130。
     *
     * 而且要给 **ReactNode（已创建好的元素）而不是函数**：空面板的欢迎卡片
     * （PaneEmptyCards）把 `option.icon` 直接当 children 渲染，不会调用函数形式。
     */
    const makeLensIcon = (size = 18) =>
      el('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      },
        el('circle', { cx: 11, cy: 11, r: 6 }),
        el('path', { d: 'M11 8a3 3 0 0 0-3 3' }),
        el('path', { d: 'M20 20l-4.5-4.5' }),
      )

    const lensIcon = makeLensIcon(18)

    /**
     * **顶层 inject 是空的。**
     *
     * 每一个写进顶层 inject 的服务都是一个「缺了它整个插件就不加载」的条件。
     * 而 dsh 的公共 API 是 pre-stable 的（官方原话：升级时自己改自己仓库里的
     * 调用方 —— 我们不在那个仓库里），betterSidebar 更是第三方包、peer 依赖
     * 18 个 dsh 包。它一旦和当前 dsh 版本对不上，顶层 inject 会让 tools 和
     * skill 跟着一起废掉 —— 而那两样根本不需要 UI。
     *
     * 所以三块各自等各自的服务，谁没到谁不出现，互不牵连。
     */
    const inject = []

    /** 面板缺依赖时给一句人能读懂的话，而不是一屏 minified 堆栈。 */
    function warnMissing(what, why) {
      console.warn(
        `[Consumer Lens] ${what}未加载：${why}\n` +
          `                tools 和 /cl-tk-comments 不受影响，可继续在对话框里使用。`,
      )
    }

    function apply(ctx) {
      // ① 侧栏面板 —— 依赖第三方 betterSidebar，风险最高，所以单独等
      ctx.inject(['betterSidebar', 'sessions'], (sub) => {
        sub.effect(() =>
          sub.betterSidebar.registerTab({
            id: 'consumer-lens:main',
            title: 'Consumer Lens',
            icon: lensIcon,
            single: true,
            order: 100,
            component: LensTab,
          }),
        )
      })

      // 给一个自检：几秒内没等到就说明这个环境没有 betterSidebar
      ctx.effect(() => {
        const timer = setTimeout(() => {
          if (ctx.get('betterSidebar') === undefined) {
            warnMissing(
              '侧栏面板',
              '需要 dsh-better-sidebar，当前未安装或与 dsh 版本不兼容',
            )
          }
        }, 5000)
        return () => clearTimeout(timer)
      })

      // ② 设置卡片 —— 要 remote.credentials，那是远端连接就绪后才有的服务。
      // 等不到就只是没有卡片，侧栏 tab 和 tools 都不受影响。
      ctx.inject(['slots', 'remote', 'remote.credentials', 'settingsScope'], (sub) => {
        // 插槽是 keyed 的，key 就是设置命名空间 —— 这正是「repository 外分发
        // 的插件」贡献一张卡片的方式：它注册自己的命名空间，标签页把两者配对，
        // 而不需要知道那个命名空间是什么意思。
        sub.effect(() =>
          sub.slots.register('settings.plugin.item', {
            key: NAMESPACE,
            component: SettingsCard,
          }),
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
