<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};
use App\Services\{CouponService, Settings};

/** 领券中心（学生）：福利群每日发券、抢券、我的券、下单可用券 */
final class CouponController
{
    public function today(Request $req): array
    {
        Auth::schoolId($req);
        return [
            'templates' => CouponService::today($req->user),
            'group'     => ['name' => Settings::get('group_name'), 'desc' => Settings::get('group_desc'), 'qr' => Settings::get('group_qr')],
        ];
    }

    public function claim(Request $req): array
    {
        Auth::schoolId($req);
        return CouponService::claim($req->user, (int) $req->params['id']);
    }

    public function mine(Request $req): array
    {
        return CouponService::mine($req->user, $req->oneOf('status', ['available', 'used', 'expired'], 'available'));
    }

    /** 下单页可用券：按商品金额与类型筛选 */
    public function usable(Request $req): array
    {
        $deal = Db::one("SELECT type, sale_price FROM deals WHERE id = ? AND status = 'on'", [$req->int('deal_id')]);
        if (!$deal) {
            throw new HttpException('商品不存在', 404);
        }
        $qty = max(1, min(20, $req->int('quantity', 1)));
        return CouponService::usable($req->user, $deal['sale_price'] * $qty, $deal['type']);
    }
}
