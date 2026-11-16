<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;

/**
 * 资金流水（分账凭据）。正式版按流水调用微信支付服务商分账，分别打给商家、客户经理、骑手、学生。
 * party_type：merchant 商家 | manager 客户经理 | rider 骑手 | student 学生（跑腿接单人 / 二手卖家）| platform 平台
 */
final class Ledger
{
    /** 平台收入来源 → 中文名（看板与「收益分配」页使用） */
    public const PLATFORM_KINDS = [
        'margin'     => '商品差价留存',
        'delivery'   => '配送费结余',
        'errand_fee' => '跑腿服务费',
        'market_fee' => '二手服务费',
        'ad'         => '推荐位广告费',
        'subsidy'    => '优惠券补贴',
    ];

    public static function add(string $source, ?int $schoolId, string $partyType, ?int $partyId, int $amount, string $kind, string $remark = '', ?int $orderId = null, ?int $refId = null): void
    {
        if ($amount === 0) {
            return;
        }
        Db::insert('ledger', [
            'school_id'  => $schoolId,
            'source'     => $source,
            'order_id'   => $orderId,
            'ref_id'     => $refId ?? $orderId,
            'party_type' => $partyType,
            'party_id'   => $partyId,
            'amount'     => $amount,
            'kind'       => $kind,
            'remark'     => mb_substr($remark, 0, 80),
        ]);
    }

    /** 按费率抽成，向下取整到分（对用户友好） */
    public static function fee(int $amount, string $rateKey): int
    {
        return max(0, (int) floor($amount * (float) Settings::get($rateKey)));
    }
}
