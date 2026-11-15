<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};

/** 跑腿 & 代取快递 */
final class ErrandController
{
    private const SELECT = 'SELECT e.*, u.nickname AS user_nickname, r.nickname AS runner_nickname
        FROM errands e JOIN users u ON u.id = e.user_id LEFT JOIN users r ON r.id = e.runner_id';

    public function list(Request $req): array
    {
        $sid = Auth::schoolId($req);
        [$limit, $offset] = $req->page();
        $where = ['e.school_id = ?'];
        $params = [$sid];
        if ($type = $req->str('type', 10)) {
            $where[] = 'e.type = ?';
            $params[] = $type;
        }
        $where[] = 'e.status = ?';
        $params[] = $req->str('status', 12) ?: 'open';
        $rows = Db::all(self::SELECT . ' WHERE ' . implode(' AND ', $where) . " ORDER BY e.id DESC LIMIT $limit OFFSET $offset", $params);
        return array_map(fn($r) => $this->present($r, $req->user), $rows);
    }

    public function mine(Request $req): array
    {
        $uid = $req->user['id'];
        $rows = Db::all(self::SELECT . ' WHERE e.user_id = ? OR e.runner_id = ? ORDER BY e.id DESC LIMIT 50', [$uid, $uid]);
        return array_map(fn($r) => $this->present($r, $req->user), $rows);
    }

    public function show(Request $req): array
    {
        return $this->present($this->find((int) $req->params['id']), $req->user);
    }

    public function create(Request $req): array
    {
        $sid = Auth::schoolId($req);
        $type = $req->oneOf('type', ['errand', 'express']);
        $reward = $req->money('reward', true, '赏金');
        if ($reward < 100 || $reward > 20000) {
            throw new HttpException('赏金需在 1~200 元之间', 422);
        }
        $data = [
            'school_id'    => $sid,
            'user_id'      => $req->user['id'],
            'type'         => $type,
            'title'        => $req->str('title', 40, true, '标题'),
            'description'  => $req->str('description', 300),
            'pickup_addr'  => $req->str('pickup_addr', 60),
            'deliver_addr' => $req->str('deliver_addr', 60, true, '送达地点'),
            'reward'       => $reward,
        ];
        if ($type === 'express') {
            $data['express_station'] = $req->str('express_station', 40, true, '快递驿站');
            $data['express_code']    = $req->str('express_code', 40, true, '取件码');
            $data['size']            = $req->oneOf('size', ['small', 'medium', 'large'], 'small');
            $data['pickup_addr']     = $data['express_station'];
        } elseif ($data['pickup_addr'] === '') {
            throw new HttpException('请填写取件/购买地点', 422);
        }
        $id = Db::insert('errands', $data);
        return $this->present($this->find($id), $req->user);
    }

    /** 状态流转：accept 接单 / deliver 送达 / complete 确认完成 / cancel 取消 */
    public function action(Request $req): array
    {
        $e = $this->find((int) $req->params['id']);
        $uid = (int) $req->user['id'];
        $isOwner = (int) $e['user_id'] === $uid;
        $isRunner = (int) $e['runner_id'] === $uid;

        switch ($req->params['action']) {
            case 'accept':
                if ($isOwner) throw new HttpException('不能接自己发布的单', 422);
                if ($e['status'] !== 'open') throw new HttpException('手慢了，这单已被接走', 422);
                $n = Db::run("UPDATE errands SET status = 'accepted', runner_id = ?, accepted_at = ? WHERE id = ? AND status = 'open'", [$uid, now(), $e['id']])->rowCount();
                if (!$n) throw new HttpException('手慢了，这单已被接走', 422);
                break;
            case 'deliver':
                if (!$isRunner || $e['status'] !== 'accepted') throw new HttpException('当前状态不可操作', 422);
                Db::update('errands', ['status' => 'delivered'], 'id = :id', ['id' => $e['id']]);
                break;
            case 'complete':
                if (!$isOwner || !in_array($e['status'], ['accepted', 'delivered'], true)) throw new HttpException('当前状态不可操作', 422);
                Db::update('errands', ['status' => 'completed', 'completed_at' => now()], 'id = :id', ['id' => $e['id']]);
                break;
            case 'cancel':
                if (!$isOwner || $e['status'] !== 'open') throw new HttpException('已被接单，请联系接单人协商', 422);
                Db::update('errands', ['status' => 'cancelled'], 'id = :id', ['id' => $e['id']]);
                break;
            default:
                throw new HttpException('未知操作', 404);
        }
        return $this->present($this->find((int) $e['id']), $req->user);
    }

    private function find(int $id): array
    {
        $e = Db::one(self::SELECT . ' WHERE e.id = ?', [$id]);
        if (!$e) {
            throw new HttpException('订单不存在', 404);
        }
        return $e;
    }

    /** 取件码等隐私信息仅发布者与接单人可见 */
    private function present(array $e, array $user): array
    {
        $uid = (int) $user['id'];
        $e['is_owner'] = (int) $e['user_id'] === $uid;
        $e['is_runner'] = (int) $e['runner_id'] === $uid;
        if (!$e['is_owner'] && !$e['is_runner']) {
            $e['express_code'] = $e['express_code'] ? '接单后可见' : null;
        }
        return $e;
    }
}
