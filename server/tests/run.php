<?php
/**
 * 测试入口：php tests/run.php
 *  1. 定价引擎单元测试（使用临时数据库）
 *  2. 启动临时内置服务器，跑通三端核心业务流程（接口集成测试）
 */
declare(strict_types=1);

$tmpDb = sys_get_temp_dir() . '/campus-test-' . getmypid() . '.db';
putenv('DB_PATH=' . $tmpDb);
putenv('APP_ENV=dev');
require dirname(__DIR__) . '/src/bootstrap.php';
require APP_ROOT . '/database/Seeder.php';

use App\Core\HttpException;
use App\Services\PricingService;

$passed = 0;
$failed = [];
function check(string $name, bool $cond, string $detail = ''): void
{
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "  \033[32m✓\033[0m $name\n";
    } else {
        $failed[] = $name;
        echo "  \033[31m✗ $name\033[0m $detail\n";
    }
}
function throws(callable $fn, string $contains = ''): bool
{
    try {
        $fn();
    } catch (HttpException $e) {
        return $contains === '' || str_contains($e->getMessage(), $contains);
    }
    return false;
}

Seeder::run(true);

echo "\n[定价引擎]\n";
$q = PricingService::quote(['pricing_mode' => 'voucher', 'competitor_price' => 1500, 'merchant_settle' => 1050, 'voucher_face' => 200, 'voucher_cost' => 100]);
check('代金券模式：到店标价 12.5', $q['list_price'] === 1250);
check('代金券模式：用户实付 11.5', $q['sale_price'] === 1150);
check('代金券模式：差价 1 元，经理/平台各 0.5', $q['platform_gross'] === 100 && $q['manager_commission'] === 50 && $q['platform_margin'] === 50);
check('代金券模式：用户比竞品省 3.5', $q['user_saving'] === 350);
check('商家到手比例 70%', abs($q['merchant_ratio'] - 0.7) < 1e-9);

$q = PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1500, 'merchant_settle' => 950, 'sale_price' => 1200]);
check('平台定价模式：差价 2.5 元', $q['platform_gross'] === 250 && $q['manager_commission'] === 125);
check('平台定价模式：划线价为竞品价', $q['list_price'] === 1500);

$q = PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1500, 'merchant_settle' => 950, 'sale_price' => 1201], false);
check('无客户经理时差价全归平台', $q['manager_commission'] === 0 && $q['platform_margin'] === 251);
$q = PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1500, 'merchant_settle' => 950, 'sale_price' => 1001]);
check('奇数分佣金向下取整', $q['manager_commission'] === 25 && $q['platform_margin'] === 26);

check('售价不够便宜时拒绝', throws(fn() => PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1500, 'merchant_settle' => 950, 'sale_price' => 1450]), '至少便宜'));
check('售价低于商家到手价时拒绝', throws(fn() => PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1500, 'merchant_settle' => 950, 'sale_price' => 900])));
check('券售价 ≥ 面额时拒绝', throws(fn() => PricingService::quote(['pricing_mode' => 'voucher', 'competitor_price' => 1500, 'merchant_settle' => 1050, 'voucher_face' => 200, 'voucher_cost' => 200])));
check('到手价 ≥ 竞品价时拒绝', throws(fn() => PricingService::quote(['pricing_mode' => 'fixed', 'competitor_price' => 1000, 'merchant_settle' => 1000, 'sale_price' => 800])));
check('yuan() 格式化', PricingService::yuan(1150) === '11.5' && PricingService::yuan(200) === '2' && PricingService::yuan(5) === '0.05');

// ---------- 接口集成测试 ----------
echo "\n[接口集成]\n";
setlocale(LC_CTYPE, "C.UTF-8"); // escapeshellarg 在 C locale 下会丢弃中文路径字符
$port = random_int(18100, 18900);
$cmd = sprintf('DB_PATH=%s APP_ENV=dev php -S 127.0.0.1:%d -t %s %s > /dev/null 2>&1 & echo $!',
    escapeshellarg($tmpDb), $port, escapeshellarg(dirname(APP_ROOT) . '/web'), escapeshellarg(APP_ROOT . '/router.php'));
$pid = (int) shell_exec($cmd);
register_shutdown_function(static function () use ($pid, $tmpDb) {
    if ($pid) exec('kill ' . $pid);
    foreach ([$tmpDb, "$tmpDb-wal", "$tmpDb-shm"] as $f) @unlink($f);
});
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);

