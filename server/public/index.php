<?php
declare(strict_types=1);

use App\Core\{HttpException, Request, Response};

require dirname(__DIR__) . '/src/bootstrap.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$router = require APP_ROOT . '/src/routes.php';
$req = Request::fromGlobals();

try {
    Response::json($router->dispatch($req));
} catch (HttpException $e) {
    Response::json(Response::error($e->getMessage(), $e->status), $e->status);
} catch (\Throwable $e) {
    error_log('[campus] ' . $e);
    $msg = config('env') === 'dev' ? $e->getMessage() : '服务繁忙，请稍后再试';
    Response::json(Response::error($msg, 500), 500);
}
