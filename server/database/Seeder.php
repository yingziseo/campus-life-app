<?php
declare(strict_types=1);

use App\Core\Db;
use App\Services\{CouponService, Ledger, OrderService, PricingService, PromotionService, Settings};

/**
 * 建表 + 演示数据。所有演示数据均为虚构，仅用于原型展示。
 */
final class Seeder
{
    public static function run(bool $fresh = false): void
    {
        $pdo = Db::pdo();
        if ($fresh) {
            $pdo->exec('PRAGMA foreign_keys = OFF');
            $tables = Db::all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
            foreach ($tables as $t) {
                $pdo->exec('DROP TABLE IF EXISTS "' . $t['name'] . '"');
            }
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
        $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
        Settings::flush();

        if (Db::value('SELECT COUNT(*) FROM schools') > 0) {
            return; // 已有数据，不重复灌入
        }
        Db::transaction(static function () {
            self::settings();
            $sid = self::schools();
            $u = self::users($sid);
            self::campus($sid, $u);
            $m = self::merchants($sid, $u);
            self::faqs($sid);
            self::coupons($sid);
            self::history($u, $m);
            self::orders($sid, $u, $m);
            self::promotions($m);
            self::trades($sid, $u);
        });
    }

    private static function settings(): void
    {
        foreach (Settings::DEFAULTS as $k => $v) {
            Settings::set($k, $v);
        }
    }

    private static function schools(): int
    {
        $pilot = Db::insert('schools', [
            'name' => '青岛理工职业学院', 'short_name' => '青理职', 'city' => '青岛', 'status' => 'active', 'is_pilot' => 1,
            'delivery_slots'  => json_encode(['11:30', '17:30', '21:00']),
            'delivery_points' => json_encode(['东门取餐柜', '北区宿舍楼下', '图书馆门口'], JSON_UNESCAPED_UNICODE),
        ]);
        foreach ([['青岛职业技术学院', '青岛'], ['青岛酒店管理职业技术学院', '青岛'], ['山东外贸职业学院', '青岛']] as [$name, $city]) {
            Db::insert('schools', ['name' => $name, 'city' => $city, 'status' => 'preparing']);
        }
        return $pilot;
    }

    private static function users(int $sid): array
    {
        $rows = [
            'student'  => ['13800000001', '小青同学', 'student', null],
            'merchant' => ['13800000002', '王老板', 'merchant', null],
            'manager'  => ['13800000003', '李经理', 'manager', 'QD8801'],
            'rider'    => ['13800000004', '小刘', 'student', null],
            'admin'    => ['13800000000', '平台管理员', 'admin', null],
            's2'       => ['13800000011', '阿杰', 'student', null],
            's3'       => ['13800000012', '晓雯', 'student', null],
            'o2'       => ['13800000021', '张老板', 'merchant', null],
            'o3'       => ['13800000022', '赵老板', 'merchant', null],
            'o4'       => ['13800000023', '孙老板', 'merchant', null],
            'o5'       => ['13800000024', '周老板', 'merchant', null],
            'o6'       => ['13800000025', '吴老板', 'merchant', null],
            'o7'       => ['13800000026', '郑老板', 'merchant', null],
        ];
        $ids = [];
        foreach ($rows as $key => [$phone, $nick, $role, $code]) {
            $ids[$key] = Db::insert('users', ['phone' => $phone, 'nickname' => $nick, 'role' => $role, 'school_id' => $sid, 'invite_code' => $code]);
        }
        Db::update('users', ['rider_status' => 'approved'], 'id = :id', ['id' => $ids['rider']]);
        Db::update('users', ['rider_status' => 'pending'], 'id = :id', ['id' => $ids['s3']]);
        // 第二位客户经理（尚未推广商家）
        Db::insert('users', ['phone' => '13800000005', 'nickname' => '陈经理', 'role' => 'manager', 'school_id' => $sid, 'invite_code' => 'QD8802']);
        // 学生申请开通的新学校
        Db::insert('schools', ['name' => '青岛黄海学院', 'city' => '青岛', 'status' => 'applying', 'contact' => '微信 hh-2025（演示）']);
        return $ids;
    }

    private static function campus(int $sid, array $u): void
    {
        $errands = [
            [$u['s2'], 'express', '菜鸟驿站中件，送北区5号楼', '有点重，麻烦啦', '北区5号楼 302', '菜鸟驿站(东门)', '6-2-3018', 'medium', 300],
            [$u['s3'], 'express', '帮取两个小件', '', '南区2号楼楼下', '京东快递点', '取件码 8821/8822', 'small', 400],
            [$u['s2'], 'errand', '二食堂带份鸡排饭', '不要香菜，送到图书馆三楼', '图书馆三楼自习区', null, null, null, 500],
            [$u['s3'], 'errand', '帮忙打印20页资料', '文件发你，双面黑白', '教学楼A座 201', null, null, null, 300],
        ];
        foreach ($errands as [$uid, $type, $title, $desc, $to, $station, $code, $size, $reward]) {
            Db::insert('errands', [
                'school_id' => $sid, 'user_id' => $uid, 'type' => $type, 'title' => $title, 'description' => $desc,
                'pickup_addr' => $station ?? ($type === 'errand' ? (str_starts_with($title, '二') ? '二食堂' : '校门口打印店') : null),
                'deliver_addr' => $to, 'express_station' => $station, 'express_code' => $code, 'size' => $size, 'reward' => $reward,
                'fee' => Ledger::fee($reward, 'errand_fee_rate'), 'paid_at' => now(),
            ]);
        }

        $items = [
            [$u['s2'], '高等数学 第七版 上下册', 'book', '有少量笔记，考试重点都标了', 1500, 6800, '9成新'],
            [$u['s3'], '小米台灯 Pro', 'digital', '宿舍用了一学期，功能完好', 6000, 16900, '95新'],
            [$u['s2'], '山地自行车', 'sport', '毕业出，送车锁', 18000, 59900, '8成新'],
            [$u['s3'], '宿舍收纳三件套', 'daily', '搬寝室用不上了', 2000, 5900, '9成新'],
            [$u['student'], '英语四级真题 + 词汇书', 'book', '已过四级，便宜出', 1000, 4500, '9成新'],
            [$u['s2'], '机械键盘 青轴', 'digital', '室友嫌吵，忍痛出', 8000, 22900, '9成新'],
        ];
        foreach ($items as [$uid, $title, $cat, $desc, $price, $orig, $cond]) {
            Db::insert('market_items', [
                'school_id' => $sid, 'user_id' => $uid, 'title' => $title, 'category' => $cat, 'description' => $desc,
                'price' => $price, 'original_price' => $orig, 'item_condition' => $cond, 'contact' => '站内联系（演示）',
            ]);
        }

        $posts = [
            [$u['s2'], '熬夜的水豚', '图书馆三楼靠窗那个位置的同学，你每天带的柠檬茶是哪家的？想要同款', '日常', 23],
            [$u['s3'], '迷路的企鹅', '新生求问：校园卡丢了去哪里补办？', '求助', 8],
            [$u['student'], '干饭的柴犬', '东门新开的黄焖鸡在平台上买便宜好几块，还能进群领券，亲测', '日常', 41],
            [$u['s2'], '安静的松鼠', '捡到一把蓝色雨伞，放在一食堂门口失物招领处了', '失物招领', 5],
            [$u['s3'], '温柔的橘猫', '体育课八百米，求一个不累的跑法……', '吐槽', 17],
        ];
        foreach ($posts as [$uid, $anon, $content, $tag, $likes]) {
            $pid = Db::insert('treehole_posts', ['school_id' => $sid, 'user_id' => $uid, 'anon_name' => $anon, 'content' => $content, 'tag' => $tag, 'like_count' => $likes]);
            if ($tag === '吐槽') {
                // 演示：一条被举报的帖子，等待后台复核
                foreach ([$u['s2'], $u['student']] as $reporter) {
                    Db::insert('treehole_reports', ['post_id' => $pid, 'user_id' => $reporter, 'reason' => '其他']);
                }
                Db::run('UPDATE treehole_posts SET report_count = 2 WHERE id = ?', [$pid]);
            }
            if ($tag === '求助') {
                Db::insert('treehole_comments', ['post_id' => $pid, 'user_id' => $u['s2'], 'anon_name' => '勇敢的海鸥', 'content' => '可以先在平台「学校百事通」里搜一下，有写流程']);
                Db::run('UPDATE treehole_posts SET comment_count = 1 WHERE id = ?', [$pid]);
            }
        }
    }

    private static function merchants(int $sid, array $u): array
    {
        $managerId = $u['manager'];
        $list = [
            'hmj' => [$u['merchant'], '老王黄焖鸡米饭', 'food', '学校东门商业街 12 号', 350, 1, '招牌黄焖鸡，米饭免费加', [
                ['groupbuy', '黄焖鸡米饭 单人餐（到店）', '含米饭+小菜+饮料', ['pricing_mode' => 'voucher', 'competitor_price' => 1500, 'merchant_settle' => 1050, 'voucher_face' => 200, 'voucher_cost' => 100]],
                ['takeout', '黄焖鸡米饭（校园外卖）', '固定时间点送达取餐点', ['pricing_mode' => 'fixed', 'competitor_price' => 1700, 'merchant_settle' => 950, 'sale_price' => 1200]],
                ['takeout', '黄焖排骨饭（校园外卖）', '', ['pricing_mode' => 'fixed', 'competitor_price' => 2200, 'merchant_settle' => 1300, 'sale_price' => 1650]],
            ]],
            'mlt' => [$u['o2'], '一品川味麻辣烫', 'food', '学校东门商业街 8 号', 300, 1, '自选麻辣烫，骨汤熬制', [
                ['groupbuy', '麻辣烫 单人套餐（到店）', '到店自选，含一份主食', ['pricing_mode' => 'voucher', 'competitor_price' => 1800, 'merchant_settle' => 1300, 'voucher_face' => 300, 'voucher_cost' => 150]],
                ['takeout', '招牌麻辣烫套餐（校园外卖）', '荤素搭配约 400g', ['pricing_mode' => 'fixed', 'competitor_price' => 2000, 'merchant_settle' => 1200, 'sale_price' => 1550]],
            ]],
            'tea' => [$u['o3'], '甜心奶茶铺', 'food', '学校北门 3 号', 500, 1, '鲜果茶 / 奶茶', [
                ['groupbuy', '招牌珍珠奶茶 大杯', '', ['pricing_mode' => 'fixed', 'competitor_price' => 1200, 'merchant_settle' => 700, 'sale_price' => 900]],
            ]],
            'net' => [$u['o4'], '极速电竞网咖', 'netcafe', '学校南门 2 楼', 600, 0, 'RTX 显卡 / 240Hz 电竞屏', [
                ['groupbuy', '5 小时畅玩套餐', '大厅区通用', ['pricing_mode' => 'fixed', 'competitor_price' => 2500, 'merchant_settle' => 1500, 'sale_price' => 1990]],
                ['groupbuy', '通宵包夜 代金券', '22:00 - 次日 8:00', ['pricing_mode' => 'voucher', 'competitor_price' => 3000, 'merchant_settle' => 2100, 'voucher_face' => 500, 'voucher_cost' => 200]],
            ]],
            'pool' => [$u['o5'], '星空台球俱乐部', 'billiards', '学校南门商业街 18 号', 800, 0, '中式黑八 / 斯诺克', [
                ['groupbuy', '中式台球 2 小时', '工作日全天可用', ['pricing_mode' => 'voucher', 'competitor_price' => 4000, 'merchant_settle' => 2600, 'voucher_face' => 500, 'voucher_cost' => 200]],
            ]],
            'home' => [$u['o6'], '海边小屋民宿', 'homestay', '距学校 1.5km，近海边', 1500, 0, '大床房 / 双床房 / 投影', [
                ['groupbuy', '周末大床房 1 晚', '含投影，可提前入住', ['pricing_mode' => 'fixed', 'competitor_price' => 16800, 'merchant_settle' => 12000, 'sale_price' => 13900]],
            ]],
        ];
        $ids = [];
        foreach ($list as $key => [$owner, $name, $cat, $addr, $dist, $takeout, $intro, $deals]) {
            $mid = Db::insert('merchants', [
                'school_id' => $sid, 'owner_user_id' => $owner, 'manager_id' => $managerId, 'name' => $name, 'category' => $cat,
                'address' => $addr, 'phone' => '0532-0000' . str_pad((string) (count($ids) + 1), 4, '0', STR_PAD_LEFT),
                'intro' => $intro, 'distance_m' => $dist, 'takeout_enabled' => $takeout, 'status' => 'approved', 'approved_at' => now(),
            ]);
            $ids[$key] = ['id' => $mid, 'deals' => []];
            foreach ($deals as [$type, $title, $desc, $pricing]) {
                $q = PricingService::quote($pricing, true);
                $ids[$key]['deals'][] = Db::insert('deals', [
                    'merchant_id' => $mid, 'type' => $type, 'title' => $title, 'description' => $desc,
                    'pricing_mode' => $q['pricing_mode'], 'competitor_price' => $q['competitor_price'], 'merchant_settle' => $q['merchant_settle'],
                    'voucher_face' => $q['voucher_face'], 'voucher_cost' => $q['voucher_cost'],
                    'list_price' => $q['list_price'], 'sale_price' => $q['sale_price'], 'stock' => 999,
                ]);
            }
        }
        // 一家待客户经理审核的商家
        Db::insert('merchants', [
            'school_id' => $sid, 'owner_user_id' => $u['o7'], 'manager_id' => $managerId, 'name' => '小李烧烤', 'category' => 'food',
            'address' => '学校东门夜市 5 号', 'phone' => '0532-00009999', 'intro' => '夜宵烧烤', 'distance_m' => 400, 'takeout_enabled' => 1, 'status' => 'pending',
        ]);
        return $ids;
    }

    private static function faqs(int $sid): void
    {
        $common = [
            ['代取快递怎么用？', '首页点「代取快递」→ 发布，填写驿站、取件码和送达地点，设置赏金。取件码只有接单的同学能看到。', '快递,代取,取件'],
            ['平台上的东西为什么更便宜？', '平台由校园团队直接对接商家，不收高额平台抽佣，省下的钱直接让给同学。每个商品都标注了"比其他平台省 X 元"，还可以进福利群每天领券。', '便宜,美团,外卖平台,优惠,省钱,低价'],
            ['怎么领优惠券？', '首页点「领券中心」，每天定时开抢；也可以加入福利群，群里每天发券提醒。领到的券下单时自动抵扣。', '优惠券,领券,福利群,进群,券'],
            ['二手交易安全吗？', '二手采用担保交易：你付款后由平台托管，当面验货满意再点「确认收货」，钱才会打给卖家；不满意可以取消，全额退款。', '二手,担保,安全,被骗,验货'],
            ['团购券怎么使用？', '下单支付后在「我的订单」里查看 12 位券码，到店出示给商家核销即可。', '券码,核销,团购,使用'],
            ['买了没用可以退款吗？', '未核销的团购券可以在订单详情里随时申请退款，原路退回。', '退款,退钱,取消'],
            ['校园外卖什么时候送？', '校园外卖按固定时间点集中配送（例如 11:30、17:30、21:00），送到指定取餐点，配送费比外卖平台低。截单时间为送餐前 40 分钟。', '外卖,配送,送餐,几点'],
            ['我是商家，怎么入驻？', '在「我的」→「商家入驻」提交店铺信息，填写客户经理给你的邀请码，审核通过后即可上架团购和外卖。', '商家,入驻,开店'],
            ['我的学校不在列表里怎么办？', '在选择学校页面底部点「申请开通我的学校」，留下联系方式，我们会尽快联系你。', '学校,开通,没有'],
            ['树洞是完全匿名的吗？', '树洞对其他同学完全匿名展示。依据相关规定，平台会对违规内容进行处理。', '树洞,匿名'],
        ];
        foreach ($common as [$q, $a, $k]) {
            Db::insert('faqs', ['school_id' => null, 'question' => $q, 'answer' => $a, 'keywords' => $k]);
        }
        $school = [
            ['新生报到需要带什么？', '【示例数据，请运营替换为本校真实信息】录取通知书、身份证、一寸照片若干、档案材料、户口迁移证明（如需）。', '报到,新生,带什么,开学'],
            ['校园卡丢了怎么补办？', '【示例数据，请运营替换为本校真实信息】先在校园卡小程序挂失，再携带身份证到一卡通服务中心补办。', '校园卡,饭卡,补办,丢了'],
            ['学校附近有哪些快递点？', '【示例数据】东门菜鸟驿站、京东快递点、顺丰服务点。懒得跑可以用平台「代取快递」。', '快递点,驿站,菜鸟'],
            ['宿舍几点熄灯/门禁？', '【示例数据，请运营替换为本校真实信息】一般为 23:00 门禁，具体以宿管通知为准。', '宿舍,熄灯,门禁,几点'],
        ];
        foreach ($school as [$q, $a, $k]) {
            Db::insert('faqs', ['school_id' => $sid, 'question' => $q, 'answer' => $a, 'keywords' => $k]);
        }
    }

    /** 平台优惠券：福利群每日发券 */
    private static function coupons(int $sid): void
    {
        $list = [
            ['外卖立减券', 200, 1000, 'takeout', 200, '00:00', 1],
            ['到店团购券', 300, 2000, 'groupbuy', 100, '00:00', 3],
            ['午间秒杀 无门槛', 300, 0, 'all', 30, '12:00', 1],
            ['新人专享券', 500, 1500, 'all', 50, '00:00', 7],
        ];
        foreach ($list as [$title, $amount, $threshold, $scope, $quota, $start, $days]) {
            Db::insert('coupon_templates', [
                'school_id' => $sid, 'title' => $title, 'amount' => $amount, 'threshold' => $threshold, 'scope' => $scope,
                'daily_quota' => $quota, 'start_time' => $start, 'valid_days' => $days,
            ]);
        }
    }

    /** 首页推荐位：几家商家购买了行业前 3 位（其中一条待审核） */
    private static function promotions(array $m): void
    {
        $deal = static fn(string $k, int $i) => (int) $m[$k]['deals'][$i];
        $merchant = static fn(string $k) => Db::one('SELECT * FROM merchants WHERE id = ?', [$m[$k]['id']]);
        $past = date('Y-m-d', strtotime('-3 day'));
        $book = static function (string $k, int $dealIdx, int $pos, int $days) use ($deal, $merchant, $past) {
            $p = PromotionService::create($merchant($k), $deal($k, $dealIdx), $pos, $days, date('Y-m-d'), 'admin');
            // 回拨到 3 天前开始投放
            Db::run("UPDATE promotions SET start_date = ?, end_date = date(?, '+' || (days - 1) || ' day'), created_at = ? WHERE id = ?", [$past, $past, $past . ' 10:00:00', $p['id']]);
            Db::run("UPDATE ledger SET created_at = ? WHERE source = 'promotion' AND ref_id = ?", [$past . ' 10:00:00', $p['id']]);
        };
        $book('tea', 0, 1, 10);   // 美食第 1 位：奶茶（销量不高，但买了推荐位）
        $book('mlt', 1, 1, 10);   // 校园外卖第 1 位
        $book('net', 0, 1, 10);   // 网吧第 1 位
        // 王老板（演示商家）申请美食第 2 位，等待平台审核
        PromotionService::create($merchant('hmj'), $deal('hmj', 0), 2, 7, date('Y-m-d', strtotime('+1 day')));
    }

    /** 跑腿与二手担保交易的成交记录（产生服务费流水），以及待演示的进行中订单 */
    private static function trades(int $sid, array $u): void
    {
        $users = [];
        foreach ($u as $k => $id) {
            $users[$k] = $id;
        }
        // 已完成的跑腿：小刘帮阿杰带饭，平台抽 5%
        $ago = date('Y-m-d H:i:s', strtotime('-1 day 12:10'));
        $eid = Db::insert('errands', [
            'school_id' => $sid, 'user_id' => $u['s2'], 'type' => 'errand', 'title' => '一食堂带份煲仔饭', 'pickup_addr' => '一食堂二楼',
            'deliver_addr' => '北区3号楼 415', 'reward' => 600, 'fee' => Ledger::fee(600, 'errand_fee_rate'), 'status' => 'completed',
            'runner_id' => $u['rider'], 'paid_at' => $ago, 'accepted_at' => $ago, 'delivered_at' => $ago, 'completed_at' => $ago, 'created_at' => $ago,
        ]);
        $e = Db::one('SELECT * FROM errands WHERE id = ?', [$eid]);
        Ledger::add('errand', $sid, 'student', (int) $u['rider'], $e['reward'] - $e['fee'], 'errand_reward', '跑腿 · ' . $e['title'], null, $eid);
        Ledger::add('errand', $sid, 'platform', null, (int) $e['fee'], 'errand_fee', '跑腿 · ' . $e['title'], null, $eid);
        Db::run("UPDATE ledger SET created_at = ? WHERE source = 'errand' AND ref_id = ?", [$ago, $eid]);

        // 演示学生已接单、待送达拍照的代取快递
        Db::insert('errands', [
            'school_id' => $sid, 'user_id' => $u['s3'], 'type' => 'express', 'title' => '顺丰小件送南区2号楼', 'pickup_addr' => '顺丰服务点',
            'express_station' => '顺丰服务点', 'express_code' => 'SF 5-1-2207', 'size' => 'small', 'deliver_addr' => '南区2号楼 218',
            'reward' => 300, 'fee' => Ledger::fee(300, 'errand_fee_rate'), 'status' => 'accepted', 'runner_id' => $u['student'],
            'paid_at' => now(), 'accepted_at' => now(),
        ]);

        // 二手：一笔已确认收货（平台抽 2%），一笔演示学生作为买家待确认收货
        $item = static fn(int $uid, string $title, string $cat, int $price, int $orig, string $status) => Db::insert('market_items', [
            'school_id' => $sid, 'user_id' => $uid, 'title' => $title, 'category' => $cat, 'description' => '当面验货，担保交易',
            'price' => $price, 'original_price' => $orig, 'item_condition' => '9成新', 'contact' => '微信 demo-' . $uid, 'status' => $status,
        ]);
        $sold = $item($u['s3'], '计算机二级考试教材', 'book', 1200, 4500, 'sold');
        $fee = Ledger::fee(1200, 'market_fee_rate');
        $oid = Db::insert('market_orders', [
            'order_no' => 'M' . date('YmdHis', strtotime('-2 day')) . '00001', 'school_id' => $sid, 'item_id' => $sold, 'buyer_id' => $u['s2'],
            'seller_id' => $u['s3'], 'title' => '计算机二级考试教材', 'price' => 1200, 'fee' => $fee, 'status' => 'completed',
            'created_at' => date('Y-m-d H:i:s', strtotime('-2 day')), 'completed_at' => date('Y-m-d H:i:s', strtotime('-2 day')),
        ]);
        Ledger::add('market', $sid, 'student', (int) $u['s3'], 1200 - $fee, 'market_sale', '二手 · 计算机二级考试教材', null, $oid);
        Ledger::add('market', $sid, 'platform', null, $fee, 'market_fee', '二手 · 计算机二级考试教材', null, $oid);

        $reserved = $item($u['s2'], '罗技无线鼠标 M330', 'digital', 3500, 9900, 'reserved');
        Db::insert('market_orders', [
            'order_no' => 'M' . date('YmdHis') . '00002', 'school_id' => $sid, 'item_id' => $reserved, 'buyer_id' => $u['student'],
            'seller_id' => $u['s2'], 'title' => '罗技无线鼠标 M330', 'price' => 3500, 'fee' => Ledger::fee(3500, 'market_fee_rate'), 'status' => 'paid',
        ]);

        // 演示学生已领取一张外卖券、一张新人券
        $student = Db::one('SELECT * FROM users WHERE id = ?', [$u['student']]);
        foreach (Db::all("SELECT id FROM coupon_templates WHERE title IN ('外卖立减券','新人专享券')") as $t) {
            CouponService::claim($student, (int) $t['id']);
        }
    }

    /** 演示订单：一张已核销（产生佣金流水）、一张待核销、一单外卖待配送 */
    private static function orders(int $sid, array $u, array $m): void
    {
        $student = Db::one('SELECT * FROM users WHERE id = ?', [$u['student']]);
        $s2 = Db::one('SELECT * FROM users WHERE id = ?', [$u['s2']]);
        $merchant = Db::one('SELECT * FROM merchants WHERE id = ?', [$m['hmj']['id']]);

        $done = OrderService::pay($s2, (int) OrderService::create($s2, $m['hmj']['deals'][0], 2)['id']);
        foreach ($done['coupons'] as $c) {
            OrderService::verifyCoupon($merchant, $c['code']);
        }
        OrderService::pay($student, (int) OrderService::create($student, $m['hmj']['deals'][0], 1)['id']);
        OrderService::pay($student, (int) OrderService::create($student, $m['tea']['deals'][0], 1)['id']);

        // 外卖：组成下一个送餐批次（多商家、多取餐点），部分已出餐，供骑手端演示
        $s3 = Db::one('SELECT * FROM users WHERE id = ?', [$u['s3']]);
        $mlt = Db::one('SELECT * FROM merchants WHERE id = ?', [$m['mlt']['id']]);
        $slot = self::nextSlot($sid);
        $take = static fn(array $user, int $dealId, string $point, int $qty = 1) =>
            OrderService::pay($user, (int) OrderService::create($user, $dealId, $qty, ['delivery_slot' => $slot, 'delivery_point' => $point])['id']);
        $o1 = $take($s2, $m['hmj']['deals'][1], '北区宿舍楼下');
        $o2 = $take($s3, $m['hmj']['deals'][2], '东门取餐柜');
        $o3 = $take($s3, $m['mlt']['deals'][1], '东门取餐柜', 2);
        $take($student, $m['mlt']['deals'][1], '图书馆门口');
        OrderService::markReady($merchant, (int) $o1['id']);
        OrderService::markReady($merchant, (int) $o2['id']);
        OrderService::markReady($mlt, (int) $o3['id']);

        // 一单已完成的外卖（骑手已有收入记录）
        $rider = Db::one('SELECT * FROM users WHERE id = ?', [$u['rider']]);
        $done = $take($s2, $m['mlt']['deals'][1], '北区宿舍楼下');
        OrderService::markReady($mlt, (int) $done['id']);
        OrderService::pickup($rider, [$done['id']]);
        OrderService::deliver($rider, [$done['id']]);

        Db::insert('ai_logs', ['user_id' => $u['s2'], 'school_id' => $sid, 'question' => '学校有没有游泳馆？', 'answer' => '（未命中）', 'source' => 'none']);
    }

    /** 过去 6 天的历史成交（走真实下单→支付→核销流程，再把时间回拨），让看板趋势有数据 */
    private static function history(array $u, array $m): void
    {
        $buyers = array_map(static fn($k) => Db::one('SELECT * FROM users WHERE id = ?', [$u[$k]]), ['student', 's2', 's3']);
        $deals = [];
        foreach ($m as $info) {
            foreach ($info['deals'] as $did) {
                $d = Db::one('SELECT id, merchant_id, type FROM deals WHERE id = ?', [$did]);
                if ($d['type'] === 'groupbuy') {
                    $deals[] = $d;
                }
            }
        }
        $merchants = [];
        $couponDays = [];
        $perDay = [6 => 5, 5 => 8, 4 => 7, 3 => 11, 2 => 9, 1 => 14];
        $seq = 0;
        foreach ($perDay as $daysAgo => $n) {
            for ($i = 0; $i < $n; $i++, $seq++) {
                $buyer = $buyers[$seq % 3];
                $deal = $deals[($seq * 7 + $daysAgo) % count($deals)];
                $merchants[$deal['merchant_id']] ??= Db::one('SELECT * FROM merchants WHERE id = ?', [$deal['merchant_id']]);
                $couponId = 0;
                if ($seq % 5 === 2 && empty($couponDays[$buyer['id']][$daysAgo])) {
                    $couponDays[$buyer['id']][$daysAgo] = true;
                    // 部分历史订单使用了福利群优惠券（平台补贴）
                    $tpl = Db::one("SELECT * FROM coupon_templates WHERE scope = 'groupbuy'");
                    $couponId = Db::insert('user_coupons', [
                        'template_id' => $tpl['id'], 'user_id' => $buyer['id'], 'title' => $tpl['title'], 'amount' => $tpl['amount'], 'threshold' => 0,
                        'scope' => 'groupbuy', 'claim_date' => date('Y-m-d', strtotime("-$daysAgo day")), 'expires_at' => date('Y-m-d 23:59:59'),
                    ]);
                }
                $order = OrderService::pay($buyer, (int) OrderService::create($buyer, (int) $deal['id'], 1 + ($seq % 4 === 0 ? 1 : 0), [], $couponId)['id']);
                foreach ($order['coupons'] as $c) {
                    OrderService::verifyCoupon($merchants[$deal['merchant_id']], $c['code']);
                }
                $ts = date('Y-m-d', strtotime("-$daysAgo day")) . sprintf(' %02d:%02d:00', 11 + ($seq % 10), ($seq * 13) % 60);
                Db::run('UPDATE orders SET created_at = ?, paid_at = ?, completed_at = ? WHERE id = ?', [$ts, $ts, $ts, $order['id']]);
                Db::run('UPDATE coupons SET used_at = ? WHERE order_id = ?', [$ts, $order['id']]);
                Db::run('UPDATE ledger SET created_at = ? WHERE order_id = ?', [$ts, $order['id']]);
            }
        }
    }

    /** 下一个仍可下单的送餐时间点（演示数据用） */
    private static function nextSlot(int $sid): string
    {
        $slots = json_decode((string) Db::value('SELECT delivery_slots FROM schools WHERE id = ?', [$sid]), true);
        $cutoff = (int) Settings::get('takeout_cutoff_minutes');
        foreach ($slots as $s) {
            if (time() + $cutoff * 60 <= strtotime(date('Y-m-d') . ' ' . $s)) {
                return $s;
            }
        }
        return $slots[0]; // 今天都已截单，则为明天第一个批次
    }
}
