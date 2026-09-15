/**
 * 展示用的格式化 —— 纯函数，没有 React。
 */
/** 相对时间。saved_at 是毫秒时间戳，缺了就不显示这一段。 */
const ago = (ts) => {
  if (!ts) return ''
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}

export { ago }
