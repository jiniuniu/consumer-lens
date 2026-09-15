---
name: cl-reddit-audience
description: 给一个人群（一个爱好，或一个共同特征），在 Reddit 上找到该去哪些社区 —— 搜版块本身（不是搜帖子），按体量分层挑出不超过 5 个，每个给出订阅数、简介和推荐理由。结果落盘后面板上可以多选，选完直接接 /cl-reddit-signal 挖选品信号。触发词：/cl-reddit-audience、这个人群在哪些社区、该去哪个subreddit、找版块、人群定位。
---

# Reddit 人群定位

输入一个人群，输出**该去哪些社区**。这是漏斗的第一步，很便宜（一轮 2~6 次额度），
跑完之后用户在面板上勾选版块，再接 `/cl-reddit-signal` 去那些版块挖选品信号。

## 0. 先确认输入是人群，不是品类

整条漏斗是 **人群 → 他们缺什么 → 该做什么品**。起点必须是人群，
**收品类词会让第二步必然塌掉**，所以这一步要先拦。

```
人群 = 一个爱好，或一个共同特征

✅ 爱好   攀岩 / 高尔夫 / 露营 / 手工皮具 / 钓鱼 / 养多肉
✅ 特征   ADHD / 失眠 / 孕期 / 倒班 / 膝伤 / 租房党
❌ 品类   ebike / 挂烫机 / 硅胶戒指
```

判据只有一条：**这群人先聚在一起，才聊到东西。**
r/climbing 存在是因为攀岩，不是因为要买攀岩装备 —— 所以里面的需求
没有被商品目录框住，挖得出「买不到的东西」。

而 r/ebikes 是**围绕商品聚起来的**，里面的人已经在这个品类里了，
讨论的是「这个牌子续航虚标」「换个控制器」。那是痛点素材，不是选品信号。
拿品类词跑完这条漏斗，第二步挖出来的会全是「已满足」，一条「空白」都没有。

**收到品类词不要硬跑，先反问。** 花掉的额度买不回一份注定塌掉的报告 ——
这和 `cl_save` 对 `category` 的态度一样：不成立的输入宁可打回，不要硬凑。
反问时要给出路，不要只说不行：

> ebike 是品类不是人群 —— 直接搜会搜到 r/ebikes，
> 那里面全是已经在买 ebike 的人，挖不出空白需求。
>
> 换个问法：**谁会骑 ebike，而且因为某个身份有独特需求？**
> · 通勤 15km+ 的上班族　· 带娃接送的家长
> · 膝盖受过伤但想继续骑车的人　· 住没电梯的楼要扛车上楼的人
>
> 挑一个，或者说说你的产品有什么特别之处，我帮你倒推。
>
> （如果你想知道的是「现有这个品被骂什么」，那是另一条路：`/cl-reddit-pain ebike`）

最后那句很重要 —— 拿品类词来的人通常有个真问题，只是走错了门，
要把他导向 `cl-reddit-pain`，而不是把他挡在门外。

⚠️ **这是搜版块，不是搜帖子。** 和 `cl-reddit-pain` 的分工是死的：

```
cl-reddit-audience   我该去哪些社区？      输入人群 → 版块名单   ← 你在这
cl-reddit-signal     这些社区在求什么？    输入版块 → 选品信号
cl-reddit-pain       这个品被骂什么？      输入产品 → 痛点
```

## 工具

| 工具 | 干什么 | 花几次额度 |
|---|---|---|
| `cl_reddit_audience` | 搜版块（多词 × 多页） | 词×页，开 typeahead 每词再 +1 |
| `cl_save` | 结果落到本机 | 0 |

---

## 1. 换几个说法搜

一个人群往往要换几个说法才找得全 —— **品类词和人群自称的词召回的版块不一样**：

```
cl_reddit_audience {
  queries: ["lash serum", "eyelash extensions", "lashes"],
  pages: 1
}
```

```
✅ 品类词 + 人群自称 + 上位词都试     lash serum / lash tech / lashes
❌ 只用一个精确的品类词              只会回来一小撮同名版块
```

⚠️ **typeahead 只对单个词有效。** 传词组（`"lash serum"`）拿不到任何版块，
那一次额度是白花的。所以：

```
单个词（lash / buyitforlife）   → typeahead: true   能捞到品牌自建版块
词组（lash serum）             → typeahead: false  省一次额度
```

品牌自建版块（实测 r/LashLegendOfficial、r/Nulastin）是竞品情报，**版块搜索返回不了**，
只有 typeahead 能捞到。所以值得单独用单个词多打一轮。

## 2. 分层选取 —— 这一步最容易做错

看输出头部的**体量分档**。默认的错误做法是一路挑订阅数最大的，那样挑出来的
全是 r/beauty、r/Makeup 这种泛版块，搜进去全是噪声。

一份合格的名单要满足：

