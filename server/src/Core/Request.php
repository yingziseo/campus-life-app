<?php
declare(strict_types=1);

namespace App\Core;

final class Request
{
    public function __construct(
        public string $method,
        public string $path,
        public array $query = [],
        public array $body = [],
        public array $headers = [],
        public array $params = [],   // 路由参数
        public ?array $user = null,  // 由 Auth 注入
    ) {
    }

    public static function fromGlobals(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $raw = file_get_contents('php://input') ?: '';
        $body = [];
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            $body = is_array($decoded) ? $decoded : [];
        }
        if (!$body && $_POST) {
            $body = $_POST;
        }
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (strncmp($k, 'HTTP_', 5) === 0) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
            }
        }
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), rtrim($path, '/') ?: '/', $_GET, $body, $headers);
    }

    public function input(string $key, $default = null)
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function str(string $key, int $max = 500, bool $required = false, string $label = ''): string
    {
        $v = trim((string) $this->input($key, ''));
        if ($required && $v === '') {
            throw new HttpException(($label ?: $key) . '不能为空', 422);
        }
        if (mb_strlen($v) > $max) {
            throw new HttpException(($label ?: $key) . "不能超过{$max}字", 422);
        }
        return $v;
    }

    public function int(string $key, int $default = 0): int
    {
        $v = $this->input($key);
        return is_numeric($v) ? (int) $v : $default;
    }

    /** 读取「元」为单位的金额，转换为「分」 */
    public function money(string $key, bool $required = false, string $label = ''): ?int
    {
        $v = $this->input($key);
        if ($v === null || $v === '') {
            if ($required) {
                throw new HttpException(($label ?: $key) . '不能为空', 422);
            }
            return null;
        }
        if (!is_numeric($v) || (float) $v < 0) {
            throw new HttpException(($label ?: $key) . '金额格式不正确', 422);
        }
        return (int) round((float) $v * 100);
    }

    public function oneOf(string $key, array $allowed, ?string $default = null): string
    {
        $v = (string) $this->input($key, $default ?? '');
        if (!in_array($v, $allowed, true)) {
            throw new HttpException("参数 {$key} 不合法", 422);
        }
        return $v;
    }

    public function bearer(): ?string
    {
        $h = $this->headers['authorization'] ?? '';
        return preg_match('/^Bearer\s+(\S+)$/i', $h, $m) ? $m[1] : null;
    }

    public function page(): array
    {
        $page = max(1, $this->int('page', 1));
        $size = min(50, max(1, $this->int('size', 20)));
        return [$size, ($page - 1) * $size];
    }
}
