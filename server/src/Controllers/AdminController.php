<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, HttpException, Request};
use App\Services\{CouponService, Ledger, PricingService, PromotionService, Settings};

/** 平台管理后台（角色 admin） */
final class AdminController
{
    private const PAID = "('paid','ready','delivering','completed')";

    /* ---------- 数据看板 ---------- */
    public function dashboard(Request $req): array
    {
        $sid = $req->int('school_id');
        $w = $sid ? ' AND o.school_id = ' . $sid : '';
        $lw = $sid ? ' AND l.school_id = ' . $sid : '';
        $ledger = static fn(string $party) => (int) Db::value(
            "SELECT COALESCE(SUM(l.amount),0) FROM ledger l WHERE l.party_type = ?$lw", [$party]
        );
        $income = [];
        foreach (Db::all("SELECT l.kind, SUM(l.amount) AS amount FROM ledger l WHERE l.party_type = 'platform'$lw GROUP BY l.kind") as $r) {
            $income[$r['kind']] = (int) $r['amount'];
        }
        $daily = Db::all(
            "SELECT date(o.paid_at) AS day, COUNT(*) AS orders, SUM(o.goods_amount) AS gmv, SUM(o.competitor_amount - o.goods_amount) AS saved
             FROM orders o WHERE o.status IN " . self::PAID . " AND o.paid_at >= date('now','localtime','-6 day')$w GROUP BY day ORDER BY day"
        );
        $days = [];
        for ($i = 6; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i day"));
            $days[$d] = ['day' => $d, 'orders' => 0, 'gmv' => 0, 'saved' => 0];
        }
        foreach ($daily as $r) {
            $days[$r['day']] = $r;
        }
        return [
            'totals' => [
                'students'        => (int) Db::value("SELECT COUNT(*) FROM users WHERE role = 'student'" . ($sid ? " AND school_id = $sid" : '')),
                'merchants'       => (int) Db::value("SELECT COUNT(*) FROM merchants WHERE status = 'approved'" . ($sid ? " AND school_id = $sid" : '')),
                'orders'          => (int) Db::value("SELECT COUNT(*) FROM orders o WHERE o.status IN " . self::PAID . $w),
                'gmv'             => (int) Db::value("SELECT COALESCE(SUM(o.goods_amount),0) FROM orders o WHERE o.status IN " . self::PAID . $w),
                'user_saved'      => (int) Db::value("SELECT COALESCE(SUM(o.competitor_amount - o.goods_amount + o.coupon_discount),0) FROM orders o WHERE o.status IN " . self::PAID . $w),
                'platform_income' => $ledger('platform'),
                'manager_income'  => $ledger('manager'),
                'rider_income'    => $ledger('rider'),
                'merchant_income' => $ledger('merchant'),
                'student_income'  => $ledger('student'),
                'errands'         => (int) Db::value('SELECT COUNT(*) FROM errands' . ($sid ? " WHERE school_id = $sid" : '')),
                'treehole_posts'  => (int) Db::value('SELECT COUNT(*) FROM treehole_posts' . ($sid ? " WHERE school_id = $sid" : '')),
            ],
            'daily' => array_values($days),
            'income' => array_map(static fn($k, $t) => ['kind' => $k, 'title' => $t, 'amount' => $income[$k] ?? 0], array_keys(Ledger::PLATFORM_KINDS), Ledger::PLATFORM_KINDS),
            'schools' => Db::all(
                "SELECT s.id, s.name, s.status, s.is_pilot,
                    (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'student') AS students,
                    (SELECT COUNT(*) FROM merchants m WHERE m.school_id = s.id AND m.status = 'approved') AS merchants,
                    (SELECT COUNT(*) FROM orders o WHERE o.school_id = s.id AND o.status IN " . self::PAID . ") AS orders,
                    (SELECT COALESCE(SUM(goods_amount),0) FROM orders o WHERE o.school_id = s.id AND o.status IN " . self::PAID . ") AS gmv
                 FROM schools s WHERE s.status != 'applying' ORDER BY s.is_pilot DESC, gmv DESC"
            ),
            'todo' => [
                'pending_merchants' => (int) Db::value("SELECT COUNT(*) FROM merchants WHERE status = 'pending'"),
                'applying_schools'  => (int) Db::value("SELECT COUNT(*) FROM schools WHERE status = 'applying'"),
                'pending_riders'    => (int) Db::value("SELECT COUNT(*) FROM users WHERE rider_status = 'pending'"),
                'reported_posts'    => (int) Db::value('SELECT COUNT(*) FROM treehole_posts WHERE report_count > 0'),
                'unanswered'        => (int) Db::value("SELECT COUNT(*) FROM ai_logs WHERE source = 'none'"),
                'pending_promotions'=> (int) Db::value("SELECT COUNT(*) FROM promotions WHERE status = 'pending'"),
            ],
        ];
    }

