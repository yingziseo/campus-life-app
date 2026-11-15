<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;

/**
 * 订单生命周期与分账结算。
 * 团购：下单 → 支付(生成券码) → 到店核销(逐张结算) → 全部核销即完成
 * 外卖：下单(选送餐时间点) → 支付 → 商家出餐/配送中 → 送达(结算，含骑手提成)
 */
final class OrderService
{
    public static function create(array $user, int $dealId, int $qty, array $takeout = []): array
    {
        if ($qty < 1 || $qty > 20) {
            throw new HttpException('购买数量需在 1~20 之间', 422);
        }
        $deal = Db::one(
            "SELECT d.*, m.school_id, m.manager_id, m.status AS m_status, m.takeout_enabled
             FROM deals d JOIN merchants m ON m.id = d.merchant_id WHERE d.id = ?",
            [$dealId]
        );
        if (!$deal || $deal['status'] !== 'on' || $deal['m_status'] !== 'approved') {
            throw new HttpException('商品不存在或已下架', 404);
        }
        if ((int) $deal['school_id'] !== (int) $user['school_id']) {
            throw new HttpException('该商家不在你当前所选学校的服务范围', 422);
        }
        if ($deal['stock'] < $qty) {
            throw new HttpException('库存不足', 422);
        }

        $hasManager = !empty($deal['manager_id']);
        $unitGross  = $deal['sale_price'] - $deal['merchant_settle'];
        [$unitCommission] = PricingService::split($unitGross, $hasManager);

        $goods      = $deal['sale_price'] * $qty;
        $merchant   = $deal['merchant_settle'] * $qty;
        $gross      = $unitGross * $qty;
        $commission = $unitCommission * $qty;

        $deliveryFee = $rider = 0;
        $date = $slot = $point = null;
        if ($deal['type'] === 'takeout') {
            if (!$deal['takeout_enabled']) {
                throw new HttpException('该商家暂未开通校园外卖', 422);
            }
            [$date, $slot, $point] = self::resolveDelivery((int) $user['school_id'], $takeout);
            $deliveryFee = (int) Settings::get('delivery_fee');
            $rider       = (int) Settings::get('rider_commission');
        }

        $data = [
            'order_no'           => date('YmdHis') . random_int(1000, 9999),
            'school_id'          => $user['school_id'],
            'user_id'            => $user['id'],
            'merchant_id'        => $deal['merchant_id'],
            'deal_id'            => $deal['id'],
            'manager_id'         => $deal['manager_id'],
            'type'               => $deal['type'],
            'title'              => $deal['title'],
            'quantity'           => $qty,
            'unit_price'         => $deal['sale_price'],
            'goods_amount'       => $goods,
            'delivery_fee'       => $deliveryFee,
            'total_amount'       => $goods + $deliveryFee,
            'competitor_amount'  => $deal['competitor_price'] * $qty,
            'merchant_amount'    => $merchant,
            'platform_gross'     => $gross,
            'manager_commission' => $commission,
            'rider_commission'   => $rider,
            'platform_net'       => $gross - $commission + $deliveryFee - $rider,
            'delivery_date'      => $date,
            'delivery_slot'      => $slot,
            'delivery_point'     => $point,
            'contact_phone'      => $takeout['contact_phone'] ?? $user['phone'],
            'remark'             => mb_substr((string) ($takeout['remark'] ?? ''), 0, 100),
        ];
        $id = Db::insert('orders', $data);
        return self::find($id);
    }

