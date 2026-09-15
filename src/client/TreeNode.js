/**
 * 人群洞察左列的一个节点 —— 人群 → 信号 → 痛点，缩进即血缘。
 *
 * 关系只认 from_run（代码透传上一步 run_id 的结果），不按 slug 分组。
 */
import { el, useState, Fragment } from './react.js'
import { S } from './styles.js'
import { rowMeta } from './modules.js'

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

  return el(Fragment, null,
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


export { TreeNode, NODE_ICON }

