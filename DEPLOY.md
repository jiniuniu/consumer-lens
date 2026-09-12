# 部署 Consumer Lens 客户端

> 写于 2026-09-13。这份讲**怎么把这个插件装到一台 dsh 上**。
> 日常启动看 `../RUNNING.md`，发 npm 的细节看 `../docs/publishing.md`。

---

## 先搞清楚「部署」在这里是什么意思

这个插件**没有构建、没有服务器、没有 CI**。它是一个纯 ESM 的 npm 包，
`lib/` 下的 js 就是最终产物，dsh 进程直接 import。

所以部署 = **让某台机器上的某个 dsh profile 的 `node_modules` 里有这个包**，
然后重启 dsh。仅此而已。

有两条路，区别只在「包从哪来」：

| | 包从哪来 | 给谁用 | 改了代码怎么办 |
|---|---|---|---|
| **A. link**（现在用的） | 软链到本地工作目录 | 只有你自己 | 重启 dsh 就生效 |
| **B. npm** | `registry.npmjs.org` | 别人 | 要发新版本 |

**A 不能给别人用** —— `link:` 指向一个绝对路径，那条路径在别人机器上不存在。
这是现在的状态，也是下面第一节要说清楚的坑。

---

## 当前状态（实测）

`~/.dsh/profiles/lens/package.json`：

```json
"dependencies": {
  "@consumer-lens/lens": "link:/Users/nianji/code/projects/dsh-seller/consumer-lens",
  "dsh-better-sidebar": "^0.19.1"
}
```

那个 `link:` 是**开发装法**。它的好处是改完代码重启就生效，不用发版；
代价是这个 profile 目录换台机器就是死链。

包本身**还没发到 npm**（`npm whoami` 未登录，scope `@consumer-lens` 也还没注册）。

---

## A. 装到自己机器（开发，已跑通）

前置：全局 dsh `0.1.5-rc.2`，node `v24.19.0`。

```bash
# ① 建 profile —— 装一个真实存在的 npm 包触发初始化
dsh plugin --profile lens add dsh-better-sidebar

# ② 手动把框架包写进 bundles（见下方「为什么」）
#    编辑 ~/.dsh/profiles/lens/package.json

# ③ 装本插件
dsh plugin --profile lens add ~/code/projects/dsh-seller/consumer-lens

# ④ 验收：配置树能组合出来
dsh --profile lens --dump-config | grep consumer-lens
```

`~/.dsh/profiles/lens/package.json` 应该长这样：

```json
{
  "name": "dsh-profile-lens",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-better-sidebar",
        "@consumer-lens/lens"
      ],
      "patchReload": "live"
    }
  },
  "dependencies": {
    "@consumer-lens/lens": "link:/Users/nianji/code/projects/dsh-seller/consumer-lens",
    "dsh-better-sidebar": "^0.19.1"
  }
}
```

### ⚠️ 为什么 `@deepseek-ai/*` 只在 bundles 不在 dependencies

npm 上的 `@deepseek-ai/dsh-web-app` 是过期 rc，依赖一个根本没发布的
`@deepseek-ai/dsh-frontend`，装它必 404。真正在用的版本**随全局 dsh 一起装**，
软链在 `~/.dsh/profiles/node_modules/` 这个共享目录里。

**bundles 数组的顺序有意义** —— 是按顺序层层 patch 叠的，框架包必须排在
自己的插件前面。

---

## B. 发到 npm 给别人装（还没做）

发完之后别人只要两条命令：

```bash
dsh plugin --profile lens add @consumer-lens/lens
dsh --profile lens -- --port 5599
```

发之前这个包还缺三样东西（照 `../docs/publishing.md` 的 checklist 对的）：

- [ ] **`"publishConfig": { "access": "public" }`** —— scoped 包不写这个，
      第一次 `npm publish` 会当成私有包被拒
- [ ] **`"license"` 字段 + 一个 LICENSE 文件**
- [ ] **README.md** —— 装什么、配什么 key

`"files"` 已经对了（`lib` / `skills` / `cordis.patch.yml`），
`cordis.patch.yml` 里也没有绝对路径（用的 `!!js` 表达式 + `dshHomePath()`）。

发之前务必：

```bash
npm pack --dry-run     # 逐行看文件列表，确认 skills/ 在里面
npm pack               # 生成 tgz，先本地装一次试
dsh plugin --profile lens add ./consumer-lens-lens-0.1.0.tgz
```

> scope 名先到先得。注册账号后建议立刻发个 0.0.1 占位版把 `@consumer-lens` 占下来。

---

## 两项运行时配置

插件自己只有两个配置项，都由 `cordis.patch.yml` 给，环境变量可覆盖：

| 配置 | 环境变量 | 默认值 |
|---|---|---|
| `apiBase` | `CL_API_BASE` | `http://localhost:8000` |
| `dataDir` | `CL_DATA_DIR` | `~/.dsh/consumer-lens/data` |

**token 不在这里。** `CL_TOKEN` 走 dsh 的托管凭证存储
（设置 → 插件 → Consumer Lens），配置文件里只有凭证名，值不落盘到仓库。
缺省时退回读环境变量 `CL_TOKEN`。

凭证是**每次调用重新解析**的，所以换 token 不用重启 dsh。

> 凭证在 `~/.dsh/.credentials.yaml`，是**所有 profile 共享**的 ——
> 在哪个 profile 配都能用。插件和配置才是 profile 隔离的。

---

## 部署之后怎么验收

```bash
# ① 服务端在跑
curl localhost:8000/health        # → {"ok":true,...}

# ② 插件挂上了
dsh --profile lens --dump-config | grep consumer-lens

# ③ skill 注册上了 —— 对话框敲 /cl 应该能补全出 cl-tk-comments

# ④ 面板路由活着
curl 'http://127.0.0.1:5599/consumer-lens/api/list'
```

第 ③ 和第 ④ 是**独立的两条链**。面板挂了不影响 `/cl-tk-comments`——
`webServer` 故意没写进 `inject`，它只挂面板的只读路由，
缺了它取数链照跑。控制台看到这条是正常的：

```
[Consumer Lens] 侧栏面板未加载：需要 dsh-better-sidebar，...
                tools 和 /cl-tk-comments 不受影响
```

---

## 改了代码之后要重启什么

| 改了什么 | 要做什么 |
|---|---|
| `lib/**` | **重启 dsh**（JS 已被进程加载，热换不掉） |
| `skills/**` | **重启 dsh** |
| `~/.dsh/profiles/lens/cordis.patch.yml` | 热加载，不用重启（`patchReload: live`） |

```bash
pkill -f "dsh --profile lens"
```

link 装法下改 `lib/` **不用重新 `dsh plugin add`** —— 软链指的就是工作目录。

---

## 版本对不上时

实测跑通的组合：

```
dsh                0.1.5-rc.2
dsh-better-sidebar 0.19.1
node               v24.19.0
```

profile 的 node_modules 混了新旧版本会报 `does not provide an export named 'xxx'`，
清掉重装：

```bash
cd ~/.dsh/profiles/lens
rm -rf node_modules pnpm-lock.yaml
dsh plugin --profile lens install
```

---

## 数据在哪（部署要知道的）

```
~/.dsh/consumer-lens/data/cl-tk-comments/<视频id>.json
```

**没有数据库迁移、没有备份机制。** 一个视频一个 json 文件，
删掉这个目录分析就没了 —— 云端不存任何用户内容，那边只有调用次数。

换机器时想保留分析结果，直接拷这个目录。
