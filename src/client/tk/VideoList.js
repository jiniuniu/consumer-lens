/**
 * 一次搜索的视频列表 —— 排序、类型筛选、●/○ 标记。
 *
 * ●/○ 的数据来源见 store.js 里 `cl-tk-comments` 投影的注释：
 * 文件名是 run_id，所以「这条分析过没有」要靠投影出来的 aweme_id 求交集。
 */
import { el, useState, useMemo } from '../react.js'
import { TK } from './styles.js'
import { Cover } from './media.js'

/** 12,392,013 → 1239万；56,329 → 5.6万 */
function human(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}万`
  return String(n)
}

const SORTS = [
  { id: 'play_count', label: '播放量' },
  { id: 'engage_rate', label: '互动率' },
  { id: 'comment_count', label: '评论数' },
  { id: 'digg_count', label: '点赞数' },
]

function VideoRow({ v, analyzed, onOpen }) {
  return el('div', {
    style: TK.row,
    onClick: () => onOpen(v),
  },
    el(Cover, { url: v.url }),
    el('div', { style: TK.rowMain },
      el('div', { style: TK.rowTop },
        el('span', { style: analyzed ? TK.badgeOn : TK.badgeOff },
          analyzed ? '● 已分析' : '○ 未分析'),
        v.type ? el('span', { style: TK.tag }, v.type) : null,
        el('span', { style: TK.rowAuthor }, `@${v.author_name ?? '—'}`),
        v.follower_count
          ? el('span', { style: TK.rowFans }, `${human(v.follower_count)}粉`) : null,
      ),
      // 英文原文案 —— 两行截断
      el('div', { style: TK.rowDesc }, v.desc || '(无文案)'),
      // note 是模型写的判断，不是 desc 的翻译 —— 信息量比直译大得多
      v.note ? el('div', { style: TK.rowNote }, v.note) : null,
      el('div', { style: TK.rowStats },
        el('span', null, `▶ ${human(v.play_count)}`),
        el('span', null, `♥ ${human(v.digg_count)}`),
        el('span', null, `💬 ${human(v.comment_count)}`),
        typeof v.engage_rate === 'number'
          ? el('span', { style: TK.rate }, `${v.engage_rate}%`) : null,
        v.create_time ? el('span', { style: { opacity: 0.7 } }, v.create_time) : null,
      ),
    ),
  )
}

/**
 * 列表本体。
 *
 * type 的取值**随数据集变化**（种草/评测/DIY/其他，但一次搜索里不一定四种都有），
 * 所以筛选栏从数据里长出来，不写死。
 */
function VideoList({ data, done, onOpen }) {
  const [sort, setSort] = useState('play_count')
  const [type, setType] = useState('全部')
  const [onlyDone, setOnlyDone] = useState(false)

  const videos = useMemo(
    () => (Array.isArray(data.videos) ? data.videos : []),
    [data],
  )

  const types = useMemo(() => {
    const seen = []
    for (const v of videos) {
      if (typeof v.type === 'string' && !seen.includes(v.type)) seen.push(v.type)
    }
    return ['全部', ...seen]
  }, [videos])

  const rows = useMemo(() => {
    let vs = videos
    if (type !== '全部') vs = vs.filter((v) => v.type === type)
    if (onlyDone) vs = vs.filter((v) => done.has(v.aweme_id))
    return [...vs].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0))
  }, [videos, sort, type, onlyDone, done])

  const n = videos.filter((v) => done.has(v.aweme_id)).length

  return el('div', null,
    el('div', { style: TK.bar },
      el('select', {
        style: TK.select,
        value: sort,
        onChange: (e) => { setSort(e.currentTarget.value) },
      }, SORTS.map((s) => el('option', { key: s.id, value: s.id }, s.label))),
      el('div', { style: TK.tabs }, types.map((t) =>
        el('button', {
          key: t,
          type: 'button',
          style: { ...TK.tab, ...(t === type ? TK.tabOn : null) },
          onClick: () => { setType(t) },
        }, t))),
      // 已分析数为 0 时不显示这个勾选框 —— 勾了必然是空列表
      n > 0
        ? el('label', { style: TK.check },
            el('input', {
              type: 'checkbox',
              checked: onlyDone,
              onChange: (e) => { setOnlyDone(e.currentTarget.checked) },
            }),
            `只看已分析 (${n})`,
          )
        : null,
    ),
    rows.length === 0
      ? el('div', { style: { padding: 20, opacity: 0.6 } }, '没有符合条件的视频')
      : rows.map((v) => el(VideoRow, {
          key: v.aweme_id,
          v,
          analyzed: done.has(v.aweme_id),
          onOpen,
        })),
  )
}

export { VideoList, human }
