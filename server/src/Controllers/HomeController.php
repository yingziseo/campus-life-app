<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, Request};
use App\Services\{CouponService, PromotionService, Settings};

final class HomeController
{
    public function index(Request $req): array
    {
        $sid = Auth::schoolId($req);
        return [
            'banners' => [
                ['title' => '新生开学季', 'desc' => '周边美食每单再省 3 元起', 'link' => '#/local'],
                ['title' => '代取快递', 'desc' => '下课顺路帮带，2 元起', 'link' => '#/errands?type=express'],
            ],
            'coupons' => array_slice(CouponService::today($req->user), 0, 3),
            'rec_categories' => PromotionService::CATEGORIES,
            'stats' => [
                'open_errands' => (int) Db::value("SELECT COUNT(*) FROM errands WHERE school_id = ? AND status = 'open'", [$sid]),
                'market_items' => (int) Db::value("SELECT COUNT(*) FROM market_items WHERE school_id = ? AND status = 'on_sale'", [$sid]),
                'merchants'    => (int) Db::value("SELECT COUNT(*) FROM merchants WHERE school_id = ? AND status = 'approved'", [$sid]),
            ],
            // 首页推荐：各行业推荐位(广告)置顶，其余按销量
            'hot_deals' => LocalController::publicDeals(PromotionService::recommend($sid, '', 6)),
            'treehole' => Db::all(
                "SELECT id, anon_name, content, tag, like_count, comment_count, created_at FROM treehole_posts
                 WHERE school_id = ? AND status = 'normal' ORDER BY like_count DESC, id DESC LIMIT 2",
                [$sid]
            ),
        ];
    }

    /** 前端公共配置：比价文案、抽成费率、福利群（公开） */
    public function config(Request $req): array
    {
        return [
            'price_slogan'     => Settings::get('price_slogan'),
            'compare_label'    => Settings::get('compare_label'),
            'errand_fee_rate'  => (float) Settings::get('errand_fee_rate'),
            'market_fee_rate'  => (float) Settings::get('market_fee_rate'),
            'delivery_fee'     => (int) Settings::get('delivery_fee'),
            'rider_commission' => (int) Settings::get('rider_commission'),
            'manager_rate'     => (float) Settings::get('manager_rate'),
            'ad_prices'        => Settings::get('ad_prices'),
            'group'            => ['name' => Settings::get('group_name'), 'desc' => Settings::get('group_desc'), 'qr' => Settings::get('group_qr')],
        ];
    }
}
