<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, Request};

final class HomeController
{
    public function index(Request $req): array
    {
        $sid = Auth::schoolId($req);
        return [
            'banners' => [
                ['title' => '新生开学季', 'desc' => '周边美食比美团再省 3 元起', 'link' => '#/local'],
                ['title' => '代取快递', 'desc' => '下课顺路帮带，2 元起', 'link' => '#/errands?type=express'],
            ],
            'stats' => [
                'open_errands' => (int) Db::value("SELECT COUNT(*) FROM errands WHERE school_id = ? AND status = 'open'", [$sid]),
                'market_items' => (int) Db::value("SELECT COUNT(*) FROM market_items WHERE school_id = ? AND status = 'on_sale'", [$sid]),
                'merchants'    => (int) Db::value("SELECT COUNT(*) FROM merchants WHERE school_id = ? AND status = 'approved'", [$sid]),
            ],
            'hot_deals' => LocalController::publicDeals(Db::all(
                "SELECT d.*, m.name AS merchant_name, m.category FROM deals d JOIN merchants m ON m.id = d.merchant_id
                 WHERE m.school_id = ? AND m.status = 'approved' AND d.status = 'on' ORDER BY d.sold DESC LIMIT 4",
                [$sid]
            )),
            'treehole' => Db::all(
                "SELECT id, anon_name, content, tag, like_count, comment_count, created_at FROM treehole_posts
                 WHERE school_id = ? AND status = 'normal' ORDER BY like_count DESC, id DESC LIMIT 2",
                [$sid]
            ),
        ];
    }
}
