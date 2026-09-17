/**
 * 面板本体 —— 三级导航：grid（选模块）→ 模块内 list + report 同屏。
 *
 * 同屏是因为用户要横着比：切一个品，右边立刻换报告，不用来回跳。
 *
 * 报告按**选中那条的 kind** 分发，不是按当前格子 —— 人群洞察的树里三种
 * 报告混在一起，按 mod 分发会拿 AudienceReport 去渲染痛点。
 */
import { el, useState, useEffect, useCallback, useRef } from './react.js'
import { POLL_MS, API } from './constants.js'
import { S } from './styles.js'
import { call, sendToConversation } from './api.js'
import { MODULES, SIGNAL, TK_COMMENTS, ACCOUNT, rowMeta, EmptyHint } from './modules.js'
import { appIcon, accountIcon } from './icons.js'
import { TreeNode } from './TreeNode.js'
import { AccountPage } from './AccountPage.js'
import { AudienceReport } from './report/audience.js'
import { SignalReport } from './report/signal.js'
import { Report } from './report/reddit-pain.js'
import { IgReport } from './report/ig-pain.js'
import { TkPane } from './tk/TkPane.js'

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
    const kinds = [...MODULES.filter((m) => m.wired).map((m) => m.id), SIGNAL, TK_COMMENTS]
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

  /**
   * 登录了没。
   *
   * **走 /account 而不是 credentials.describe()。** 原来用后者,但 LensTab 的
   * inject 里只有 sidebarRightTabs/slots/sessions —— 没有 `remote`,
   * 于是 ctx.get('remote') 永远是 undefined、ready 永远停在 null、
   * 角标永远不出现（这就是「图标不显示状态」的原因）。
   *
   * 而把 'remote' 加进 inject 是错的解法：那会让远端连接没就绪时
   * **整个面板都不出现**,为了一个角标赔掉主功能。
   *
   * /account 这条路更好：它本来就是面板唯一出网的路由,host 在没 token 时
   * 回 `code: 'not_logged_in'`,正是我们要的答案。顺带它还能反映
   * 「token 有但失效了」（401）—— describe() 只知道「配没配过」,不知道好不好使。
   */
  const [ready, setReady] = useState(null)   // null=还没查出来
  const checkRef = useRef(null)
  useEffect(() => {
    let alive = true

    const check = async () => {
      try {
        const r = await fetch(`${API}/account`)
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (r.ok) return setReady(true)
        if (d?.code === 'not_logged_in') return setReady(false)
        setReady(null)          // 服务端连不上之类 —— 别吓唬用户
      } catch {
        if (alive) setReady(null)
      }
    }
    checkRef.current = check
    check()
    return () => { alive = false }
  }, [])

  // 登录/登出后立刻回读，不等 credentials 事件 —— 那个事件由 host 侧的
  // set()/unset() 触发，但从面板发起的那次我们自己就知道，等一轮没必要。
  const recheck = useCallback(() => { checkRef.current?.() }, [])

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


  /**
   * 开跑 = 往对话框发指令。面板自己从不跑分析。
   *
   * 返回一个 Promise<boolean> —— 调用方靠它决定要不要把「等待中」状态摘掉。
   * （TK 那格的「分析评论」按钮会等这个：发失败还留着 pending 的话，
   * 按钮会永远卡在「已提交，等待中…」，而用户看不出是发送失败了。）
   */
  const run = useCallback(async (moduleId, topic) => {
    if (!sessionId) return false
    try {
      return await sendToConversation(ctx, sessionId, `/${moduleId} ${topic}`)
    } catch {
      return false
    }
  }, [ctx, sessionId])

  // ── ① grid：选模块 ──
  if (!mod) {
    return el('div', { style: S.single },
      el('h2', { style: { ...S.h1, marginBottom: 16 } }, 'Consumer Lens'),

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
          // 未登录时这一格是**唯一的入口**，tooltip 要说「点这里登录」，
          // 不能还说「余额和用量」—— 那是登录之后才有的东西。
          title: ready === false
            ? '点击登录 —— 手机号登录后即可使用'
            : '我的账户 —— 余额和用量',
          onClick: () => { setMod(ACCOUNT); setPick(null) },
          style: S.appCell,
        },
          accountIcon(56, ready),
          el('span', { style: S.appName }, ready === false ? '登录' : '我的'),
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
      el(AccountPage, { onAuthChanged: recheck }),
    )
  }

  // ── ② 模块内：左 list + 右 report ──
  const m = MODULES.find((x) => x.id === mod)
  let rows = lists[mod] ?? []

  /**
   * TK 的左列要显示「这次搜索里已分析了几条」。
   *
   * 这个数**算不进 store 的投影** —— 它是两个 kind 求交集的结果
   * （搜索的 videos[] × 评论分析的 aweme_id），而 store.list() 一次只看
   * 一个目录。但左列又不能为了这个数去读每次搜索的全文（那是几十 KB × N）。
   *
   * 所以用 from_run 近似：挂在这次搜索下面的分析，**按 aweme_id 去重**。
   * 去重是必须的 —— 同一条视频可以分析多次（永远新建、从不覆盖），
   * 不去重的话左列会显示「● 5」而列表上只有 2 条打了勾。
   */
  if (mod === 'cl-tk-search') {
    const analyses = lists[TK_COMMENTS] ?? []
    rows = rows.map((r) => ({
      ...r,
      analyzed: new Set(
        analyses.filter((a) => a.from_run === r.id && a.aweme_id).map((a) => a.aweme_id),
      ).size,
    }))
  }

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
              /**
               * TK 那一格不是「一份报告」，是一棵两层的东西：
               * 视频列表 → 某条视频的详情 + 评论聚类。所以交给 TkPane
               * 自己管内部状态（见那个文件顶部关于「为什么不复用 TreeNode」）。
               *
               * `search` 要带上 id —— TkPane 发 /cl-tk-comments 时要把它
               * 当 from_run 传过去，血缘才串得起来。
               */
              : (pickKind ?? mod) === 'cl-tk-search'
                ? el(TkPane, {
                    search: { ...report, id: pick },
                    analyses: lists[TK_COMMENTS] ?? [],
                    onRun: run,
                  })
                : el(Report, { r: report }),
    ),
  )
}


export { LensTab }

