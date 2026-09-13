/**
 * Consumer Lens —— 右栏一个 tab + 设置页一张卡片。
 *
 * 面板**只读**：不自己跑分析，也不发起任务 —— 跑分析是用户在对话框里
 * 说话触发的（/cl-reddit-pain <产品>）。这样耗时操作、报错、中途追问
 * 全在对话框里，面板永远不用处理「正在跑」以外的状态。
 *
 * **挂在 dsh 原生的 sidebarRightTabs 上，不依赖 dsh-better-sidebar。**
 * 那个第三方包自己 peer 18 个 dsh 包，版本错一位就整个面板挂掉；而它做的事
 * 不过是包装这里用的同一套原生 API（它自己也 inject 'sidebarRightTabs'）。
 * 少一层中间商 = 用户少装一个包，也不用再锁 0.19.1。
 *
 * 注册分两段（契约见 @deepseek-ai/dsh-client-ui-sidebar-right 的 README）：
 *   ① 类型：ctx.sidebarRightTabs.register({ id, kind, title, guide })
 *   ② 本体：ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)
 * 两段都放进各自的 ctx.effect，注册的寿命就等于插件的寿命。
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

    const S = {
      // height:100% 会在「父级没有确定高度」时塌成 0 —— 原生 seat 的容器
      // 不保证给高度（旧的 better-sidebar 给）。用 flex:1 + minHeight 兜底：
      // 父级是 flex 就撑满，不是 flex 就用 minHeight 保证看得见。
      wrap: {
        display: 'flex', flex: 1, minHeight: 320, height: '100%',
        fontSize: 13, overflow: 'hidden',
      },
      // 右栏本来就窄，list 给 168 就够：一行一个品名 + 一行摘要。
      side: {
        width: 168, flex: 'none', borderRight: '1px solid var(--border, #e5e3df)',
        overflowY: 'auto', padding: '0 0 8px',
      },
      sideHead: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 8px',
        borderBottom: '1px solid var(--border, #e5e3df)', marginBottom: 4,
        position: 'sticky', top: 0, background: 'var(--bg, transparent)',
      },
      backBtn: {
        border: '1px solid var(--border, #e5e3df)', borderRadius: 5,
        background: 'transparent', color: 'inherit', font: 'inherit',
        cursor: 'pointer', padding: '1px 7px', fontSize: 12, flex: 'none',
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
      warn: {
        border: '1px solid rgba(180,112,14,0.45)', background: 'rgba(180,112,14,0.08)',
        borderRadius: 6, padding: '11px 13px', marginBottom: 14, fontSize: 12.5,
      },
      h1: { fontSize: 17, fontWeight: 600, margin: '0 0 4px' },
      statRow: { display: 'flex', gap: 20, flexWrap: 'wrap', margin: '0 0 20px' },
      statBox: { display: 'flex', flexDirection: 'column', gap: 2 },
      statV: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      statL: { fontSize: 11, opacity: 0.6 },
      topic: {
        margin: '0 0 12px', paddingLeft: 12,
        borderLeft: '2px solid var(--border, #e5e3df)',
      },
      qText: { fontStyle: 'italic' },
      note: { fontSize: 11, opacity: 0.5, marginTop: 20, lineHeight: 1.7 },

      // ── 宫格 ──
      // 三级导航都是单栏（grid / list / report 各占满宽），不再左右分栏：
      // 右栏本来就窄，再切一刀两边都不够用。
      single: { flex: 1, minHeight: 320, height: '100%', overflowY: 'auto', padding: '16px 18px', fontSize: 13 },
      slug: { fontSize: 12, opacity: 0.6, margin: '0 0 20px' },
      code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
      layer: { margin: '0 0 20px' },
      layerT: { fontSize: 14, fontWeight: 600 },
      // app 图标网格：92px 一格，窄面板也能并排放下三四个
      grid: { display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' },
      appCell: {
        border: 'none', background: 'transparent', color: 'inherit', font: 'inherit',
        cursor: 'pointer', padding: '12px 4px', borderRadius: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
      },
      appName: {
        fontSize: 12, fontWeight: 500, textAlign: 'center', lineHeight: 1.3,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      cell: {
        border: '1px solid var(--border, #e5e3df)', borderRadius: 8,
        padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7,
        minHeight: 84, textAlign: 'left', font: 'inherit', color: 'inherit',
        background: 'transparent', cursor: 'pointer',
      },
      cellOff: { opacity: 0.45, cursor: 'not-allowed' },
      cross: { border: '1px solid var(--border, #e5e3df)', borderRadius: 8, padding: '2px 0' },
      xrow: { display: 'flex', gap: 9, padding: '9px 13px', alignItems: 'flex-start' },
      xname: { fontWeight: 500 },
      xsrc: { fontSize: 11, opacity: 0.6, marginTop: 2 },
      xverdict: { fontSize: 11.5, marginTop: 3 },
    }

    /** 相对时间。saved_at 是毫秒时间戳，缺了就不显示这一段。 */
    const ago = (ts) => {
      if (!ts) return ''
      const s = Math.max(0, (Date.now() - ts) / 1000)
      if (s < 60) return '刚刚'
      if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
      if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
      return `${Math.floor(s / 86400)} 天前`
    }

    function LensTab(props) {
      const ctx = props.ctx
      // sessionId 由 slot 的 inject(sessionId) 注进来 —— 不能从 useTabInfo()
      // 里拿：那个 hook 返回的 tab 是 layout 记录（id/title/host…），
      // sessionId 只活在它的工厂闭包里，没有出现在返回值上。
      const sessionId = props.sessionId
      // 两级：grid（选模块） → 模块内 list + report 同屏（左右分栏）。
      // 同屏是因为用户要横着比：切一个品，右边立刻换报告，不用来回跳。
      const [mod, setMod] = useState(null)
      const [pick, setPick] = useState(null)

      // 每个模块一份 list，按 kind 缓存。grid 上要显示各模块的研究数，
      // 所以进任何一个模块之前就得把它们都拉回来。
      const [lists, setLists] = useState({})
      const [report, setReport] = useState(null)
      const mtimeRef = useRef(0)

      const reload = useCallback(async () => {
        const next = {}
        for (const m of MODULES) {
          if (!m.wired) { next[m.id] = []; continue }
          try {
            next[m.id] = await call(`/list?kind=${encodeURIComponent(m.id)}`) ?? []
          } catch {
            next[m.id] = []   // host 还没起来，下一轮再试
          }
        }
        setLists(next)
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

      // token 配没配好 —— 没配的话面板能打开但跑不动，要在首页就说清楚，
      // 否则用户只会看到一个空列表，不知道缺什么。
      const [ready, setReady] = useState(null)   // null=还没查出来
      useEffect(() => {
        let alive = true

        // ⚠️ 必须 ctx.get('remote')，不能写 ctx.remote?.…
        //
        // cordis 铁律（见文件顶部 sendToConversation 的注释）：裸属性访问
        // ctx.foo 只在 foo 写进 inject 时才合法，否则 proxy 的 get trap
        // **直接抛**。`?.` 挡不住 —— 异常在读 .remote 那一刻就抛了，
        // 可选链根本没轮到。而这里是渲染期，一抛整个面板就白屏。
        //
        // LensTab 的 inject 里只有 sidebarRightTabs/slots/sessions，
        // remote 是可选的（连接就绪后才有），所以只能用 get 查询。
        const remote = ctx.get?.('remote')

        const check = async () => {
          try {
            const list = await remote?.credentials?.describe?.([CL_TOKEN])
            if (alive) setReady(list?.[0]?.configured === true)
          } catch {
            if (alive) setReady(null)   // 查不了就别吓唬用户
          }
        }
        check()

        const off = remote?.$on?.('credentials/reference-updated', check)
        return () => { alive = false; if (typeof off === 'function') off() }
      }, [ctx])

      // 选中一条就去读完整报告。404 = 还没分析，是正常状态不是错误。
      useEffect(() => {
        if (pick === null || mod === null) { setReport(null); return }
        let alive = true
        call(`/item?kind=${encodeURIComponent(mod)}&id=${encodeURIComponent(pick)}`)
          .then((d) => { if (alive) setReport(d) })
          .catch(() => { if (alive) setReport(null) })
        return () => { alive = false }
      }, [mod, pick])


      /** 开跑 = 往对话框发指令。面板自己从不跑分析。 */
      const run = useCallback((moduleId, topic) => {
        if (!sessionId) return
        sendToConversation(ctx, sessionId, `/${moduleId} ${topic}`)
      }, [ctx, sessionId])

      // ── ① grid：选模块 ──
      if (!mod) {
        return el('div', { style: S.single },
          el('h2', { style: { ...S.h1, marginBottom: 16 } }, 'Consumer Lens'),

          // 配置在标准位置：设置 → 插件 → Consumer Lens。
          // 面板只负责告诉用户「缺了什么」，不自己做一套配置表单 ——
          // 那会变成两个都要维护的入口。
          ready === false
            ? el('div', { style: S.warn },
                el('div', { style: { fontWeight: 600, marginBottom: 3 } }, '还没配 token'),
                el('div', { style: { opacity: 0.8, lineHeight: 1.6 } },
                  '打开 设置 → 插件 → Consumer Lens，填入 token 和 API 地址。'),
              )
            : null,

          el('div', { style: S.grid },
            MODULES.map((m) =>
              el('button', {
                key: m.id,
                type: 'button',
                disabled: !m.wired,
                title: m.wired ? m.name : `${m.name}（还没接进插件）`,
                onClick: m.wired ? () => { setMod(m.id); setPick(null) } : undefined,
                style: { ...S.appCell, ...(m.wired ? null : S.cellOff) },
              },
                appIcon(m.icon, 56),
                el('span', { style: S.appName }, m.name),
              ),
            ),
          ),
        )
      }

      // ── ② 模块内：左 list + 右 report ──
      const m = MODULES.find((x) => x.id === mod)
      const rows = lists[mod] ?? []

      return el('div', { style: S.wrap },
        // 左：研究列表
        el('div', { style: S.side },
          el('div', { style: S.sideHead },
            el('button', {
              type: 'button',
              onClick: () => { setMod(null); setPick(null) },
              title: '返回模块',
              style: S.backBtn,
            }, '←'),
            el('span', { style: { fontWeight: 600, fontSize: 12.5 } }, m.name),
          ),

          rows.length === 0
            ? el('div', { style: { ...S.empty, fontSize: 12, padding: '16px 12px' } },
                '还没跑过。')
            : rows.map((row) =>
                el('div', {
                  key: row.slug,
                  style: { ...S.row, ...(pick === row.slug ? S.rowOn : null) },
                  onClick: () => setPick(row.slug),
                },
                  el('span', { style: S.rowName }, row.name),
                  el('span', { style: S.rowMeta },
                    [`${row.pains ?? 0} 痛点`, `${row.posts ?? 0} 帖`, ago(row.saved_at)]
                      .filter(Boolean).join(' · ')),
                ),
              ),
        ),

        // 右：报告
        el('div', { style: S.main },
          report === null
            ? el('div', { style: S.empty },
                rows.length === 0
                  ? el(React.Fragment, null,
                      '还没跑过 ', el('b', null, m.name), '。', el('br'), el('br'),
                      '在对话框里跑 ',
                      el('code', { style: S.code }, `/${mod} <产品>`),
                      '，结果几秒后自动出现在这里。')
                  : '选左边一个研究看报告。')
            : el(Report, { r: report }),
        ),
      )
    }

    /** 报告正文 —— 面板读 JSON 自己渲染，不嵌 iframe。 */
    function Report({ r }) {
      // 可选字段缺了就少显示一块，不能让整个报告崩掉 ——
      // cl_save 的校验是宽松的，只保证 product 和 pain_points 在。
      const meta = r.meta ?? {}
      const subs = meta.subreddits ?? []
      const terms = meta.search_terms ?? []
      const pains = r.pain_points ?? []
      const opps = r.opportunities ?? []

      return el('div', null,
        el('h2', { style: S.h1 }, r.product),
        el('p', { style: S.slug },
          el('code', { style: S.code }, r.slug ?? ''),
          r.generated_at ? ` · ${r.generated_at}` : null),

        r.summary ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 12px' } }, r.summary) : null,
        r.demand_validation
          ? el('p', { style: { fontSize: 12.5, opacity: 0.75, lineHeight: 1.7, margin: '0 0 18px' } },
              r.demand_validation)
          : null,

        el('div', { style: S.statRow },
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, meta.posts_collected ?? '—'),
            el('span', { style: S.statL }, '高价值帖')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, meta.posts_scanned ?? '—'),
            el('span', { style: S.statL }, '扫过')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, subs.length),
            el('span', { style: S.statL }, 'subreddit')),
        ),

        // 检索策略要看得见 —— subreddit 的选择本身就是策略的一部分
        (terms.length > 0 || subs.length > 0)
          ? el('div', { style: { ...S.note, marginTop: 0, marginBottom: 20 } },
              terms.length ? el('div', null, '检索词：', terms.join('  /  ')) : null,
              subs.length ? el('div', null, subs.join('　')) : null,
            )
          : null,

        el('h3', { style: S.layerT }, '痛点'),
        pains.map((p, i) =>
          el('section', { key: i, style: { margin: '10px 0 18px' } },
            el('div', { style: { fontWeight: 600, marginBottom: 3 } }, `${i + 1}. ${p.title}`),
            el('div', { style: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.65, marginBottom: 8 } },
              p.description),
            (p.evidence ?? []).map((e, j) =>
              el('div', { key: j, style: S.topic },
                el('div', { style: S.qText }, `“${e.text}”`),
                el('div', { style: { ...S.rowMeta, marginTop: 3 } },
                  el('a', {
                    href: e.post_url, target: '_blank', rel: 'noreferrer',
                    style: { color: 'inherit' },
                  }, e.post_title),
                  `　·　${e.subreddit}　·　♥${e.score}`),
              ),
            ),
          ),
        ),

        opps.length > 0 ? el('h3', { style: S.layerT }, '机会') : null,
        opps.length > 0 ? el('div', { style: { ...S.cross, marginTop: 10 } },
          opps.map((o, i) =>
            el('div', {
              key: i,
              style: { ...S.xrow, borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)' },
            },
              el('span', null, o.feasibility === 'high' ? '✅' : '🟡'),
              el('span', null,
                el('span', { style: S.xname }, o.title),
                el('div', { style: S.xsrc }, `可行性 ${o.feasibility}`),
                el('div', { style: S.xverdict }, o.note),
              ),
            ),
          ),
        ) : null,
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

    // ════════════════════════════════════════════════════════════════
    // 假数据 —— 只为把交互敲定。接 store 时整段删掉，换成 /research 路由。
    // 真实数据到位前，这里的形状就是将来 store 要返回的形状。
    // ════════════════════════════════════════════════════════════════

    /**
     * 三层 + 交叉，对应 docs/ux.md §3。每格一个 skill。
     *
     * 分层不是装饰：它编码了依赖关系 —— 「怎么想」硬依赖「谁在买」
     * （不知道是哪群人，挖出来的心智没有归属），而「疼在哪」可单独跑。
     * 平铺成一堆 icon 就把这个信息丢了。
     */
    /**
     * 首页 = 功能 grid。一个 icon 一个模块，点进去是 list + report。
     *
     * **功能在第一层，不是研究在第一层。** 两个模块的输入不一样（Reddit 要
     * subreddit 检索策略，IG 不要），塞进同一个「研究详情页」会互相别扭；
     * 而分开之后，加一个数据源只是 grid 多一个 icon，不动任何已有的东西。
     *
     * 都是**循环搜索**：模型定检索词 → 召回 → 判读 → 不够就换词再来。
     * subreddit 的选择本身就是 Reddit 那条检索策略的一部分。
     */
    const MODULES = [
      { id: 'cl-reddit-pain', name: 'Reddit 痛点', icon: 'reddit', wired: true },
    ]

    /**
     * 品牌图标 —— 路径抄自 Simple Icons（MIT），**内联**进代码。
     *
     * 不能引用 CDN 或 <img src="外链">：面板的 client bundle 走 dsh 的 CSP，
     * 外部资源一律加载不到，而且是静默失败。要用网上的图标就把 SVG 源码抄进来。
     *
     * 这些是 24×24 的实心 path（fill 不是 stroke），所以能填任意颜色 ——
     * app 图标要的是白色 logo 压在品牌色底板上。
     */
    const BRAND = {
      // Reddit 官方 logo 外圈就是实心圆，所以它**自己就是**图标块 ——
      // 再压一层橙色底板会糊成一团。full:true 表示整块直接画 logo。
      //
      // 路径抄自 Simple Icons（MIT），**内联**进代码：面板的 client bundle
      // 走 dsh 的 CSP，外链图标和 CDN 一律加载不到，而且是静默失败。
      // 加平台时来这里加一条，同样把 SVG 源码抄进来。
      reddit: { bg: '#FF4500', full: true, path: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z' },
    }

    /**
     * app 风格的图标块：品牌色圆角底 + 白色 logo。
     * 渐变底（IG）走 background，纯色走 backgroundColor —— 两者都能吃 CSS 字符串。
     */
    const appIcon = (kind, size = 56) => {
      const b = BRAND[kind] ?? BRAND.reddit

      // logo 自带外形（Reddit 的实心圆）：整块就画它，不套底板
      if (b.full) {
        return el('svg', {
          width: size, height: size, viewBox: '0 0 24 24',
          fill: b.bg, 'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        }, el('path', { d: b.path }))
      }

      return el('span', {
        style: {
          width: size, height: size, flex: 'none',
          borderRadius: size * 0.24,
          background: b.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      },
        el('svg', {
          width: size * 0.56, height: size * 0.56, viewBox: '0 0 24 24',
          fill: '#fff', 'aria-hidden': true, style: { display: 'block' },
        }, el('path', { d: b.path })),
      )
    }

    /** 这个 tab 类型在注册表里的身份。包名是天然的 id —— 全局唯一，重名会抛。 */
    const TAB_ID = '@consumer-lens/lens'
    /** 按 kind 打开：ctx.sidebarRight.openTab(TAB_KIND)。 */
    const TAB_KIND = 'consumer-lens'

    /**
     * **顶层 inject 是空的。**
     *
     * 每一个写进顶层 inject 的服务都是一个「缺了它整个插件就不加载」的条件。
     * 而 dsh 的公共 API 是 pre-stable 的（官方原话：升级时自己改自己仓库里的
     * 调用方 —— 我们不在那个仓库里）。面板挂了不该连累 tools 和 skill：
     * 那两样根本不需要 UI，而它们才是这个插件存在的理由。
     *
     * 所以两块各自等各自的服务，谁没到谁不出现，互不牵连。
     */
    const inject = []

    function apply(ctx) {
      // ① 右栏面板 —— 挂原生 sidebarRightTabs，两段注册各自 effect
      ctx.inject(['sidebarRightTabs', 'slots', 'sessions'], (sub) => {
        // 类型：一个 page 类型（不带 patterns —— 我们不认领 dsh-resource:// 地址，
        // 是按 kind 打开的一页，不是某种文件的查看器）。
        // priority 不写，默认就是 extension band：来自产品外的类型排最前。
        sub.effect(
          () =>
            sub.sidebarRightTabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              title: () => 'Consumer Lens',
              // guide 是「新标签页」里的入口胶囊 —— 不写就没有任何地方能打开它。
              //
              // title / description 必须是**函数**（seat 直接 entry.title()、
              // entry.description?.()）——传字符串会 TypeError 把整个 guide 打崩，
              // 连别人的胶囊一起。字段叫 icon 不是 glyph，而且要的是**组件**
              // （seat 渲染 <Icon size={22|26} />），不是造好的元素。
              guide: [{
                kind: TAB_KIND,
                title: () => 'Consumer Lens',
                description: () => '消费者洞察：谁在买 · 怎么想 · 疼在哪',
                icon: ({ size }) => makeLensIcon(size ?? 22),
                order: 100,
              }],
            }),
          'consumer-lens: tab type',
        )

        // 本体：key 必须等于类型的 id —— seat 靠这个配对
        sub.effect(
          () =>
            sub.slots.inject('sidebar.right.pane.tab', () =>
              sub.slots.register({
                name: 'sidebar.right.pane.tab',
                key: TAB_ID,
                // sessionId 从这里进组件；ctx 一起带上，发指令要用
                inject: (sessionId) => ({ sessionId, ctx: sub }),
              }, LensTab),
            ),
          'consumer-lens: tab body',
        )
      })

      // ② 设置卡片 —— 要 remote.credentials，那是远端连接就绪后才有的服务。
      // 等不到就只是没有卡片，右栏 tab 和 tools 都不受影响。
      ctx.inject(['slots', 'remote', 'remote.credentials', 'settingsScope'], (sub) => {
        // 插槽是 keyed 的，key 就是设置命名空间 —— 这正是「repository 外分发
        // 的插件」贡献一张卡片的方式：它注册自己的命名空间，标签页把两者配对，
        // 而不需要知道那个命名空间是什么意思。
        //
        // ⚠️ 签名和 tab 那边一样：第一个参数是**对象**（带 name），组件是
        // 第二个参数。写成 register('名字', {component}) 不报错但永远不渲染。
        sub.effect(() =>
          sub.slots.inject('settings.plugin.item', () =>
            sub.slots.register({
              name: 'settings.plugin.item',
              key: NAMESPACE,
              inject: () => ({ ctx: sub }),
            }, SettingsCard),
          ),
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
