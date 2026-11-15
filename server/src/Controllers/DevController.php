<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, HttpException, Request};

/** 开发辅助：重置演示数据（仅 dev 环境） */
final class DevController
{
    public function reset(Request $req): array
    {
        self::guard();
        require_once APP_ROOT . '/database/Seeder.php';
        \Seeder::run(true);
        return ['message' => '演示数据已重置'];
    }

    /** 演示辅助：商家查看本店待核销券码（正式环境禁用） */
    public function coupons(Request $req): array
    {
        self::guard();
        return Db::all(
            "SELECT c.code, o.title, u.nickname FROM coupons c JOIN orders o ON o.id = c.order_id JOIN users u ON u.id = o.user_id
             JOIN merchants m ON m.id = o.merchant_id WHERE m.owner_user_id = ? AND c.status = 'unused' AND o.status = 'paid' ORDER BY c.id DESC LIMIT 10",
            [$req->user['id']]
        );
    }

    private static function guard(): void
    {
        if (config('env') !== 'dev') {
            throw new HttpException('仅开发环境可用', 403);
        }
    }
}
