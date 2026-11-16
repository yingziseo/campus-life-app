<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, HttpException, Request};

/** 客户经理端：推广邀请码、绑定商家、佣金明细 */
final class ManagerController
{
    public function dashboard(Request $req): array
    {
        $uid = $req->user['id'];
        $sum = static fn(string $extra = '', array $p = []) => (int) Db::value(
            "SELECT COALESCE(SUM(amount),0) FROM ledger WHERE party_type = 'manager' AND party_id = ? $extra",
            array_merge([$uid], $p)
        );
        $counts = [];
        foreach (Db::all('SELECT status, COUNT(*) AS n FROM merchants WHERE manager_id = ? GROUP BY status', [$uid]) as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }
        return [
            'invite_code'      => $req->user['invite_code'],
            'merchant_counts'  => $counts + ['approved' => 0, 'pending' => 0, 'rejected' => 0],
            'commission_total' => $sum(),
            'commission_today' => $sum('AND date(created_at) = ?', [date('Y-m-d')]),
            'commission_month' => $sum("AND strftime('%Y-%m', created_at) = ?", [date('Y-m')]),
            'order_count'      => (int) Db::value("SELECT COUNT(*) FROM orders WHERE manager_id = ? AND status IN ('paid','ready','delivering','completed')", [$uid]),
            'gmv'              => (int) Db::value("SELECT COALESCE(SUM(goods_amount),0) FROM orders WHERE manager_id = ? AND status IN ('paid','ready','delivering','completed')", [$uid]),
        ];
    }

    public function merchants(Request $req): array
    {
        return Db::all(
            "SELECT m.id, m.name, m.category, m.address, m.phone, m.status, m.created_at, m.takeout_enabled, m.cover,
                    (SELECT COUNT(*) FROM orders o WHERE o.merchant_id = m.id AND o.status IN ('paid','delivering','completed')) AS orders,
                    (SELECT COALESCE(SUM(l.amount),0) FROM ledger l WHERE l.party_type = 'manager' AND l.party_id = m.manager_id
                        AND l.order_id IN (SELECT id FROM orders WHERE merchant_id = m.id)) AS commission
             FROM merchants m WHERE m.manager_id = ? ORDER BY m.status = 'pending' DESC, m.id DESC",
            [$req->user['id']]
        );
    }

    /** 原型：客户经理对自己推广的商家做初审；正式版增加平台后台终审 */
    public function review(Request $req): array
    {
        $m = Db::one('SELECT * FROM merchants WHERE id = ? AND manager_id = ?', [(int) $req->params['id'], $req->user['id']]);
        if (!$m) {
            throw new HttpException('商家不存在', 404);
        }
        if ($m['status'] !== 'pending') {
            throw new HttpException('该商家已审核', 422);
        }
        $approve = $req->params['action'] === 'approve';
        Db::update('merchants', ['status' => $approve ? 'approved' : 'rejected', 'approved_at' => $approve ? now() : null], 'id = :id', ['id' => $m['id']]);
        return ['id' => (int) $m['id'], 'status' => $approve ? 'approved' : 'rejected'];
    }

    public function commissions(Request $req): array
    {
        [$limit, $offset] = $req->page();
        return Db::all(
            "SELECT l.id, l.amount, l.remark, l.created_at, o.order_no, m.name AS merchant_name
             FROM ledger l JOIN orders o ON o.id = l.order_id JOIN merchants m ON m.id = o.merchant_id
             WHERE l.party_type = 'manager' AND l.party_id = ? ORDER BY l.id DESC LIMIT $limit OFFSET $offset",
            [$req->user['id']]
        );
    }
}
