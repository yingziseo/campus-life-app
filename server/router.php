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
// 用户上传的图片（存于 server/storage/uploads，不在 web 根目录下）
if (preg_match('#^/uploads/(\d{6})/([a-f0-9]{24})\.(jpg|png|webp)$#', $path, $m)) {
    $file = __DIR__ . "/storage/uploads/{$m[1]}/{$m[2]}.{$m[3]}";
    if (!is_file($file)) {
        http_response_code(404);
        return true;
    }
    header('Content-Type: ' . ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$m[3]]);
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($file);
    return true;
}
if ($path === '/admin') {
    header('Location: /admin/');
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
