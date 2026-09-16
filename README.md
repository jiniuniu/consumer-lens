# Consumer Lens

面向跨境卖家的消费者洞察 —— 一个 [dsh](https://github.com/deepseek-ai/deepseek-harness) 插件。

去 Reddit 和 Instagram 挖买家在说什么：买了之后在骂什么、买之前顾虑什么、
有什么东西想买但买不到。

**数据只存在你自己的机器上。**

---

## 安装

前置：Node ≥ 20、[dsh](https://github.com/deepseek-ai/deepseek-harness)。

```bash
npm i -g @deepseek-ai/dsh                                  # 如果还没有

dsh plugin --profile lens add github:jiniuniu/consumer-lens
```

然后编辑 `~/.dsh/profiles/lens/package.json`，在 `bundles` 里补一行
`@deepseek-ai/dsh-web-app`（面板要靠它，`dsh plugin add` 不会自动加）：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@consumer-lens/lens"
]
```

> 只改这一行就行，**不要去 `npm i` 装它** —— 它随全局 dsh 一起发，
> profile 里装反而会撞上 npm 上那个坏掉的旧版（依赖一个已改名、
> registry 上不存在的包）。

```bash
dsh --profile lens -- --port 5599
```

`--profile lens` 是隔离单位 —— 你原有的 dsh 环境一行不动。

浏览器打开 dsh 打印的地址，右栏 **Consumer Lens** → 账户那一格带**橙色角标**
的就是登录入口。手机号收验证码，新号自动注册送 20 积分。

---

## 用

在对话框里：

```
/cl-reddit-pain 便携挂烫机
```

跑完在右栏面板里看报告。

| Skill | 回答什么 |
|---|---|
| `/cl-reddit-audience` | 这个爱好/人群该去哪些社区找 |
| `/cl-reddit-signal` | 有人明确想要、但买不到的东西 |
| `/cl-reddit-pain` | 这个品类的买家在骂什么 |
| `/cl-ig-pain` | 刷到还没买的人在顾虑什么 |

---

## 更新 / 卸载

```bash
dsh plugin --profile lens update @consumer-lens/lens    # 更新后要重启 dsh
rm -rf ~/.dsh/profiles/lens                             # 卸载
rm -rf ~/.dsh/consumer-lens                             # 数据（想留就别删）
```

---

## License

MIT
