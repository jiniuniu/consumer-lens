# 部署 Consumer Lens 客户端

> 这份讲**怎么把这个插件装到一台 dsh 上**，以及发 npm 前要注意什么。
> 日常启动看 `../RUNNING.md`，用户视角的安装看 `../docs/install-cli.md`。

---

## 「部署」在这里是什么意思

= **让某台机器上某个 dsh profile 的 `node_modules` 里有这个包**，然后重启 dsh。
没有服务器、没有 CI。

但**有构建**：`src/` 是源码，`lib/` 是 esbuild 产物，dsh 加载的是 `lib/`。
浏览器那半必须是单文件（dsh 的 loader 不认相对路径 import，见 `build.js` 顶部），
所以构建这步省不掉。

`lib/` **不进 git**（构建产物，diff 噪声大、会和源码打架），但**进 npm 包**
（`files` 里有它）。三条安装路径各自怎么拿到 `lib/`：

| 装法 | 包从哪来 | `lib/` 哪来 | 给谁 |
|---|---|---|---|
| **A. link** | 软链到工作目录 | 你自己 `npm run build` | 只有你 |
| **B. npm** | `registry.npmjs.org` | tarball 里已打好 | 正式用户 |
| **C. GitHub** | 仓库快照 | npm 自动跑 `prepare` 现场 build | 尝鲜用户 |

**A 不能给别人用** —— `link:` 是绝对路径，换台机器就是死链。

---

## A. 装到自己机器（开发）

```bash
cd ~/code/projects/dsh-seller/consumer-lens
npm install                              # prepare 会顺带 build 出 lib/
dsh plugin --profile lens add ./
```

改完代码：`npm run build` + 重启 dsh。

---

## B. 发到 npm

发之前跑一遍，`prepublishOnly` 会自动跑测试（含 lint + build）：

```bash
npm login
npm pack --dry-run     # 逐行看文件列表，确认 lib/ 和 skills/ 都在（应该 20 个文件）
npm publish            # publishConfig 已设 access:public，不用再加参数
```

发完页面自动生成：`https://www.npmjs.com/package/@consumer-lens/lens`

> scope 先到先得。`@consumer-lens` 目前还没被占，建议先发个 `0.0.1` 占下来。

**公开包 = 源码公开。** 任何人都能 `npm pack @consumer-lens/lens` 下载下来看
全部内容，包括 `skills/` 里那四个 SKILL.md。按 `DESIGN.md` 这是故意的
（客户端开源、服务端闭源），但发之前确认一遍这是你要的。

---

## C. 从 GitHub 装

```bash
dsh plugin --profile lens add github:jiniuniu/consumer-lens
```

npm 会克隆仓库、装 devDependencies、跑 `prepare` 构建出 `lib/`，然后装进去。
比 npm 慢（实测 20 秒，要下载 esbuild 并构建），但拿到的永远是 main 最新代码。

⚠️ **`prepare` 这一行不能删。** 删了从 GitHub 装只能拿到 8 个文件
（`lib/` 不在 git 里），插件加载不了，而且**不会报错** —— 表现为面板空白。

---

## 两项运行时配置

都由 `cordis.patch.yml` 给，环境变量可覆盖：

| 配置 | 环境变量 | 默认值 |
|---|---|---|
| `apiBase` | `CL_API_BASE` | `http://localhost:8000` |
| `dataDir` | `CL_DATA_DIR` | `~/.dsh/consumer-lens/data` |

> 发布前 `apiBase` 的默认值要改成线上地址 —— 用户侧不跑本地服务端。

**token 不在这里。** 用户在面板里用手机号登录，token 由插件写进 dsh 的托管
凭证库（`~/.dsh/.credentials.yaml`），**用户从头到尾不用手填**。

凭证是**每次调用重新解析**的，所以换 token 不用重启 dsh。

⚠️ **启动时不要带 `CL_TOKEN=...` 环境变量。** 进程环境是只读且优先级最高的
一层，会遮蔽托管凭证库 —— 登录时 `credentials.set()` 会被拒绝（409）。

> 凭证文件是**所有 profile 共享**的，插件和配置才是 profile 隔离的。

---

## 装完怎么验收

```bash
# ① 插件挂上了
dsh --profile lens --dump-config | grep consumer-lens

# ② skill 注册上了 —— 对话框敲 /cl 能补全出四个 cl-* skill

# ③ 面板路由活着
curl 'http://127.0.0.1:5599/consumer-lens/api/stat'    # → {"mtime":...}

# ④ 账户能查（要先登录）
curl 'http://127.0.0.1:5599/consumer-lens/api/account'
```

② 和 ③ 是**独立的两条链**。面板挂了不影响 skill —— `webServer` 故意没写进
顶层 `inject`，缺了它取数链照跑。

---

## 改了代码之后

| 改了什么 | 要做什么 |
|---|---|
| `src/**` | `npm run build` + 重启 dsh |
| `skills/**` | 重启 dsh（skill 不经构建，原样发） |
| `cordis.patch.yml` | 热加载，不用重启（`patchReload: live`） |

**永远不要手改 `lib/`** —— 下次 build 会覆盖掉。

---

## 数据在哪

```
~/.dsh/consumer-lens/data/<kind>/<run-id>.json
```

平铺的 JSON，文件名就是主键。**全在用户自己机器上**，云端只记调用次数。

换机器拷这个目录就行；卸载插件不会删它。
