<?php
declare(strict_types=1);

namespace App\Core;

/** 统一响应：{ code: 0, data } 或 { code: <http>, msg } */
final class Response
{
    public static function json(array $payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function ok($data = null): array
    {
        return ['code' => 0, 'data' => $data];
    }

    public static function error(string $msg, int $status): array
    {
        return ['code' => $status, 'msg' => $msg];
    }
}
