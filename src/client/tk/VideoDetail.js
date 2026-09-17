/**
 * 一条视频的详情页：播放器 + 元信息 + 评论报告（或「去分析」按钮）。
 *
 * 面板**只读 + 一个动作**：不自己跑分析，只在用户点「分析评论」时往对话框
 * 发一条 /cl-tk-comments，剩下的交给 skill。这样耗时操作、报错、中途追问
 * 全在对话框里，面板永远不用处理「正在跑」以外的状态。
 */
import { el } from '../react.js'
import { TK } from './styles.js'
import { Player } from './media.js'
import { human } from './VideoList.js'
import { CommentReport } from './CommentReport.js'

/** 还没分析过这条 —— 一个按钮，外加说清点了会发生什么。 */
function NotYet({ onAnalyze, busy }) {
  return el('div', { style: TK.notYet },
    el('div', { style: TK.notYetDot }, '○'),
    el('div', null, '还没分析过这条的评论区'),
    el('button', {
      type: 'button',
      style: { ...TK.btn, ...(busy ? TK.btnBusy : null) },
      disabled: busy,
      onClick: onAnalyze,
    }, busy ? '已提交，等待中…' : '分析评论'),
    el('div', { style: TK.notYetHint },
      busy
        ? '任务在对话框里跑，完成后这里自动刷新'
        : '会往对话框发一条 /cl-tk-comments'),
  )
}

function VideoDetail({ v, report, analyzed, onBack, onAnalyze, busy }) {
  return el('div', null,
    el('div', { style: TK.detailHead },
      el('button', {
        type: 'button', style: TK.back, onClick: onBack, title: '返回视频列表',
      }, '‹ 返回'),
      el('span', { style: { fontSize: 12, opacity: 0.7 } }, `@${v.author_name ?? '—'}`),
    ),

    el(Player, { v }),

    el('div', { style: TK.vMeta },
      el('div', { style: { fontSize: 12.5, color: 'inherit', marginBottom: 4 } },
        v.desc || '(无文案)'),
      v.note ? el('div', { style: TK.rowNote }, v.note) : null,
      el('div', { style: TK.rowStats },
        el('span', null, `▶ ${human(v.play_count)}`),
        el('span', null, `♥ ${human(v.digg_count)}`),
        el('span', null, `💬 ${human(v.comment_count)}`),
        typeof v.engage_rate === 'number'
          ? el('span', { style: TK.rate }, `互动率 ${v.engage_rate}%`) : null,
        v.create_time ? el('span', { style: { opacity: 0.7 } }, v.create_time) : null,
      ),
    ),

    // 已分析但报告还没读回来时，别闪一个「未分析」——
    // 那会让用户以为刚跑完的东西丢了
    analyzed && report === null
      ? el('div', { style: { padding: 20, opacity: 0.6 } }, '读取中…')
      : report !== null
        ? el(CommentReport, { r: report })
        : el(NotYet, { onAnalyze, busy }),
  )
}

export { VideoDetail }
