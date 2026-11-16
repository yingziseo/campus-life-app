<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;

/** 平台可调参数，存于 settings 表，缺省值见 DEFAULTS */
final class Settings
{
    public const DEFAULTS = [
        'manager_rate'          => 0.5,  // 客户经理在平台差价毛利中的分成比例
        'min_saving'            => 100,  // 售价至少比竞品低多少(分)，保证"比美团便宜"
        'delivery_fee'          => 150,  // 校园外卖每单配送费(分)，用户支付
        'rider_commission'      => 100,  // 骑手每单提成(分)
        'takeout_cutoff_minutes'=> 40,   // 距送餐时间点多少分钟前截单
        'merchant_auto_approve' => false,
        // 校园基础业务抽成（"不抽多，积少成多"）
        'errand_fee_rate'       => 0.05, // 跑腿 / 代取快递：从赏金中抽 5%
        'market_fee_rate'       => 0.02, // 二手担保交易：从成交价中抽 2%
        // 首页推荐位（每个行业前 3 位），按天计费(分/天)，下标 0 = 第 1 位
        'ad_prices'             => [1500, 1000, 800],
        // 学生端比价文案（不直接点名竞品平台）
        'price_slogan'          => '全平台低价',
        'compare_label'         => '其他平台',
        // 福利群（企业微信），每天群内发券
        'group_name'            => '校园生活福利群',
        'group_desc'            => '每天 12:00 群内发券，外卖、奶茶、网吧都能用',
        'group_qr'              => '',
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache === null) {
            $rows = Db::all('SELECT key, value FROM settings');
            $stored = [];
            foreach ($rows as $r) {
                $stored[$r['key']] = json_decode($r['value'], true);
            }
            self::$cache = array_replace(self::DEFAULTS, $stored);
        }
        return self::$cache;
    }

    public static function get(string $key)
    {
        return self::all()[$key] ?? null;
    }

    public static function set(string $key, $value, string $remark = ''): void
    {
        Db::run(
            'INSERT INTO settings(key, value, remark) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [$key, json_encode($value), $remark]
        );
        self::$cache = null;
    }

    public static function flush(): void
    {
        self::$cache = null;
    }
}
