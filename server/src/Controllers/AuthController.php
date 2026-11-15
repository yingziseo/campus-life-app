<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};

final class AuthController
{
    /** 演示账号（seed.php 中创建），仅 dev 环境可一键登录 */
    public const DEMO = [
        'student'  => '13800000001',
        'merchant' => '13800000002',
        'manager'  => '13800000003',
        'rider'    => '13800000004',
        'admin'    => '13800000000',
    ];

    /** 手机号 + 验证码登录。原型阶段验证码固定 1234，正式版接短信或微信 wx.login */
    public function login(Request $req): array
    {
        $phone = $req->str('phone', 11, true, '手机号');
        if (!preg_match('/^1\d{10}$/', $phone)) {
            throw new HttpException('手机号格式不正确', 422);
        }
        if ($req->str('code', 6, true, '验证码') !== '1234') {
            throw new HttpException('验证码错误（演示环境请输入 1234）', 422);
        }
        $user = Db::one('SELECT * FROM users WHERE phone = ?', [$phone]);
        if ($user && $user['status'] === 'banned') {
            throw new HttpException('账号已被限制使用，请联系平台', 403);
        }
        if (!$user) {
            $id = Db::insert('users', ['phone' => $phone, 'nickname' => '同学' . substr($phone, -4), 'role' => 'student']);
            $user = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        }
        return ['token' => Auth::issueToken((int) $user['id']), 'user' => $this->profile($user)];
    }

    public function demo(Request $req): array
    {
        if (config('env') !== 'dev') {
            throw new HttpException('仅开发环境可用', 403);
        }
        $role = $req->oneOf('role', array_keys(self::DEMO));
        $user = Db::one('SELECT * FROM users WHERE phone = ?', [self::DEMO[$role]]);
        if (!$user) {
            throw new HttpException('演示数据未初始化，请执行 php bin/init-db.php', 500);
        }
        return ['token' => Auth::issueToken((int) $user['id']), 'user' => $this->profile($user)];
    }

    public function me(Request $req): array
    {
        return $this->profile($req->user);
    }

    public function setSchool(Request $req): array
    {
        $school = Db::one("SELECT * FROM schools WHERE id = ? AND status = 'active'", [$req->int('school_id')]);
        if (!$school) {
            throw new HttpException('该学校暂未开通', 422);
        }
        if ($req->user['role'] === 'merchant' && Db::value('SELECT 1 FROM merchants WHERE owner_user_id = ?', [$req->user['id']])) {
            throw new HttpException('商家账号已绑定入驻学校，不能切换', 422);
        }
        Db::update('users', ['school_id' => $school['id']], 'id = :id', ['id' => $req->user['id']]);
        return $this->profile(Db::one('SELECT * FROM users WHERE id = ?', [$req->user['id']]));
    }

    public function updateProfile(Request $req): array
    {
        $nickname = $req->str('nickname', 20, true, '昵称');
        Db::update('users', ['nickname' => $nickname], 'id = :id', ['id' => $req->user['id']]);
        return $this->profile(Db::one('SELECT * FROM users WHERE id = ?', [$req->user['id']]));
    }

    public function logout(Request $req): array
    {
        Db::run('DELETE FROM sessions WHERE token = ?', [$req->bearer()]);
        return [];
    }

    private function profile(array $u): array
    {
        $school = $u['school_id'] ? Db::one('SELECT id, name, short_name, city, is_pilot FROM schools WHERE id = ?', [$u['school_id']]) : null;
        $merchant = $u['role'] === 'merchant'
            ? Db::one('SELECT id, name, status, category FROM merchants WHERE owner_user_id = ?', [$u['id']])
            : null;
        return [
            'id'          => (int) $u['id'],
            'phone'       => substr($u['phone'], 0, 3) . '****' . substr($u['phone'], -4),
            'nickname'    => $u['nickname'],
            'role'        => $u['role'],
            'school'      => $school,
            'invite_code' => $u['role'] === 'manager' ? $u['invite_code'] : null,
            'rider_status'=> $u['rider_status'],
            'merchant'    => $merchant,
        ];
    }
}
