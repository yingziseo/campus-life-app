<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{HttpException, Request};

/** 开发辅助：重置演示数据（仅 dev 环境） */
final class DevController
{
    public function reset(Request $req): array
    {
        if (config('env') !== 'dev') {
            throw new HttpException('仅开发环境可用', 403);
        }
        require_once APP_ROOT . '/database/Seeder.php';
        \Seeder::run(true);
        return ['message' => '演示数据已重置'];
    }
}
