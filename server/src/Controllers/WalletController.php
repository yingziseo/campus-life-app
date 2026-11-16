<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, Request};

/** 学生钱包：跑腿赏金、二手货款、骑手提成（正式版通过微信支付分账到零钱） */
final class WalletController
{
    private const KINDS = ['errand_reward' => '跑腿赏金', 'market_sale' => '二手货款', 'delivery' => '配送提成'];

    public function index(Request $req): array
    {
        $uid = (int) $req->user['id'];
        $rows = Db::all(
            "SELECT id, kind, amount, remark, created_at FROM ledger WHERE party_type IN ('student','rider') AND party_id = ? ORDER BY id DESC LIMIT 100",
            [$uid]
        );
        $sum = [];
        foreach (Db::all("SELECT kind, SUM(amount) AS amount FROM ledger WHERE party_type IN ('student','rider') AND party_id = ? GROUP BY kind", [$uid]) as $r) {
            $sum[$r['kind']] = (int) $r['amount'];
        }
        return [
            'total'   => array_sum($sum),
            'by_kind' => array_map(static fn($k, $t) => ['kind' => $k, 'title' => $t, 'amount' => $sum[$k] ?? 0], array_keys(self::KINDS), self::KINDS),
            'rows'    => array_map(static fn($r) => $r + ['title' => self::KINDS[$r['kind']] ?? $r['kind']], $rows),
        ];
    }
}