function api(string $method, string $path, array $body = [], ?string $token = null): array
{
    global $port;
    $ch = curl_init("http://127.0.0.1:$port$path");
    $headers = ['Content-Type: application/json'];
    if ($token) $headers[] = "Authorization: Bearer $token";
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers]);
    if ($method === 'POST') curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $res = json_decode((string) curl_exec($ch), true) ?? ['code' => -1, 'msg' => 'invalid json'];
    curl_close($ch);
    return $res;
}
$ok = static fn(array $r) => ($r['code'] ?? -1) === 0;

$stu = api('POST', '/api/auth/demo', ['role' => 'student'])['data']['token'] ?? null;
$mer = api('POST', '/api/auth/demo', ['role' => 'merchant'])['data']['token'] ?? null;
$mgr = api('POST', '/api/auth/demo', ['role' => 'manager'])['data']['token'] ?? null;
check('三端演示账号登录', $stu && $mer && $mgr);
check('未登录访问受保护接口返回 401', api('GET', '/api/home')['code'] === 401);
check('学生访问商家接口返回 403', api('GET', '/api/merchant/dashboard', [], $stu)['code'] === 403);
check('学校列表含试点学校', ($r = api('GET', '/api/schools')) && $ok($r) && $r['data'][0]['name'] === '青岛理工职业学院' && $r['data'][0]['is_pilot'] == 1);
check('首页聚合数据', $ok($r = api('GET', '/api/home', [], $stu)) && count($r['data']['hot_deals']) > 0);

// 新用户登录 → 选学校
$new = api('POST', '/api/auth/login', ['phone' => '13900001111', 'code' => '1234'])['data']['token'] ?? null;
check('验证码登录自动注册', (bool) $new);
check('未选学校时提示 412', api('GET', '/api/home', [], $new)['code'] === 412);
check('不能选择未开通学校', api('POST', '/api/auth/school', ['school_id' => 2], $new)['code'] === 422);
check('选择试点学校', $ok(api('POST', '/api/auth/school', ['school_id' => 1], $new)));

// 跑腿
$r = api('POST', '/api/errands', ['type' => 'express', 'title' => '取个快递', 'deliver_addr' => '5号楼', 'express_station' => '菜鸟', 'express_code' => '1-2-3', 'reward' => 3], $new);
check('发布代取快递', $ok($r) && $r['data']['reward'] === 300);
$eid = $r['data']['id'];
check('非接单人看不到取件码', api('GET', "/api/errands/$eid", [], $stu)['data']['express_code'] === '接单后可见');
check('不能接自己的单', api('POST', "/api/errands/$eid/accept", [], $new)['code'] === 422);
check('接单后可见取件码', $ok(api('POST', "/api/errands/$eid/accept", [], $stu)) && api('GET', "/api/errands/$eid", [], $stu)['data']['express_code'] === '1-2-3');
check('送达 → 确认完成', $ok(api('POST', "/api/errands/$eid/deliver", [], $stu)) && api('POST', "/api/errands/$eid/complete", [], $new)['data']['status'] === 'completed');

// 二手 & 树洞 & AI
check('发布二手', $ok(api('POST', '/api/market', ['title' => '台灯', 'price' => '25.5', 'category' => 'digital', 'contact' => 'wx'], $new)));
check('二手列表金额为分', api('GET', '/api/market', [], $stu)['data'][0]['price'] === 2550);
$r = api('POST', '/api/treehole', ['content' => '今天食堂的红烧肉绝了', 'tag' => '日常'], $new);
check('树洞发帖且不暴露 user_id', $ok($r) && !isset($r['data']['user_id']));
$pid = $r['data']['id'];
check('树洞点赞/取消', api('POST', "/api/treehole/$pid/like", [], $stu)['data']['liked'] === true && api('POST', "/api/treehole/$pid/like", [], $stu)['data']['liked'] === false);
check('楼主评论显示洞主', api('POST', "/api/treehole/$pid/comments", ['content' => '真的'], $new)['data']['anon_name'] === '洞主');
check('敏感词拦截', api('POST', '/api/treehole', ['content' => '加我微信号'], $new)['code'] === 422);
check('AI 问答 FAQ 兜底命中', ($r = api('POST', '/api/ai/ask', ['question' => '校园卡丢了怎么办'], $stu)) && $r['data']['source'] === 'faq');

