<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};
use App\Services\{OrderService, PricingService, Settings};

/** 商家端 */
final class MerchantController
{
    /** 商家入驻申请：填写客户经理邀请码即与该经理绑定（推广归属） */
    public function apply(Request $req): array
    {
        $user = $req->user;
        if (Db::value('SELECT 1 FROM merchants WHERE owner_user_id = ?', [$user['id']])) {
            throw new HttpException('你已提交过入驻申请', 422);
        }
        if (in_array($user['role'], ['manager', 'admin'], true)) {
            throw new HttpException('客户经理账号不能申请商家入驻', 422);
        }
        $sid = Auth::schoolId($req);
        $managerId = null;
        if ($code = strtoupper($req->str('invite_code', 12))) {
            $managerId = Db::value("SELECT id FROM users WHERE invite_code = ? AND role = 'manager'", [$code]);
            if (!$managerId) {
                throw new HttpException('邀请码无效，请向客户经理确认', 422);
            }
        }
        $auto = (bool) Settings::get('merchant_auto_approve');
        $id = Db::transaction(function () use ($req, $user, $sid, $managerId, $auto) {
            $id = Db::insert('merchants', [
                'school_id'       => $sid,
                'owner_user_id'   => $user['id'],
                'manager_id'      => $managerId,
                'name'            => $req->str('name', 30, true, '店铺名称'),
                'category'        => $req->oneOf('category', LocalController::CATEGORIES),
                'address'         => $req->str('address', 80, true, '店铺地址'),
                'phone'           => $req->str('phone', 20, true, '联系电话'),
                'intro'           => $req->str('intro', 200),
                'distance_m'      => $req->int('distance_m') ?: null,
                'takeout_enabled' => $req->int('takeout_enabled') ? 1 : 0,
                'cover'           => UploadController::checkUrl($req->str('cover', 200)),
                'license_image'   => UploadController::checkUrl($req->str('license_image', 200)),
                'status'          => $auto ? 'approved' : 'pending',
                'approved_at'     => $auto ? now() : null,
            ]);
            Db::update('users', ['role' => 'merchant'], 'id = :id', ['id' => $user['id']]);
            return $id;
        });
        return $this->merchantById($id);
    }

    public function profile(Request $req): ?array
    {
        $m = Db::one('SELECT * FROM merchants WHERE owner_user_id = ?', [$req->user['id']]);
        if (!$m) {
            return null;
        }
        return $this->merchantById((int) $m['id']);
    }

    public function updateProfile(Request $req): array
    {
        $m = $this->current($req);
        Db::update('merchants', [
            'intro'           => $req->str('intro', 200),
            'phone'           => $req->str('phone', 20, true, '联系电话'),
            'takeout_enabled' => $req->int('takeout_enabled') ? 1 : 0,
            'cover'           => UploadController::checkUrl($req->str('cover', 200)),
        ], 'id = :id', ['id' => $m['id']]);
        return $this->merchantById((int) $m['id']);
    }

    public function dashboard(Request $req): array
    {
        $m = $this->current($req);
        $today = date('Y-m-d');
        $mid = $m['id'];
        return [
            'merchant' => $this->merchantById((int) $mid),
            'today_orders'  => (int) Db::value("SELECT COUNT(*) FROM orders WHERE merchant_id = ? AND status IN ('paid','delivering','completed') AND date(paid_at) = ?", [$mid, $today]),
            'today_income'  => (int) Db::value("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE party_type = 'merchant' AND party_id = ? AND date(created_at) = ?", [$mid, $today]),
            'total_income'  => (int) Db::value("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE party_type = 'merchant' AND party_id = ?", [$mid]),
            'unused_coupons'=> (int) Db::value("SELECT COUNT(*) FROM coupons c JOIN orders o ON o.id = c.order_id WHERE o.merchant_id = ? AND c.status = 'unused' AND o.status = 'paid'", [$mid]),
            'takeout_slots' => Db::all(
                "SELECT delivery_date, delivery_slot, COUNT(*) AS orders, SUM(quantity) AS items,
                    SUM(status = 'paid') AS to_cook, SUM(status = 'ready') AS to_pick FROM orders
                 WHERE merchant_id = ? AND type = 'takeout' AND status IN ('paid','ready','delivering') GROUP BY delivery_date, delivery_slot ORDER BY delivery_date, delivery_slot",
                [$mid]
            ),
            'deal_count' => (int) Db::value("SELECT COUNT(*) FROM deals WHERE merchant_id = ? AND status = 'on'", [$mid]),
        ];
    }

    /** 定价试算（不落库），商家/客户经理录入商品时实时展示 */
    public function quote(Request $req): array
    {
        $hasManager = true;
        if ($req->user['role'] === 'merchant') {
            $m = Db::one('SELECT manager_id FROM merchants WHERE owner_user_id = ?', [$req->user['id']]);
            $hasManager = !empty($m['manager_id']);
        }
        return PricingService::quote($this->pricingInput($req), $hasManager);
    }

