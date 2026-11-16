<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};
use App\Services\{Ledger, Settings};

/**
 * 二手交易：担保交易模式 —— 买家下单付款由平台托管，当面验货后买家确认收货，
 * 货款打给卖家并扣除 market_fee_rate 服务费；交易前任一方可取消，全额退款。
 */
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
        $uid = (int) $req->user['id'];
        $item['is_owner'] = (int) $item['user_id'] === $uid;
        $item['fee_rate'] = (float) Settings::get('market_fee_rate');
        // 进行中的担保交易：买家看到自己的订单，卖家看到买家的订单
        $item['active_order'] = Db::one(
            "SELECT o.*, b.nickname AS buyer_name FROM market_orders o JOIN users b ON b.id = o.buyer_id
             WHERE o.item_id = ? AND o.status = 'paid' AND (o.buyer_id = ? OR o.seller_id = ?)",
            [$id, $uid, $uid]
        );
        if (!$item['is_owner'] && !$item['active_order']) {
            $item['contact'] = null; // 联系方式下单后可见，引导走担保交易
        }
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

    /* ---------- 担保交易 ---------- */

    public function buy(Request $req): array
    {
        $sid = Auth::schoolId($req);
        return Db::transaction(function () use ($req, $sid) {
            $item = Db::one('SELECT * FROM market_items WHERE id = ?', [(int) $req->params['id']]);
            if (!$item || (int) $item['school_id'] !== $sid) {
                throw new HttpException('商品不存在', 404);
            }
            if ((int) $item['user_id'] === (int) $req->user['id']) {
                throw new HttpException('不能购买自己发布的物品', 422);
            }
            $n = Db::run("UPDATE market_items SET status = 'reserved' WHERE id = ? AND status = 'on_sale'", [$item['id']])->rowCount();
            if (!$n) {
                throw new HttpException('手慢了，宝贝已被别人拍下', 422);
            }
            $id = Db::insert('market_orders', [
                'order_no'  => 'M' . date('YmdHis') . str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT),
                'school_id' => $sid,
                'item_id'   => $item['id'],
                'buyer_id'  => $req->user['id'],
                'seller_id' => $item['user_id'],
                'title'     => $item['title'],
                'price'     => $item['price'],
                'fee'       => Ledger::fee((int) $item['price'], 'market_fee_rate'),
            ]);
            return $this->order($id, $req->user);
        });
    }

    /** 我买到的 / 我卖出的 */
    public function orders(Request $req): array
    {
        $role = $req->oneOf('role', ['buy', 'sell'], 'buy');
        $col = $role === 'buy' ? 'o.buyer_id' : 'o.seller_id';
        $ids = Db::all("SELECT o.id FROM market_orders o WHERE $col = ? ORDER BY o.id DESC LIMIT 50", [$req->user['id']]);
        return array_map(fn($r) => $this->order((int) $r['id'], $req->user), $ids);
    }

    /** confirm 买家确认收货 / cancel 交易前取消（买卖双方均可） */
    public function orderAction(Request $req): array
    {
        $o = $this->order((int) $req->params['id'], $req->user);
        if ($o['status'] !== 'paid') {
            throw new HttpException('交易已结束', 422);
        }
        Db::transaction(static function () use ($o, $req) {
            if ($req->params['action'] === 'confirm') {
                if (!$o['is_buyer']) {
                    throw new HttpException('只有买家可以确认收货', 403);
                }
                Db::update('market_orders', ['status' => 'completed', 'completed_at' => now()], 'id = :id', ['id' => $o['id']]);
                Db::update('market_items', ['status' => 'sold'], 'id = :id', ['id' => $o['item_id']]);
                Ledger::add('market', (int) $o['school_id'], 'student', (int) $o['seller_id'], $o['price'] - $o['fee'], 'market_sale', '二手 · ' . $o['title'], null, (int) $o['id']);
                Ledger::add('market', (int) $o['school_id'], 'platform', null, (int) $o['fee'], 'market_fee', '二手 · ' . $o['title'], null, (int) $o['id']);
            } elseif ($req->params['action'] === 'cancel') {
                Db::update('market_orders', ['status' => 'cancelled'], 'id = :id', ['id' => $o['id']]);
                Db::run("UPDATE market_items SET status = 'on_sale' WHERE id = ? AND status = 'reserved'", [$o['item_id']]);
            } else {
                throw new HttpException('未知操作', 404);
            }
        });
        return $this->order((int) $o['id'], $req->user);
    }

    private function order(int $id, array $user): array
    {
        $o = Db::one(
            'SELECT o.*, i.images, i.item_condition, i.contact, b.nickname AS buyer_name, s.nickname AS seller_name
             FROM market_orders o JOIN market_items i ON i.id = o.item_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id WHERE o.id = ?',
            [$id]
        );
        $uid = (int) $user['id'];
        if (!$o || ((int) $o['buyer_id'] !== $uid && (int) $o['seller_id'] !== $uid)) {
            throw new HttpException('订单不存在', 404);
        }
        $o['is_buyer'] = (int) $o['buyer_id'] === $uid;
        $o['seller_income'] = $o['price'] - $o['fee'];
        if (!$o['is_buyer']) {
            unset($o['contact']);
        }
        return self::decode([$o])[0];
    }
}