```
至少 2 个   中小型垂直版块（500 ~ 10万）  ← 信噪比高，痛点都在这
至多 2 个   大型泛版块（>10万）           ← 看声量、看主流怎么说
0 个        <500 的                      ← 建了没人用，搜进去没帖子
```

**<500 的一律不要。** 实测 `lash` 一次就回了 r/lashblindness(18人)、
r/LashifyLashifiends(12人) 这种空版块，占了 20 条里的一半 —— 它们简介写得挺像回事，
但根本没有帖子。

**看简介判断人群对不对得上**，别只看名字：

```
✅ r/lashtechs "A place for lash artists…"        → 从业者，问的是产品好不好用
✅ r/eyelashextensions "professionals and clients" → 混合，消费者视角也有
⚠️ r/AwfulEyelashes "For Awful Eyelashes"         → 吐槽向，能挖失败案例但不是主力
❌ r/LashifySnark "…patent troll named…"          → 品牌骂战，跟选品无关
```

## 3. 写推荐理由

每个版块一句话，说清**为什么选它、去那儿能拿到什么**。

```
✅ 8.8k 的垂直版块，技师和客户都在，讨论集中在持久度和胶水过敏 —— 挖使用痛点的主力
❌ 订阅数多，比较活跃                    ← 废话，没有信息
```

理由要**挂得住简介原文**。简介里没写的东西不要编——你现在还没进去看过帖子。

❌ **不要凑满 5 个。** 只找到 3 个合适的就写 3 个，在 summary 里说清楚。
名单里混进一个不相关的版块，下一步就会浪费掉那个版块的全部额度。

## 4. 落盘

```
cl_save {
  kind: "cl-reddit-audience",
  slug: "<人群 slug>",
  data: { ... }
}
```

**slug 由你生成** —— 小写英文 + 短横线，看得出是什么**人群**：
`saltwater-anglers`、`adhd-adults`、`cast-iron-cooks`。

人群不一定和产品挂钩 —— 「海钓爱好者」「ADHD 人群」这种跨品类的人群是常态，
**不要为了像个产品名而硬改**。

⚠️ **slug 只是给人读的标签，不构成任何关联。** 它不是文件名，重跑不会覆盖；
但也**不要指望同一个 slug 能把多次运行聚成一组** —— 面板不按 slug 分组。
研究之间的关系由 `from_run` 表达（那是代码透传上一步的 run_id，不是你编的），
所以 slug 这次写 `silicone-ring`、下次写 `silicone-wedding-band` 不会出错，
只是列表上那行字不一样。

### data 的形状

```json
{
  "audience": "假睫毛/睫毛增长液的使用者",
  "slug": "lash-serum-buyers",
  "generated_at": "2026-09-14",
  "summary": "一句话：这群人主要聚在哪、讨论什么",
  "meta": {
    "search_terms": ["lash serum", "eyelash extensions", "lashes"],
    "communities_scanned": 36,
    "communities_picked": 4
  },
  "communities": [
    {
      "name": "r/lashextensions",
      "slug": "lashextensions",
      "subscribers": 67576,
      "tier": "中型",
      "desc": "版块简介原文（照抄，不要改写）",
      "reason": "为什么选它、去那儿能拿到什么",
      "brand_owned": false
    }
  ],
  "skipped": [
    { "name": "r/beauty", "subscribers": 1854960, "why": "泛美妆，睫毛只是其中很小一块" }
  ]
}
```

**必填**：`audience`、`communities[]`（每条要有 `name`、`slug`、`subscribers`、`reason`）。

`slug` 是**裸版块名**（不带 `r/`）—— 下一步要拿它回填 `cl_reddit_search` 的
`subreddits` 参数，**大小写敏感，必须照抄**输出里的原样。

`skipped` 不强制，但**建议写上被你排除的大版块**：用户看到「r/beauty 为什么没选」
才知道你是有判断的，而不是漏了。

## 5. 交给用户挑

落盘之后告诉用户：**面板上可以多选版块，选完提交就会接着跑 `/cl-reddit-signal`**。

不要自己替用户决定去哪几个版块深挖 —— 他比你清楚自己做的是哪个细分。
也不要在这一步直接接着跑下一个 skill，那是用户点了提交之后的事。

⚠️ 顺便提醒用户下一步的开销：**每个版块大约 8~10 次额度**（搜索 + 拉评论），
选 3 个就是 30 次左右。这一步才是花钱的地方。

---

## 一次完整的跑法

```
① cl_reddit_audience  3个词组，typeahead=false，pages=1   → 看分档
② cl_reddit_audience  1~2个单词，typeahead=true          → 捞品牌版块
③ 分层挑 ≤5 个 + 写理由
④ cl_save
⑤ 告诉用户去面板勾选
```

额度大概 4~8 次。比后面那步便宜一个量级，可以放心多跑一轮换词。
