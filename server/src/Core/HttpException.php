<?php
declare(strict_types=1);

namespace App\Core;

/** 业务异常：status 为 HTTP 状态码，消息直接展示给用户 */
final class HttpException extends \RuntimeException
{
    public function __construct(string $message, public int $status = 400)
    {
        parent::__construct($message);
    }
}
