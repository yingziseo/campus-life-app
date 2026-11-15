<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};

/** 二手交易 */
final class MarketController
{
    public const CATEGORIES = ['book', 'digital', 'daily', 'sport', 'other'];

    public function list(Request $req): array
    {
        $sid = Auth::schoolId($req);
        [$limit, $offset] = $req->page();
        $where = ["i.school_id = ?", "i.status = 'on_sale'"];
        $params = [$sid];
        if (($cat = $req->str('category', 10)) && in_array($cat, self::CATEGORIES, true)) {
            $where[] = 'i.category = ?';
            $params[] = $cat;
        }
        if ($kw = $req->str('keyword', 30)) {
            $where[] = '(i.title LIKE ? OR i.description LIKE ?)';
            array_push($params, "%$kw%", "%$kw%");
        }
        return self::decode(Db::all(
            'SELECT i.id, i.title, i.price, i.original_price, i.category, i.item_condition, i.views, i.images, i.created_at, u.nickname
             FROM market_items i JOIN users u ON u.id = i.user_id WHERE ' . implode(' AND ', $where) . " ORDER BY i.id DESC LIMIT $limit OFFSET $offset",
            $params
        ));
    }

    public static function decode(array $rows): array
    {
        return array_map(static function (array $r): array {
            $r['images'] = json_decode($r['images'] ?? '[]', true) ?: [];
            return $r;
        }, $rows);
    }

    public function mine(Request $req): array
    {
        return self::decode(Db::all('SELECT * FROM market_items WHERE user_id = ? ORDER BY id DESC', [$req->user['id']]));
    }

    public function show(Request $req): array
    {
        $id = (int) $req->params['id'];
        Db::run('UPDATE market_items SET views = views + 1 WHERE id = ?', [$id]);
        $item = Db::one('SELECT i.*, u.nickname FROM market_items i JOIN users u ON u.id = i.user_id WHERE i.id = ?', [$id]);
        if (!$item) {
            throw new HttpException('商品不存在', 404);
        }
        $item['is_owner'] = (int) $item['user_id'] === (int) $req->user['id'];
        return self::decode([$item])[0];
    }

    public function create(Request $req): array
    {
        $sid = Auth::schoolId($req);
        $price = $req->money('price', true, '价格');
        if ($price <= 0 || $price > 10000000) {
            throw new HttpException('价格不合法', 422);
        }
        $id = Db::insert('market_items', [
            'school_id'      => $sid,
            'user_id'        => $req->user['id'],
            'title'          => $req->str('title', 40, true, '标题'),
            'description'    => $req->str('description', 500),
            'category'       => $req->oneOf('category', self::CATEGORIES, 'other'),
            'item_condition' => $req->str('item_condition', 10) ?: '9成新',
            'price'          => $price,
            'original_price' => $req->money('original_price'),
            'contact'        => $req->str('contact', 40, true, '联系方式'),
            'images'         => json_encode($this->images($req)),
        ]);
        return self::decode([Db::one('SELECT * FROM market_items WHERE id = ?', [$id])])[0];
    }

    /** 最多 6 张，只接受本站上传地址 */
    private function images(Request $req): array
    {
        $list = $req->input('images', []);
        if (!is_array($list)) {
            return [];
        }
        return array_values(array_filter(array_map(static fn($u) => UploadController::checkUrl((string) $u), array_slice($list, 0, 6))));
    }

    public function setStatus(Request $req): array
    {
        $item = Db::one('SELECT * FROM market_items WHERE id = ? AND user_id = ?', [(int) $req->params['id'], $req->user['id']]);
        if (!$item) {
            throw new HttpException('商品不存在', 404);
        }
        $status = $req->oneOf('status', ['on_sale', 'reserved', 'sold', 'off']);
        Db::update('market_items', ['status' => $status], 'id = :id', ['id' => $item['id']]);
        return ['id' => (int) $item['id'], 'status' => $status];
    }
}
