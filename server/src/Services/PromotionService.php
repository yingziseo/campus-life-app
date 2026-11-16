<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\{Db, HttpException};

/**
 * 首页推荐位：每个学校、每个行业前 3 位由商家购买（手动置顶），其余商品按销量排序。
 * 按《互联网广告管理办法》，付费置顶内容在前台须标注"广告"。
 */
final class PromotionService
{
    public const CATEGORIES = [
        'food' => '美食', 'takeout' => '校园外卖', 'netcafe' => '网吧', 'billiards' => '台球',
        'homestay' => '民宿', 'ktv' => 'KTV', 'other' => '其他',
    ];
    public const POSITIONS = 3;

    /** 商品所属行业：外卖商品单列"校园外卖"，其余按商家类目 */
    public static function categoryOf(array $deal, string $merchantCategory): string
    {
        return $deal['type'] === 'takeout' ? 'takeout' : $merchantCategory;
    }

    /** SQL 片段：今天生效中的推广位 */
    public static function activeJoin(string $dealAlias = 'd'): string
    {
        $today = date('Y-m-d');
        return "LEFT JOIN promotions p ON p.deal_id = $dealAlias.id AND p.status = 'active' AND p.start_date <= '$today' AND p.end_date >= '$today'";
    }

    /**
     * 推荐商品：推广位(按位置) 优先，其余按销量。
     * @param string $category '' = 全部行业（各行业的推广位都会置顶）
     */
    public static function recommend(int $schoolId, string $category = '', int $limit = 6): array
    {
        $catExpr = "CASE WHEN d.type = 'takeout' THEN 'takeout' ELSE m.category END";
        $where = ["m.school_id = ?", "m.status = 'approved'", "d.status = 'on'"];
        $params = [$schoolId];
        if ($category !== '' && isset(self::CATEGORIES[$category])) {
            $where[] = "$catExpr = ?";
            $params[] = $category;
        }
        $rows = Db::all(
            "SELECT d.*, m.name AS merchant_name, m.category, m.cover AS merchant_cover, $catExpr AS rec_category,
                    CASE WHEN p.id IS NOT NULL AND p.category = $catExpr THEN p.position END AS ad_position
             FROM deals d JOIN merchants m ON m.id = d.merchant_id " . self::activeJoin() . "
             WHERE " . implode(' AND ', $where) . "
             ORDER BY ad_position IS NULL, ad_position, d.sold DESC, d.id LIMIT " . max(1, min(50, $limit)),
            $params
        );
        return $rows;
    }

    /** 某行业各推荐位的占用情况（商家购买页 / 后台排期） */
    public static function slots(int $schoolId, string $category): array
    {
        $today = date('Y-m-d');
        $out = [];
        for ($pos = 1; $pos <= self::POSITIONS; $pos++) {
            $booked = Db::all(
                "SELECT p.*, m.name AS merchant_name, d.title AS deal_title FROM promotions p
                 JOIN merchants m ON m.id = p.merchant_id JOIN deals d ON d.id = p.deal_id
                 WHERE p.school_id = ? AND p.category = ? AND p.position = ? AND p.status IN ('pending','active') AND p.end_date >= ?
                 ORDER BY p.start_date",
                [$schoolId, $category, $pos, $today]
            );
            $current = null;
            foreach ($booked as $b) {
                if ($b['status'] === 'active' && $b['start_date'] <= $today) {
                    $current = $b;
                }
            }
            $last = $booked ? max(array_column($booked, 'end_date')) : null;
            $out[] = [
                'position'       => $pos,
                'price_per_day'  => self::price($pos),
                'current'        => $current,
                'booked'         => $booked,
                'available_from' => $last && $last >= $today ? date('Y-m-d', strtotime($last . ' +1 day')) : $today,
            ];
        }
        return $out;
    }

    public static function price(int $position): int
    {
        $prices = (array) Settings::get('ad_prices');
        return (int) ($prices[$position - 1] ?? end($prices) ?: 0);
    }

