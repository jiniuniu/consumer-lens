/**
 * Consumer Lens —— 右栏一个 tab。**没有设置卡片。**
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
import { makeLensIcon } from './icons.js'
import { LensTab } from './LensTab.js'

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

  // ② 没有设置卡片 —— 这是刻意的。
  //
  // 账号相关的一切都收在右栏「我的」那一格里：未登录时它带橙色角标、
  // 点进去就是登录页。而服务端地址和 token **不再让用户填**：
  //   - 地址是我们定的，填错只会得到「无法连接到 http://localhs:8000」
  //   - token 是登录的产物，不是用户该持有的东西
  // 留着那张卡等于把「怎么填对」这个问题丢回给用户，还多一个要维护的入口。
  //
  // 地址要改就用 CL_API_BASE 环境变量（见 src/index.js），那是给开发者的口子。
}


export { apply, inject }

