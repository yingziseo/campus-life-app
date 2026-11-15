<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};

/** 周边本地生活（学生视角） */
final class LocalController
{
    public const CATEGORIES = ['food', 'netcafe', 'billiards', 'homestay', 'ktv', 'other'];

    public function merchants(Request $req): array
    {
        $sid = Auth::schoolId($req);
        $where = ["m.school_id = ?", "m.status = 'approved'"];
        $params = [$sid];
        $cat = $req->str('category', 12);
        if ($cat === 'takeout') {
            $where[] = 'm.takeout_enabled = 1';
        } elseif ($cat && in_array($cat, self::CATEGORIES, true)) {
            $where[] = 'm.category = ?';
            $params[] = $cat;
        }
        if ($kw = $req->str('keyword', 30)) {
            $where[] = 'm.name LIKE ?';
            $params[] = "%$kw%";
        }
        $rows = Db::all(
            "SELECT m.id, m.name, m.category, m.address, m.intro, m.distance_m, m.takeout_enabled, m.cover,
                    MIN(d.sale_price) AS min_price,
                    MAX(d.competitor_price - d.sale_price) AS max_saving,
                    COALESCE(SUM(d.sold), 0) AS sold
             FROM merchants m LEFT JOIN deals d ON d.merchant_id = m.id AND d.status = 'on'
             WHERE " . implode(' AND ', $where) . ' GROUP BY m.id ORDER BY sold DESC, m.id',
            $params
        );
        return $rows;
    }

    public function merchant(Request $req): array
    {
        $m = Db::one(
            "SELECT id, school_id, name, category, address, phone, intro, distance_m, takeout_enabled, cover FROM merchants WHERE id = ? AND status = 'approved'",
            [(int) $req->params['id']]
        );
        if (!$m) {
            throw new HttpException('商家不存在', 404);
        }
        $deals = Db::all("SELECT * FROM deals WHERE merchant_id = ? AND status = 'on' ORDER BY type, sold DESC", [$m['id']]);
        $m['deals'] = self::publicDeals($deals);
        return $m;
    }

    public function deal(Request $req): array
    {
        $d = Db::one(
            "SELECT d.*, m.name AS merchant_name, m.address, m.school_id, m.takeout_enabled FROM deals d JOIN merchants m ON m.id = d.merchant_id
             WHERE d.id = ? AND d.status = 'on' AND m.status = 'approved'",
            [(int) $req->params['id']]
        );
        if (!$d) {
            throw new HttpException('商品不存在或已下架', 404);
        }
        $deal = self::publicDeals([$d])[0];
        if ($d['type'] === 'takeout') {
            $deal['delivery'] = (new SchoolController())->config(new Request('GET', '', params: ['id' => $d['school_id']]));
            $deal['delivery_fee'] = (int) \App\Services\Settings::get('delivery_fee');
            $deal['cutoff_minutes'] = (int) \App\Services\Settings::get('takeout_cutoff_minutes');
        }
        return $deal;
    }

    /** 对用户隐藏商家结算价、券成本等商业信息 */
    public static function publicDeals(array $deals): array
    {
        return array_map(static function (array $d): array {
            $out = [
                'id'               => (int) $d['id'],
                'merchant_id'      => (int) $d['merchant_id'],
                'type'             => $d['type'],
                'title'            => $d['title'],
                'description'      => $d['description'],
                'image'            => $d['image'] ?? null,
                'pricing_mode'     => $d['pricing_mode'],
                'competitor_price' => (int) $d['competitor_price'],
                'list_price'       => (int) $d['list_price'],
                'sale_price'       => (int) $d['sale_price'],
                'saving'           => $d['competitor_price'] - $d['sale_price'],
                'sold'             => (int) $d['sold'],
                'stock'            => (int) $d['stock'],
            ];
            if ($d['pricing_mode'] === 'voucher') {
                $out['voucher_label'] = sprintf('%s元抵%s元', \App\Services\PricingService::yuan((int) $d['voucher_cost']), \App\Services\PricingService::yuan((int) $d['voucher_face']));
            }
            foreach (['merchant_name', 'category', 'address'] as $k) {
                if (isset($d[$k])) {
                    $out[$k] = $d[$k];
                }
            }
            return $out;
        }, $deals);
    }
}