    /**
     * 新建推广（商家自助购买 → 待平台审核；后台直接排期 → 立即生效）
     */
    public static function create(array $merchant, int $dealId, int $position, int $days, string $startDate, string $source = 'merchant'): array
    {
        $deal = Db::one("SELECT * FROM deals WHERE id = ? AND merchant_id = ?", [$dealId, $merchant['id']]);
        if (!$deal || $deal['status'] !== 'on') {
            throw new HttpException('请选择在售的商品', 422);
        }
        if ($merchant['status'] !== 'approved') {
            throw new HttpException('商家审核通过后才能购买推荐位', 422);
        }
        if ($position < 1 || $position > self::POSITIONS) {
            throw new HttpException('推荐位只有第 1~3 位', 422);
        }
        if ($days < 1 || $days > 30) {
            throw new HttpException('投放天数需在 1~30 天之间', 422);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || $startDate < date('Y-m-d')) {
            throw new HttpException('开始日期不能早于今天', 422);
        }
        $category = self::categoryOf($deal, $merchant['category']);
        $endDate = date('Y-m-d', strtotime("$startDate +" . ($days - 1) . ' day'));
        $conflict = Db::one(
            "SELECT start_date, end_date FROM promotions WHERE school_id = ? AND category = ? AND position = ? AND status IN ('pending','active')
               AND start_date <= ? AND end_date >= ?",
            [$merchant['school_id'], $category, $position, $endDate, $startDate]
        );
        if ($conflict) {
            throw new HttpException("该推荐位 {$conflict['start_date']} ~ {$conflict['end_date']} 已被预订，请换个位置或日期", 422);
        }
        if (Db::value("SELECT 1 FROM promotions WHERE deal_id = ? AND status IN ('pending','active') AND start_date <= ? AND end_date >= ?", [$deal['id'], $endDate, $startDate])) {
            throw new HttpException('该商品在这段时间已有推广，不能重复购买', 422);
        }
        $fee = self::price($position) * $days;
        return Db::transaction(static function () use ($merchant, $deal, $category, $position, $startDate, $endDate, $days, $fee, $source) {
            $id = Db::insert('promotions', [
                'school_id' => $merchant['school_id'], 'merchant_id' => $merchant['id'], 'deal_id' => $deal['id'], 'category' => $category,
                'position' => $position, 'start_date' => $startDate, 'end_date' => $endDate, 'days' => $days, 'fee' => $fee,
                'status' => $source === 'admin' ? 'active' : 'pending', 'source' => $source,
            ]);
            if ($source === 'admin') {
                self::charge($id);
            }
            return self::find($id);
        });
    }

    /** 审核通过：推广生效，广告费计入平台收入 */
    public static function approve(int $id): array
    {
        $p = self::find($id);
        if (!$p || $p['status'] !== 'pending') {
            throw new HttpException('当前状态不可审核', 422);
        }
        Db::transaction(static function () use ($id) {
            Db::update('promotions', ['status' => 'active'], 'id = :id', ['id' => $id]);
            self::charge($id);
        });
        return self::find($id);
    }

    public static function reject(int $id): array
    {
        $p = self::find($id);
        if (!$p || $p['status'] !== 'pending') {
            throw new HttpException('当前状态不可驳回', 422);
        }
        Db::update('promotions', ['status' => 'rejected'], 'id = :id', ['id' => $id]);
        return self::find($id);
    }

    /** 提前下线（不退款，原型简化） */
    public static function end(int $id): array
    {
        Db::run("UPDATE promotions SET status = 'ended', end_date = MIN(end_date, ?) WHERE id = ? AND status = 'active'", [date('Y-m-d'), $id]);
        return self::find($id);
    }

    private static function charge(int $id): void
    {
        $p = self::find($id);
        Ledger::add('promotion', (int) $p['school_id'], 'platform', null, (int) $p['fee'], 'ad',
            sprintf('%s · %s第%d位 %d天', $p['merchant_name'], self::CATEGORIES[$p['category']] ?? '', $p['position'], $p['days']), null, $id);
    }

    public static function find(int $id): ?array
    {
        return Db::one(
            'SELECT p.*, m.name AS merchant_name, d.title AS deal_title FROM promotions p JOIN merchants m ON m.id = p.merchant_id JOIN deals d ON d.id = p.deal_id WHERE p.id = ?',
            [$id]
        );
    }
}
