<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, HttpException, Request};

final class SchoolController
{
    public function list(Request $req): array
    {
        $kw = $req->str('keyword', 30);
        $sql = "SELECT id, name, short_name, city, status, is_pilot FROM schools WHERE status IN ('active','preparing')";
        $params = [];
        if ($kw !== '') {
            $sql .= ' AND (name LIKE ? OR city LIKE ?)';
            $params = ["%$kw%", "%$kw%"];
        }
        $sql .= " ORDER BY is_pilot DESC, status = 'active' DESC, id";
        return Db::all($sql, $params);
    }

    /** 申请开通新学校（原型：记录申请，由平台后台审核开通） */
    public function apply(Request $req): array
    {
        $name = $req->str('name', 40, true, '学校名称');
        $city = $req->str('city', 20, true, '所在城市');
        $contact = $req->str('contact', 40, true, '联系方式');
        $exists = Db::one('SELECT id, status FROM schools WHERE name = ?', [$name]);
        if ($exists) {
            return ['id' => (int) $exists['id'], 'status' => $exists['status'], 'message' => '该学校已在列表中'];
        }
        $id = Db::insert('schools', ['name' => $name, 'city' => $city, 'contact' => $contact, 'status' => 'applying']);
        return ['id' => $id, 'status' => 'applying', 'message' => '申请已提交，我们会尽快联系你'];
    }

    public function config(Request $req): array
    {
        $s = Db::one('SELECT id, name, delivery_slots, delivery_points FROM schools WHERE id = ?', [(int) $req->params['id']]);
        if (!$s) {
            throw new HttpException('学校不存在', 404);
        }
        $s['delivery_slots']  = json_decode($s['delivery_slots'], true);
        $s['delivery_points'] = json_decode($s['delivery_points'], true);
        return $s;
    }
}
