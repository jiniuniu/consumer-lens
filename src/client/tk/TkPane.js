/**
 * TK 那一格的右半边 —— 三态：视频列表 / 视频详情 / 还没选。
 *
 * **为什么 TK 不复用 TreeNode**（人群洞察那棵树用的组件）：
 *
 * 那棵树三层都是一次运行（audience → signal → pain），每个节点都有 run_id，
 * 点它就能 `/item?kind=&id=` 取报告。TK 的中间层「视频」**不是一次运行** ——
 * 它是搜索结果 JSON 里的一条记录，没有 run_id、没有 saved_at。硬塞进
 * TreeNode 要给它编一个假 id，而那个 id 一旦进了 pick 就会去请求
 * `/item?id=<假的>`，拿回 404 → 右边一片空白，列表却是好的（那正是
 * LensTab 里 `row.slug` 那个坑的形状）。
 *
 * 所以这里自己管两层状态：左列选中的是**搜索**（真 run），
 * 这个组件内部再管「在列表页还是在某条视频的详情页」。
 */
import { el, useState, useEffect, useCallback } from '../react.js'
import { call } from '../api.js'
import { VideoList } from './VideoList.js'
import { VideoDetail } from './VideoDetail.js'

/**
 * @param search   当前选中那次搜索的全文（含 videos[]），null = 还没读回来
 * @param analyses cl-tk-comments 的 list —— 用来求 ●/○ 交集和取报告 id
 * @param onRun    往对话框发指令
 */
function TkPane({ search, analyses, onRun }) {
  /** 当前打开的视频（null = 在列表页）。存整条，返回列表不用重查。 */
  const [video, setVideo] = useState(null)
  const [report, setReport] = useState(null)
  /** 已提交分析、还没等到结果的 aweme_id 集合。 */
  const [pending, setPending] = useState(() => new Set())

  // 换一次搜索就退回列表 —— 不然会停在上一个品类的视频详情
  useEffect(() => { setVideo(null); setReport(null) }, [search?.slug, search?.id])

  /**
   * aweme_id → 最新那份分析。
   *
   * 同一条视频可以分析多次（永远新建、从不覆盖），这里取 saved_at 最大的
   * 那份 —— store.list() 已经按 saved_at 降序排过，所以第一个命中的就是最新。
   */
  const latest = new Map()
  for (const a of analyses) {
    if (a.aweme_id && !latest.has(a.aweme_id)) latest.set(a.aweme_id, a)
  }
  const done = new Set(latest.keys())

  // 打开的那条视频一旦有了分析，就去读它的报告
  useEffect(() => {
    if (video === null) { setReport(null); return undefined }
    const hit = latest.get(video.aweme_id)
    if (hit === undefined) { setReport(null); return undefined }

    let alive = true
    call(`/item?kind=cl-tk-comments&id=${encodeURIComponent(hit.id)}`)
      .then((d) => {
        if (!alive) return
        setReport(d)
        // 拿到了说明这条跑完了，把 pending 摘掉
        if (d !== null) {
          setPending((s) => {
            if (!s.has(video.aweme_id)) return s
            const n = new Set(s)
            n.delete(video.aweme_id)
            return n
          })
        }
      })
      .catch(() => { if (alive) setReport(null) })
    return () => { alive = false }
    // latest 每次渲染都是新 Map，不能进依赖 —— 用它里面那条的 id
  }, [video, analyses])

  /**
   * 点「分析评论」：往对话框发 `/cl-tk-comments <aweme_id> <搜索的 run_id>`。
   *
   * 第二个参数是 from_run —— skill 落盘时填进去，面板才能把这份分析
   * 挂回这条视频所属的那次搜索（血缘）。
   */
  const onAnalyze = useCallback(async () => {
    if (video === null) return
    const id = video.aweme_id
    setPending((s) => new Set(s).add(id))
    // 发失败要把 pending 摘掉，否则按钮永远卡在「已提交，等待中…」，
    // 而用户看不出是根本没发出去（run 返回 false 就是这种情况）
    const ok = await onRun('cl-tk-comments', `${id} ${search?.id ?? ''}`.trim())
    if (!ok) {
      setPending((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }, [video, search, onRun])

  if (search === null) {
    return el('div', { style: { padding: 24, opacity: 0.6 } }, '读取中…')
  }

  if (video !== null) {
    return el(VideoDetail, {
      v: video,
      report,
      analyzed: done.has(video.aweme_id),
      busy: pending.has(video.aweme_id),
      onBack: () => { setVideo(null); setReport(null) },
      onAnalyze,
    })
  }

  return el(VideoList, { data: search, done, onOpen: setVideo })
}

export { TkPane }
