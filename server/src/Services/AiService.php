<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;

/**
 * AI 自助问答（预留）。
 * 当前：本地 FAQ 关键词匹配兜底，培养用户"有问题先问平台"的习惯。
 * 接入：config.php 中 ai.enabled=true 并配置 endpoint/api_key/model（OpenAI 兼容协议），
 *       命中的 FAQ 会作为上下文一并发送，保证回答贴合本校信息。
 */
final class AiService
{
    public static function ask(?array $user, string $question): array
    {
        $schoolId = $user['school_id'] ?? null;
        $matches  = self::searchFaq($question, $schoolId ? (int) $schoolId : null);

        $answer = null;
        $source = 'none';
        if (config('ai.enabled') && config('ai.endpoint')) {
            $answer = self::callModel($question, $matches);
            $source = $answer !== null ? 'ai' : 'none';
        }
        if ($answer === null && $matches) {
            $answer = $matches[0]['answer'];
            $source = 'faq';
            Db::run('UPDATE faqs SET hits = hits + 1 WHERE id = ?', [$matches[0]['id']]);
        }
        if ($answer === null) {
            $answer = '这个问题我暂时还答不上来～ AI 智能问答即将上线，你也可以在「树洞」发帖求助同学。';
        }

        Db::insert('ai_logs', [
            'user_id'   => $user['id'] ?? null,
            'school_id' => $schoolId,
            'question'  => mb_substr($question, 0, 500),
            'answer'    => $answer,
            'source'    => $source,
        ]);

        return [
            'answer'  => $answer,
            'source'  => $source,
            'related' => array_map(static fn($f) => ['id' => $f['id'], 'question' => $f['question']], array_slice($matches, 1, 3)),
            'ai_enabled' => (bool) config('ai.enabled'),
        ];
    }

    /** 关键词命中 + 字符二元组重合度打分 */
    public static function searchFaq(string $q, ?int $schoolId): array
    {
        $rows = Db::all('SELECT * FROM faqs WHERE school_id IS NULL OR school_id = ?', [$schoolId]);
        $qBigrams = self::bigrams($q);
        $scored = [];
        foreach ($rows as $row) {
            $score = 0.0;
            foreach (array_filter(explode(',', $row['keywords'])) as $kw) {
                if (mb_strpos($q, trim($kw)) !== false) {
                    $score += 3;
                }
            }
            $score += count(array_intersect($qBigrams, self::bigrams($row['question'])));
            if ($row['school_id'] !== null) {
                $score += 0.5; // 本校问题优先
            }
            if ($score >= 2) {
                $row['score'] = $score;
                $scored[] = $row;
            }
        }
        usort($scored, static fn($a, $b) => $b['score'] <=> $a['score']);
        return $scored;
    }

    private static function bigrams(string $s): array
    {
        $s = preg_replace('/[\s\p{P}]+/u', '', $s);
        $out = [];
        $len = mb_strlen($s);
        for ($i = 0; $i < $len - 1; $i++) {
            $out[] = mb_substr($s, $i, 2);
        }
        return array_values(array_unique($out));
    }

    /** OpenAI 兼容 chat/completions 调用，失败返回 null 走 FAQ 兜底 */
    private static function callModel(string $question, array $faqs): ?string
    {
        $context = implode("\n", array_map(static fn($f) => "Q: {$f['question']}\nA: {$f['answer']}", array_slice($faqs, 0, 5)));
        $payload = [
            'model'    => config('ai.model'),
            'messages' => [
                ['role' => 'system', 'content' => "你是校园生活助手，面向大学生和新生，回答简洁友好。优先依据以下本校资料回答，资料没有的不要编造：\n" . $context],
                ['role' => 'user', 'content' => $question],
            ],
        ];
        $ch = curl_init(config('ai.endpoint'));
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => (int) config('ai.timeout'),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Authorization: Bearer ' . config('ai.api_key')],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res === false || $code !== 200) {
            return null;
        }
        $json = json_decode((string) $res, true);
        return $json['choices'][0]['message']['content'] ?? null;
    }
}
