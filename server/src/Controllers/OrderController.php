<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};
use App\Services\OrderService;

final class OrderController
{
    private const HIDDEN = ['merchant_amount', 'platform_gross', 'manager_commission', 'rider_commission', 'platform_net', 'manager_id', 'user_coupon_id'];

    public function create(Request $req): array
    {
        Auth::schoolId($req);
        $order = OrderService::create($req->user, $req->int('deal_id'), $req->int('quantity', 1), [
            'delivery_slot'  => $req->str('delivery_slot', 10),
            'delivery_point' => $req->str('delivery_point', 40),
            'contact_phone'  => $req->str('contact_phone', 11) ?: null,
            'remark'         => $req->str('remark', 100),
        ], $req->int('coupon_id'));
        return $this->present($order);
    }

    public function pay(Request $req): array
    {
        return $this->present(OrderService::pay($req->user, (int) $req->params['id']));
    }

    public function cancel(Request $req): array
    {
        return $this->present(OrderService::cancel($req->user, (int) $req->params['id']));
    }

    public function mine(Request $req): array
    {
        $where = 'user_id = ?';
        $params = [$req->user['id']];
        if ($status = $req->str('status', 12)) {
            $where .= ' AND status = ?';
            $params[] = $status;
        }
        $ids = Db::all("SELECT id FROM orders WHERE $where ORDER BY id DESC LIMIT 50", $params);
        $orders = array_map(fn($r) => $this->present(OrderService::find((int) $r['id'])), $ids);
        $saved = (int) Db::value("SELECT COALESCE(SUM(competitor_amount - goods_amount + coupon_discount), 0) FROM orders WHERE user_id = ? AND status IN ('paid','ready','delivering','completed')", [$req->user['id']]);
        return ['orders' => $orders, 'total_saved' => $saved];
    }

    public function show(Request $req): array
    {
        $o = OrderService::find((int) $req->params['id']);
        if (!$o || (int) $o['user_id'] !== (int) $req->user['id']) {
            throw new HttpException('订单不存在', 404);
        }
        return $this->present($o);
    }

    private function present(array $o): array
    {
        return array_diff_key($o, array_flip(self::HIDDEN));
    }
}
