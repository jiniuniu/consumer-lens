---
name: cl-reddit-pain
description: 给一个产品或品类，在 Reddit 上循环搜索买家的真实抱怨：先全站搜看落在哪些版块，再定向到那些版块换词深挖，拉评论看细节，最后聚成痛点并给出机会判断。触发词：/cl-reddit-pain、这个品用户在骂什么、Reddit上怎么说、买家痛点、痛点调研。
---

# Reddit 买家痛点

输入一个产品/品类，输出**这个品的用户在真实抱怨什么**，每条痛点挂着原帖引文。
结果用 `cl_save` 存到本机。

⚠️ **这不是一次搜索，是循环逼近。** 第一轮的检索词几乎一定不够好 ——
你猜的是品类术语，用户说的是自己的处境。看命中统计，换词，再来。
**跑三到五轮是正常的**，一轮就收工的报告基本没价值。

⚠️ **要找的是「买了之后的失望」，不是「买之前的顾虑」。**

```
失望（要的）  it leaked on day 2 / the scent died in a week
顾虑（不要）  is it actually waterproof? / worth the price?
```

两者长得像，但只有前者指向产品该改什么。顾虑是详情页的事。

## 工具

| 工具 | 干什么 |
|---|---|
| `cl_reddit_search` | 一轮循环搜索（多词 × 多版块） |
| `cl_reddit_comments` | 拉帖子评论 |
| `cl_save` | 结果落到本机 |

---

## 1. 第一轮：全站搜，看落在哪儿

**不要一上来就限定版块。** 你还不知道这个品的人在哪说话。

```
cl_reddit_search {
  queries: ["portable steamer leaks", "travel steamer broke", "steamer stopped working"],
  pages: 1
}
```

用**买家自己会说的话**，不要品类术语：

```
✅ steamer leaks / scent died / stopped working / waste of money
❌ garment steamer quality issues / product defect analysis
```

看输出头部的两样东西：

- **每条检索词的命中数** —— `0条` 说明这个词没人这么说，换掉
- **版块分布** —— `r/HerOneBag:5 r/travel:3` 就是下一轮要定向的地方

## 2. 第二轮起：定向版块 + 换词

拿第一轮发现的版块，配新的检索词：

```
cl_reddit_search {
  queries: ["steamer", "wrinkles", "packing iron"],
  subreddits: ["HerOneBag", "onebagging", "travel"],
  pages: 2
}
```

⚠️ **传 N 个版块 = N 倍调用次数。** 三个词 × 三个版块 × 两页 = 18 次。
先用 `pages: 1` 试水，确认命中率再翻页。

**什么时候停：** 新一轮的帖子大部分已经见过（`新0` 或个位数），
或者连着两轮都聚不出新痛点。

## 3. 拉评论 —— 别跳过

**标题只说「坏了」，评论才说「怎么坏的」。**

挑评论数多、和主题最相关的 10~20 条：

```
cl_reddit_comments { post_ids: ["t3_1v0qqqb", "t3_xxx", ...] }
```

id 就是搜索输出里每行末尾 `<>` 中那串，已带 `t3_` 前缀，直接传。

⚠️ **不要把搜到的帖子全拉一遍** —— 每帖都要消耗，而且大部分帖子的评论区
跟痛点无关。先读标题和正文摘要，挑那些明显在讲使用问题的。

## 4. 聚类

把读到的东西聚成痛点。**聚类没有脚本，是你读完之后的判断。**

一条合格的痛点要满足三件事：

1. **跨帖出现** —— 一个人抱怨是个例，五个人说同一件事才是痛点
2. **能说清机制** —— 不是「质量差」，是「水垢堵塞，因为说明书没写要用蒸馏水」
3. **挂得住原文** —— 每条痛点至少一条真实引文，带原帖链接

❌ **不要为了凑数编痛点。** 三条扎实的比八条注水的有用。
真只找到两条就写两条，在 summary 里说清楚。

❌ **不要把「产品没坏但用户不会用」算成产品缺陷** —— 那是说明书或详情页的事，
但值得单独指出来，因为对卖家同样可行动。