// 本地生活：团购下单 → 支付 → 核销 → 分账
$detail = api('GET', '/api/local/merchants/1', [], $stu)['data'];
$deal = $detail['deals'][0];
check('用户侧不暴露商家结算价', !isset($deal['merchant_settle']) && !isset($deal['voucher_cost']));
check('代金券标签', ($deal['voucher_label'] ?? '') === '1元抵2元');
$order = api('POST', '/api/orders', ['deal_id' => $deal['id'], 'quantity' => 2], $new)['data'];
check('团购下单金额 23 元、省 7 元', $order['total_amount'] === 2300 && $order['saved'] === 700 && !isset($order['platform_net']));
$order = api('POST', "/api/orders/{$order['id']}/pay", [], $new)['data'];
check('支付后生成 2 张券码', count($order['coupons']) === 2);
$before = api('GET', '/api/manager/dashboard', [], $mgr)['data']['commission_total'];
check('核销第 1 张', $ok(api('POST', '/api/merchant/verify', ['code' => $order['coupons'][0]['code']], $mer)));
check('重复核销被拒绝', api('POST', '/api/merchant/verify', ['code' => $order['coupons'][0]['code']], $mer)['code'] === 422);
$r = api('POST', '/api/merchant/verify', ['code' => $order['coupons'][1]['code']], $mer);
check('全部核销后订单完成', $ok($r) && $r['data']['order']['status'] === 'completed');
check('客户经理佣金 +1 元', api('GET', '/api/manager/dashboard', [], $mgr)['data']['commission_total'] === $before + 100);
check('有核销记录时不可退款', api('POST', "/api/orders/{$order['id']}/cancel", [], $new)['code'] === 422);

// 退款
$o2 = api('POST', '/api/orders', ['deal_id' => $deal['id'], 'quantity' => 1], $new)['data'];
api('POST', "/api/orders/{$o2['id']}/pay", [], $new);
check('未核销订单可退款', api('POST', "/api/orders/{$o2['id']}/cancel", [], $new)['data']['status'] === 'refunded');

// 外卖：固定时间点
$take = array_values(array_filter($detail['deals'], fn($d) => $d['type'] === 'takeout'))[0];
check('外卖未选时间点被拒绝', api('POST', '/api/orders', ['deal_id' => $take['id'], 'quantity' => 1], $new)['code'] === 422);
$o3 = api('POST', '/api/orders', ['deal_id' => $take['id'], 'quantity' => 1, 'delivery_slot' => '11:30', 'delivery_point' => '东门取餐柜'], $new)['data'];
check('外卖含配送费 1.5', $o3['delivery_fee'] === 150 && $o3['total_amount'] === 1350);
api('POST', "/api/orders/{$o3['id']}/pay", [], $new);
$rider = api('POST', '/api/auth/demo', ['role' => 'rider'])['data']['token'];
check('未出餐时骑手不能取餐', api('POST', '/api/rider/pickup', ['order_ids' => [$o3['id']]], $rider)['code'] === 422);
check('商家出餐 → 待取餐', api('POST', "/api/merchant/orders/{$o3['id']}/advance", [], $mer)['data']['status'] === 'ready');
check('重复出餐被拒绝', api('POST', "/api/merchant/orders/{$o3['id']}/advance", [], $mer)['code'] === 422);
check('已出餐不可退款', api('POST', "/api/orders/{$o3['id']}/cancel", [], $new)['code'] === 422);
check('非骑手不能访问骑手端', api('GET', '/api/rider/dashboard', [], $stu)['code'] === 403);
$o3d = api('GET', "/api/orders/{$o3['id']}", [], $new)['data'];
check('骑手查看批次取餐清单', ($r = api('GET', '/api/rider/batch?date=' . $o3d['delivery_date'] . '&slot=11:30', [], $rider)) && $ok($r) && count($r['data']['pickups']) >= 1);
check('骑手取餐', api('POST', '/api/rider/pickup', ['order_ids' => [$o3['id']]], $rider)['data']['picked'] === 1);
check('取餐后可见完整手机号', str_contains(json_encode(api('GET', '/api/rider/batch?date=' . $o3d['delivery_date'] . '&slot=11:30', [], $rider)['data']['drops']), '"mine":true'));
$before = api('GET', '/api/rider/dashboard', [], $rider)['data']['total_earning'];
check('骑手送达并获得提成 1 元', api('POST', '/api/rider/deliver', ['order_ids' => [$o3['id']]], $rider)['data']['earning'] === 100
    && api('GET', '/api/rider/dashboard', [], $rider)['data']['total_earning'] === $before + 100);
