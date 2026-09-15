/**
 * 只开一条规则：**no-undef**。
 *
 * 拆成多文件之后最容易犯、也最难发现的错就是「用了一个没 import 的名字」。
 * 实测踩过两次：
 *
 * - `AccountPage` 用了 `API` 但漏 import → 那行在组件自己的 try/catch 里，
 *   ReferenceError 被吞成 err 状态，渲染测试全绿，面板上写
 *   「读不到账户信息。API is not defined」
 * - `TreeNode` / `audience` 漏了 `Fragment` / `useEffect`
 *
 * esbuild **查不出这类问题** —— 它把未声明的名字当浏览器全局，静默放过
 * （实测：故意删掉 import，整图打包照样成功）。所以需要一个真正做作用域
 * 分析的工具，这是 eslint 唯一被引进来的理由。
 *
 * 刻意不开 style 规则（缩进、引号、分号）：那些会和现有两千行代码打架，
 * 而且和「能不能跑」无关。这里只要一条安全网。
 */
export default [
  {
    files: ['src/**/*.js', 'build.js', 'tests/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // 浏览器半边（面板）跑在页面里
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        // Host 半边和构建脚本跑在 node 里
        process: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      // 就这一条 —— 不继承 recommended，免得引一个额外的包，
      // 而且那套里的 style 规则会和现有两千行代码打架。
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
]