    /* ---------- 学校 ---------- */
    public function schools(Request $req): array
    {
        return array_map(static function ($s) {
            $s['delivery_slots'] = json_decode($s['delivery_slots'], true);
            $s['delivery_points'] = json_decode($s['delivery_points'], true);
            return $s;
        }, Db::all("SELECT * FROM schools ORDER BY status = 'applying' DESC, is_pilot DESC, id"));
    }

    public function saveSchool(Request $req): array
    {
        $id = (int) ($req->params['id'] ?? 0);
        $slots = array_values(array_filter((array) $req->input('delivery_slots', []), static fn($s) => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $s)));
        sort($slots);
        $points = array_values(array_filter(array_map(static fn($p) => mb_substr(trim((string) $p), 0, 20), (array) $req->input('delivery_points', []))));
        $data = [
            'name'            => $req->str('name', 40, true, '学校名称'),
            'short_name'      => $req->str('short_name', 10),
            'city'            => $req->str('city', 20),
            'status'          => $req->oneOf('status', ['active', 'preparing', 'applying'], 'preparing'),
            'is_pilot'        => $req->int('is_pilot') ? 1 : 0,
            'delivery_slots'  => json_encode($slots ?: ['11:30', '17:30']),
            'delivery_points' => json_encode($points, JSON_UNESCAPED_UNICODE),
        ];
        if (Db::value('SELECT 1 FROM schools WHERE name = ? AND id != ?', [$data['name'], $id])) {
            throw new HttpException('学校名称已存在', 422);
        }
        if ($id) {
            Db::update('schools', $data, 'id = :id', ['id' => $id]);
        } else {
            $id = Db::insert('schools', $data);
        }
        return Db::one('SELECT * FROM schools WHERE id = ?', [$id]);
    }

    /* ---------- 商家 ---------- */
    public function merchants(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['status' => 'm.status', 'school_id' => 'm.school_id'], 'm.name');
        return Db::all(
            "SELECT m.*, s.name AS school_name, mg.nickname AS manager_name, mg.invite_code, ow.phone AS owner_phone,
                    (SELECT COUNT(*) FROM deals d WHERE d.merchant_id = m.id AND d.status = 'on') AS deals,
                    (SELECT COUNT(*) FROM orders o WHERE o.merchant_id = m.id AND o.status IN " . self::PAID . ") AS orders
             FROM merchants m JOIN schools s ON s.id = m.school_id LEFT JOIN users mg ON mg.id = m.manager_id JOIN users ow ON ow.id = m.owner_user_id
             $where ORDER BY m.status = 'pending' DESC, m.id DESC",
            $params
        );
    }

    public function reviewMerchant(Request $req): array
    {
        $m = $this->mustFind('merchants', (int) $req->params['id'], '商家');
        $action = $req->params['action'];
        if ($action === 'manager') {
            $mid = $req->int('manager_id') ?: null;
            if ($mid && !Db::value("SELECT 1 FROM users WHERE id = ? AND role = 'manager'", [$mid])) {
                throw new HttpException('客户经理不存在', 422);
            }
            Db::update('merchants', ['manager_id' => $mid], 'id = :id', ['id' => $m['id']]);
        } elseif (in_array($action, ['approve', 'reject', 'suspend'], true)) {
            $status = ['approve' => 'approved', 'reject' => 'rejected', 'suspend' => 'rejected'][$action];
            Db::update('merchants', ['status' => $status, 'approved_at' => $status === 'approved' ? now() : $m['approved_at']], 'id = :id', ['id' => $m['id']]);
        } else {
            throw new HttpException('未知操作', 404);
        }
        return Db::one('SELECT * FROM merchants WHERE id = ?', [$m['id']]);
    }

    /* ---------- 商品比价抽查 ---------- */
    public function deals(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['status' => 'd.status', 'school_id' => 'm.school_id', 'pricing_mode' => 'd.pricing_mode'], 'd.title');
        return Db::all(
            "SELECT d.*, m.name AS merchant_name, s.name AS school_name, (d.sale_price - d.merchant_settle) AS gross,
                    (d.competitor_price - d.sale_price) AS saving, ROUND(d.merchant_settle * 1.0 / d.competitor_price, 3) AS merchant_ratio
             FROM deals d JOIN merchants m ON m.id = d.merchant_id JOIN schools s ON s.id = m.school_id $where ORDER BY d.id DESC",
            $params
        );
    }

    public function toggleDeal(Request $req): array
    {
        $d = $this->mustFind('deals', (int) $req->params['id'], '商品');
        $status = $d['status'] === 'on' ? 'off' : 'on';
        Db::update('deals', ['status' => $status], 'id = :id', ['id' => $d['id']]);
        return ['id' => (int) $d['id'], 'status' => $status];
    }

    /* ---------- 订单 & 流水 ---------- */
    public function orders(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['status' => 'o.status', 'type' => 'o.type', 'school_id' => 'o.school_id'], 'o.order_no');
        [$limit, $offset] = $req->page();
        return Db::all(
            "SELECT o.*, m.name AS merchant_name, u.nickname AS user_name, mg.nickname AS manager_name, r.nickname AS rider_name
             FROM orders o JOIN merchants m ON m.id = o.merchant_id JOIN users u ON u.id = o.user_id
             LEFT JOIN users mg ON mg.id = o.manager_id LEFT JOIN users r ON r.id = o.rider_id
             $where ORDER BY o.id DESC LIMIT $limit OFFSET $offset",
            $params
        );
    }

    public function ledger(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['party_type' => 'l.party_type', 'source' => 'l.source', 'school_id' => 'l.school_id'], 'o.order_no', 'l.remark');
        [$limit, $offset] = $req->page();
        return [
            'summary' => Db::all('SELECT party_type, kind, COUNT(*) AS n, SUM(amount) AS amount FROM ledger GROUP BY party_type, kind ORDER BY party_type'),
            'rows' => Db::all(
                "SELECT l.*, o.order_no, o.title,
                    CASE l.party_type WHEN 'merchant' THEN m.name WHEN 'platform' THEN '平台' ELSE u.nickname END AS party_name
                 FROM ledger l LEFT JOIN orders o ON o.id = l.order_id LEFT JOIN merchants m ON l.party_type = 'merchant' AND m.id = l.party_id
                 LEFT JOIN users u ON l.party_type IN ('manager','rider','student') AND u.id = l.party_id
                 $where ORDER BY l.id DESC LIMIT $limit OFFSET $offset",
                $params
            ),
        ];
    }

    /* ---------- 用户 / 客户经理 / 骑手 ---------- */
    public function users(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['role' => 'u.role', 'rider_status' => 'u.rider_status', 'school_id' => 'u.school_id', 'status' => 'u.status'], 'u.phone', 'u.nickname');
        return Db::all(
            "SELECT u.id, u.phone, u.nickname, u.role, u.invite_code, u.rider_status, u.status, u.created_at, s.name AS school_name,
                    (SELECT COUNT(*) FROM merchants m WHERE m.manager_id = u.id) AS bound_merchants
             FROM users u LEFT JOIN schools s ON s.id = u.school_id $where ORDER BY u.id DESC LIMIT 200",
            $params
        );
    }

    public function updateUser(Request $req): array
    {
        $u = $this->mustFind('users', (int) $req->params['id'], '用户');
        $data = [];
        if (($role = $req->str('role', 10)) !== '') {
            $role = $req->oneOf('role', ['student', 'manager', 'admin']);
            if ($u['role'] === 'merchant') {
                throw new HttpException('商家账号不能直接改角色', 422);
            }
            $data['role'] = $role;
            if ($role === 'manager' && !$u['invite_code']) {
                $data['invite_code'] = $this->newInviteCode();
            }
        }
        if (($rs = $req->str('rider_status', 10)) !== '') {
            $data['rider_status'] = $req->oneOf('rider_status', ['none', 'pending', 'approved']);
        }
        if (($st = $req->str('status', 10)) !== '') {
            if ((int) $u['id'] === (int) $req->user['id']) {
                throw new HttpException('不能封禁自己', 422);
            }
            $data['status'] = $req->oneOf('status', ['active', 'banned']);
            if ($data['status'] === 'banned') {
                Db::run('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
            }
        }
        if ($data) {
            Db::update('users', $data, 'id = :id', ['id' => $u['id']]);
        }
        return Db::one('SELECT id, phone, nickname, role, invite_code, rider_status, status FROM users WHERE id = ?', [$u['id']]);
    }

    /* ---------- 平台参数 ---------- */
    public function settings(Request $req): array
    {
        return Settings::all();
    }

    public function saveSettings(Request $req): array
    {
        $rules = [
            'manager_rate'           => [0, 1],
            'min_saving'             => [0, 2000],
            'delivery_fee'           => [0, 2000],
            'rider_commission'       => [0, 2000],
            'takeout_cutoff_minutes' => [0, 240],
            'errand_fee_rate'        => [0, 0.3],
            'market_fee_rate'        => [0, 0.2],
        ];
        foreach ($rules as $key => [$min, $max]) {
            $v = $req->input($key);
            if ($v === null || $v === '') {
                continue;
            }
            if (!is_numeric($v) || $v < $min || $v > $max) {
                throw new HttpException("参数 {$key} 需在 {$min}~{$max} 之间", 422);
            }
            Settings::set($key, str_ends_with($key, '_rate') ? round((float) $v, 4) : (int) $v);
        }
        if (is_array($prices = $req->input('ad_prices'))) {
            $prices = array_map('intval', array_slice(array_values($prices), 0, PromotionService::POSITIONS));
            if (count($prices) !== PromotionService::POSITIONS || min($prices) < 0 || max($prices) > 1000000) {
                throw new HttpException('推荐位价格不合法', 422);
            }
            Settings::set('ad_prices', $prices);
        }
        foreach (['price_slogan' => 12, 'compare_label' => 8, 'group_name' => 20, 'group_desc' => 60] as $key => $max) {
            if ($req->input($key) !== null) {
                $v = $req->str($key, $max);
                if ($v === '') {
                    throw new HttpException('文案不能为空', 422);
                }
                Settings::set($key, $v);
            }
        }
        if ($req->input('group_qr') !== null) {
            Settings::set('group_qr', UploadController::checkUrl($req->str('group_qr', 200)) ?? '');
        }
        if ($req->input('merchant_auto_approve') !== null) {
            Settings::set('merchant_auto_approve', (bool) $req->input('merchant_auto_approve'));
        }
        return Settings::all();
    }

    /* ---------- FAQ 知识库 & AI 日志 ---------- */
    public function faqs(Request $req): array
    {
        return Db::all('SELECT f.*, s.name AS school_name FROM faqs f LEFT JOIN schools s ON s.id = f.school_id ORDER BY f.hits DESC, f.id DESC');
    }

    public function saveFaq(Request $req): array
    {
        $id = (int) ($req->params['id'] ?? 0);
        $data = [
            'school_id' => $req->int('school_id') ?: null,
            'question'  => $req->str('question', 100, true, '问题'),
            'answer'    => $req->str('answer', 1000, true, '答案'),
            'keywords'  => implode(',', array_filter(array_map('trim', preg_split('/[,，\s]+/u', $req->str('keywords', 200))))),
        ];
        if ($id) {
            $this->mustFind('faqs', $id, '问答');
            Db::update('faqs', $data, 'id = :id', ['id' => $id]);
        } else {
            $id = Db::insert('faqs', $data);
        }
        return Db::one('SELECT * FROM faqs WHERE id = ?', [$id]);
    }

    public function deleteFaq(Request $req): array
    {
        Db::run('DELETE FROM faqs WHERE id = ?', [(int) $req->params['id']]);
        return [];
    }

    public function aiLogs(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['source' => 'l.source'], 'l.question');
        return Db::all("SELECT l.*, u.nickname FROM ai_logs l LEFT JOIN users u ON u.id = l.user_id $where ORDER BY l.id DESC LIMIT 200", $params);
    }

    /* ---------- 收益分配：平台怎么赚钱、钱分给了谁 ---------- */
    public function revenue(Request $req): array
    {
        $sid = $req->int('school_id');
        $lw = $sid ? ' WHERE school_id = ' . $sid : '';
        $parties = [];
        foreach (Db::all("SELECT party_type, kind, COUNT(*) AS n, SUM(amount) AS amount FROM ledger$lw GROUP BY party_type, kind") as $r) {
            $parties[$r['party_type']][$r['kind']] = ['n' => (int) $r['n'], 'amount' => (int) $r['amount']];
        }
        $platform = [];
        foreach (Ledger::PLATFORM_KINDS as $k => $title) {
            $platform[] = ['kind' => $k, 'title' => $title, 'amount' => $parties['platform'][$k]['amount'] ?? 0, 'n' => $parties['platform'][$k]['n'] ?? 0];
        }
        $sum = static fn(string $p) => array_sum(array_column($parties[$p] ?? [], 'amount'));
        // 示例订单：取销量最高的团购 + 外卖各一个，演示一笔钱怎么拆
        $samples = [];
        foreach (['groupbuy', 'takeout'] as $type) {
            $d = Db::one("SELECT d.*, m.name AS merchant_name, m.manager_id FROM deals d JOIN merchants m ON m.id = d.merchant_id
                WHERE d.type = ? AND d.status = 'on' AND m.status = 'approved'" . ($sid ? " AND m.school_id = $sid" : '') . ' ORDER BY d.sold DESC LIMIT 1', [$type]);
            if ($d) {
                [$commission, $margin] = PricingService::split($d['sale_price'] - $d['merchant_settle'], !empty($d['manager_id']));
                $samples[] = [
                    'type' => $type, 'title' => $d['title'], 'merchant_name' => $d['merchant_name'], 'pricing_mode' => $d['pricing_mode'],
                    'competitor_price' => (int) $d['competitor_price'], 'sale_price' => (int) $d['sale_price'],
                    'merchant_settle' => (int) $d['merchant_settle'], 'manager_commission' => $commission, 'platform_margin' => $margin,
                    'delivery_fee' => $type === 'takeout' ? (int) Settings::get('delivery_fee') : 0,
                    'rider_commission' => $type === 'takeout' ? (int) Settings::get('rider_commission') : 0,
                ];
            }
        }
        return [
            'platform'     => $platform,
            'platform_net' => array_sum(array_column($platform, 'amount')),
            'parties'      => [
                ['party' => 'merchant', 'title' => '商家结算', 'amount' => $sum('merchant')],
                ['party' => 'manager',  'title' => '客户经理佣金', 'amount' => $sum('manager')],
                ['party' => 'rider',    'title' => '骑手配送提成', 'amount' => $sum('rider')],
                ['party' => 'student',  'title' => '学生收入（跑腿赏金 / 二手货款）', 'amount' => $sum('student')],
                ['party' => 'platform', 'title' => '平台净收入', 'amount' => $sum('platform')],
            ],
            'rules'   => Settings::all(),
            'samples' => $samples,
            'ad_slots_active' => (int) Db::value("SELECT COUNT(*) FROM promotions WHERE status = 'active' AND start_date <= date('now','localtime') AND end_date >= date('now','localtime')" . ($sid ? " AND school_id = $sid" : '')),
            'coupon_stats' => Db::one("SELECT COUNT(*) AS claimed, SUM(status = 'used') AS used FROM user_coupons"),
        ];
    }

    /* ---------- 首页推荐位 ---------- */
    public function promotions(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['status' => 'p.status', 'school_id' => 'p.school_id', 'category' => 'p.category'], 'm.name');
        $sid = $req->int('school_id') ?: (int) Db::value("SELECT id FROM schools WHERE is_pilot = 1 ORDER BY id LIMIT 1");
        $board = [];
        foreach (PromotionService::CATEGORIES as $c => $name) {
            $board[] = ['category' => $c, 'name' => $name, 'slots' => PromotionService::slots($sid, $c)];
        }
        return [
            'rows' => Db::all(
                "SELECT p.*, m.name AS merchant_name, d.title AS deal_title, s.name AS school_name FROM promotions p
                 JOIN merchants m ON m.id = p.merchant_id JOIN deals d ON d.id = p.deal_id JOIN schools s ON s.id = p.school_id
                 $where ORDER BY p.status = 'pending' DESC, p.id DESC LIMIT 200",
                $params
            ),
            'board' => $board,
            'board_school_id' => $sid,
            'prices' => Settings::get('ad_prices'),
            'categories' => PromotionService::CATEGORIES,
        ];
    }

    /** 后台直接排期（线下由客户经理谈下的广告） */
    public function createPromotion(Request $req): array
    {
        $deal = $this->mustFind('deals', $req->int('deal_id'), '商品');
        $m = $this->mustFind('merchants', (int) $deal['merchant_id'], '商家');
        return PromotionService::create($m, (int) $deal['id'], $req->int('position'), $req->int('days', 7), $req->str('start_date', 10) ?: date('Y-m-d'), 'admin');
    }

    public function promotionAction(Request $req): array
    {
        $id = (int) $req->params['id'];
        return match ($req->params['action']) {
            'approve' => PromotionService::approve($id),
            'reject'  => PromotionService::reject($id),
            'end'     => PromotionService::end($id),
            default   => throw new HttpException('未知操作', 404),
        };
    }

    /* ---------- 平台优惠券（福利群发券） ---------- */
    public function coupons(Request $req): array
    {
        $today = date('Y-m-d');
        return Db::all(
            "SELECT t.*, s.name AS school_name,
                (SELECT COUNT(*) FROM user_coupons c WHERE c.template_id = t.id AND c.claim_date = ?) AS claimed_today,
                (SELECT COUNT(*) FROM user_coupons c WHERE c.template_id = t.id) AS claimed_total,
                (SELECT COUNT(*) FROM user_coupons c WHERE c.template_id = t.id AND c.status = 'used') AS used_total,
                (SELECT COALESCE(SUM(o.coupon_discount),0) FROM user_coupons c JOIN orders o ON o.id = c.order_id
                   WHERE c.template_id = t.id AND o.status IN ('paid','ready','delivering','completed')) AS subsidy_total
             FROM coupon_templates t LEFT JOIN schools s ON s.id = t.school_id ORDER BY t.status = 'on' DESC, t.id DESC",
            [$today]
        );
    }

    public function saveCoupon(Request $req): array
    {
        $id = (int) ($req->params['id'] ?? 0);
        if ($id && $req->input('title') === null) {
            // 仅切换上下线
            $t = $this->mustFind('coupon_templates', $id, '优惠券');
            Db::update('coupon_templates', ['status' => $t['status'] === 'on' ? 'off' : 'on'], 'id = :id', ['id' => $id]);
            return Db::one('SELECT * FROM coupon_templates WHERE id = ?', [$id]);
        }
        $amount = (int) $req->money('amount', true, '抵扣金额');
        $threshold = (int) ($req->money('threshold') ?? 0);
        if ($amount <= 0 || $amount > 5000) {
            throw new HttpException('抵扣金额需在 0.01~50 元之间', 422);
        }
        if ($threshold && $threshold <= $amount) {
            throw new HttpException('使用门槛应大于抵扣金额', 422);
        }
        $quota = $req->int('daily_quota');
        if ($quota < 1 || $quota > 10000) {
            throw new HttpException('每日发放数量需在 1~10000 之间', 422);
        }
        $start = $req->str('start_time', 5) ?: '00:00';
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start)) {
            throw new HttpException('开抢时间格式应为 HH:MM', 422);
        }
        $data = [
            'school_id'   => $req->int('school_id') ?: null,
            'title'       => $req->str('title', 20, true, '券名称'),
            'amount'      => $amount,
            'threshold'   => $threshold,
            'scope'       => $req->oneOf('scope', array_keys(CouponService::SCOPES), 'all'),
            'daily_quota' => $quota,
            'start_time'  => $start,
            'valid_days'  => max(1, min(30, $req->int('valid_days', 1))),
        ];
        if ($id) {
            $this->mustFind('coupon_templates', $id, '优惠券');
            Db::update('coupon_templates', $data, 'id = :id', ['id' => $id]);
        } else {
            $id = Db::insert('coupon_templates', $data);
        }
        return Db::one('SELECT * FROM coupon_templates WHERE id = ?', [$id]);
    }

    /* ---------- 树洞审核 ---------- */
    public function treehole(Request $req): array
    {
        [$where, $params] = $this->filters($req, ['status' => 'p.status', 'school_id' => 'p.school_id'], 'p.content');
        if ($req->int('reported')) {
            $where .= ($where ? ' AND' : ' WHERE') . ' p.report_count > 0';
        }
        $rows = Db::all(
            "SELECT p.*, u.nickname AS real_name, u.phone AS real_phone, s.name AS school_name,
                    (SELECT GROUP_CONCAT(reason, '、') FROM treehole_reports r WHERE r.post_id = p.id) AS reasons
             FROM treehole_posts p JOIN users u ON u.id = p.user_id JOIN schools s ON s.id = p.school_id $where
             ORDER BY p.report_count DESC, p.id DESC LIMIT 200",
            $params
        );
        return $rows;
    }

    public function moderatePost(Request $req): array
    {
        $p = $this->mustFind('treehole_posts', (int) $req->params['id'], '帖子');
        $action = $req->params['action'];
        if (!in_array($action, ['hide', 'restore'], true)) {
            throw new HttpException('未知操作', 404);
        }
        $data = ['status' => $action === 'hide' ? 'hidden' : 'normal'];
        if ($action === 'restore') {
            $data['report_count'] = 0; // 复核通过，清空举报
            Db::run('DELETE FROM treehole_reports WHERE post_id = ?', [$p['id']]);
        }
        Db::update('treehole_posts', $data, 'id = :id', ['id' => $p['id']]);
        return ['id' => (int) $p['id'], 'status' => $data['status']];
    }

    /* ---------- 工具 ---------- */

    /** 构造白名单字段的等值过滤 + 关键词模糊搜索 */
    private function filters(Request $req, array $map, string ...$kwCols): array
    {
        $where = [];
        $params = [];
        foreach ($map as $key => $col) {
            $v = $req->str($key, 20);
            if ($v !== '') {
                $where[] = "$col = ?";
                $params[] = $v;
            }
        }
        if (($kw = $req->str('keyword', 40)) !== '' && $kwCols) {
            $where[] = '(' . implode(' OR ', array_map(static fn($c) => "$c LIKE ?", $kwCols)) . ')';
            foreach ($kwCols as $_) {
                $params[] = "%$kw%";
            }
        }
        return [$where ? ' WHERE ' . implode(' AND ', $where) : '', $params];
    }

    private function mustFind(string $table, int $id, string $label): array
    {
        $row = Db::one("SELECT * FROM $table WHERE id = ?", [$id]);
        if (!$row) {
            throw new HttpException("{$label}不存在", 404);
        }
        return $row;
    }

    private function newInviteCode(): string
    {
        do {
            $code = 'QD' . random_int(1000, 9999);
        } while (Db::value('SELECT 1 FROM users WHERE invite_code = ?', [$code]));
        return $code;
    }
}