    public function deals(Request $req): array
    {
        $m = $this->current($req);
        return Db::all('SELECT * FROM deals WHERE merchant_id = ? ORDER BY status, id DESC', [$m['id']]);
    }

    public function saveDeal(Request $req): array
    {
        $m = $this->current($req);
        $id = (int) ($req->params['id'] ?? 0);
        if ($id && !Db::value('SELECT 1 FROM deals WHERE id = ? AND merchant_id = ?', [$id, $m['id']])) {
            throw new HttpException('商品不存在', 404);
        }
        $type = $req->oneOf('type', ['groupbuy', 'takeout']);
        if ($type === 'takeout' && !$m['takeout_enabled']) {
            throw new HttpException('请先在店铺设置中开通校园外卖', 422);
        }
        $q = PricingService::quote($this->pricingInput($req), !empty($m['manager_id']));
        $data = [
            'merchant_id'      => $m['id'],
            'type'             => $type,
            'title'            => $req->str('title', 40, true, '商品名称'),
            'description'      => $req->str('description', 300),
            'image'            => UploadController::checkUrl($req->str('image', 200)),
            'pricing_mode'     => $q['pricing_mode'],
            'competitor_price' => $q['competitor_price'],
            'merchant_settle'  => $q['merchant_settle'],
            'voucher_face'     => $q['voucher_face'],
            'voucher_cost'     => $q['voucher_cost'],
            'list_price'       => $q['list_price'],
            'sale_price'       => $q['sale_price'],
            'stock'            => max(0, $req->int('stock', 999)),
        ];
        if ($id) {
            Db::update('deals', $data, 'id = :id', ['id' => $id]);
        } else {
            $id = Db::insert('deals', $data);
        }
        return Db::one('SELECT * FROM deals WHERE id = ?', [$id]);
    }

    public function toggleDeal(Request $req): array
    {
        $m = $this->current($req);
        $deal = Db::one('SELECT * FROM deals WHERE id = ? AND merchant_id = ?', [(int) $req->params['id'], $m['id']]);
        if (!$deal) {
            throw new HttpException('商品不存在', 404);
        }
        $status = $deal['status'] === 'on' ? 'off' : 'on';
        Db::update('deals', ['status' => $status], 'id = :id', ['id' => $deal['id']]);
        return ['id' => (int) $deal['id'], 'status' => $status];
    }

    public function orders(Request $req): array
    {
        $m = $this->current($req);
        $where = ["o.merchant_id = ?", "o.status != 'pending_pay'", "o.status != 'cancelled'"];
        $params = [$m['id']];
        if (($type = $req->str('type', 10)) && in_array($type, ['groupbuy', 'takeout'], true)) {
            $where[] = 'o.type = ?';
            $params[] = $type;
        }
        if ($status = $req->str('status', 12)) {
            $where[] = 'o.status = ?';
            $params[] = $status;
        }
        return Db::all(
            'SELECT o.id, o.order_no, o.type, o.title, o.quantity, o.total_amount, o.merchant_amount, o.status, o.delivery_date,
                    o.delivery_slot, o.delivery_point, o.contact_phone, o.remark, o.paid_at, o.completed_at, u.nickname, r.nickname AS rider_name
             FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN users r ON r.id = o.rider_id WHERE ' . implode(' AND ', $where) . ' ORDER BY o.id DESC LIMIT 100',
            $params
        );
    }

    public function verify(Request $req): array
    {
        $m = $this->current($req, true);
        $code = preg_replace('/\D/', '', $req->str('code', 20, true, '券码'));
        return OrderService::verifyCoupon($m, $code);
    }

    public function advance(Request $req): array
    {
        $m = $this->current($req, true);
        return OrderService::markReady($m, (int) $req->params['id']);
    }

    private function current(Request $req, bool $mustApproved = false): array
    {
        $m = Db::one('SELECT * FROM merchants WHERE owner_user_id = ?', [$req->user['id']]);
        if (!$m) {
            throw new HttpException('请先提交商家入驻申请', 412);
        }
        if ($mustApproved && $m['status'] !== 'approved') {
            throw new HttpException('店铺审核通过后才能操作', 422);
        }
        return $m;
    }

    private function merchantById(int $id): array
    {
        $m = Db::one('SELECT m.*, u.nickname AS manager_name FROM merchants m LEFT JOIN users u ON u.id = m.manager_id WHERE m.id = ?', [$id]);
        $m['has_manager'] = !empty($m['manager_id']);
        return $m;
    }

    private function pricingInput(Request $req): array
    {
        return [
            'pricing_mode'     => $req->str('pricing_mode', 10),
            'competitor_price' => $req->money('competitor_price', true, '竞品平台价'),
            'merchant_settle'  => $req->money('merchant_settle', true, '商家到手价'),
            'voucher_face'     => $req->money('voucher_face'),
            'voucher_cost'     => $req->money('voucher_cost'),
            'sale_price'       => $req->money('sale_price'),
        ];
    }
}
