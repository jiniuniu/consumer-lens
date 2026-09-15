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
      // IG 证据的封面图。固定宽高比避免加载时抖动；签名过期就是空位，
      // 所以 onError 之后直接隐藏，不占位、不显示碎图标。
      thumb: {
        width: 56, height: 56, objectFit: 'cover', borderRadius: 4,
        flex: 'none', background: 'var(--bg-hover, #f0eeea)',
      },
      evRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
      // 中文意思 —— 卖家要抄进详情页的就是这句，所以它不能比原文更弱。
      zhText: { fontSize: 12.5, opacity: 0.85, lineHeight: 1.6, marginTop: 3 },
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

      // ── 版块多选 ──
      pickRow: {
        display: 'flex', gap: 9, padding: '9px 11px', alignItems: 'flex-start',
        cursor: 'pointer', borderTop: '1px solid var(--border, #e5e3df)',
      },
      pickBox: { marginTop: 2, flex: 'none', cursor: 'pointer' },
      pickSubs: {
        fontSize: 11, opacity: 0.6, fontVariantNumeric: 'tabular-nums',
        flex: 'none', minWidth: 42, textAlign: 'right',
      },
      // 提交条吸底：版块多时用户滚到一半就想提交，不该再滚回去找按钮
      submitBar: {
        position: 'sticky', bottom: 0, marginTop: 14, padding: '10px 0 4px',
        background: 'var(--bg, #faf9f7)',
        borderTop: '1px solid var(--border, #e5e3df)',
        display: 'flex', alignItems: 'center', gap: 10,
      },
      submitBtn: {
        border: 'none', borderRadius: 6, padding: '7px 14px',
        background: '#15803d', color: '#fff', font: 'inherit', fontWeight: 500,
        cursor: 'pointer', flex: 'none',
      },
      submitOff: { opacity: 0.4, cursor: 'not-allowed' },
      cost: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.5 },
      /**
       * 信号条目里的「接着挖痛点」。
       *
       * 深色实心 —— 它是漏斗第三步的入口，是这一屏最该被点的东西。
       * 早先做成描边是怕它跟人群页的主按钮抢，但那两个按钮不同屏，
       * 抢不起来；在信号页上它反而被淹没了。
       */
      digBtn: {
        marginTop: 8, padding: '6px 12px', borderRadius: 6,
        border: 'none', background: '#9a3412', color: '#fff',
        font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
      },
      // 已挖过 —— 压平成描边灰字，一眼区别于可点的那个，但仍能点进去看
      digDone: {
        marginTop: 8, padding: '6px 12px', borderRadius: 6,
        border: '1px solid var(--border, #d9d5cf)', background: 'transparent',
        font: 'inherit', fontSize: 12, cursor: 'pointer', opacity: 0.65,
        color: 'inherit',
      },
      // 已挖过的版块行：压暗但不隐藏 —— 它是「当初选了哪些」的记录
      pickDone: { opacity: 0.5 },
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
      /**
       * 选中那条是哪个 kind —— 人群洞察的树里三种 kind 混在一起，
       * 光有 id 读不出该去哪个目录取报告（/item 要 kind+id 两个参数）。
       * null 表示「跟着 mod 走」，痛点洞察那一格就是这种情况。
       */
      const [pickKind, setPickKind] = useState(null)

      // 每个模块一份 list，按 kind 缓存。grid 上要显示各模块的研究数，
      // 所以进任何一个模块之前就得把它们都拉回来。
      const [lists, setLists] = useState({})
      const [report, setReport] = useState(null)
      const mtimeRef = useRef(0)

      const reload = useCallback(async () => {
        const next = {}
        // 信号不在 MODULES 里（它没有 grid 入口），但人群洞察那棵树要用它的
        // 数据，所以这里显式带上 —— 漏在这儿的话树只剩根节点，而且是静默的。
        const kinds = [...MODULES.filter((m) => m.wired).map((m) => m.id), SIGNAL]
        for (const kind of kinds) {
          try {
            next[kind] = await call(`/list?kind=${encodeURIComponent(kind)}`) ?? []
          } catch {
            next[kind] = []   // host 还没起来，下一轮再试
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
        // 用 falsy 判断而不是 `=== null`：一个 undefined 的 id 也该当成
        // 「没选」，而不是去请求 `id=undefined` 换回一个 404。
        if (!pick || !mod) { setReport(null); return }
        let alive = true
        // 树里选中的可能是信号或痛点，跟当前 mod 不是一个 kind
        const kind = pickKind ?? mod
        call(`/item?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(pick)}`)
          .then((d) => { if (alive) setReport(d) })
          .catch(() => { if (alive) setReport(null) })
        return () => { alive = false }
      }, [mod, pick, pickKind])


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
                // 未接通的格子 tooltip 说的是**它将来回答什么**，不是
                // 「还没接进插件」—— 后者是开发者的说法，对用户没有信息量。
                // 每个源的那句话就是它的信号性质（docs/product.md §2）。
                title: m.wired ? `${m.name} —— ${m.blurb}` : `${m.name}（即将推出）—— ${m.blurb}`,
                onClick: m.wired ? () => { setMod(m.id); setPick(null) } : undefined,
                style: { ...S.appCell, ...(m.wired ? null : S.cellOff) },
              },
                appIcon(m.icon, 56, !m.wired),
                el('span', { style: S.appName }, m.name),
              ),
            ),

            // 账户单独一格，排在研究模块后面。描边图标而不是品牌实心块 ——
            // 那个差别就是「这一格不是数据源」的全部提示。
            el('button', {
              key: ACCOUNT,
              type: 'button',
              title: '我的账户 —— 余额和用量',
              onClick: () => { setMod(ACCOUNT); setPick(null) },
              style: S.appCell,
            },
              accountIcon(56),
              el('span', { style: S.appName }, '我的'),
            ),
          ),
        )
      }

      // ── 账户页：没有 list，占满整个 tab ──
      if (mod === ACCOUNT) {
        return el('div', { style: { ...S.main, height: '100%' } },
          el('button', {
            type: 'button',
            onClick: () => setMod(null),
            title: '返回模块',
            style: { ...S.backBtn, marginBottom: 12 },
          }, '←'),
          el(AccountPage),
        )
      }

      // ── ② 模块内：左 list + 右 report ──
      const m = MODULES.find((x) => x.id === mod)
      const rows = lists[mod] ?? []

      /**
       * 人群洞察的左列是一棵树：人群 → 信号 → 痛点，缩进即血缘。
       *
       * 关系**只认 `from_run`** —— 那是代码透传上一步 run_id 的结果。
       * 不按 slug 分组：slug 是模型编的，同一个东西这次叫 silicone-ring、
       * 下次叫 silicone-wedding-band，拿它当键会两个方向都错（该合的没合、
       * 不该合的合了），而且错得很安静。
       *
       * 痛点洞察那一格不建树：那些是独立跑的，平铺就对了。
       */
      const tree = mod === 'cl-reddit-audience'
        ? rows.map((a) => ({
            row: a,
            kind: mod,
            children: (lists[SIGNAL] ?? [])
              .filter((s) => s.from_run === a.id)
              .map((s) => ({
                row: s,
                kind: SIGNAL,
                children: (lists['cl-reddit-pain'] ?? [])
                  .filter((p) => p.from_run === s.id)
                  .map((p) => ({ row: p, kind: 'cl-reddit-pain', children: [] })),
              })),
          }))
        : null

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
            // ⚠️ 字段名是 **id**，不是 slug —— store.list() 投影出的主键
            // 就是文件名（store.js:91），store.read(kind, id) 也收 id。
            // 写成 row.slug 会让 pick 变成 undefined：而 undefined 躲过了
            // 下面 `pick === null` 那道守卫，于是真的去请求 id=undefined，
            // 拿回 404 → setReport(null) → 右边一片空白，列表却是好的。
            : tree
              ? tree.map((node) =>
                  el(TreeNode, {
                    key: node.row.id,
                    node,
                    depth: 0,
                    pick,
                    onPick: (id, kind) => { setPick(id); setPickKind(kind) },
                  }))
              : rows.map((row) =>
                  el('div', {
                    key: row.id,
                    style: { ...S.row, ...(pick === row.id ? S.rowOn : null) },
                    onClick: () => { setPick(row.id); setPickKind(mod) },
                  },
                    el('span', { style: S.rowName }, row.name),
                    el('span', { style: S.rowMeta },
                      rowMeta(mod, row).filter(Boolean).join(' · ')),
                  ),
                ),
        ),

        // 右：报告
        el('div', { style: S.main },
          report === null
            ? el('div', { style: S.empty },
                rows.length === 0
                  ? el(EmptyHint, { mod, name: m.name })
                  : '选左边一个研究看报告。')
            // 按**选中那条的 kind** 分发，不是按当前格子 —— 人群洞察的树里
            // 三种报告混在一起，按 mod 分发会拿 AudienceReport 去渲染痛点。
            : (pickKind ?? mod) === 'cl-reddit-audience'
              ? el(AudienceReport, {
                  r: report,
                  runId: pick,
                  // 这次人群下面已经挖过的信号 —— 报告里据此把跑过的版块
                  // 置灰成「已挖过」，点它跳过去看，而不是再花一次额度。
                  done: (lists[SIGNAL] ?? []).filter((s) => s.from_run === pick),
                  onOpen: (id) => { setPick(id); setPickKind(SIGNAL) },
                  // 提交 = 把指令打进对话框。面板自己从不跑分析。
                  // 带上 run_id：下一步落盘时填进 from_run，才串得起
                  // 「这批信号是从哪次人群研究来的」。
                  onSubmit: (slug, subs) =>
                    run(SIGNAL, `${slug} ${pick} ${subs.join(' ')}`),
                })
              : (pickKind ?? mod) === SIGNAL
                ? el(SignalReport, {
                    r: report,
                    // 这条信号下面已经挖过的痛点，按品类词索引 —— 报告里据此
                    // 把「挖痛点」换成「查看」。
                    done: (lists['cl-reddit-pain'] ?? []).filter((p) => p.from_run === pick),
                    onOpen: (id) => { setPick(id); setPickKind('cl-reddit-pain') },
                    // 每条信号都能接着挖痛点。category 是「能去 1688 搜的
                    // 品类词」（cl-save.js 卡它必填），正好就是 pain 的输入；
                    // run_id 一起打进去，from_run 自动就对了 —— 模型不用
                    // 自己编 slug、也不用记住父 id。
                    onDig: (category) =>
                      run('cl-reddit-pain', `${category} ${pick}`),
                  })
                : (pickKind ?? mod) === 'cl-ig-pain'
                  ? el(IgReport, { r: report })
                  : el(Report, { r: report }),
        ),
      )
    }

    /** 树里每种 kind 的前缀图标 —— 一眼看出这一行是漏斗的哪一步。 */
    const NODE_ICON = {
      'cl-reddit-audience': '👥',
      'cl-reddit-signal': '📡',
      'cl-reddit-pain': '💢',
    }

    /**
     * 人群洞察左列的一个节点，可展开。
     *
     * 默认**展开**而不是折叠：一个人群下面通常只有几条，折起来等于把
     * 「这次研究挖到了什么」藏进一次额外点击。只有根节点给展开箭头 ——
     * 再往下层数已经够浅，多一层交互不如多一层缩进清楚。
     */
    function TreeNode({ node, depth, pick, onPick }) {
      const [open, setOpen] = useState(true)
      const { row, kind, children } = node
      const has = children.length > 0

      return el(React.Fragment, null,
        el('div', {
          style: {
            ...S.row,
            ...(pick === row.id ? S.rowOn : null),
            paddingLeft: 12 + depth * 14,
          },
          onClick: () => onPick(row.id, kind),
        },
          el('span', { style: S.rowName },
            // 箭头只在有子节点时出现，点它只切展开、不换选中 ——
            // 否则「想看看下面有什么」会连带把右边的报告也换掉
            has
              ? el('span', {
                  onClick: (e) => { e.stopPropagation(); setOpen((v) => !v) },
                  style: { cursor: 'pointer', opacity: 0.55, marginRight: 4 },
                }, open ? '▾' : '▸')
              : null,
            `${NODE_ICON[kind] ?? '·'} ${row.name}`),
          el('span', { style: { ...S.rowMeta, paddingLeft: depth * 14 } },
            // inTree：树里缩进已经表达了血缘，不要再挂一个「← 来自信号」
            rowMeta(kind, row, true).filter(Boolean).join(' · ')),
        ),
        open
          ? children.map((c) =>
              el(TreeNode, {
                key: c.row.id, node: c, depth: depth + 1, pick, onPick,
              }))
          : null,
      )
    }

    /**
     * 列表行的第二行摘要 —— 每个模块的数据语义不同，不硬凑成同一组字段。
     * 和 store.list() 的投影一一对应，那边加字段这边才有得显示。
     */
    function rowMeta(mod, row, inTree = false) {
      if (mod === 'cl-ig-pain') {
        return [
          `${row.pains ?? 0} 簇`,
          // 高频那档是用户最先要看的，有才显示
          row.high ? `${row.high} 高频` : null,
          `${row.fetched ?? 0} 帖`,
          ago(row.saved_at),
        ]
      }
      if (mod === 'cl-reddit-audience') {
        return [`${row.comms ?? 0} 版块`, ago(row.saved_at)]
      }
      if (mod === 'cl-reddit-signal') {
        return [
          `${row.signals ?? 0} 信号`,
          // 空白那档是用户真正在找的东西，有才显示
          row.blank ? `${row.blank} 空白` : null,
          ago(row.saved_at),
        ]
      }
      return [
        `${row.pains ?? 0} 痛点`,
        `${row.posts ?? 0} 帖`,
        ago(row.saved_at),
        // 痛点洞察那一格显示**全部**痛点报告，不只是独立跑的 —— 用户不会按
        // 「当初从哪个门进来的」去记忆自己的数据，一个品的痛点永远该在这里
        // 找得到。从信号挖出来的标一下来源，树只是它的另一个视角。
        // （所以两个入口共用一个目录，不按入口分 folder：同一份数据同时属于
        //   两边，分开存就得挑一边放，另一边永远看不到它。）
        !inTree && row.from_run ? '← 来自信号' : null,
      ]
    }

    /**
     * 空状态 —— 不只是「还没数据」，它是**唯一一处能在用户犯错之前拦住他**的地方。
     *
     * 人群洞察最容易犯的错是输入品类词（ebike、挂烫机）。那样跑出来的社区是
     * 围绕商品聚起来的，里面的人已经在买了，第二步挖信号会全是「有货」——
     * 而这个失败是**静默**的：报告看着挺像回事，只是没有空白。
     * 所以判据要摆在他将要敲命令的地方，而且要给出另一条路（痛点洞察），
     * 因为拿品类词来的人通常有个真问题，只是走错了门。
     */
    function EmptyHint({ mod, name }) {
      const cmd = (text) => el('code', { style: S.code }, text)

      /**
       * IG 痛点和痛点洞察问的是同一句话，但人群不同 —— 空状态是唯一能
       * 说清这件事的地方，所以两格各自指一下对面。
       *
       * 用错的代价是静默的：想改产品却跑了 IG，拿回来一堆买前顾虑，
       * 报告看着挺像回事，只是没有一条指向产品该改什么。
       */
      if (mod === 'cl-ig-pain') {
        return el(React.Fragment, null,
          '还没跑过 ', el('b', null, name), '。', el('br'), el('br'),
          '在对话框里跑 ', cmd('/cl-ig-pain <产品>'),
          '，结果几秒后自动出现在这里。',

          el('div', { style: { ...S.note, textAlign: 'left', marginTop: 18 } },
            el('div', { style: { fontWeight: 600, marginBottom: 6 } },
              'IG 上说话的人大半还没买'),
            el('div', { style: { margin: '4px 0', lineHeight: 1.7 } },
              '所以这里挖到的是', el('b', null, '买前顾虑'), '和内容选题 —— ',
              '产出是「详情页要先回答什么」。'),
            el('div', { style: { margin: '4px 0', lineHeight: 1.7, opacity: 0.75 } },
              '想知道产品该改什么？那要问用过的人，走 ', el('b', null, '痛点洞察'), '。'),
          ),
        )
      }

      if (mod !== 'cl-reddit-audience') {
        return el(React.Fragment, null,
          '还没跑过 ', el('b', null, name), '。', el('br'), el('br'),
          '在对话框里跑 ', cmd('/cl-reddit-pain <产品>'),
          '，结果几秒后自动出现在这里。',

          el('div', { style: { ...S.note, textAlign: 'left', marginTop: 18 } },
            el('div', { style: { margin: '4px 0', lineHeight: 1.7, opacity: 0.75 } },
              'Reddit 上说话的人买过并用过 —— 挖到的是',
              el('b', null, '用过之后的失望'), '。',
              '想看买之前的顾虑，走 ', el('b', null, 'IG 痛点'), '。'),
          ),
        )
      }

      const line = { margin: '4px 0', lineHeight: 1.7 }
      return el(React.Fragment, null,
        '还没跑过 ', el('b', null, name), '。', el('br'), el('br'),
        '在对话框里跑 ', cmd('/cl-reddit-audience <人群>'),
        '，结果几秒后自动出现在这里。',

        el('div', { style: { ...S.note, textAlign: 'left', marginTop: 18 } },
          el('div', { style: { fontWeight: 600, marginBottom: 6 } },
            '人群 = 一个爱好，或一个共同特征'),
          el('div', { style: line }, '爱好　攀岩 · 高尔夫 · 露营 · 手工皮具'),
          el('div', { style: line }, '特征　ADHD · 失眠 · 孕期 · 倒班 · 租房党'),
          el('div', { style: { ...line, marginTop: 10, opacity: 0.75 } },
            '❌ ebike · 挂烫机 —— 这是品类。围绕商品聚起来的社区里，',
            '人已经在买了，挖不出空白。'),
          el('div', { style: { ...line, opacity: 0.75 } },
            '想改进现有的品？走 ', el('b', null, '痛点洞察'), '。'),
        ),
      )
    }

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
          ? el(React.Fragment, null,
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
    /** 订阅数压成 67.6k / 1.9M —— 列表要对齐，精确值没人看。 */
    function humanSubs(n) {
      const v = Number(n) || 0
      if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
      if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
      return String(v)
    }

    /** 每个版块的预估额度（搜索 + 拉评论），和 SKILL.md 里的口径一致。 */
    const COST_PER_SUB = 9

    /**
     * 人群定位报告 —— **唯一一个有输入的报告**。
     *
     * 别的模块是纯只读，这个要收用户勾选的版块。但它仍然不发起任务：
     * 勾完提交 = 往对话框打一条 `/cl-reddit-signal <slug> <版块…>`，
     * 跑不跑、怎么跑、报错怎么办全在对话框里（adding-a-module.md §③）。
     *
     * 勾选状态**故意不落盘**：那是一次性的意图，不是数据。存了就要处理
     * 「上次勾的还算不算数」，而重开面板时用户本来就该重新决定。
     */
    function AudienceReport({ r, runId, done = [], onOpen, onSubmit }) {
      const comms = r.communities ?? []
      const skipped = r.skipped ?? []
      const meta = r.meta ?? {}

      /**
       * 已经挖过的版块 → 那次信号运行。
       *
       * ⚠️ 两边的写法不一样，必须规范化后再比：
       * 勾选框的 key 是**裸版块名**（cl-save.js 卡死不许带 r/），
       * 而落盘的 `meta.subreddits` 是模型写的，SKILL.md 的样例里带 `r/`。
       * 直接比字符串会永远不相等 —— 而且是静默的：所有版块都显示成没挖过，
       * 用户照样能提交，只是白花一次额度。
       */
      const bare = (s) => String(s ?? '').replace(/^r\//i, '').toLowerCase()
      const doneBy = new Map()
      for (const run of done) {
        for (const s of run.subreddits ?? []) {
          // 同一个版块挖过多次就留最近那次（list 已按 saved_at 倒序）
          if (!doneBy.has(bare(s))) doneBy.set(bare(s), run)
        }
      }

      // 默认勾选**还没挖过的**：模型已经做过一轮筛选，名单里本来就都是它
      // 推荐的，所以让用户去掉不要的比从零勾起省事；但挖过的不该再默认勾上，
      // 否则最省事的那条路（不改任何勾选直接提交）就是重复挖一遍。
      const fresh = (list) => new Set(
        list.filter((c) => !doneBy.has(bare(c.slug))).map((c) => c.slug))
      const [sel, setSel] = useState(() => fresh(comms))

      // 换一份报告要重置勾选 —— 否则上一次的选择会漏到这一份。
      //
      // 依赖用 runId 而不是 r：对象每次轮询都是新的，用 r 会无限重置。
      // 也不能用 r.slug —— 同一个 slug 现在可以有多次运行，两次之间切换时
      // slug 不变，勾选就不会重置，用户会拿着上一次的选择提交这一次。
      useEffect(() => {
        setSel(fresh(r.communities ?? []))
      }, [runId])

      const toggle = (slug) => setSel((prev) => {
        const next = new Set(prev)
        if (next.has(slug)) next.delete(slug)
        else next.add(slug)
        return next
      })

      // 挖过的不进提交名单，哪怕它在 sel 里（切报告的空隙可能有残留）
      const picked = comms.filter((c) => sel.has(c.slug) && !doneBy.has(bare(c.slug)))

      return el('div', null,
        el('h2', { style: S.h1 }, r.audience ?? r.slug),
        el('p', { style: S.slug },
          el('code', { style: S.code }, r.slug ?? ''),
          r.generated_at ? ` · ${r.generated_at}` : null),

        r.summary
          ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' } }, r.summary)
          : null,

        el('div', { style: S.statRow },
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, comms.length),
            el('span', { style: S.statL }, '候选版块')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, meta.communities_scanned ?? '—'),
            el('span', { style: S.statL }, '扫过')),
        ),

        el('h3', { style: S.layerT }, '选版块'),
        el('div', { style: { ...S.note, marginTop: 4, marginBottom: 8 } },
          '勾上要深挖的，提交后在对话框里接着跑。小版块信噪比高，大版块看声量。'),

        el('div', { style: { ...S.cross, padding: 0 } },
          comms.map((c, i) => {
            const ran = doneBy.get(bare(c.slug))
            return el('label', {
              key: c.slug ?? i,
              style: {
                ...S.pickRow,
                borderTop: i === 0 ? 'none' : S.pickRow.borderTop,
                // 挖过的整行压暗，但**不隐藏** —— 用户要看得见自己挖过什么，
                // 这本身就是「哪些被选中过」的记录
                ...(ran ? S.pickDone : null),
              },
            },
              el('input', {
                type: 'checkbox',
                // 挖过的保持勾着：那是它当初被选中的事实，不是一个可改的输入
                checked: ran ? true : sel.has(c.slug),
                disabled: Boolean(ran),
                onChange: () => toggle(c.slug),
                style: S.pickBox,
              }),
              el('span', { style: S.pickSubs }, humanSubs(c.subscribers)),
              el('span', { style: { flex: 1, minWidth: 0 } },
                el('span', { style: S.xname }, c.name),
                c.brand_owned
                  ? el('span', { style: { ...S.xsrc, display: 'inline', marginLeft: 6 } }, '品牌版块')
                  : null,
                // 挖过的给一条出路：点「查看」跳到那次信号报告。
                // 这一行同时说明了为什么这个勾选框动不了。
                ran
                  ? el('span', { style: { ...S.xsrc, display: 'inline', marginLeft: 6 } },
                      `已挖过 · ${ago(ran.saved_at)}　`,
                      el('a', {
                        href: '#',
                        onClick: (e) => {
                          e.preventDefault()
                          e.stopPropagation()   // 别连带 toggle 了勾选框
                          onOpen?.(ran.id)
                        },
                        style: { color: '#15803d', textDecoration: 'none' },
                      }, '查看 →'))
                  : null,
                c.reason ? el('div', { style: S.xverdict }, c.reason) : null,
              ),
            )
          }),
        ),

        // 吸底提交条。预估额度随勾选实时变 —— 用户对「勾一个框」的代价
        // 没有直觉，但对数字有。
        el('div', { style: S.submitBar },
          el('button', {
            type: 'button',
            disabled: picked.length === 0,
            onClick: () => onSubmit(r.slug, picked.map((c) => c.slug)),
            style: { ...S.submitBtn, ...(picked.length === 0 ? S.submitOff : null) },
          }, '挖选品信号'),
          el('span', { style: S.cost },
            picked.length > 0
              ? `已选 ${picked.length} 个 · 预计 ~${picked.length * COST_PER_SUB} 次额度`
              // 全挖过和一个没勾是两回事：前者说「至少选一个」会让人去找
              // 一个根本不存在的可勾项。分开说清楚。
              : comms.every((c) => doneBy.has(bare(c.slug)))
                ? '这份名单里的版块都挖过了'
                : '至少选一个版块'),
        ),

        skipped.length > 0
          ? el('div', { style: { marginTop: 22 } },
              el('h3', { style: S.layerT }, '没选的'),
              el('div', { style: { ...S.note, marginTop: 6 } },
                skipped.map((s, i) =>
                  el('div', { key: i, style: { marginBottom: 4 } },
                    `${s.name}（${humanSubs(s.subscribers)}）—— ${s.why ?? ''}`),
                ),
              ),
            )
          : null,
      )
    }

    /** 信号状态 → 颜色和图标。「空白」是用户最关心的那档，给最强的视觉。 */
    const SIGNAL_STATUS = {
      空白: { icon: '🟢', note: '没人答得上来' },
      不满: { icon: '🟡', note: '有货但在被骂' },
      已满足: { icon: '⚪', note: '已有认可的品牌' },
    }

    /**
     * 选品信号报告 —— 纯只读，没有输入。
     *
     * 排序不在这里做：模型落盘时是按它的判断排的，面板再排一次会让
     * 「为什么这条在最前」变得不可解释。
     */
    function SignalReport({ r, done = [], onOpen, onDig }) {
      const meta = r.meta ?? {}
      const signals = r.signals ?? []
      const picks = r.picks ?? []
      const subs = meta.subreddits ?? []

      /**
       * 已经挖过痛点的品类 → 那次痛点运行。
       *
       * 按**品类词**认，因为那正是点按钮时打进去的参数（`s.category`）。
       * 痛点报告落盘的 `product` 是模型写的，多半就是这个词，但它可能顺手
       * 改写（「耐高温硅胶戒指」→「耐高温硅胶戒指（焊工用）」），所以用
       * 包含匹配兜一层，比严格相等鲁棒 —— 认不出来最多是按钮没变成「查看」，
       * 不会误把两个不同的品当成同一个。
       */
      const norm = (s) => String(s ?? '').trim().toLowerCase()
      const doneFor = (category) => {
        const c = norm(category)
        if (!c) return null
        return done.find((p) => {
          const n = norm(p.name)
          return n === c || n.includes(c) || c.includes(n)
        }) ?? null
      }

      return el('div', null,
        el('h2', { style: S.h1 }, r.audience ?? r.slug),
        el('p', { style: S.slug },
          el('code', { style: S.code }, r.slug ?? ''),
          r.generated_at ? ` · ${r.generated_at}` : null),

        r.summary
          ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 12px' } }, r.summary)
          : null,

        el('div', { style: S.statRow },
          el('div', { style: S.statBox },
            el('span', { style: S.statV },
              signals.filter((s) => s.status === '空白').length),
            el('span', { style: S.statL }, '空白')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, signals.length),
            el('span', { style: S.statL }, '条信号')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, meta.posts_picked ?? '—'),
            el('span', { style: S.statL }, '有信号帖')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, meta.posts_scanned ?? '—'),
            el('span', { style: S.statL }, '扫过')),
        ),

        (subs.length > 0 || meta.time_range)
          ? el('div', { style: { ...S.note, marginTop: 0, marginBottom: 20 } },
              subs.length ? el('div', null, subs.join('　')) : null,
              meta.time_range ? el('div', null, `时间范围：${meta.time_range}`) : null,
            )
          : null,

        el('h3', { style: S.layerT }, '信号'),
        signals.map((s, i) => {
          const st = SIGNAL_STATUS[s.status] ?? { icon: '·', note: s.status ?? '' }
          return el('section', { key: i, style: { margin: '10px 0 18px' } },
            el('div', { style: { fontWeight: 600, marginBottom: 3 } },
              `${st.icon} ${s.title}`),
            el('div', { style: { ...S.xsrc, marginBottom: 5 } },
              // category 是能去 1688 搜的品类词 —— 报告里要突出，用户会直接拿去用
              el('code', { style: S.code }, s.category ?? ''),
              st.note ? `　·　${st.note}` : null),
            s.description
              ? el('div', {
                  style: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.65, marginBottom: 8 },
                }, s.description)
              : null,
            s.existing
              ? el('div', { style: { ...S.xsrc, marginBottom: 8 } }, `现有：${s.existing}`)
              : null,
            (s.evidence ?? []).map((e, j) =>
              el('div', { key: j, style: S.topic },
                el('div', { style: S.qText }, `“${e.text}”`),
                el('div', { style: { ...S.rowMeta, marginTop: 3 } },
                  el('a', {
                    href: e.post_url, target: '_blank', rel: 'noreferrer',
                    style: { color: 'inherit' },
                  }, e.post_title),
                  `　·　${e.subreddit ?? ''}　·　💬${e.comments ?? 0}`),
              ),
            ),

            /**
             * 接着挖这个品的痛点 —— 漏斗的第三步入口。
             *
             * **「已满足」那档不给按钮**：站内已有认可的品牌，挖痛点是把额度
             * 花在一个已经没有空位的品上。这个判断 status 字段已经做了，
             * UI 照着它走就行，不要让用户自己再判一次。
             */
            (() => {
              if (!s.category || s.status === '已满足') return null
              const ran = doneFor(s.category)
              // 挖过的：按钮变「查看」，不再给重跑的入口 —— 重跑一个已经有
              // 结果的品是纯粹的额度浪费，而按钮长得一样的话用户分不出来。
              if (ran) {
                return el('button', {
                  type: 'button',
                  onClick: () => onOpen?.(ran.id),
                  style: S.digDone,
                }, `已挖过 ${ran.pains ?? 0} 个痛点 · ${ago(ran.saved_at)} · 查看 →`)
              }
              return onDig
                ? el('button', {
                    type: 'button',
                    onClick: () => onDig(s.category),
                    style: S.digBtn,
                  }, `💢 挖「${s.category}」的痛点 →`)
                : null
            })(),
          )
        }),

        picks.length > 0 ? el('h3', { style: S.layerT }, '建议') : null,
        picks.length > 0
          ? el('div', { style: { ...S.cross, marginTop: 10 } },
              picks.map((p, i) =>
                el('div', {
                  key: i,
                  style: {
                    ...S.xrow,
                    borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)',
                  },
                },
                  el('span', null, '→'),
                  el('span', null,
                    el('span', { style: S.xname }, p.title),
                    el('div', { style: S.xverdict }, p.why),
                  ),
                ),
              ),
            )
          : null,
      )
    }

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

    /** 痛点簇的频次上色 —— 高频那档才是用户要先看的。 */
    const FREQ = {
      high: { icon: '🔴', label: '高频' },
      medium: { icon: '🟡', label: '中频' },
      low: { icon: '⚪', label: '低频' },
    }

    /**
     * IG 痛点报告。
     *
     * 和 Reddit 那份的三个区别，都来自数据本身而不是排版偏好：
     *
     * ① **每条证据带封面图** —— IG 是图像平台，那张图常常就是痛点本身
     *    （指甲翘边、搓泥的脸）。签名链接会过期，过期后隐藏掉不占位。
     * ② **中文必须和原文并列**，不是 tooltip —— 读面板的人不一定看得懂
     *    英文，而这些原话正是要抄进详情页的东西（cl_save 卡 zh 必填）。
     * ③ **没有「机会」区块**，改成内容侧信号 —— IG 上说话的大半还没买，
     *    这份报告的产出是「详情页先答什么」，不是「产品该改什么」。
     */
    function IgReport({ r }) {
      // 可选字段缺了就少显示一块，不能让整个报告崩掉 ——
      // cl_save 的校验是宽松的，只保证 product 和 pains 在。
      const stats = r.stats ?? {}
      const pains = r.pains ?? []
      const tags = stats.tags_tried ?? []
      const dropped = stats.tags_dropped ?? []
      const signals = r.content_signals ?? []
      const caveats = r.caveats ?? []

      return el('div', null,
        el('h2', { style: S.h1 }, r.product),
        el('p', { style: S.slug },
          el('code', { style: S.code }, r.slug ?? ''),
          r.analyzed_at ? ` · ${r.analyzed_at}` : null),

        r.summary
          ? el('p', { style: { fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' } }, r.summary)
          : null,

        el('div', { style: S.statRow },
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, pains.length),
            el('span', { style: S.statL }, '痛点簇')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, stats.signal ?? '—'),
            el('span', { style: S.statL }, '高信号帖')),
          el('div', { style: S.statBox },
            el('span', { style: S.statV }, stats.fetched ?? '—'),
            el('span', { style: S.statL }, '扫过')),
          // 花了多少钱要看得见 —— 这个平台的评论贵，用户据此决定要不要重跑
          stats.total_cost
            ? el('div', { style: S.statBox },
                el('span', { style: S.statV }, `$${stats.total_cost}`),
                el('span', { style: S.statL }, '成本'))
            : null,
        ),

        // 走过哪些标签是这份报告的**覆盖面**，也是重跑时的避雷图 ——
        // 弃掉的那些标明出来，下次不用再花钱试一遍
        (tags.length > 0 || dropped.length > 0)
          ? el('div', { style: { ...S.note, marginTop: 0, marginBottom: 20 } },
              tags.length ? el('div', null, '搜过：', tags.map((t) => `#${t}`).join('  ')) : null,
              dropped.length
                ? el('div', null, '弃掉：', dropped.map((t) => `#${t}`).join('  '),
                    '（标签太小或没痛点语言）')
                : null,
            )
          : null,

        el('h3', { style: S.layerT }, '痛点簇'),
        pains.map((p, i) => {
          const f = FREQ[p.frequency] ?? {}
          return el('section', { key: i, style: { margin: '10px 0 20px' } },
            el('div', { style: { fontWeight: 600, marginBottom: 3 } },
              `${f.icon ?? '·'} ${p.title}`,
              f.label
                ? el('span', { style: { ...S.rowMeta, marginLeft: 6, fontWeight: 400 } }, f.label)
                : null),
            p.description
              ? el('div', { style: { fontSize: 12.5, opacity: 0.8, lineHeight: 1.65, marginBottom: 10 } },
                  p.description)
              : null,
            (p.evidence ?? []).map((e, j) =>
              el('div', { key: j, style: { ...S.topic, ...S.evRow } },
                // 封面图。签名过期 = 空位，隐藏掉而不是显示碎图标。
                // album（轮播）和评论类证据本来就没有，一样走这条路。
                e.thumbnail_url
                  ? el('img', {
                      src: e.thumbnail_url,
                      alt: '',
                      loading: 'lazy',
                      referrerPolicy: 'no-referrer',
                      style: S.thumb,
                      onError: (ev) => { ev.currentTarget.style.display = 'none' },
                    })
                  : null,
                el('div', { style: { minWidth: 0 } },
                  el('div', { style: S.qText }, `“${e.text}”`),
                  // 中文和原文并列 —— 卖家要抄的是这句
                  e.zh ? el('div', { style: S.zhText }, e.zh) : null,
                  el('div', { style: { ...S.rowMeta, marginTop: 4 } },
                    el('a', {
                      href: e.url ?? (e.code ? `https://www.instagram.com/p/${e.code}/` : undefined),
                      target: '_blank',
                      rel: 'noreferrer',
                      style: { color: 'inherit' },
                    }, `@${e.username ?? '?'}`),
                    e.like_count ? `　·　♥${e.like_count}` : null,
                    e.media_name ? `　·　${e.media_name}` : null,
                    // 品牌投放的「翻车测评」是选题，不是真实受苦
                    e.is_paid_partnership ? '　·　💰投放' : null,
                    e.source_type === 'comment' ? '　·　评论' : null),
                ),
              ),
            ),
          )
        }),

        // 内容侧信号单列 —— 那不是选品结论，混进痛点里会让人当成产品问题
        signals.length > 0 ? el('h3', { style: S.layerT }, '内容侧信号') : null,
        signals.length > 0
          ? el('div', { style: { ...S.cross, marginTop: 10 } },
              signals.map((s, i) =>
                el('div', {
                  key: i,
                  style: { ...S.xrow, borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e3df)' },
                },
                  el('span', null, '📣'),
                  el('span', { style: S.xverdict }, typeof s === 'string' ? s : s.note ?? s.title),
                ),
              ),
            )
          : null,

        // 样本偏性要留在报告里 —— 隔两周回看的人不记得这是标签池抽的
        caveats.length > 0
          ? el('div', { style: S.note },
              caveats.map((c, i) => el('div', { key: i }, '· ', c)))
          : null,
      )
    }

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

    /**
     * grid 上的格子 —— 用户此刻在问的问题，一格一个：
     *
     *   👥 人群洞察   这群人缺什么          → 该做什么品
     *   💢 痛点洞察   这个品被骂什么        → 这个品怎么做（用过的人）
     *   📷 IG 痛点    刷到的人在顾虑什么    → 详情页先答什么（还没买的人）
     *
     * 前两格的分法是「在问哪个问题」，不是「有没有产品」—— 有产品的人两个
     * 都会要，只是先后不同（想扩品走人群，想改现有的品走痛点）。
     *
     * **接通一个新数据源 = 这里多一格，用那个平台自己的图标。**
     * 曾经试过把 IG 折进痛点洞察（同一格里混排 + 源角标），因为「两者回答
     * 同一个问题」。那是错的：**平台就是用户脑子里的索引** —— 他想的是
     * 「去 IG 上看看」，不是「看痛点，顺便挑个源」。靠角标区分等于要求他
     * 先记住「痛点洞察里面还藏着一个 IG」，那是我们的数据模型，不是他的心智。
     *
     * 路线图上那些还没接通的源（TK / Shop / Amazon / 交叉）不在这里置灰摆着：
     * 一个还不能用的格子对**正在用**的人没有信息量。接通了才出现 ——
     * 「撤掉置灰格子」说的是别摆不能用的，不是接通了也别开格子。
     */
    const MODULES = [
      /**
       * 人群洞察 —— 漏斗的入口，**起点是人群不是产品**。
       *
       * 整条链是「一群人 → 他们缺什么 → 该做什么品」，所以它回答的是
       * 「这群人缺什么」，不是「我的产品卖给谁」（那是定位，这个产品不做）。
       *
       * 里面三步（人群 → 信号 → 痛点）不各占一格：signal 的输入来自
       * audience 的报告，拆成三格会让漏斗被 grid 切断 —— 跑完一步要退回
       * 首页再进另一格，然后在新列表里找刚跑完那条。合成一格之后，
       * 左列是一棵树，一屏走完。
       */
      {
        id: 'cl-reddit-audience', name: '人群洞察', icon: 'reddit', wired: true,
        blurb: '这群人缺什么',
      },
      /**
       * 痛点洞察 —— 另一个入口，已知要研究哪个品时直接进。
       *
       * 和人群洞察是两个问题，不是两个阶段：这个回答「这个品怎么做」，
       * 那个回答「该做什么品」。拿品类词跑人群洞察会塌（围绕商品聚起来的
       * 社区里人已经在买了），所以 SKILL 会把那种输入导流到这里。
       */
      {
        id: 'cl-reddit-pain', name: '痛点洞察', icon: 'reddit', wired: true,
        blurb: '这个品被骂什么',
      },
      /**
       * IG 痛点 —— **自己一格，用 IG 的图标**。
       *
       * 和痛点洞察问的是同一句话（「这个品被骂什么」），但**入口要分开**：
       * 平台就是用户脑子里的索引。他想的是「去 IG 上看看」，不是
       * 「看痛点，顺便挑个源」—— 混在一格里靠角标区分，等于要求他先记住
       * 「痛点洞察里面还藏着一个 IG」，那是我们的数据模型，不是他的心智。
       *
       * 图标也必须是 IG 的渐变块，不是第二个 Reddit 橙圈：宫格是靠图标
       * 认路的，两格同图标等于没分开。
       */
      {
        id: 'cl-ig-pain', name: 'IG 痛点', icon: 'instagram', wired: true,
        blurb: '刷到的人在顾虑什么',
      },
    ]

    /**
     * 信号不是 grid 上的入口 —— 它只能从人群报告里勾选版块触发。
     *
     * 但它仍然是一个独立的 kind（自己的目录、自己的 list），所以要单列出来：
     * 人群洞察那棵树要拉它的数据，只是不给它一个格子。
     */
    const SIGNAL = 'cl-reddit-signal'

    /**
     * 「我的」不是研究模块 —— 它不产生数据、没有 list、不吃额度，
     * 所以它不在 MODULES 里，而是 grid 末尾单独一格。
     *
     * 为什么不混进 MODULES：那个数组驱动了 reload() 的取数循环
     * （逐个 kind 拉 /list）。把账户塞进去，就得给它编一个不存在的 kind，
     * 然后在循环里加分支排除它 —— 一个用来标记「我不是这个东西」的成员。
     * 分开之后两边各自干净：MODULES 全是能跑分析的，这个是账户。
     */
    const ACCOUNT = 'cl-account'

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

      tiktok: { bg: '#000000', path: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z' },

      // TikTok Shop 没有独立 logo；用购物袋 —— 它和 TikTok 是**不同的信号**
      // （视频评论是怀疑，商品差评是失望），图标必须区分得开。
      shop: { bg: '#FE2C55', path: 'M6 2h12l1.5 4H4.5L6 2Zm-3 6h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm5 3v2a4 4 0 0 0 8 0v-2h-2v2a2 2 0 0 1-4 0v-2H8Z' },

      instagram: { bg: 'linear-gradient(45deg,#FEDA75,#FA7E1E 35%,#D62976 60%,#962FBF 80%,#4F5BD5)', path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0Zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03Zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4Zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z' },

      amazon: { bg: '#FF9900', path: 'M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.571 17.571 0 0 1-4.482.615c-2.4 0-4.67-.42-6.81-1.26a19.297 19.297 0 0 1-5.55-3.396c-.09-.075-.135-.15-.135-.226 0-.045.015-.09.045-.135zm6.84-6.63c0-1.005.247-1.863.743-2.577.495-.71 1.174-1.25 2.04-1.615.79-.335 1.766-.575 2.927-.72.39-.046 1.033-.106 1.93-.18v-.376c0-.936-.1-1.565-.304-1.885-.3-.436-.78-.654-1.44-.654h-.18c-.48.045-.896.196-1.244.45-.35.26-.575.615-.674 1.08-.06.3-.21.465-.44.5l-2.53-.315c-.255-.06-.375-.18-.375-.39 0-.045.008-.09.022-.15.255-1.32.87-2.295 1.844-2.94.976-.64 2.115-.99 3.42-1.05h.54c1.666 0 2.97.436 3.9 1.306.15.15.285.315.404.48.12.166.21.315.285.435.06.12.12.3.166.525.045.24.09.405.105.495.03.09.045.285.06.585.015.3.03.48.03.525v4.995c0 .36.045.69.165.99.105.3.21.51.315.645l.51.66c.09.12.135.24.135.345 0 .12-.06.225-.18.315-.615.54-1.26 1.095-1.92 1.65-.12.09-.27.105-.42.03-.135-.105-.255-.21-.36-.315l-.42-.48-.3-.405c-.51.555-1.005.915-1.5 1.08-.3.12-.705.18-1.2.21h-.42c-.99 0-1.815-.3-2.46-.915-.645-.615-.96-1.485-.96-2.61zm3.87-.45c0 .495.12.885.375 1.185.24.3.585.45 1.005.45h.12c.045-.015.105-.015.165-.03.06-.015.105-.03.12-.03.42-.12.75-.39.99-.84.12-.195.195-.42.255-.645.06-.24.09-.435.105-.585.015-.15.015-.39.015-.735v-.39c-.855 0-1.5.06-1.95.18-1.29.36-1.935 1.185-1.935 2.43zm9.63 6.72c.015-.03.045-.075.09-.12.27-.18.54-.315.795-.375.42-.105.825-.165 1.23-.18.105-.015.21-.005.315.015.51.045.825.135.93.27.045.06.075.15.075.27v.105c0 .345-.09.75-.285 1.215-.18.465-.435.84-.765 1.125-.045.045-.09.06-.135.06-.03 0-.045 0-.06-.015-.06-.03-.075-.075-.045-.15.36-.855.54-1.44.54-1.77 0-.105-.015-.18-.06-.225-.105-.12-.405-.18-.9-.18-.18 0-.39.015-.63.03-.27.03-.51.06-.72.09-.06 0-.105.015-.12.03-.03 0-.045 0-.06.015h-.03l-.015-.015-.015-.015v-.045c0-.03 0-.045.015-.075z' },

      // 交叉不是平台 —— 用两条相交的线，视觉上就不该是品牌块
      cross: { bg: '#2F7D82', path: 'M4 5h7v2H6.41l4.3 4.29-1.42 1.42L5 8.41V13H3V5h1Zm16 14h-8v-2h4.59l-4.3-4.29 1.42-1.42L18 15.59V11h2v8h-1Z' },
    }

    /**
     * app 风格的图标块：品牌色圆角底 + 白色 logo。
     * 渐变底（IG）走 background，纯色走 backgroundColor —— 两者都能吃 CSS 字符串。
     */
    const appIcon = (kind, size = 56, off = false) => {
      const b = BRAND[kind] ?? BRAND.reddit

      /**
       * 未接通的图标要**去色**，不能只靠外层那 45% 透明度。
       *
       * 半透明的品牌色仍然是品牌色 —— 淡橙的 Reddit 看着像「加载中」而不是
       * 「还没做」。`grayscale(1)` 把它变成中性灰，配上外层的 opacity，
       * 才读得出是路线图而不是故障。
       */
      const dim = off ? { filter: 'grayscale(1)' } : null

      // logo 自带外形（Reddit 的实心圆）：整块就画它，不套底板
      if (b.full) {
        return el('svg', {
          width: size, height: size, viewBox: '0 0 24 24',
          fill: b.bg, 'aria-hidden': true,
          style: { display: 'block', flex: 'none', ...dim },
        }, el('path', { d: b.path }))
      }

      return el('span', {
        style: {
          width: size, height: size, flex: 'none',
          borderRadius: size * 0.24,
          background: b.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...dim,
        },
      },
        el('svg', {
          width: size * 0.56, height: size * 0.56, viewBox: '0 0 24 24',
          fill: '#fff', 'aria-hidden': true, style: { display: 'block' },
        }, el('path', { d: b.path })),
      )
    }

    /**
     * 账户图标 —— 刻意**不用品牌实心块**，用 currentColor 的线性图标。
     *
     * 这就是「视觉上区分开」那件事：Reddit 那格是橙色实心 logo，一眼看出是
     * 数据源；账户是一个跟着主题走的描边人形，一眼看出不是数据源。
     * 给它也配一个橙紫底板反而会让人以为又多了一个平台。
     */
    const accountIcon = (size = 56) =>
      el('span', {
        style: {
          width: size, height: size, flex: 'none',
          borderRadius: size * 0.24,
          border: '1px solid var(--dsw-alias-border-l4, #e5e3df)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--dsw-alias-label-secondary, #555)',
        },
      },
        el('svg', {
          width: size * 0.5, height: size * 0.5, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round',
          strokeLinejoin: 'round', 'aria-hidden': true, style: { display: 'block' },
        },
          el('circle', { cx: 12, cy: 8, r: 3.6 }),
          el('path', { d: 'M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6' }),
        ),
      )

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
