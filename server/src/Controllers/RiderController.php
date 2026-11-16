<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};
use App\Services\{OrderService, Settings};

/**
 * 骑手端（校园外卖团队）：学生兼职，按"日期 + 送餐时间点"批次集中取餐、按取餐点集中送达。
 */
final class RiderController
{
    /** 学生申请加入外卖团队 */
    public function apply(Request $req): array
    {
        Auth::schoolId($req);
        if ($req->user['role'] !== 'student') {
            throw new HttpException('仅学生账号可加入外卖团队', 422);
        }
        if ($req->user['rider_status'] !== 'none') {
            throw new HttpException($req->user['rider_status'] === 'approved' ? '你已是外卖团队成员' : '申请审核中', 422);
        }
        Db::update('users', ['rider_status' => 'pending'], 'id = :id', ['id' => $req->user['id']]);
        return ['rider_status' => 'pending'];
    }

    public function dashboard(Request $req): array
    {
        $uid = $req->user['id'];
        $sid = Auth::schoolId($req);
        $today = date('Y-m-d');
        $earn = static fn(string $extra = '', array $p = []) => (int) Db::value(
            "SELECT COALESCE(SUM(amount),0) FROM ledger WHERE party_type = 'rider' AND party_id = ? $extra", array_merge([$uid], $p)
        );
        return [
            'rider_commission' => (int) Settings::get('rider_commission'),
            'today_delivered'  => (int) Db::value("SELECT COUNT(*) FROM orders WHERE rider_id = ? AND status = 'completed' AND date(completed_at) = ?", [$uid, $today]),
            'today_earning'    => $earn('AND date(created_at) = ?', [$today]),
            'total_earning'    => $earn(),
            'delivering'       => (int) Db::value("SELECT COUNT(*) FROM orders WHERE rider_id = ? AND status = 'delivering'", [$uid]),
            'batches'          => $this->batchList($sid, $uid),
        ];
    }

    /** 批次详情：取餐清单（按商家）+ 送达清单（按取餐点） */
    public function batch(Request $req): array
    {
        $sid = Auth::schoolId($req);
        $date = $req->str('date', 10, true, '日期');
        $slot = $req->str('slot', 5, true, '时间点');
        $orders = Db::all(
            "SELECT o.id, o.order_no, o.title, o.quantity, o.status, o.delivery_point, o.contact_phone, o.remark, o.rider_id, o.proof_image,
                    m.id AS merchant_id, m.name AS merchant_name, m.address AS merchant_address, u.nickname
             FROM orders o JOIN merchants m ON m.id = o.merchant_id JOIN users u ON u.id = o.user_id
             WHERE o.school_id = ? AND o.type = 'takeout' AND o.delivery_date = ? AND o.delivery_slot = ?
               AND o.status IN ('paid','ready','delivering','completed') ORDER BY m.id, o.id",
            [$sid, $date, $slot]
        );
        $uid = (int) $req->user['id'];
        $pickups = [];
        $drops = [];
        foreach ($orders as $o) {
            $o['mine'] = (int) $o['rider_id'] === $uid;
            $o['contact_phone'] = $o['mine'] ? $o['contact_phone'] : substr((string) $o['contact_phone'], 0, 3) . '****' . substr((string) $o['contact_phone'], -4);
            $mk = $o['merchant_id'];
            $pickups[$mk] ??= ['merchant_id' => $mk, 'merchant_name' => $o['merchant_name'], 'merchant_address' => $o['merchant_address'], 'orders' => []];
            $pickups[$mk]['orders'][] = $o;
            if ($o['mine'] && in_array($o['status'], ['delivering', 'completed'], true)) {
                $drops[$o['delivery_point']] ??= ['point' => $o['delivery_point'], 'orders' => []];
                $drops[$o['delivery_point']]['orders'][] = $o;
            }
        }
        return ['date' => $date, 'slot' => $slot, 'pickups' => array_values($pickups), 'drops' => array_values($drops)];
    }

    public function pickup(Request $req): array
    {
        $ids = array_map('intval', (array) $req->input('order_ids', []));
        if (!$ids) {
            throw new HttpException('请选择要取餐的订单', 422);
        }
        $n = OrderService::pickup($req->user, $ids);
        if (!$n) {
            throw new HttpException('没有可取餐的订单（商家可能还未出餐，或已被其他骑手取走）', 422);
        }
        return ['picked' => $n];
    }

    public function deliver(Request $req): array
    {
        $ids = array_map('intval', (array) $req->input('order_ids', []));
        $proof = UploadController::checkUrl($req->str('proof_image', 200));
        if (!$proof) {
            throw new HttpException('请在取餐点拍照上传送达照片', 422);
        }
        $n = OrderService::deliver($req->user, $ids, $proof);
        if (!$n) {
            throw new HttpException('没有可送达的订单', 422);
        }
        return ['delivered' => $n, 'earning' => $n * (int) Settings::get('rider_commission')];
    }

    public function earnings(Request $req): array
    {
        [$limit, $offset] = $req->page();
        return Db::all(
            "SELECT l.id, l.amount, l.remark, l.created_at, o.title, o.order_no FROM ledger l JOIN orders o ON o.id = l.order_id
             WHERE l.party_type = 'rider' AND l.party_id = ? ORDER BY l.id DESC LIMIT $limit OFFSET $offset",
            [$req->user['id']]
        );
    }

    private function batchList(int $sid, int $uid): array
    {
        return Db::all(
            "SELECT delivery_date, delivery_slot,
                    COUNT(*) AS total,
                    SUM(status = 'paid') AS cooking,
                    SUM(status = 'ready') AS ready,
                    SUM(status = 'delivering' AND rider_id = ?) AS my_delivering,
                    SUM(status = 'completed') AS completed,
                    COUNT(DISTINCT merchant_id) AS merchants,
                    COUNT(DISTINCT delivery_point) AS points
             FROM orders WHERE school_id = ? AND type = 'takeout' AND status IN ('paid','ready','delivering','completed')
               AND delivery_date >= date('now','localtime','-1 day')
             GROUP BY delivery_date, delivery_slot ORDER BY delivery_date, delivery_slot",
            [$uid, $sid]
        );
    }
}
