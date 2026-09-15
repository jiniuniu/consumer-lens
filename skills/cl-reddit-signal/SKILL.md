---
name: cl-reddit-signal
description: 给一批 subreddit，翻它们最近的高评论帖，找出「有人明确想要一个买不到的东西」这类选品信号，拉评论看细节，聚类后给出选品建议。承接 /cl-reddit-audience 的版块名单，也可以直接给版块名跑。触发词：/cl-reddit-signal、这些社区在求什么、挖选品信号、看看最近有什么需求、选品信号。
---

# Reddit 选品信号

输入一批 subreddit，输出**这些社区最近在求什么买不到的东西**。

⚠️ **这是「未知产品，找需求」，不是「已知产品，找缺陷」。**

```
cl-reddit-signal（你在这）  不搜产品词，整版块刷最近的帖   → 发现需求
cl-reddit-pain              搜具体产品词，看买家骂什么     → 验证缺陷
```

两者用的工具一样，但**检索策略相反**：这里不该带任何产品关键词——
带了就只能找到你已经想到的东西，而这个模块的价值正是找到你没想到的。

## 输入

```
/cl-reddit-signal <slug> <run_id> <版块1> <版块2> …
```

- `<slug>` —— 上一步 `/cl-reddit-audience` 的人群 slug，落盘时原样用
- `<run_id>` —— 上一步那次运行的 id（形如 `aud_20260914_a3f2`），落盘时填进 `from_run`

面板上的「挖选品信号」按钮就是这么打进来的，两个都带着。

用户直接给版块名（没有 slug / run_id）也能跑 —— 那时你自己生成一个人群 slug，
`from_run` 留空。

## 工具

| 工具 | 干什么 | 花几次额度 |
|---|---|---|
| `cl_reddit_search` | 整版块刷帖 | 词×版块×页 |
| `cl_reddit_comments` | 拉帖子评论 | 每帖 1 |
| `cl_save` | 结果落到本机 | 0 |

---

## 1. 刷帖：三个参数决定成败

```
cl_reddit_search {
  queries: [""],
  subreddits: ["BuyItForLife"],
  sort: "COMMENTS",
  time_range: "week",
  pages: 2
}
```

### ① `sort` 必须是 `COMMENTS`

**不是 `TOP`。** 实测同样的调用次数，信号密度差 2~10 倍：

```
TOP       奖励好看的老物件照片、感人故事 —— 点赞高，选品价值为零
COMMENTS  奖励吵起来的帖 —— 求助和品牌争议天然评论多
```

时间范围越长，这个差距越夸张。**这一条错了，后面全白跑。**

### ② `time_range` 按版块体量定，不是一律 week

小版块一周可能只有三五个帖，全捞上来也聚不出东西：

| 订阅数 | time_range |
|---|---|
| > 100 万 | `week` |
| 1 万 ~ 100 万 | `month` |
| < 1 万 | `year` |

**一批版块体量不同就分开调用**，不要用同一个 time_range 一把梭。

### ③ `queries` 留空或用极泛的词

这个模块**不搜产品词**。整版块按 COMMENTS 刷就是要看「最近什么最吵」。

如果空 query 召回不理想，用版块里的**求助句式**而不是品类词：

```
✅ looking for / recommendations / anyone know / alternative to / where to buy
❌ water bottle / cast iron pan          ← 这是 cl-reddit-pain 的活
```

## 2. 挑有选品信号的帖 —— 这一步是模型的活

刷回来的帖子大部分没有选品价值。**逐条读标题和正文摘要**，挑出那些指向
「有人想要一个买不到的东西」的。

### 先看有没有 flair 体系

```
有强制 flair（如 r/BuyItForLife）  → [Request] / [Request] Answered! / Review
                                     / Currently sold 优先，Vintage 直接跳过
没有或很稀疏（大多数版块）         → 只能读标题，别指望 flair
```

⚠️ **flair 靠谱的版块是少数。** r/BuyItForLife 的 flair 是版主强制的才好用，
大多数版块的 flair 可选、稀疏、命名随意。**看到 flair 稀疏就当它不存在。**

### 判断标准只有一条

> **读完能不能说出一个可以去 1688 找货的具体品类词？**

```
✅ "求一个能装进登机箱的挂烫机，试了三个都漏水"      → 具体品类 + 明确缺陷
✅ "有没有不用电的宠物饮水机？停电那次差点出事"      → 具体品类 + 使用场景
⚠️ "刚买房，求推荐任何 BIFL 产品"                   → 泛化求助，说不出品类
❌ "用亡父遗款买个纪念物"                            → 情感型，评论最多但没法选品
❌ "我爷爷 1950 年的计算器还能用"                    → 怀旧展示
```

