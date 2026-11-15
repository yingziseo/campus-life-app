<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;

/**
 * 定价引擎 —— 平台商业模式的核心，所有金额单位为「分」。
 *
 * 模式一 voucher（代金券模式，商家到手不变）：
 *   竞品价 15，商家在竞品到手 10.5；平台卖"1 元抵 2 元"代金券
 *   到店标价 = 到手价 + 券面额 = 12.5；用户实付 = 到手价 + 券售价 = 11.5
 *   商家得 10.5，差价 1 元由平台与客户经理分成，用户比竞品省 3.5
 *
 * 模式二 fixed（平台定价模式，压缩商家利润换渠道销量）：
 *   与商家约定到手价 9.5，平台定售价 12（须 ≤ 竞品价 - min_saving）
 *   差价 2.5 由平台与客户经理分成，用户省 3
 */
final class PricingService
{
    public const MODES = ['voucher', 'fixed'];

    /**
     * @param array{pricing_mode:string, competitor_price:int, merchant_settle:int,
     *              voucher_face?:?int, voucher_cost?:?int, sale_price?:?int} $in
     * @param bool $hasManager 商家是否绑定客户经理（无则差价全部归平台）
     */
    public static function quote(array $in, bool $hasManager = true): array
    {
        $mode       = $in['pricing_mode'] ?? '';
        $competitor = (int) ($in['competitor_price'] ?? 0);
        $settle     = (int) ($in['merchant_settle'] ?? 0);
        $minSaving  = (int) Settings::get('min_saving');

        if (!in_array($mode, self::MODES, true)) {
            throw new HttpException('定价模式不正确', 422);
        }
        if ($competitor <= 0 || $settle <= 0) {
            throw new HttpException('竞品价与商家到手价必须大于 0', 422);
        }
        if ($settle >= $competitor) {
            throw new HttpException('商家到手价应低于竞品平台售价（竞品平台还要抽佣）', 422);
        }

        $voucherFace = $voucherCost = null;
        if ($mode === 'voucher') {
            $voucherFace = (int) ($in['voucher_face'] ?? 0);
            $voucherCost = (int) ($in['voucher_cost'] ?? 0);
            if ($voucherFace <= 0 || $voucherCost <= 0) {
                throw new HttpException('请填写代金券面额与售价', 422);
            }
            if ($voucherCost >= $voucherFace) {
                throw new HttpException('券售价必须低于券面额，否则用户没有优惠', 422);
            }
            $listPrice = $settle + $voucherFace;
            $salePrice = $settle + $voucherCost;
        } else {
            $salePrice = (int) ($in['sale_price'] ?? 0);
            if ($salePrice <= 0) {
                throw new HttpException('请填写平台售价', 422);
            }
            if ($salePrice < $settle) {
                throw new HttpException('平台售价不能低于商家到手价', 422);
            }
            $listPrice = $competitor; // 划线价展示竞品价
        }

        $saving = $competitor - $salePrice;
        if ($saving < $minSaving) {
            throw new HttpException(sprintf('用户实付须比竞品至少便宜 %s 元，当前仅便宜 %s 元', self::yuan($minSaving), self::yuan($saving)), 422);
        }

        $gross = $salePrice - $settle;
        [$managerCommission, $platformMargin] = self::split($gross, $hasManager);

        return [
            'pricing_mode'       => $mode,
            'competitor_price'   => $competitor,
            'merchant_settle'    => $settle,
            'voucher_face'       => $voucherFace,
            'voucher_cost'       => $voucherCost,
            'list_price'         => $listPrice,
            'sale_price'         => $salePrice,
            'user_saving'        => $saving,
            'platform_gross'     => $gross,
            'manager_commission' => $managerCommission,
            'platform_margin'    => $platformMargin,
            'merchant_ratio'     => round($settle / $competitor, 4), // 商家到手占竞品售价比例
        ];
    }

    /** 差价毛利拆分：返回 [客户经理佣金, 平台留存]，佣金向下取整到分 */
    public static function split(int $gross, bool $hasManager): array
    {
        if (!$hasManager || $gross <= 0) {
            return [0, max(0, $gross)];
        }
        $commission = (int) floor($gross * (float) Settings::get('manager_rate'));
        return [$commission, $gross - $commission];
    }

    public static function yuan(int $cents): string
    {
        $s = number_format($cents / 100, 2, '.', '');
        return rtrim(rtrim($s, '0'), '.');
    }
}
