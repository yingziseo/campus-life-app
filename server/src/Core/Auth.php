<?php
declare(strict_types=1);

namespace App\Core;

final class Auth
{
    public static function resolve(Request $req, array $roles): ?array
    {
        $token = $req->bearer();
        $user = $token ? self::userByToken($token) : null;

        if ($roles === [''] ) {
            return $user; // 公开接口，登录态可选
        }
        if (!$user) {
            throw new HttpException('请先登录', 401);
        }
        if ($user['status'] === 'banned') {
            throw new HttpException('账号已被限制使用，请联系平台', 403);
        }
        // 骑手是学生的兼职身份（rider_status），不占用 role
        if (in_array('rider', $roles, true) && $user['rider_status'] === 'approved') {
            return $user;
        }
        if ($roles !== ['login'] && !in_array($user['role'], $roles, true) && $user['role'] !== 'admin') {
            throw new HttpException('当前身份无权访问', 403);
        }
        return $user;
    }

    public static function userByToken(string $token): ?array
    {
        return Db::one(
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
            [$token, now()]
        );
    }

    public static function issueToken(int $userId): string
    {
        $token = bin2hex(random_bytes(24));
        Db::insert('sessions', [
            'token'      => $token,
            'user_id'    => $userId,
            'expires_at' => date('Y-m-d H:i:s', strtotime('+' . config('session_ttl_days') . ' days')),
        ]);
        return $token;
    }

    /** 当前用户必须已选择学校 */
    public static function schoolId(Request $req): int
    {
        $sid = (int) ($req->user['school_id'] ?? 0);
        if (!$sid) {
            throw new HttpException('请先选择学校', 412);
        }
        return $sid;
    }
}
