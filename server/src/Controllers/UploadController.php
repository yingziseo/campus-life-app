<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{HttpException, Request};

/**
 * 图片上传：存放于 server/storage/uploads/YYYYMM/，通过 /uploads/... 访问。
 * 正式版替换为对象存储（COS/OSS），接口与返回结构不变。
 */
final class UploadController
{
    private const MAX_BYTES = 3 * 1024 * 1024;
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public function image(Request $req): array
    {
        $file = $req->files['file'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new HttpException('请选择图片', 422);
        }
        if ($file['size'] > self::MAX_BYTES) {
            throw new HttpException('图片不能超过 3MB', 422);
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!isset(self::TYPES[$mime]) || @getimagesize($file['tmp_name']) === false) {
            throw new HttpException('仅支持 JPG / PNG / WEBP 图片', 422);
        }
        $sub = date('Ym');
        $dir = self::root() . '/' . $sub;
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $name = bin2hex(random_bytes(12)) . '.' . self::TYPES[$mime];
        if (!move_uploaded_file($file['tmp_name'], "$dir/$name")) {
            throw new HttpException('保存失败，请重试', 500);
        }
        return ['url' => "/uploads/$sub/$name"];
    }

    public static function root(): string
    {
        return APP_ROOT . '/storage/uploads';
    }

    /** 只接受本站上传目录下的地址，防止注入外部链接 */
    public static function checkUrl(string $url): ?string
    {
        if ($url === '') {
            return null;
        }
        return preg_match('#^/uploads/\d{6}/[a-f0-9]{24}\.(jpg|png|webp)$#', $url) ? $url : null;
    }
}