check('送达后订单完成', api('GET', "/api/orders/{$o3['id']}", [], $new)['data']['status'] === 'completed');
check('学生申请加入外卖团队', api('POST', '/api/rider/apply', [], $new)['data']['rider_status'] === 'pending');

// 商家定价 & 上架
$r = api('POST', '/api/merchant/quote', ['pricing_mode' => 'voucher', 'competitor_price' => 15, 'merchant_settle' => 10.5, 'voucher_face' => 2, 'voucher_cost' => 1], $mer);
check('商家定价试算', $ok($r) && $r['data']['sale_price'] === 1150);
$r = api('POST', '/api/merchant/deals', ['type' => 'groupbuy', 'title' => '测试套餐', 'pricing_mode' => 'fixed', 'competitor_price' => 20, 'merchant_settle' => 13, 'sale_price' => 16], $mer);
check('商家上架新商品', $ok($r) && $r['data']['sale_price'] === 1600);
check('不合规定价不能上架', api('POST', '/api/merchant/deals', ['type' => 'groupbuy', 'title' => 'x', 'pricing_mode' => 'fixed', 'competitor_price' => 20, 'merchant_settle' => 13, 'sale_price' => 19.5], $mer)['code'] === 422);

// 商家入驻 → 客户经理审核
$boss = api('POST', '/api/auth/login', ['phone' => '13900002222', 'code' => '1234'])['data']['token'];
api('POST', '/api/auth/school', ['school_id' => 1], $boss);
check('错误邀请码被拒绝', api('POST', '/api/merchant/apply', ['name' => '新店', 'category' => 'food', 'address' => '东门', 'phone' => '123', 'invite_code' => 'XXXX'], $boss)['code'] === 422);
$r = api('POST', '/api/merchant/apply', ['name' => '新店', 'category' => 'food', 'address' => '东门', 'phone' => '123', 'invite_code' => 'qd8801'], $boss);
check('邀请码入驻并绑定客户经理', $ok($r) && $r['data']['status'] === 'pending' && $r['data']['has_manager']);
$newMid = $r['data']['id'];
check('客户经理审核通过', api('POST', "/api/manager/merchants/$newMid/approve", [], $mgr)['data']['status'] === 'approved');
check('重复审核被拒绝', api('POST', "/api/manager/merchants/$newMid/approve", [], $mgr)['code'] === 422);
check('佣金明细', count(api('GET', '/api/manager/commissions', [], $mgr)['data']) > 0);

// 树洞举报
$p2 = api('POST', '/api/treehole', ['content' => '测试举报帖'], $new)['data']['id'];
check('不能举报自己', api('POST', "/api/treehole/$p2/report", ['reason' => '其他'], $new)['code'] === 422);
check('举报成功', $ok(api('POST', "/api/treehole/$p2/report", ['reason' => '广告引流'], $stu)));
check('重复举报被拒绝', api('POST', "/api/treehole/$p2/report", ['reason' => '其他'], $stu)['code'] === 422);
api('POST', "/api/treehole/$p2/report", ['reason' => '其他'], $boss);
api('POST', "/api/treehole/$p2/report", ['reason' => '其他'], $rider);
check('举报 3 次自动隐藏', api('GET', "/api/treehole/$p2/comments", [], $stu)['code'] === 404);

