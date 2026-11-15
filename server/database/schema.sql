-- 校园生活平台 · SQLite 数据结构
-- 约定：所有金额字段单位为「分」(INTEGER)，时间为 'YYYY-MM-DD HH:MM:SS' 本地时间字符串
PRAGMA foreign_keys = ON;

-- 平台配置（分成比例、配送费等），value 存 JSON 编码
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    remark     TEXT
);

-- 学校（多校入驻）
CREATE TABLE IF NOT EXISTS schools (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    short_name  TEXT,
    city        TEXT,
    status      TEXT NOT NULL DEFAULT 'applying', -- active 已开通 | preparing 筹备中 | applying 申请中
    is_pilot    INTEGER NOT NULL DEFAULT 0,
    delivery_slots TEXT NOT NULL DEFAULT '["11:30","17:30"]', -- 外卖固定送餐时间点(JSON)
    delivery_points TEXT NOT NULL DEFAULT '[]',               -- 校内取餐点(JSON)
    contact     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 用户（学生 / 商家 / 客户经理 / 管理员 共用账号体系）
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT NOT NULL UNIQUE,
    nickname    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'student', -- student | merchant | manager | admin
    school_id   INTEGER REFERENCES schools(id),
    invite_code TEXT UNIQUE,                     -- 客户经理专属邀请码
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ========== 板块一：校园基础业务 ==========

-- 跑腿 / 代取快递（type 区分）
CREATE TABLE IF NOT EXISTS errands (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id       INTEGER NOT NULL REFERENCES schools(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL,          -- errand 跑腿 | express 代取快递
    title           TEXT NOT NULL,
    description     TEXT,
    pickup_addr     TEXT,                   -- 取件/购买地点
    deliver_addr    TEXT NOT NULL,          -- 送达地点
    express_station TEXT,                   -- 快递驿站
    express_code    TEXT,                   -- 取件码（仅发布者与接单人可见）
    size            TEXT,                   -- small | medium | large
    reward          INTEGER NOT NULL,       -- 赏金(分)
    status          TEXT NOT NULL DEFAULT 'open', -- open 待接单 | accepted 已接单 | delivered 已送达 | completed 已完成 | cancelled 已取消
    runner_id       INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    accepted_at     TEXT,
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_errands_school ON errands(school_id, status, type);

-- 二手交易
CREATE TABLE IF NOT EXISTS market_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id       INTEGER NOT NULL REFERENCES schools(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL DEFAULT 'other', -- book 教材 | digital 数码 | daily 生活 | sport 运动 | other
    item_condition  TEXT NOT NULL DEFAULT '9成新',
    price           INTEGER NOT NULL,
    original_price  INTEGER,
    contact         TEXT,
    status          TEXT NOT NULL DEFAULT 'on_sale', -- on_sale | reserved | sold | off
    views           INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_market_school ON market_items(school_id, status, category);

-- 树洞（匿名展示，后台可追溯真实用户）
CREATE TABLE IF NOT EXISTS treehole_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id   INTEGER NOT NULL REFERENCES schools(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    anon_name   TEXT NOT NULL,
    content     TEXT NOT NULL,
    tag         TEXT NOT NULL DEFAULT '日常', -- 日常 | 表白 | 吐槽 | 求助 | 失物招领
    like_count  INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'normal', -- normal | hidden
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_treehole_school ON treehole_posts(school_id, status, id);

CREATE TABLE IF NOT EXISTS treehole_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL REFERENCES treehole_posts(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    anon_name   TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS treehole_likes (
    post_id     INTEGER NOT NULL REFERENCES treehole_posts(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (post_id, user_id)
);

-- ========== 板块二：周边本地生活 ==========

-- 商家（manager_id = 推广绑定的客户经理）
CREATE TABLE IF NOT EXISTS merchants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id       INTEGER NOT NULL REFERENCES schools(id),
    owner_user_id   INTEGER NOT NULL UNIQUE REFERENCES users(id),
    manager_id      INTEGER REFERENCES users(id),
    name            TEXT NOT NULL,
    category        TEXT NOT NULL, -- food 餐饮 | netcafe 网吧 | billiards 台球 | homestay 民宿 | ktv | other
    address         TEXT NOT NULL,
    phone           TEXT NOT NULL,
    intro           TEXT,
    distance_m      INTEGER,                       -- 距学校距离(米)，原型手填
    takeout_enabled INTEGER NOT NULL DEFAULT 0,    -- 是否加入校园外卖团队配送
    status          TEXT NOT NULL DEFAULT 'pending', -- pending 待审核 | approved 已通过 | rejected 已驳回
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    approved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_merchants_school ON merchants(school_id, status, category);
CREATE INDEX IF NOT EXISTS idx_merchants_manager ON merchants(manager_id);

-- 商品/套餐/代金券
-- pricing_mode:
--   voucher  代金券模式：用户实付 = 商家到手价 + 券售价；到店标价 = 商家到手价 + 券面额
--   fixed    平台定价模式：平台与商家约定到手价，平台自定售价（须低于竞品价）
CREATE TABLE IF NOT EXISTS deals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id       INTEGER NOT NULL REFERENCES merchants(id),
    type              TEXT NOT NULL,     -- groupbuy 团购套餐 | takeout 外卖菜品
    title             TEXT NOT NULL,
    description       TEXT,
    pricing_mode      TEXT NOT NULL,     -- voucher | fixed
    competitor_price  INTEGER NOT NULL,  -- 竞品平台(美团等)到手价，用于比价展示
    merchant_settle   INTEGER NOT NULL,  -- 商家到手结算价
    voucher_face      INTEGER,           -- 券面额 (voucher 模式)
    voucher_cost      INTEGER,           -- 券售价 (voucher 模式)
    list_price        INTEGER NOT NULL,  -- 到店标价/划线价
    sale_price        INTEGER NOT NULL,  -- 用户实付单价
    stock             INTEGER NOT NULL DEFAULT 999,
    sold              INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'on', -- on 上架 | off 下架
    created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_deals_merchant ON deals(merchant_id, status);

-- 订单（分账快照在下单时固化，规则变化不影响历史订单）
CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no            TEXT NOT NULL UNIQUE,
    school_id           INTEGER NOT NULL REFERENCES schools(id),
    user_id             INTEGER NOT NULL REFERENCES users(id),
    merchant_id         INTEGER NOT NULL REFERENCES merchants(id),
    deal_id             INTEGER NOT NULL REFERENCES deals(id),
    manager_id          INTEGER REFERENCES users(id),
    type                TEXT NOT NULL,      -- groupbuy | takeout
    title               TEXT NOT NULL,
    quantity            INTEGER NOT NULL,
    unit_price          INTEGER NOT NULL,
    goods_amount        INTEGER NOT NULL,   -- 商品金额 = 单价 × 数量
    delivery_fee        INTEGER NOT NULL DEFAULT 0,
    total_amount        INTEGER NOT NULL,   -- 用户实付
    competitor_amount   INTEGER NOT NULL,   -- 同等商品在竞品平台的总价（用于"已省"展示）
    merchant_amount     INTEGER NOT NULL,   -- 商家应得
    platform_gross      INTEGER NOT NULL,   -- 商品差价毛利（平台+客户经理）
    manager_commission  INTEGER NOT NULL DEFAULT 0,
    rider_commission    INTEGER NOT NULL DEFAULT 0,
    platform_net        INTEGER NOT NULL,   -- 平台净收入 = 毛利 - 经理佣金 + 配送费 - 骑手提成
    delivery_date       TEXT,
    delivery_slot       TEXT,
    delivery_point      TEXT,
    contact_phone       TEXT,
    remark              TEXT,
    status              TEXT NOT NULL DEFAULT 'pending_pay', -- pending_pay | paid | delivering | completed | cancelled | refunded
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    paid_at             TEXT,
    completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id, status);

-- 团购券码（到店核销）
CREATE TABLE IF NOT EXISTS coupons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    code        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'unused', -- unused | used | refunded
    used_at     TEXT
);

-- 资金流水（结算凭据，核销/送达时写入）
CREATE TABLE IF NOT EXISTS ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    party_type  TEXT NOT NULL,     -- merchant | manager | platform | rider
    party_id    INTEGER,           -- merchants.id / users.id；platform、rider 池为 NULL
    amount      INTEGER NOT NULL,
    kind        TEXT NOT NULL,     -- settle 商家结算 | commission 推广佣金 | margin 平台差价 | delivery 配送
    remark      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger(party_type, party_id);

-- ========== AI 问答（预留） ==========

-- 本地 FAQ 知识库：AI 接入前由它兜底自助问答，接入后作为 RAG 语料
CREATE TABLE IF NOT EXISTS faqs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id   INTEGER REFERENCES schools(id), -- NULL = 全平台通用
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    keywords    TEXT NOT NULL DEFAULT '',        -- 逗号分隔
    hits        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    school_id   INTEGER,
    question    TEXT NOT NULL,
    answer      TEXT,
    source      TEXT NOT NULL, -- faq | ai | none
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
