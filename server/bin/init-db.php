<?php
/**
 * 初始化数据库：php bin/init-db.php [--fresh]
 *   --fresh  删除全部表并重新灌入演示数据
 */
require dirname(__DIR__) . '/src/bootstrap.php';
require APP_ROOT . '/database/Seeder.php';

$fresh = in_array('--fresh', $argv, true);
Seeder::run($fresh);
echo ($fresh ? '已重建' : '已初始化') . '数据库：' . config('db_path') . PHP_EOL;
