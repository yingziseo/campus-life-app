# 05 · API 接口清单

> 路由定义：[`server/src/routes.php`](../server/src/routes.php) · 约定见 [03-技术架构 §4](03-技术架构.md)
> 权限：公开 = 无需登录；登录 = 任意已登录用户；商家/经理 = 指定角色。请求金额单位元，响应金额单位分。

## 账号 & 学校

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/auth/login | 公开 | `{phone, code}` 验证码登录（演示码 1234），新号自动注册为学生 |
| POST | /api/auth/demo | 公开(dev) | `{role: student/merchant/manager}` 演示账号一键登录 |
| GET | /api/auth/me | 登录 | 当前用户、学校、商家信息、邀请码 |
| POST | /api/auth/school | 登录 | `{school_id}` 切换学校（仅 active） |
| POST | /api/auth/profile | 登录 | `{nickname}` |
| POST | /api/auth/logout | 登录 | |
| GET | /api/schools | 公开 | `?keyword=` 已开通 + 筹备中学校 |
| POST | /api/schools/apply | 公开 | `{name, city, contact}` 申请开通学校 |
| GET | /api/schools/{id}/config | 公开 | 送餐时间点、取餐点 |
| GET | /api/home | 登录 | 首页聚合：banner、统计、热门团购、热门树洞 |

## 板块一：校园基础业务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/errands | `?type=errand/express&status=open` |
| GET | /api/errands/mine | 我发布的 + 我接的 |
| POST | /api/errands | `{type, title, description, pickup_addr, deliver_addr, reward, express_station, express_code, size}` |
| GET | /api/errands/{id} | 详情（取件码仅双方可见） |
| POST | /api/errands/{id}/{action} | action = accept / deliver / complete / cancel |
| GET | /api/market | `?category=&keyword=&page=` |
| GET | /api/market/mine | |
| POST | /api/market | `{title, description, category, item_condition, price, original_price, contact}` |
| GET | /api/market/{id} | 详情（浏览量 +1） |
| POST | /api/market/{id}/status | `{status: on_sale/reserved/sold/off}` |
| GET | /api/treehole | `?tag=` 含 liked 标记 |
| POST | /api/treehole | `{content, tag}` |
| POST | /api/treehole/{id}/like | 点赞/取消 |
| GET | /api/treehole/{id}/comments | 帖子 + 评论 |
| POST | /api/treehole/{id}/comments | `{content}` |

## 板块二：本地生活（学生）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/local/merchants | `?category=food/netcafe/billiards/homestay/ktv/takeout&keyword=` 含最低价、最高省多少 |
| GET | /api/local/merchants/{id} | 商家 + 在售商品（不含结算价） |
| GET | /api/local/deals/{id} | 商品详情；外卖含送餐时间点/取餐点/配送费 |
| POST | /api/orders | `{deal_id, quantity, delivery_slot, delivery_point, contact_phone, remark}` |
| GET | /api/orders | 我的订单 + `total_saved` 累计已省 |
| GET | /api/orders/{id} | 详情含券码 |
| POST | /api/orders/{id}/pay | 模拟支付（团购生成券码） |
| POST | /api/orders/{id}/cancel | 未支付取消 / 已支付未核销退款 |

## 商家端（角色 merchant）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/merchant/apply | 登录即可：`{name, category, address, phone, intro, distance_m, takeout_enabled, invite_code}` |
| POST | /api/merchant/quote | 登录即可：定价试算 `{pricing_mode, competitor_price, merchant_settle, voucher_face, voucher_cost, sale_price}` |
| GET/POST | /api/merchant/profile | 店铺信息 / 修改（intro, phone, takeout_enabled） |
| GET | /api/merchant/dashboard | 今日订单/收入、累计收入、待核销券、外卖按时间点汇总 |
| GET | /api/merchant/deals | 全部商品 |
| POST | /api/merchant/deals | 新建商品（`type` + 定价字段 + `title, description, stock`） |
| POST | /api/merchant/deals/{id} | 修改商品 |
| POST | /api/merchant/deals/{id}/toggle | 上/下架 |
| GET | /api/merchant/orders | `?type=&status=` |
| POST | /api/merchant/verify | `{code}` 核销券码 |
| POST | /api/merchant/orders/{id}/advance | 外卖：已支付 → 配送中 → 已送达 |

## 客户经理端（角色 manager）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/manager/dashboard | 邀请码、商家数（按状态）、佣金（今日/本月/累计）、带来的订单数与 GMV |
| GET | /api/manager/merchants | 绑定商家列表 + 每家订单数与佣金 |
| POST | /api/manager/merchants/{id}/{action} | action = approve / reject |
| GET | /api/manager/commissions | 佣金流水 |

## AI 问答（预留）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/ai/ask | 公开：`{question}` → `{answer, source: faq/ai/none, related[], ai_enabled}` |
| GET | /api/ai/hot | 公开：热门问题 |

## 开发辅助

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/dev/reset | dev 环境：重置全部演示数据 |
