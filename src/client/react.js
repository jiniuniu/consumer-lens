/**
 * React 入口 —— 别处不要再 import 'react'。
 *
 * `el` 就是 createElement 的简写（这个面板不用 JSX，所以没有编译步骤，
 * 源码即产物形状）。hooks 从这里再导出，是为了让「谁用了 hooks」一眼看得出 ——
 * 用了 hooks 的文件才是组件，其余都是纯函数或查表。
 *
 * react 本身是 external（由宿主提供，见 build.js）—— 打进 bundle 会让页面上
 * 出现第二个 React 实例，症状是 hooks 报 Invalid hook call。
 */
import React from 'react'

export const el = React.createElement
export const { useState, useEffect, useCallback, useRef, Fragment } = React
export default React

