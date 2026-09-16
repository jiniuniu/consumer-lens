#!/usr/bin/env bash
#
# Consumer Lens 安装脚本
#
#   curl -fsSL https://raw.githubusercontent.com/jiniuniu/consumer-lens/main/install.sh | bash
#
# 装 dsh（如果没有）→ 建 profile 装插件 → 补 bundles → 启动。
# 幂等：重复跑就是更新。

set -uo pipefail

PROFILE="${CL_PROFILE:-lens}"
PORT="${CL_PORT:-5599}"
SOURCE="${CL_SOURCE:-github:jiniuniu/consumer-lens}"
MIN_NODE=20

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

bold "Consumer Lens 安装"
echo

# ── ① Node ──────────────────────────────────────────────────
#
# 不自动装 Node：那要么动系统目录（要 sudo），要么装一份用户不知道的
# 副本，两种都不该由一个第三方脚本擅自做。说清楚怎么装，让用户决定。
if ! command -v node >/dev/null 2>&1; then
  die "没有 Node。装一个再来：
    brew install node          （macOS）
    或 https://nodejs.org 下载安装包"
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  die "Node 版本太低：当前 v$(node -p 'process.versions.node')，需要 v${MIN_NODE} 以上。
    brew upgrade node          （macOS）"
fi
ok "Node v$(node -p 'process.versions.node')"

command -v npm >/dev/null 2>&1 || die "有 node 但没有 npm，Node 装得不完整。"

# ── ② dsh ───────────────────────────────────────────────────
if command -v dsh >/dev/null 2>&1; then
  ok "dsh $(dsh --version 2>/dev/null | head -1)"
else
  echo "  正在安装 dsh…"
  npm i -g @deepseek-ai/dsh >/dev/null 2>&1 \
    || die "dsh 安装失败。手动跑一次看报什么：
    npm i -g @deepseek-ai/dsh"
  command -v dsh >/dev/null 2>&1 \
    || die "dsh 装上了但不在 PATH 里。把 npm 全局 bin 目录加进 PATH：
    export PATH=\"\$(npm prefix -g)/bin:\$PATH\""
  ok "dsh 已安装"
fi

# ── ③ 插件 ──────────────────────────────────────────────────
echo "  正在安装插件（要现场构建，约 20 秒）…"
dsh plugin --profile "$PROFILE" add "$SOURCE" >/dev/null 2>&1 \
  || die "插件安装失败。手动跑一次看报什么：
    dsh plugin --profile ${PROFILE} add ${SOURCE}"
ok "插件已装进 profile「${PROFILE}」"

# ── ④ 补 bundles ────────────────────────────────────────────
#
# ★ 这一步是这个脚本存在的主要理由。
#
# `dsh plugin add` 只把插件写进 bundles，**不会加框架包**。缺了
# dsh-web-app 启动后没有 web server —— 日志 0 字节、没有 URL、
# 面板起不来，而且**完全没有报错**，用户无从判断哪里错了。
#
# 而且不能用 `dsh plugin add` 装它：那个包随全局 dsh 一起发，
# profile 里装会去 registry 拉，而 npm 上那份 0.0.1-rc.1 依赖
# @deepseek-ai/dsh-frontend —— 那个包已改名成 dsh-web-frontend，
# registry 上是 404，pnpm 直接失败。所以只改配置，不装包。
PKG="$HOME/.dsh/profiles/$PROFILE/package.json"
[ -f "$PKG" ] || die "找不到 profile 配置：$PKG"

node - "$PKG" <<'NODE' || exit 1
const fs = require('node:fs')
const p = process.argv[2]
const d = JSON.parse(fs.readFileSync(p, 'utf8'))
const b = ((d.dsh ??= {}).profile ??= {}).bundles ??= []
const WEB = '@deepseek-ai/dsh-web-app'
if (!b.includes(WEB)) {
  // 插在 base 之后、插件之前 —— 顺序就是加载顺序
  const at = b.indexOf('@deepseek-ai/dsh-base')
  b.splice(at >= 0 ? at + 1 : 0, 0, WEB)
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n')
}
NODE
ok "bundles 已就绪"

# ── ⑤ 跑起来 ────────────────────────────────────────────────
echo
bold "装好了。启动："
echo
echo "    dsh --profile ${PROFILE} -- --port ${PORT}"
echo
echo "浏览器会打开面板。右栏 Consumer Lens → 账户那一格带橙色角标的"
echo "就是登录入口，手机号收验证码，新号自动注册送 20 积分。"
echo
