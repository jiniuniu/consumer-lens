/**
 * 两个图 —— 手画 SVG，不引库。
 *
 * 插件代码不过打包器（浏览器半边的 require 只查 dsh 的模块表），
 * require 不到 d3 那类东西。好在这两个图都简单到不需要库。
 */
import { el } from '../react.js'
import { TK, C, clsColor } from './styles.js'

/**
 * 人群构成的环形图。
 *
 * 用 stroke-dasharray 把一个圆切成几段，比算 arc path 简单得多。
 *
 * **只画顶层档**：`sub: true` 的二级话题 n 已经含在父档里（SKILL.md 明确
 * 要求父档的 n 包含子档），再画一圈就是重复计数，总和会超过 100%。
 * 它们只在图例里缩进显示。
 */
function Donut({ topics, hole }) {
  const top = topics.filter((t) => t.sub !== true)
  const total = top.reduce((sum, t) => sum + (t.n ?? 0), 0)
  if (total === 0) return null

  const R = 46, W = 14, CX = 54
  const len = 2 * Math.PI * R
  let acc = 0

  return el('div', { style: TK.donutWrap },
    el('svg', {
      width: 108, height: 108, viewBox: '0 0 108 108', style: { flex: 'none' },
    },
      el('circle', {
        cx: CX, cy: CX, r: R, fill: 'none', strokeWidth: W, stroke: C.fill,
      }),
      top.map((t, i) => {
        const frac = (t.n ?? 0) / total
        const seg = el('circle', {
          key: i, cx: CX, cy: CX, r: R, fill: 'none', strokeWidth: W,
          stroke: clsColor(t.cls),
          strokeDasharray: `${len * frac} ${len * (1 - frac)}`,
          strokeDashoffset: -len * acc,
          // -90° 起画：第一段从 12 点方向开始，读起来跟看钟一样
          transform: `rotate(-90 ${CX} ${CX})`,
        })
        acc += frac
        return seg
      }),
      // hole 不是每份都有 —— 条件渲染，别依赖它
      hole?.[0] ? el('text', {
        x: CX, y: CX + 1, textAnchor: 'middle', fontSize: 18, fontWeight: 700,
        fill: 'currentColor',
      }, hole[0]) : null,
      hole?.[1] ? el('text', {
        x: CX, y: CX + 15, textAnchor: 'middle', fontSize: 9, fill: 'currentColor',
        opacity: 0.55,
      }, hole[1]) : null,
    ),
    el('div', { style: TK.legend },
      topics.map((t, i) =>
        el('div', {
          key: i,
          style: { ...TK.legendRow, ...(t.sub ? TK.legendSub : null) },
        },
          el('i', {
            style: {
              ...TK.dot,
              background: clsColor(t.cls),
              opacity: t.sub ? 0.55 : 1,
            },
          }),
          // 二级档自动加 └ 前缀 —— SKILL.md 里明确写了 label 别再写「其中」
          el('span', { style: TK.legendLabel }, (t.sub ? '└ ' : '') + t.label),
          el('span', { style: TK.legendN },
            `${t.n}${t.pct != null ? ` · ${t.pct}%` : ''}`),
        ),
      ),
    ),
  )
}

/**
 * 长尾分布（语种之类）用条形 —— 档太多环形切不开。
 *
 * ⚠️ **语种 bars 没有 cls 字段**，走 clsColor 会拿到 fallback 的浅灰，
 * 画在同样浅灰的 track 上等于隐形。所以没 cls 时用品牌色，有才按类别配色。
 */
function Bars({ bars }) {
  const max = bars.reduce((m, b) => Math.max(m, b.n ?? 0), 0) || 1
  return el('div', { style: { marginTop: 4 } },
    bars.map((b, i) =>
      el('div', { key: i, style: TK.barRow },
        el('span', { style: TK.barLabel, title: b.label }, b.label),
        el('div', { style: TK.barTrack },
          el('div', {
            style: {
              ...TK.barFill,
              // 最长那条占满，其余按比例 —— 但留 2% 底线，
              // 免得 pct=1 的档细成一条看不见的线
              width: `${Math.max(((b.n ?? 0) / max) * 100, 2)}%`,
              background: b.cls ? clsColor(b.cls) : C.brand,
            },
          })),
        el('span', { style: TK.barN },
          `${b.n}${b.pct != null ? ` · ${b.pct}%` : ''}`),
      ),
    ),
  )
}

export { Donut, Bars }