    /**
     * 固定时间点配送：选定的时间点若已过截单时间，则顺延到次日同一时间点
     * @return array{string, string, string}
     */
    public static function resolveDelivery(int $schoolId, array $in): array
    {
        $school = Db::one('SELECT delivery_slots, delivery_points FROM schools WHERE id = ?', [$schoolId]);
        $slots  = json_decode($school['delivery_slots'] ?? '[]', true) ?: [];
        $points = json_decode($school['delivery_points'] ?? '[]', true) ?: [];
        $slot   = (string) ($in['delivery_slot'] ?? '');
        $point  = (string) ($in['delivery_point'] ?? '');
        if (!in_array($slot, $slots, true)) {
            throw new HttpException('请选择送餐时间', 422);
        }
        if ($points && !in_array($point, $points, true)) {
            throw new HttpException('请选择取餐点', 422);
        }
        $cutoff = (int) Settings::get('takeout_cutoff_minutes');
        $slotTs = strtotime(date('Y-m-d') . ' ' . $slot);
        $date   = (time() + $cutoff * 60 <= $slotTs) ? date('Y-m-d') : date('Y-m-d', strtotime('+1 day'));
        return [$date, $slot, $point];
    }

    /** 模拟支付。正式版替换为微信支付回调（需服务商分账能力，见 docs/02） */
    public static function pay(array $user, int $orderId): array
    {
        return Db::transaction(function () use ($user, $orderId) {
            $order = self::ownedBy($user, $orderId);
            if ($order['status'] !== 'pending_pay') {
                throw new HttpException('订单状态不可支付', 422);
            }
            $ok = Db::run('UPDATE deals SET stock = stock - ?, sold = sold + ? WHERE id = ? AND stock >= ?',
                [$order['quantity'], $order['quantity'], $order['deal_id'], $order['quantity']])->rowCount();
            if (!$ok) {
                throw new HttpException('库存不足，请重新下单', 422);
            }
            Db::update('orders', ['status' => 'paid', 'paid_at' => now()], 'id = :id', ['id' => $orderId]);
            if ($order['type'] === 'groupbuy') {
                for ($i = 0; $i < $order['quantity']; $i++) {
                    Db::insert('coupons', ['order_id' => $orderId, 'code' => self::newCouponCode()]);
                }
            }
            return self::find($orderId);
        });
    }

    public static function cancel(array $user, int $orderId): array
    {
        return Db::transaction(function () use ($user, $orderId) {
            $order = self::ownedBy($user, $orderId);
            if ($order['status'] === 'pending_pay') {
                Db::update('orders', ['status' => 'cancelled'], 'id = :id', ['id' => $orderId]);
                return self::find($orderId);
            }
            if ($order['status'] !== 'paid') {
                throw new HttpException('当前状态不可退款', 422);
            }
            if ($order['type'] === 'groupbuy') {
                $used = (int) Db::value("SELECT COUNT(*) FROM coupons WHERE order_id = ? AND status = 'used'", [$orderId]);
                if ($used > 0) {
                    throw new HttpException('已有券码核销，暂不支持部分退款', 422);
                }
                Db::run("UPDATE coupons SET status = 'refunded' WHERE order_id = ?", [$orderId]);
            }
            Db::run('UPDATE deals SET stock = stock + ?, sold = sold - ? WHERE id = ?',
                [$order['quantity'], $order['quantity'], $order['deal_id']]);
            Db::update('orders', ['status' => 'refunded'], 'id = :id', ['id' => $orderId]);
            return self::find($orderId);
        });
    }

    /** 商家核销券码：每张券按单份金额结算 */
    public static function verifyCoupon(array $merchant, string $code): array
    {
        return Db::transaction(function () use ($merchant, $code) {
            $coupon = Db::one(
                'SELECT c.*, o.merchant_id, o.quantity FROM coupons c JOIN orders o ON o.id = c.order_id WHERE c.code = ?',
                [$code]
            );
            if (!$coupon || (int) $coupon['merchant_id'] !== (int) $merchant['id']) {
                throw new HttpException('券码无效或不属于本店', 404);
            }
            if ($coupon['status'] !== 'unused') {
                throw new HttpException($coupon['status'] === 'used' ? '该券码已核销（' . $coupon['used_at'] . '）' : '该券码已退款', 422);
            }
            Db::update('coupons', ['status' => 'used', 'used_at' => now()], 'id = :id', ['id' => $coupon['id']]);
            $order = self::find((int) $coupon['order_id']);
            self::writeLedger($order, 1, (int) $coupon['quantity']);

            $left = (int) Db::value("SELECT COUNT(*) FROM coupons WHERE order_id = ? AND status = 'unused'", [$order['id']]);
            if ($left === 0) {
                Db::update('orders', ['status' => 'completed', 'completed_at' => now()], 'id = :id', ['id' => $order['id']]);
            }
            return ['order' => self::find((int) $order['id']), 'coupon_code' => $code];
        });
    }

