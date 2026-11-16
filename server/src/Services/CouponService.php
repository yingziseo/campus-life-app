<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\{Db, HttpException};

/**
 * 平台优惠券（福利群每日发券 → 学生在领券中心抢 → 下单抵扣）。
 * 优惠券由平台出资：抵扣金额从平台收入中扣除，商家到手与客户经理佣金不受影响。
 */
final class CouponService
{
    public const SCOPES = ['all' => '全场通用', 'takeout' => '校园外卖', 'groupbuy' => '到店团购'];

    /** 今日可抢的券（含剩余数量、我是否已领） */
    public static function today(array $user): array
    {
        $today = date('Y-m-d');
        $rows = Db::all(
            "SELECT t.*,
                (SELECT COUNT(*) FROM user_coupons c WHERE c.template_id = t.id AND c.claim_date = ?) AS claimed,
                (SELECT COUNT(*) FROM user_coupons c WHERE c.template_id = t.id AND c.claim_date = ? AND c.user_id = ?) AS mine
             FROM coupon_templates t WHERE t.status = 'on' AND (t.school_id IS NULL OR t.school_id = ?) ORDER BY t.start_time, t.amount DESC",
            [$today, $today, $user['id'], (int) $user['school_id']]
        );
        $now = date('H:i');
        return array_map(static function (array $t) use ($now): array {
            $t['left'] = max(0, $t['daily_quota'] - $t['claimed']);
            $t['started'] = $now >= $t['start_time'];
            $t['mine'] = $t['mine'] > 0;
            $t['scope_text'] = self::SCOPES[$t['scope']] ?? '通用';
            return $t;
        }, $rows);
    }

    public static function claim(array $user, int $templateId): array
    {
        return Db::transaction(static function () use ($user, $templateId) {
            $t = Db::one("SELECT * FROM coupon_templates WHERE id = ? AND status = 'on'", [$templateId]);
            if (!$t || ($t['school_id'] && (int) $t['school_id'] !== (int) $user['school_id'])) {
                throw new HttpException('优惠券不存在或已下线', 404);
            }
            if (date('H:i') < $t['start_time']) {
                throw new HttpException("还没开抢，{$t['start_time']} 准时开抢", 422);
            }
            $today = date('Y-m-d');
            if (Db::value('SELECT 1 FROM user_coupons WHERE template_id = ? AND user_id = ? AND claim_date = ?', [$t['id'], $user['id'], $today])) {
                throw new HttpException('今天已经领过这张券了', 422);
            }
            $claimed = (int) Db::value('SELECT COUNT(*) FROM user_coupons WHERE template_id = ? AND claim_date = ?', [$t['id'], $today]);
            if ($claimed >= $t['daily_quota']) {
                throw new HttpException('手慢了，今天的券已抢光，明天早点来', 422);
            }
            $expires = date('Y-m-d 23:59:59', strtotime('+' . max(0, $t['valid_days'] - 1) . ' day'));
            $id = Db::insert('user_coupons', [
                'template_id' => $t['id'], 'user_id' => $user['id'], 'title' => $t['title'], 'amount' => $t['amount'],
                'threshold' => $t['threshold'], 'scope' => $t['scope'], 'claim_date' => $today, 'expires_at' => $expires,
            ]);
            return self::present(Db::one('SELECT * FROM user_coupons WHERE id = ?', [$id]));
        });
    }

    /** 我的券：available 可用 | used 已使用 | expired 已过期 */
    public static function mine(array $user, string $status = 'available'): array
    {
        $now = now();
        $where = match ($status) {
            'used'    => "status = 'used'",
            'expired' => "status = 'unused' AND expires_at < '$now'",
            default   => "status = 'unused' AND expires_at >= '$now'",
        };
        return array_map([self::class, 'present'], Db::all("SELECT * FROM user_coupons WHERE user_id = ? AND $where ORDER BY expires_at, amount DESC LIMIT 100", [$user['id']]));
    }

    /** 下单时可用的券（按抵扣金额从大到小） */
    public static function usable(array $user, int $goodsAmount, string $type): array
    {
        return array_map([self::class, 'present'], Db::all(
            "SELECT * FROM user_coupons WHERE user_id = ? AND status = 'unused' AND expires_at >= ? AND threshold <= ? AND scope IN ('all', ?)
             ORDER BY amount DESC, expires_at",
            [$user['id'], now(), $goodsAmount, $type]
        ));
    }

    /** 锁定一张券用于下单，返回抵扣金额（不超过商品金额） */
    public static function lock(array $user, int $couponId, int $goodsAmount, string $type): array
    {
        $c = Db::one('SELECT * FROM user_coupons WHERE id = ? AND user_id = ?', [$couponId, $user['id']]);
        if (!$c || $c['status'] !== 'unused' || $c['expires_at'] < now()) {
            throw new HttpException('优惠券不可用或已过期', 422);
        }
        if ($c['threshold'] > $goodsAmount) {
            throw new HttpException('未达到优惠券使用门槛', 422);
        }
        if (!in_array($c['scope'], ['all', $type], true)) {
            throw new HttpException('该优惠券仅限' . self::SCOPES[$c['scope']] . '使用', 422);
        }
        $n = Db::run("UPDATE user_coupons SET status = 'used' WHERE id = ? AND status = 'unused'", [$c['id']])->rowCount();
        if (!$n) {
            throw new HttpException('优惠券已被使用', 422);
        }
        return ['id' => (int) $c['id'], 'discount' => min((int) $c['amount'], $goodsAmount)];
    }

    public static function bind(int $couponId, int $orderId): void
    {
        Db::update('user_coupons', ['order_id' => $orderId], 'id = :id', ['id' => $couponId]);
    }

    /** 订单取消 / 退款时退回优惠券（过期的不再退回可用） */
    public static function release(array $order): void
    {
        if (!empty($order['user_coupon_id'])) {
            Db::run("UPDATE user_coupons SET status = 'unused', order_id = NULL WHERE id = ?", [$order['user_coupon_id']]);
        }
    }

    public static function present(array $c): array
    {
        $c['scope_text'] = self::SCOPES[$c['scope']] ?? '通用';
        $c['expired'] = $c['status'] === 'unused' && $c['expires_at'] < now();
        return $c;
    }
}
