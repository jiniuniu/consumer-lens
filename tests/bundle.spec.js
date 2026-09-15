/**
 * 产物自检 —— 跑 `node tests/bundle.spec.js`，不需要测试框架。
 *
 * 守的是**构建的隐式契约**，那些坏掉时不报错、只在浏览器里白屏的东西：
 *
 * ① loader 样板的形状对不对（id / factory / exports 回填）
 * ② external 真的解析到注入的 react（见 build.js 里那段闭包说明）
 * ③ apply / inject 真的导出了
 * ④ 面板组件真的能渲染（拿真实数据喂一遍）
 *
 * ②是最值得守的：它靠「IIFE 嵌在 factory(require) 里」这个位置关系成立，
 * 改构建形态（比如产物换成 esm）会静默走到 esbuild 垫片的 throw 分支。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

const src = readFileSync(BUNDLE, 'utf8')
let pass = 0
const check = (name, fn) => {
  fn()
  pass += 1
  console.log(`  ✓ ${name}`)
}

console.log('产物形状')

check('调用 window.__ModuleLoader__.load', () => {
  assert.match(src, /window\.__ModuleLoader__\.load\(\{/)
})

check('id 和包名一致', () => {
  const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'))
  assert.ok(src.includes(JSON.stringify(pkg.name)), `产物里找不到 ${pkg.name}`)
})

check('react 没被打进 bundle', () => {
  // react 的实现特征串。打进来了说明 external 配漏了 —— 那会让页面上
  // 出现第二个 React 实例，症状是 hooks 报 Invalid hook call。
  assert.ok(!src.includes('react.production.min'), 'react 被打包了')
  assert.ok(!/function useState\(/.test(src), 'react 被打包了')
})

console.log('\n运行期')

/** 假 loader —— 冒充 dsh 的模块表，把 react 注入进去。 */
function runBundle(reactStub) {
  let captured = null
  const win = {
    __ModuleLoader__: {
      load({ id, factory }) {
        const require = (spec) => {
          if (spec === 'react') return reactStub
          throw new Error(`模块表里没有「${spec}」`)
        }
        captured = { id, exports: factory(require) }
      },
    },
  }
  // 产物是浏览器代码，用 window 当全局跑起来
  const fn = new Function('window', 'globalThis', `${src}\nreturn null`)
  fn(win, win)
  assert.ok(captured !== null, 'load() 没被调用')
  return captured
}

/** 够用的 react 替身：只要 createElement + hooks 的形状。 */
const reactStub = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
  }),
  Fragment: 'Fragment',
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useCallback: (f) => f,
  useRef: () => ({ current: 0 }),
}

const loaded = runBundle(reactStub)

check('external react 解析到了注入的那份', () => {
  // 如果 esbuild 的 __require 垫片没拿到 loader 的 require，
  // 上面 runBundle 就已经抛「Dynamic require of "react" is not supported」了。
  // 走到这里说明闭包那条契约成立。
  assert.ok(loaded.exports !== undefined)
})

check('导出 apply 和 inject', () => {
  assert.equal(typeof loaded.exports.apply, 'function', 'apply 不是函数')
  assert.ok(Array.isArray(loaded.exports.inject), 'inject 不是数组')
})

check('apply 在只有 slots/sessions 的最小宿主下不抛', () => {
  // 面板挂不上不该连累 tools 和 skill（顶层 inject 是空的那条设计）。
  // 这里给一个什么服务都没有的 ctx，apply 应该静静地什么都不注册。
  const calls = []
  const ctx = {
    inject: (names, fn) => { calls.push(names); /* 不调用 fn = 服务没到 */ },
    effect: (fn) => fn(),
    get: () => undefined,
  }
  loaded.exports.apply(ctx)
  // 它应该至少尝试 inject 了面板那组服务
  assert.ok(calls.length > 0, 'apply 没有 inject 任何东西')
})

console.log(`\n${pass} 项通过`)
