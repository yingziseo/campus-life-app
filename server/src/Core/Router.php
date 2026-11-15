<?php
declare(strict_types=1);

namespace App\Core;

final class Router
{
    /** @var array<int, array{string, string, callable|array, array}> */
    private array $routes = [];

    /** @param string|array $roles 需要的角色：'' 公开 | 'login' 任意登录用户 | ['merchant', ...] */
    public function add(string $method, string $pattern, callable|array $handler, string|array $roles = 'login'): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler, (array) $roles];
    }

    public function get(string $p, callable|array $h, string|array $roles = 'login'): void { $this->add('GET', $p, $h, $roles); }
    public function post(string $p, callable|array $h, string|array $roles = 'login'): void { $this->add('POST', $p, $h, $roles); }

    public function dispatch(Request $req): array
    {
        $methodMismatch = false;
        foreach ($this->routes as [$method, $regex, $handler, $roles]) {
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            if ($method !== $req->method) {
                $methodMismatch = true;
                continue;
            }
            $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            $req->user = Auth::resolve($req, $roles);
            if (is_array($handler)) {
                [$class, $fn] = $handler;
                $handler = [new $class(), $fn];
            }
            return Response::ok($handler($req));
        }
        throw new HttpException($methodMismatch ? '请求方法不允许' : '接口不存在', $methodMismatch ? 405 : 404);
    }
}
