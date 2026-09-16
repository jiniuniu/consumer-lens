/**
 * IG 痛点报告 —— 刷到还没买的人在顾虑什么，产出是「详情页先答什么」。
 *
 * 和 Reddit 那份的三个区别都来自数据本身：每条证据带封面图（IG 是图像
 * 平台，那张图常常就是痛点本身）、中文和原文并列（卖家要抄的是中文那句）、
 * 没有「机会」区块而是内容侧信号。
 */
import { el, useState } from '../react.js'
import { S } from '../styles.js'

/**
 * 一条证据的「看原帖」—— 点开才内嵌 IG。
 *
 * **为什么是 /embed/ 而不是正页**：实测正页回 `X-Frame-Options: DENY`，
 * 一定被拦；`/p/<code>/embed/` 没有那个头、CSP 里也没有 frame-ancestors，
 * 可以内嵌。和 TikTok 的 `/embed/v2/` 是同一个模式（正页拦、embed 放行）。
 *
 * **为什么默认折叠**：一份报告里几十条证据，全塞 iframe 会很卡；而且
 * 内嵌要求浏览器能访问 Instagram，**没有代理的用户看到的是白屏**
 * （实测直连 15s 超时）。折叠起来，想看的人点开、看不了的人不受打扰 ——
 * 文字证据（text + zh）本来就是自足的。
 *
 * **为什么不做加载失败检测**：跨域 iframe 加载失败**不触发 onerror**，
 * 检测不到，而且「没代理」和「帖子被删」是同一种白屏。所以不猜，
 * 把兜底那行常驻在下面，用户看到白屏自然会点。
 */
function Embed({ code, url }) {
  const [open, setOpen] = useState(false)
  const href = url ?? (code ? `https://www.instagram.com/p/${code}/` : undefined)

  if (!code) {
    // 评论类证据没有自己的帖子 code —— 只给外链，不给内嵌入口
    return href
      ? el('a', { href, target: '_blank', rel: 'noreferrer', style: S.igLink }, '去 Instagram ↗')
      : null
  }

  if (!open) {
    return el('button', {
      type: 'button',
      onClick: () => setOpen(true),
      style: S.igToggle,
    }, '▸ 看原帖')
  }

  return el('div', { style: { marginTop: 8 } },
    el('div', { style: S.igFrameWrap },
      el('iframe', {
        src: `https://www.instagram.com/p/${code}/embed/`,
        style: S.igFrame,
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        // captioned 版有文案但更高；这里要的是图，用默认版
        sandbox: 'allow-scripts allow-same-origin allow-popups',
        title: code,
      }),
    ),
    el('div', { style: S.igFoot },
      el('button', {
        type: 'button', onClick: () => setOpen(false), style: S.igToggle,
      }, '▾ 收起'),
      el('span', { style: { flex: 1, minWidth: 0 } },
        '看不到？需要能访问 Instagram 的网络环境'),
      href
        ? el('a', { href, target: '_blank', rel: 'noreferrer', style: S.igLink },
            '去 Instagram ↗')
        : null,
    ),
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
              // 点开才内嵌 —— 默认不加载任何外部资源
              el(Embed, { code: e.code, url: e.url }),
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


export { IgReport }