⚠️ **情感型和泛化求助往往评论最多**，按 COMMENTS 排会冲到最前面。
**不要因为它评论多就选它。**

## 3. 拉评论 —— 答案在评论里

求助帖的价值一半在评论：**有人已经推荐了现成品牌 = 这个需求被满足了**，
**没人答得上来 = 空白**。

```
cl_reddit_comments { post_ids: ["t3_xxx", …] }
```

挑 10~20 条最有信号的帖。⚠️ **不要全拉**，每帖 1 次额度。

⚠️ **评论只能当原料读，不能拿来统计品类词。** 实测「买床垫该花多少钱」那帖，
前几条热评全在聊电脑椅（一条「别省鞋/轮胎/床垫的钱」的金句带偏了整个楼）。
**品类判断以标题和正文为准。**

## 4. 聚类 + 判断

把读到的东西聚成信号。**聚类没有脚本，是你读完之后的判断。**

一条合格的信号要满足：

1. **能说出品类词** —— 说不出就不是信号
2. **有需求证据** —— 至少一条原帖引文，最好跨帖出现
3. **说清楚现状** —— 现在有没有货？推荐的是什么牌子？为什么不满意？

每条信号给一个判断：

```
空白    没人答得上来，或答案全是「我也在找」          → 机会最大
不满    有现成品牌但评论在骂它                        → 改良机会
已满足  评论里有明确品牌且大家认可                    → 记下来当竞品，不是机会
```

❌ **不要为了凑数编信号。** 三条扎实的比八条注水的有用。

## 5. 落盘

```
cl_save {
  kind: "cl-reddit-signal",
  slug: "<人群 slug>",
  from_run: "<上一步的 run_id>",
  data: { ... }
}
```

`slug` 用输入里那个人群 slug（和 `/cl-reddit-audience` 同一条线索）。

`from_run` 填上一步 `/cl-reddit-audience` 落盘时回显的 `run_id` ——
**面板靠它知道这批信号是从哪次人群研究来的**。用户直接给版块名跑的（没有上一步）
就不填。

⚠️ **slug 不是文件名，重跑不会覆盖** —— 同一个人群隔两周再跑一次是有意义的
（社区在求什么会变），两次都会留着，面板聚在一起看变化。

**落盘后把 `run_id` 告诉用户**：接着挖某个品的痛点时，
`/cl-reddit-pain` 那步要把它填进 `from_run`，才能串成
「人群 → 信号 → 这个品的痛点」一条线。

### data 的形状

```json
{
  "audience": "耐用品买家",
  "slug": "bifl-watchers",
  "generated_at": "2026-09-14",
  "summary": "一句话：这批社区最近最集中的需求是什么",
  "meta": {
    "subreddits": ["r/BuyItForLife", "r/onebag"],
    "time_range": "week",
    "posts_scanned": 70,
    "posts_picked": 14
  },
  "signals": [
    {
      "title": "能装进登机箱的挂烫机",
      "category": "便携挂烫机",
      "status": "空白",
      "description": "机制说清楚：谁在什么场景下要这个、现在为什么买不到",
      "evidence": [
        {
          "text": "原文引用，保留英文原文",
          "post_title": "帖子标题",
          "post_url": "https://reddit.com/r/xxx/comments/yyy",
          "subreddit": "r/onebag",
          "comments": 91
        }
      ],
      "existing": "评论里提到的现成品牌，没有就写 null"
    }
  ],
  "picks": [
    { "title": "建议做什么", "why": "对应哪条信号、为什么可行" }
  ]
}
```

**必填**：`audience`、`signals[]`（每条要有 `title`、`category`、非空 `evidence[]`）。

`category` 是**能去 1688 搜的品类词**——填不出来说明这条不该算信号，删掉。

---

## 一次完整的跑法

```
① cl_reddit_search   空词，大版块 week / 中版块 month，sort=COMMENTS，pages=2
② cl_reddit_search   小版块单独一轮，time_range=year
③ 逐条读标题，挑出能说出品类词的
④ cl_reddit_comments 挑 10~20 条          → 看有没有人已经答上来
⑤ 聚类 + 判断空白/不满/已满足
⑥ cl_save
```

每个版块大约 8~10 次额度，三个版块 30 次左右。跑之前跟用户说一声预算。
