<?php
declare(strict_types=1);

namespace App\Core;

use PDO;

/** SQLite 轻量封装。后续迁移 MySQL 只需替换 DSN 与少量方言（datetime 函数、AUTOINCREMENT）。 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $path = config('db_path');
            $dir = dirname($path);
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            self::$pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            self::$pdo->exec('PRAGMA foreign_keys = ON');
            self::$pdo->exec('PRAGMA journal_mode = WAL');
            self::$pdo->exec('PRAGMA busy_timeout = 5000');
        }
        return self::$pdo;
    }

    /** 测试或重置时切换数据库 */
    public static function reset(): void
    {
        self::$pdo = null;
    }

    public static function run(string $sql, array $params = []): \PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::typed(self::run($sql, $params));
    }

    public static function one(string $sql, array $params = []): ?array
    {
        return self::typed(self::run($sql, $params), 1)[0] ?? null;
    }

    /**
     * PHP 8.0 的 pdo_sqlite 会把所有值返回为字符串，这里按 SQLite 存储类型还原 int/float，
     * 保证 API 输出的 JSON 类型稳定（TEXT 列如手机号、订单号保持字符串）。
     */
    private static function typed(\PDOStatement $stmt, int $limit = 0): array
    {
        $rows = [];
        $n = $stmt->columnCount();
        while (($row = $stmt->fetch(PDO::FETCH_NUM)) !== false) {
            $assoc = [];
            for ($i = 0; $i < $n; $i++) {
                $meta = $stmt->getColumnMeta($i);
                $v = $row[$i];
                if ($v !== null) {
                    $type = $meta['native_type'] ?? '';
                    if ($type === 'integer') {
                        $v = (int) $v;
                    } elseif ($type === 'double') {
                        $v = (float) $v;
                    }
                }
                $assoc[$meta['name']] = $v;
            }
            $rows[] = $assoc;
            if ($limit && count($rows) >= $limit) {
                $stmt->closeCursor();
                break;
            }
        }
        return $rows;
    }

    public static function value(string $sql, array $params = [])
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(',', $cols),
            implode(',', array_map(static fn($c) => ':' . $c, $cols))
        );
        self::run($sql, $data);
        return (int) self::pdo()->lastInsertId();
    }

    public static function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $sets = [];
        $params = [];
        foreach ($data as $col => $val) {
            $sets[] = "$col = :set_$col";
            $params["set_$col"] = $val;
        }
        $sql = sprintf('UPDATE %s SET %s WHERE %s', $table, implode(',', $sets), $where);
        return self::run($sql, array_merge($params, $whereParams))->rowCount();
    }

    /** @template T @param callable():T $fn @return T */
    public static function transaction(callable $fn)
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $fn(); // 嵌套调用并入外层事务
        }
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
