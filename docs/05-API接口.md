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
| GET | /api/home | 登录 | 首页聚合：banner、今日福利券、推荐商品（推荐位置顶 + 销量）、热门树洞 |
| GET | /api/config | 公开 | 前端配置：比价文案、抽成费率、配送费、推荐位价格、福利群 |
| GET | /api/wallet | 登录 | 学生钱包：跑腿赏金、二手货款、配送提成 |

## 板块一：校园基础业务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/errands | `?type=errand/express&status=open` |
| GET | /api/errands/mine | 我发布的 + 我接的 |
| POST | /api/errands | `{type, title, description, pickup_addr, deliver_addr, reward, express_station, express_code, size}` |
| GET | /api/errands/{id} | 详情（取件码仅双方可见） |
| POST | /api/errands/{id}/{action} | action = accept / deliver（须 `proof_image` 送达照片）/ complete（打款并抽服务费）/ cancel |
| GET | /api/market | `?category=&keyword=&page=` |
| GET | /api/market/mine | |
| POST | /api/market | `{title, description, category, item_condition, price, original_price, contact}` |
| GET | /api/market/{id} | 详情（浏览量 +1） |
| POST | /api/market/{id}/status | `{status: on_sale/reserved/sold/off}` |
| POST | /api/market/{id}/buy | 担保交易下单（模拟支付托管，宝贝锁定） |
| GET | /api/market-orders | `?role=buy/sell` 我买到的 / 我卖出的 |
| POST | /api/market-orders/{id}/{action} | confirm（买家确认收货，打款给卖家扣服务费）/ cancel（交易前取消退款） |
| GET | /api/treehole | `?tag=` 含 liked 标记 |
| POST | /api/treehole | `{content, tag}` |
| POST | /api/treehole/{id}/like | 点赞/取消 |
| GET | /api/treehole/{id}/comments | 帖子 + 评论 |
| POST | /api/treehole/{id}/comments | `{content}` |
| POST | /api/treehole/{id}/report | `{reason}` 举报，累计 3 次自动隐藏 |
| POST | /api/upload | multipart `file` → `{url}`（JPG/PNG/WEBP ≤3MB） |

## 板块二：本地生活（学生）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/local/merchants | `?category=food/netcafe/billiards/homestay/ktv/takeout&keyword=` 含最低价、最高省多少、`is_ad`（推荐位在前） |
| GET | /api/local/recommend | `?category=&limit=` 推荐商品：行业推荐位置顶（`is_ad`），其余按销量 |
| GET | /api/coupons/today | 今日可抢的券（剩余、是否已领、开抢时间）+ 福利群信息 |
| POST | /api/coupons/{id}/claim | 抢券（每人每券每天 1 张，每日限量） |
| GET | /api/coupons/mine | `?status=available/used/expired` |
| GET | /api/coupons/usable | `?deal_id=&quantity=` 下单可用券 |
| GET | /api/local/merchants/{id} | 商家 + 在售商品（不含结算价） |
| GET | /api/local/deals/{id} | 商品详情；外卖含送餐时间点/取餐点/配送费 |
| POST | /api/orders | `{deal_id, quantity, delivery_slot, delivery_point, contact_phone, remark, coupon_id}` |
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
| POST | /api/merchant/orders/{id}/advance | 外卖出餐：paid → ready |
| GET | /api/merchant/promotions | 我的推广 + 本店行业推荐位占用情况 + 可推广商品 |
| POST | /api/merchant/promotions | `{deal_id, position, days, start_date}` 购买推荐位（模拟支付，待审核） |

## 客户经理端（角色 manager）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/manager/dashboard | 邀请码、商家数（按状态）、佣金（今日/本月/累计）、带来的订单数与 GMV |
| GET | /api/manager/merchants | 绑定商家列表 + 每家订单数与佣金 |
| POST | /api/manager/merchants/{id}/{action} | action = approve / reject |
| GET | /api/manager/commissions | 佣金流水 |

## 骑手端（学生兼职，rider_status = approved）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/rider/apply | 登录学生申请加入外卖团队 |
| GET | /api/rider/dashboard | 今日/累计收入、配送中、批次列表（每批：备餐中/待取餐/我配送中/已送达） |
| GET | /api/rider/batch | `?date=&slot=` 取餐清单（按商家）+ 我的送达清单（按取餐点） |
| POST | /api/rider/pickup | `{order_ids: []}` 批量取餐（ready → delivering） |
| POST | /api/rider/deliver | `{order_ids: [], proof_image}` 批量送达（须拍照，→ completed，写分账） |
| GET | /api/rider/earnings | 提成流水 |

## 平台管理后台（角色 admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/dashboard | `?school_id=` KPI、近 7 天趋势、各校经营、待办 |
| GET / POST | /api/admin/schools, /api/admin/schools/{id} | 学校列表 / 新增 / 编辑（状态、试点、送餐时间点、取餐点） |
| GET | /api/admin/merchants | `?status=&school_id=&keyword=` |
| POST | /api/admin/merchants/{id}/{action} | approve / reject / suspend / manager(`{manager_id}` 改推广归属) |
| GET | /api/admin/deals | 比价抽查：含结算价、毛利、到手比例 |
| POST | /api/admin/deals/{id}/toggle | 强制下架 / 恢复 |
| GET | /api/admin/orders | 含分账快照 |
| GET | /api/admin/ledger | 流水汇总 + 明细 `?party_type=` |
| GET | /api/admin/users | `?role=&rider_status=&status=&keyword=` |
| POST | /api/admin/users/{id} | `{role}` 设为客户经理（自动邀请码）/ `{rider_status}` / `{status: banned}` |
| GET / POST | /api/admin/settings | 分成比例、最少便宜、配送费、骑手提成、截单、免审、跑腿 / 二手费率、推荐位价格、比价文案、福利群 |
| GET / POST | /api/admin/faqs, /api/admin/faqs/{id}, /api/admin/faqs/{id}/delete | 知识库 |
| GET | /api/admin/ai-logs | `?source=none` 未答上的提问 |
| GET | /api/admin/treehole | `?reported=1&status=` 含真实身份与举报原因 |
| POST | /api/admin/treehole/{id}/{action} | hide / restore（驳回举报） |
| GET | /api/admin/revenue | 收益分配：平台 6 项收入来源、各方累计分配、示例订单拆分、规则参数 |
| GET / POST | /api/admin/promotions | 推荐位列表 + 排期看板 / 后台直接排期 `{deal_id, position, days, start_date}` |
| POST | /api/admin/promotions/{id}/{action} | approve（广告费入账）/ reject（退款）/ end（提前下线） |
| GET / POST | /api/admin/coupons, /api/admin/coupons/{id} | 优惠券模板列表（领取 / 使用 / 补贴统计）/ 新建编辑；只传 id 不传字段为上下线切换 |

## 学校百事通（AI 问答预留）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/ai/ask | 公开：`{question}` → `{answer, source: faq/ai/none, related[], ai_enabled}` |
| GET | /api/ai/hot | 公开：热门问题 |

## 开发辅助

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/dev/reset | dev 环境：重置全部演示数据 |
| GET | /api/dev/coupons | dev 环境：商家查看本店待核销券码（演示辅助） |