    /** 外卖状态推进：paid → delivering → completed（送达时结算） */
    public static function advanceTakeout(array $merchant, int $orderId): array
    {
        return Db::transaction(function () use ($merchant, $orderId) {
            $order = self::find($orderId);
            if (!$order || (int) $order['merchant_id'] !== (int) $merchant['id'] || $order['type'] !== 'takeout') {
                throw new HttpException('订单不存在', 404);
            }
            if ($order['status'] === 'paid') {
                Db::update('orders', ['status' => 'delivering'], 'id = :id', ['id' => $orderId]);
            } elseif ($order['status'] === 'delivering') {
                Db::update('orders', ['status' => 'completed', 'completed_at' => now()], 'id = :id', ['id' => $orderId]);
                self::writeLedger($order, $order['quantity'], $order['quantity'], true);
            } else {
                throw new HttpException('当前状态不可操作', 422);
            }
            return self::find($orderId);
        });
    }

    /**
     * 按份数写入分账流水。订单快照金额 = 单份金额 × 数量，因此可整除。
     */
    private static function writeLedger(array $order, int $units, int $total, bool $withDelivery = false): void
    {
        $per = static fn(int $amount): int => intdiv($amount, $total) * $units;
        $merchantAmt = $per((int) $order['merchant_amount']);
        $commission  = $per((int) $order['manager_commission']);
        $margin      = $per((int) $order['platform_gross']) - $commission;
        $base = ['order_id' => $order['id']];

        Db::insert('ledger', $base + ['party_type' => 'merchant', 'party_id' => $order['merchant_id'], 'amount' => $merchantAmt, 'kind' => 'settle', 'remark' => $order['title'] . " ×{$units}"]);
        if ($commission > 0) {
            Db::insert('ledger', $base + ['party_type' => 'manager', 'party_id' => $order['manager_id'], 'amount' => $commission, 'kind' => 'commission', 'remark' => $order['title'] . " ×{$units}"]);
        }
        Db::insert('ledger', $base + ['party_type' => 'platform', 'party_id' => null, 'amount' => $margin, 'kind' => 'margin', 'remark' => '商品差价']);
        if ($withDelivery) {
            Db::insert('ledger', $base + ['party_type' => 'rider', 'party_id' => null, 'amount' => (int) $order['rider_commission'], 'kind' => 'delivery', 'remark' => '骑手提成 ' . $order['delivery_slot']]);
            Db::insert('ledger', $base + ['party_type' => 'platform', 'party_id' => null, 'amount' => $order['delivery_fee'] - $order['rider_commission'], 'kind' => 'delivery', 'remark' => '配送费结余']);
        }
    }

    public static function find(int $id): ?array
    {
        $o = Db::one('SELECT o.*, m.name AS merchant_name, m.address AS merchant_address FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = ?', [$id]);
        if ($o) {
            $o['coupons'] = Db::all('SELECT code, status, used_at FROM coupons WHERE order_id = ? ORDER BY id', [$id]);
            $o['saved'] = $o['competitor_amount'] - $o['goods_amount'];
        }
        return $o;
    }

    private static function ownedBy(array $user, int $orderId): array
    {
        $o = self::find($orderId);
        if (!$o || (int) $o['user_id'] !== (int) $user['id']) {
            throw new HttpException('订单不存在', 404);
        }
        return $o;
    }

    private static function newCouponCode(): string
    {
        do {
            $code = (string) random_int(100000000000, 999999999999);
        } while (Db::value('SELECT 1 FROM coupons WHERE code = ?', [$code]));
        return $code;
    }
}
