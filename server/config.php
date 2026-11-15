<?php
/**
 * 全局配置。本地覆盖请新建 config.local.php（已被 .gitignore 忽略），返回同结构数组即可。
 */
$config = [
    'app_name' => '校园生活',
    'env'      => getenv('APP_ENV') ?: 'dev',          // dev 环境开放演示登录与数据重置接口
    'db_path'  => getenv('DB_PATH') ?: __DIR__ . '/storage/campus.db',
    'session_ttl_days' => 30,
    'timezone' => 'Asia/Shanghai',

    // AI 问答（预留）：enabled=false 时只走本地 FAQ 知识库
    'ai' => [
        'enabled'  => false,
        'endpoint' => getenv('AI_ENDPOINT') ?: '',
        'api_key'  => getenv('AI_API_KEY') ?: '',
        'model'    => getenv('AI_MODEL') ?: '',
        'timeout'  => 20,
    ],
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}
return $config;
