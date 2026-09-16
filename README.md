# Consumer Lens

面向跨境卖家的消费者洞察 —— 一个 [dsh](https://github.com/deepseek-ai/deepseek-harness) 插件。

去 Reddit 和 Instagram 挖买家在说什么：买了之后在骂什么、买之前顾虑什么、
有什么东西想买但买不到。

**数据只存在你自己的机器上。**

---

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/jiniuniu/consumer-lens/main/install.sh | bash
```

检查 Node（需要 ≥ 20）、装 dsh、装插件、配好 profile。重复跑就是更新。

装完按提示启动：

```bash
dsh --profile lens -- --port 5599
```

浏览器打开面板后，右栏 **Consumer Lens** → 账户那一格带**橙色角标**的就是
登录入口。手机号收验证码，新号自动注册送 20 积分。

<details>
<summary>手动装（不想跑脚本）</summary>

```bash
npm i -g @deepseek-ai/dsh                                  # 如果还没有
dsh plugin --profile lens add github:jiniuniu/consumer-lens
```

然后编辑 `~/.dsh/profiles/lens/package.json`，在 `bundles` 里补一行
`@deepseek-ai/dsh-web-app`：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@consumer-lens/lens"
]
```

`dsh plugin add` 不会自动加框架包，缺了它启动**没有任何报错**、面板也起不来。
只改这一行就行，**不要去装它** —— 它随全局 dsh 一起发，profile 里装反而会
撞上 npm 上那个坏掉的旧版。

</details>

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