## 5. 机会判断

每条痛点问一句：**卖家能做什么？**

```
高可行  详情页加一句话就能答（标注登机箱尺寸、写明要用蒸馏水）
中      改结构/配件，BOM 增加可控（防漏设计、随附滤芯）
低      要改模具或整个品类的物理限制
```

只写你有证据支撑的。没把握的宁可不写。

## 6. 落盘

```
cl_save {
  kind: "cl-reddit-pain",
  slug: "<产品 slug>",
  data: { ... }
}
```

**slug 由你生成** —— 小写英文 + 短横线，看得出是什么产品：
`portable-steamer`、`cat-water-fountain`。

⚠️ **slug 只是给人读的标签，不构成任何关联。** 它不是文件名，重跑不会覆盖；
但也**不要指望同一个 slug 能把多次运行聚成一组** —— 面板不按 slug 分组。
研究之间的关系由下面那个 `from_run` 表达（代码透传的 run_id，不是你编的），
所以 slug 换个写法不会出错，只是列表上那行字不一样。

**如果这个品是从某次选品信号里挖出来的**，把那次的 `run_id` 填进 `from_run`：

```
cl_save {
  kind: "cl-reddit-pain",
  slug: "portable-fishfinder",
  from_run: "sig_20260914_c81e",   ← /cl-reddit-signal 那一步回显的
  data: { ... }
}
```

面板靠它把「这个品是从哪个人群挖出来的」串起来。独立跑的不填。

⚠️ **调用参数里可能已经带了它。** 用户在面板的信号报告上点「挖这个品的痛点」，
打进对话框的是：

```
/cl-reddit-pain 耐高温硅胶戒指 sig_20260914_c81e
                └─ 品类词 ─┘  └─ 这个要原样填进 from_run ─┘
```

第二个参数形如 `sig_YYYYMMDD_xxxx` 就是上一步的 run_id，**原样透传**，
不要改写、不要当成检索词的一部分。用户手打 `/cl-reddit-pain <产品>` 时
没有这个参数，那就是独立跑的，`from_run` 留空。

### data 的形状

```json
{
  "product": "便携挂烫机",
  "slug": "portable-steamer",
  "generated_at": "2026-09-13",
  "summary": "一句话：这个品最核心的机会是什么",
  "demand_validation": "2-3 句：讨论量、集中在哪些版块、买家意图强不强",
  "meta": {
    "subreddits": ["r/HerOneBag", "r/onebagging"],
    "search_terms": ["steamer leaks", "travel steamer broke"],
    "posts_scanned": 310,
    "posts_collected": 42
  },
  "pain_points": [
    {
      "title": "水垢堵塞，用几次就不出蒸汽",
      "description": "机制说清楚：为什么会这样、什么情况下发生",
      "evidence": [
        {
          "text": "原文引用，保留英文原文",
          "post_title": "帖子标题",
          "post_url": "https://reddit.com/r/xxx/comments/yyy",
          "subreddit": "r/HerOneBag",
          "score": 312
        }
      ]
    }
  ],
  "opportunities": [
    {
      "title": "标注「登机箱友好」尺寸",
      "feasibility": "high",
      "note": "为什么可行、直接答的是哪条痛点"
    }
  ]
}
```

**必填**：`product`、`pain_points[]`（每条要有 `title` 和非空 `evidence[]`）。
其余字段面板会用但不强制 —— 缺了只是少显示一块。

`meta` 里的 `subreddits` 和 `search_terms` **要如实填你实际跑过的** ——
用户靠这个判断这份报告的覆盖面，也靠它决定要不要换个角度重跑。

---

## 一次完整的跑法

```
① cl_reddit_search  3个词，全站，pages=1        → 看版块分布
② cl_reddit_search  3个新词，定向3个版块，pages=1 → 看命中率
③ cl_reddit_search  补词，pages=2               → 直到新帖变少
④ cl_reddit_comments 挑15条帖子                  → 读细节
⑤ 聚类 + 判断机会
⑥ cl_save
```

一轮完整流程大约消耗 30~50 积分。
