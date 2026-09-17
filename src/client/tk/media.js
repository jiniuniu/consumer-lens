/**
 * TK 的两块外部媒体：封面和播放器。
 *
 * 两者都**不存 URL**，都是渲染时现取 —— 搬自 dsh-tk-studio，那边已经跑了
 * 一段时间，踩过的坑都记在下面的注释里。
 */
import { el, useState, useEffect } from '../react.js'
import { call } from '../api.js'
import { TK } from './styles.js'

/**
 * 一条视频的封面。走 host 代理实时换。
 *
 * **结果文件里不存封面 URL** —— 那是 CDN 签名链接，原始封面 5 小时、
 * oEmbed 的 48 小时就过期，存下来注定是破图（cl_save 会打回带 cover 的数据）。
 * 拉不到就渲染一个占位方块，不留破图。
 */
function Cover({ url }) {
  const [src, setSrc] = useState(null)
  const [dead, setDead] = useState(false)

  useEffect(() => {
    let alive = true
    setSrc(null)
    setDead(false)
    if (!url) { setDead(true); return undefined }
    call(`/cover?url=${encodeURIComponent(url)}`)
      .then((d) => {
        if (!alive) return
        if (d?.thumb) setSrc(d.thumb)
        else setDead(true)
      })
      .catch(() => { if (alive) setDead(true) })
    return () => { alive = false }
  }, [url])

  return el('div', { style: TK.thumb },
    src !== null && !dead
      ? el('img', {
          src,
          alt: '',
          loading: 'lazy',
          style: TK.thumbImg,
          onError: () => { setDead(true) },
        })
      : el('span', { style: TK.thumbDead }, dead ? '▶' : ''),
  )
}

/**
 * 内嵌播放器。
 *
 * **只能用 /embed/v2/<id>** —— 实测该 URL 无 X-Frame-Options、CSP 也没有
 * frame-ancestors，可以内嵌；视频正页是 X-Frame-Options: SAMEORIGIN，
 * 一定被拦。
 *
 * 地区/版权限制会让个别视频白屏，而**跨域 iframe 加载失败不触发 onerror**，
 * 检测不到。所以不做检测，把「去 TikTok」常驻在下面 —— 用户看到白屏
 * 自然会点，比一个永远不准的错误态可靠。
 */
function Player({ v }) {
  return el('div', { style: TK.playerWrap },
    el('iframe', {
      style: TK.iframe,
      src: `https://www.tiktok.com/embed/v2/${v.aweme_id}`,
      allow: 'encrypted-media; picture-in-picture; fullscreen',
      referrerPolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation',
      title: v.desc || v.aweme_id,
    }),
    el('div', { style: TK.playerFoot },
      el('span', null, '播不出来？'),
      el('a', {
        href: v.url, target: '_blank', rel: 'noreferrer', style: TK.link,
      }, '去 TikTok ↗'),
    ),
  )
}

export { Cover, Player }