// 图片上传
$png = sys_get_temp_dir() . '/campus-upload-' . getmypid() . '.png';
file_put_contents($png, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
$up = static function (string $file, string $mime) use ($port, $new): array {
    $ch = curl_init("http://127.0.0.1:$port/api/upload");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ["Authorization: Bearer $new"],
        CURLOPT_POSTFIELDS => ['file' => new CURLFile($file, $mime)]]);
    $r = json_decode((string) curl_exec($ch), true);
    curl_close($ch);
    return $r;
};
$r = $up($png, 'image/png');
check('上传图片', $ok($r) && preg_match('#^/uploads/\d{6}/[a-f0-9]{24}\.png$#', $r['data']['url']));
$url = $r['data']['url'];
check('图片可访问', str_starts_with((string) @file_get_contents("http://127.0.0.1:$port$url"), "\x89PNG"));
file_put_contents($png . '.txt', '<?php echo 1;');
check('非图片被拒绝', $up($png . '.txt', 'image/png')['code'] === 422);
$item = api('POST', '/api/market', ['title' => '带图', 'price' => 10, 'contact' => 'x', 'images' => [$url, 'http://evil.com/a.png']], $new)['data'];
check('二手图片仅保留本站地址', $item['images'] === [$url]);
@unlink($png); @unlink($png . '.txt');
@unlink(APP_ROOT . $url = str_replace('/uploads', '/storage/uploads', $url));

// 管理后台
$adm = api('POST', '/api/auth/demo', ['role' => 'admin'])['data']['token'];
check('非管理员不能访问后台', api('GET', '/api/admin/dashboard', [], $mgr)['code'] === 403);
$d = api('GET', '/api/admin/dashboard', [], $adm)['data'];
check('后台看板', $d['totals']['orders'] > 0 && count($d['daily']) === 7 && $d['totals']['platform_income'] > 0);
check('后台商品比价抽查含结算价', isset(api('GET', '/api/admin/deals', [], $adm)['data'][0]['merchant_settle']));
$sch = api('POST', '/api/admin/schools', ['name' => '测试学院', 'city' => '青岛', 'status' => 'active', 'delivery_slots' => ['12:00', '25:00', '18:00'], 'delivery_points' => ['南门']], $adm)['data'];
check('后台新增学校并过滤非法时间点', $sch['status'] === 'active' && json_decode($sch['delivery_slots'], true) === ['12:00', '18:00']);
check('新学校出现在学生选校列表', in_array('测试学院', array_column(api('GET', '/api/schools')['data'], 'name'), true));
$u = api('GET', '/api/admin/users?keyword=13900001111', [], $adm)['data'][0];
check('后台审核骑手', api('POST', "/api/admin/users/{$u['id']}", ['rider_status' => 'approved'], $adm)['data']['rider_status'] === 'approved');
$mg = api('POST', "/api/admin/users/{$u['id']}", ['role' => 'manager'], $adm)['data'];
check('设为客户经理自动生成邀请码', $mg['role'] === 'manager' && preg_match('/^QD\d{4}$/', $mg['invite_code']));
check('封禁用户后无法访问', $ok(api('POST', "/api/admin/users/{$u['id']}", ['status' => 'banned'], $adm)) && api('GET', '/api/auth/me', [], $new)['code'] === 401);
check('参数越界被拒绝', api('POST', '/api/admin/settings', ['manager_rate' => 1.5], $adm)['code'] === 422);
check('修改分成比例生效', api('POST', '/api/admin/settings', ['manager_rate' => 0.4], $adm)['data']['manager_rate'] == 0.4
    && api('POST', '/api/merchant/quote', ['pricing_mode' => 'fixed', 'competitor_price' => 15, 'merchant_settle' => 9.5, 'sale_price' => 12], $mer)['data']['manager_commission'] === 100);
api('POST', '/api/admin/settings', ['manager_rate' => 0.5], $adm);
$faq = api('POST', '/api/admin/faqs', ['question' => '游泳馆在哪', 'answer' => '体育馆负一层', 'keywords' => '游泳，泳池'], $adm)['data'];
check('后台新增 FAQ 后问答命中', api('POST', '/api/ai/ask', ['question' => '学校游泳馆开放吗'], $stu)['data']['answer'] === '体育馆负一层');
check('后台恢复被隐藏帖子', api('POST', "/api/admin/treehole/$p2/restore", [], $adm)['data']['status'] === 'normal' && $ok(api('GET', "/api/treehole/$p2/comments", [], $stu)));
check('后台驳回商家', api('POST', "/api/admin/merchants/$newMid/reject", [], $adm)['data']['status'] === 'rejected');
check('后台流水汇总', count(api('GET', '/api/admin/ledger', [], $adm)['data']['summary']) >= 4);

echo "\n" . ($failed ? "\033[31m失败 " . count($failed) . " 项\033[0m，" : "\033[32m全部通过\033[0m，") . "通过 $passed 项\n";
exit($failed ? 1 : 0);
