<?php
/**
 * PHP 内置服务器入口（原型预览用）：
 *   php -S 0.0.0.0:8100 -t ../web router.php
 * /api/* 交给 public/index.php，其余按 web/ 下静态文件处理，/ 跳转到手机预览页。
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (strncmp($path, '/api/', 5) === 0 || $path === '/api') {
    require __DIR__ . '/public/index.php';
    return true;
}
if ($path === '/' || $path === '') {
    header('Location: /preview.html');
    return true;
}
if ($path === '/app') {
    header('Location: /app/');
    return true;
}
return false; // 静态文件交给内置服务器
