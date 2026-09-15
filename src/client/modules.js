/**
 * 宫格上有哪些格子，以及每格的列表行和空状态。
 *
 * 这三样**必须一起改** —— 加一个数据源要动 MODULES（多一格）、rowMeta
 * （那一格的列表行显示什么）、EmptyHint（还没跑过时提示跑哪条命令）。
 * 放一个文件等于把「加一格要改什么」变成一处。
 */
import { el, Fragment } from './react.js'
import { S } from './styles.js'
import { ago } from './format.js'

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
    return el(Fragment, null,
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
    return el(Fragment, null,
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
  return el(Fragment, null,
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


export { MODULES, SIGNAL, ACCOUNT, rowMeta, EmptyHint }

