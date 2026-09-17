/**
 * 构建 —— `src/` 是源码，`lib/` 是产物（发 npm 的那份）。
 *
 * 为什么需要构建：**dsh 把 `lib/client.js` 原样发给浏览器，不打包也不转译**
 * （实测：服务端发出去的字节和本地文件逐字相同，只多一个 `;` 和 sourcemap 注释）。
 * 而浏览器那半的 `require` 不是 Node 的 require —— 它只查 dsh 的模块表
 * （平台 seed 词、已 materialize 的模块、注册过的包 factory，见
 * deepseek-harness/packages/client/modules/src/client/system.ts 的 makeRequire）。
 * 相对路径 `require('./foo.js')` 一定 miss，抛
 * 「missed the module table」。
 *
 * 所以浏览器半边**只能是单文件**。想把它拆成多个模块，就得在构建时打回一个 ——
 * 官方自己也是这么做的：`ui-plan/src/client/` 是一组小文件，
 * 产物 `lib/client.js` 是单文件 rolldown 输出（`dsh-client-ui-sidebar-right`
 * 那份 3779 行、24 个 `//#region`）。
 *
 * 为什么用 esbuild 而不是官方的 tsdown：官方那套 `clientBundle()` 在
 * monorepo 内部，外部拿不到；而我们要的只是「打成一个 IIFE + 套 6 行样板」。
 * 引入 rolldown 生态不值得。代价是将来要抄官方的 CSS Modules 方案会麻烦一点。
 *
 * Host 半边（`src/index.js` 那棵树）**不打包** —— 它跑在 Node 里，
 * ESM import 原生就能解析，打包只会让栈帧变难读。照原样拷过去。
 *
 * ⚠️ **package.json 的 `prepare` 这一行不能删。**
 *
 * `lib/` 不进 git（产物，diff 噪声大）但进 npm 包（`files` 里有它）。
 * 而 README 和 install.sh 的主路径是 `github:jiniuniu/consumer-lens` ——
 * 那条路拿到的是**仓库快照，没有 lib/**，全靠 npm 装完自动跑 `prepare`
 * 现场构建出来。
 *
 * 删掉 `prepare` 的后果：从 GitHub 装只拿到 8 个文件，插件加载不了，
 * **而且不报错** —— 表现为面板一片空白。实测踩过。
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import esbuild from 'esbuild'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
const OUT = join(HERE, 'lib')

/** 包名 —— loader 用它做模块表的 key，必须和 package.json 的 name 一致。 */
const ID = '@consumer-lens/lens'

/**
 * 浏览器半边不能打进 bundle 的东西。
 *
 * `react` 由宿主提供（loader 的 seed 词）。打进来会让页面上出现第二个 React
 * 实例 —— 症状是 hooks 报「Invalid hook call」，而且只在某些渲染路径上炸。
 *
 * 加一个 dsh 包时同步加到这里**和** package.json 的 `dsh.client.external`：
 * 前者让 esbuild 别打包，后者让 loader 知道要先把它准备好。
 */
const EXTERNAL = ['react']

/**
 * loader 样板。
 *
 * 这 6 行是固定的，官方产物的头尾也是这个形状。`factory(require)` 的
 * `require` 就是模块表查询函数，所以 external 的东西在这里被解析。
 *
 * `banner`/`footer` 而不是 esbuild 的 `globalName`：我们要的不是挂全局变量，
 * 是把 exports 交回给 loader。
 */
const BANNER = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
`

const FOOTER = `
    return module.exports
  },
})
`

/**
 * external 是怎么解析到的 —— **靠闭包，不用我们改写**。
 *
 * esbuild 对 external 会生成 `__require("react")`，而它那个 `__require` 垫片
 * 第一件事就是 `typeof require !== "undefined" ? require : …`。我们的 IIFE
 * 正好套在 `factory(require)` 里面，所以那个 `require` 在作用域里，
 * 垫片直接用它 —— 也就是 dsh 的模块表查询。
 *
 * ⚠️ 这条是**构建的隐式契约**，不是巧合可以依赖的那种巧合：一旦产物不再
 * 嵌在 `factory(require)` 里（比如改成 esm 格式），垫片会走到
 * 「Dynamic require of "react" is not supported」那条 throw。
 * `tests/bundle.spec.js` 有一条用假 loader 断言它真的拿到了注入的 react，
 * 改构建形态时那条会红。
 */

async function buildClient() {
  const result = await esbuild.build({
    entryPoints: [join(SRC, 'client', 'index.js')],
    bundle: true,
    format: 'iife',
    // IIFE 的返回值赋给一个局部变量，我们再把它摊到 exports 上
    globalName: '__lens',
    platform: 'browser',
    target: 'es2022',
    external: EXTERNAL,
    // 产物是给人读的（发 npm = 公开源码，见 docs/publishing.md §4.5）：
    // 不压缩、留注释，用户在 node_modules 里打开就能读懂。
    minify: false,
    legalComments: 'inline',
    write: false,
    // 缩进两级，让产物在样板里读起来是对齐的
    banner: {},
  })

  const body = result.outputFiles[0].text

  // external 在 bundle 里是 `require('react')` 调用 —— esbuild 对 iife 格式
  // 会保留它。loader 的 require 是同步的，正好符合。
  const out = BANNER + '\n' + indent(body) + `
    exports.apply = __lens.apply
    exports.inject = __lens.inject
` + FOOTER

  await writeFile(join(OUT, 'client.js'), out, 'utf8')
  return out.length
}

/** 产物缩进到样板里面，纯粹为了可读性。 */
function indent(text) {
  return text.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n')
}

/** Host 半边原样拷 —— 不打包，Node 自己解析 ESM。 */
async function copyHost() {
  for (const entry of ['index.js', 'store.js', 'client-api.js', 'render', 'tools']) {
    await cp(join(SRC, entry), join(OUT, entry), { recursive: true })
  }
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await copyHost()
const size = await buildClient()
console.log(`lib/client.js  ${(size / 1024).toFixed(1)} KB`)
console.log('lib/  (host 半边原样拷贝)')
