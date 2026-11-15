<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Auth, Db, HttpException, Request};

/** 树洞：前台匿名，后台留存 user_id 以便依法追溯（见 docs/01 合规说明） */
final class TreeholeController
{
    public const TAGS = ['日常', '表白', '吐槽', '求助', '失物招领'];
    private const ADJ = ['安静的', '快乐的', '迷路的', '熬夜的', '干饭的', '温柔的', '勇敢的', '摸鱼的'];
    private const ANIMAL = ['水豚', '柴犬', '橘猫', '企鹅', '海鸥', '松鼠', '刺猬', '考拉'];
    private const BANNED = ['微信号', '加我', '代考', '刷单', '赌'];

    public function list(Request $req): array
    {
        $sid = Auth::schoolId($req);
        [$limit, $offset] = $req->page();
        $where = "p.school_id = ? AND p.status = 'normal'";
        $params = [$req->user['id'], $sid];
        if (($tag = $req->str('tag', 10)) && in_array($tag, self::TAGS, true)) {
            $where .= ' AND p.tag = ?';
            $params[] = $tag;
        }
        return Db::all(
            "SELECT p.id, p.anon_name, p.content, p.tag, p.like_count, p.comment_count, p.created_at,
                    (l.user_id IS NOT NULL) AS liked
             FROM treehole_posts p LEFT JOIN treehole_likes l ON l.post_id = p.id AND l.user_id = ?
             WHERE $where ORDER BY p.id DESC LIMIT $limit OFFSET $offset",
            $params
        );
    }

    public function create(Request $req): array
    {
        $sid = Auth::schoolId($req);
        $content = $req->str('content', 500, true, '内容');
        $this->moderate($content);
        $id = Db::insert('treehole_posts', [
            'school_id' => $sid,
            'user_id'   => $req->user['id'],
            'anon_name' => self::ADJ[array_rand(self::ADJ)] . self::ANIMAL[array_rand(self::ANIMAL)],
            'content'   => $content,
            'tag'       => $req->oneOf('tag', self::TAGS, '日常'),
        ]);
        return Db::one('SELECT id, anon_name, content, tag, like_count, comment_count, created_at FROM treehole_posts WHERE id = ?', [$id]);
    }

    public function like(Request $req): array
    {
        $pid = (int) $req->params['id'];
        $this->post($pid);
        $uid = $req->user['id'];
        return Db::transaction(function () use ($pid, $uid) {
            if (Db::value('SELECT 1 FROM treehole_likes WHERE post_id = ? AND user_id = ?', [$pid, $uid])) {
                Db::run('DELETE FROM treehole_likes WHERE post_id = ? AND user_id = ?', [$pid, $uid]);
                Db::run('UPDATE treehole_posts SET like_count = like_count - 1 WHERE id = ?', [$pid]);
                $liked = false;
            } else {
                Db::insert('treehole_likes', ['post_id' => $pid, 'user_id' => $uid]);
                Db::run('UPDATE treehole_posts SET like_count = like_count + 1 WHERE id = ?', [$pid]);
                $liked = true;
            }
            return ['liked' => $liked, 'like_count' => (int) Db::value('SELECT like_count FROM treehole_posts WHERE id = ?', [$pid])];
        });
    }

    public function comments(Request $req): array
    {
        $pid = (int) $req->params['id'];
        $post = $this->post($pid);
        unset($post['user_id']);
        return [
            'post' => $post,
            'comments' => Db::all('SELECT id, anon_name, content, created_at FROM treehole_comments WHERE post_id = ? ORDER BY id', [$pid]),
        ];
    }

    public function comment(Request $req): array
    {
        $pid = (int) $req->params['id'];
        $post = $this->post($pid);
        $content = $req->str('content', 200, true, '评论');
        $this->moderate($content);
        // 同一帖子内同一用户保持同一匿名身份，楼主显示"洞主"
        $anon = (int) $post['user_id'] === (int) $req->user['id']
            ? '洞主'
            : (Db::value('SELECT anon_name FROM treehole_comments WHERE post_id = ? AND user_id = ? LIMIT 1', [$pid, $req->user['id']])
                ?: self::ADJ[array_rand(self::ADJ)] . self::ANIMAL[array_rand(self::ANIMAL)]);
        $id = Db::insert('treehole_comments', ['post_id' => $pid, 'user_id' => $req->user['id'], 'anon_name' => $anon, 'content' => $content]);
        Db::run('UPDATE treehole_posts SET comment_count = comment_count + 1 WHERE id = ?', [$pid]);
        return Db::one('SELECT id, anon_name, content, created_at FROM treehole_comments WHERE id = ?', [$id]);
    }

    private function post(int $id): array
    {
        $p = Db::one("SELECT * FROM treehole_posts WHERE id = ? AND status = 'normal'", [$id]);
        if (!$p) {
            throw new HttpException('帖子不存在或已被隐藏', 404);
        }
        return $p;
    }

    /** 原型级敏感词拦截；正式版接入微信内容安全 msgSecCheck + 人工复审 */
    private function moderate(string $text): void
    {
        foreach (self::BANNED as $w) {
            if (mb_strpos($text, $w) !== false) {
                throw new HttpException('内容包含不允许发布的信息', 422);
            }
        }
    }
}
