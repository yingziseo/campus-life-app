<?php
declare(strict_types=1);

use App\Controllers as C;
use App\Core\Router;

$r = new Router();

// 账号 & 学校
$r->post('/api/auth/login',   [C\AuthController::class, 'login'], '');
$r->post('/api/auth/demo',    [C\AuthController::class, 'demo'], '');
$r->get('/api/auth/me',       [C\AuthController::class, 'me']);
$r->post('/api/auth/school',  [C\AuthController::class, 'setSchool']);
$r->post('/api/auth/profile', [C\AuthController::class, 'updateProfile']);
$r->post('/api/auth/logout',  [C\AuthController::class, 'logout']);
$r->get('/api/schools',               [C\SchoolController::class, 'list'], '');
$r->post('/api/schools/apply',        [C\SchoolController::class, 'apply'], '');
$r->get('/api/schools/{id}/config',   [C\SchoolController::class, 'config'], '');
$r->get('/api/home',                  [C\HomeController::class, 'index']);
$r->get('/api/config',                [C\HomeController::class, 'config'], '');
$r->get('/api/wallet',                [C\WalletController::class, 'index']);

// 板块一：校园基础业务
$r->get('/api/errands',                    [C\ErrandController::class, 'list']);
$r->get('/api/errands/mine',               [C\ErrandController::class, 'mine']);
$r->post('/api/errands',                   [C\ErrandController::class, 'create']);
$r->get('/api/errands/{id}',               [C\ErrandController::class, 'show']);
$r->post('/api/errands/{id}/{action}',     [C\ErrandController::class, 'action']);
$r->get('/api/market',                     [C\MarketController::class, 'list']);
$r->get('/api/market/mine',                [C\MarketController::class, 'mine']);
$r->post('/api/market',                    [C\MarketController::class, 'create']);
$r->get('/api/market/{id}',                [C\MarketController::class, 'show']);
$r->post('/api/market/{id}/status',        [C\MarketController::class, 'setStatus']);
$r->post('/api/market/{id}/buy',           [C\MarketController::class, 'buy']);
$r->get('/api/market-orders',              [C\MarketController::class, 'orders']);
$r->post('/api/market-orders/{id}/{action}', [C\MarketController::class, 'orderAction']);
$r->get('/api/treehole',                   [C\TreeholeController::class, 'list']);
$r->post('/api/treehole',                  [C\TreeholeController::class, 'create']);
$r->post('/api/treehole/{id}/like',        [C\TreeholeController::class, 'like']);
$r->get('/api/treehole/{id}/comments',     [C\TreeholeController::class, 'comments']);
$r->post('/api/treehole/{id}/comments',    [C\TreeholeController::class, 'comment']);
$r->post('/api/treehole/{id}/report',      [C\TreeholeController::class, 'report']);
$r->post('/api/upload',                    [C\UploadController::class, 'image']);

// 板块二：周边本地生活（学生）
$r->get('/api/local/merchants',        [C\LocalController::class, 'merchants']);
$r->get('/api/local/merchants/{id}',   [C\LocalController::class, 'merchant']);
$r->get('/api/local/deals/{id}',       [C\LocalController::class, 'deal']);
$r->get('/api/local/recommend',        [C\LocalController::class, 'recommend']);
$r->get('/api/coupons/today',          [C\CouponController::class, 'today']);
$r->get('/api/coupons/mine',           [C\CouponController::class, 'mine']);
$r->get('/api/coupons/usable',         [C\CouponController::class, 'usable']);
$r->post('/api/coupons/{id}/claim',    [C\CouponController::class, 'claim']);
$r->post('/api/orders',                [C\OrderController::class, 'create']);
$r->get('/api/orders',                 [C\OrderController::class, 'mine']);
$r->get('/api/orders/{id}',            [C\OrderController::class, 'show']);
$r->post('/api/orders/{id}/pay',       [C\OrderController::class, 'pay']);
$r->post('/api/orders/{id}/cancel',    [C\OrderController::class, 'cancel']);

// 商家端
$r->post('/api/merchant/apply',                [C\MerchantController::class, 'apply']);
$r->post('/api/merchant/quote',                [C\MerchantController::class, 'quote']);
$r->get('/api/merchant/profile',               [C\MerchantController::class, 'profile'], 'merchant');
$r->post('/api/merchant/profile',              [C\MerchantController::class, 'updateProfile'], 'merchant');
$r->get('/api/merchant/dashboard',             [C\MerchantController::class, 'dashboard'], 'merchant');
$r->get('/api/merchant/deals',                 [C\MerchantController::class, 'deals'], 'merchant');
$r->post('/api/merchant/deals',                [C\MerchantController::class, 'saveDeal'], 'merchant');
$r->post('/api/merchant/deals/{id}',           [C\MerchantController::class, 'saveDeal'], 'merchant');
$r->post('/api/merchant/deals/{id}/toggle',    [C\MerchantController::class, 'toggleDeal'], 'merchant');
$r->get('/api/merchant/orders',                [C\MerchantController::class, 'orders'], 'merchant');
$r->post('/api/merchant/orders/{id}/advance',  [C\MerchantController::class, 'advance'], 'merchant');
$r->post('/api/merchant/verify',               [C\MerchantController::class, 'verify'], 'merchant');
$r->get('/api/merchant/promotions',            [C\MerchantController::class, 'promotions'], 'merchant');
$r->post('/api/merchant/promotions',           [C\MerchantController::class, 'buyPromotion'], 'merchant');

// 客户经理端
$r->get('/api/manager/dashboard',                  [C\ManagerController::class, 'dashboard'], 'manager');
$r->get('/api/manager/merchants',                  [C\ManagerController::class, 'merchants'], 'manager');
$r->post('/api/manager/merchants/{id}/{action}',   [C\ManagerController::class, 'review'], 'manager');
$r->get('/api/manager/commissions',                [C\ManagerController::class, 'commissions'], 'manager');

// 骑手端（校园外卖团队，学生兼职）
$r->post('/api/rider/apply',      [C\RiderController::class, 'apply']);
$r->get('/api/rider/dashboard',   [C\RiderController::class, 'dashboard'], 'rider');
$r->get('/api/rider/batch',       [C\RiderController::class, 'batch'], 'rider');
$r->post('/api/rider/pickup',     [C\RiderController::class, 'pickup'], 'rider');
$r->post('/api/rider/deliver',    [C\RiderController::class, 'deliver'], 'rider');
$r->get('/api/rider/earnings',    [C\RiderController::class, 'earnings'], 'rider');

// 平台管理后台
$r->get('/api/admin/dashboard',                  [C\AdminController::class, 'dashboard'], 'admin');
$r->get('/api/admin/schools',                    [C\AdminController::class, 'schools'], 'admin');
$r->post('/api/admin/schools',                   [C\AdminController::class, 'saveSchool'], 'admin');
$r->post('/api/admin/schools/{id}',              [C\AdminController::class, 'saveSchool'], 'admin');
$r->get('/api/admin/merchants',                  [C\AdminController::class, 'merchants'], 'admin');
$r->post('/api/admin/merchants/{id}/{action}',   [C\AdminController::class, 'reviewMerchant'], 'admin');
$r->get('/api/admin/deals',                      [C\AdminController::class, 'deals'], 'admin');
$r->post('/api/admin/deals/{id}/toggle',         [C\AdminController::class, 'toggleDeal'], 'admin');
$r->get('/api/admin/orders',                     [C\AdminController::class, 'orders'], 'admin');
$r->get('/api/admin/ledger',                     [C\AdminController::class, 'ledger'], 'admin');
$r->get('/api/admin/users',                      [C\AdminController::class, 'users'], 'admin');
$r->post('/api/admin/users/{id}',                [C\AdminController::class, 'updateUser'], 'admin');
$r->get('/api/admin/settings',                   [C\AdminController::class, 'settings'], 'admin');
$r->post('/api/admin/settings',                  [C\AdminController::class, 'saveSettings'], 'admin');
$r->get('/api/admin/faqs',                       [C\AdminController::class, 'faqs'], 'admin');
$r->post('/api/admin/faqs',                      [C\AdminController::class, 'saveFaq'], 'admin');
$r->post('/api/admin/faqs/{id}',                 [C\AdminController::class, 'saveFaq'], 'admin');
$r->post('/api/admin/faqs/{id}/delete',          [C\AdminController::class, 'deleteFaq'], 'admin');
$r->get('/api/admin/ai-logs',                    [C\AdminController::class, 'aiLogs'], 'admin');
$r->get('/api/admin/treehole',                   [C\AdminController::class, 'treehole'], 'admin');
$r->post('/api/admin/treehole/{id}/{action}',    [C\AdminController::class, 'moderatePost'], 'admin');
$r->get('/api/admin/revenue',                    [C\AdminController::class, 'revenue'], 'admin');
$r->get('/api/admin/promotions',                 [C\AdminController::class, 'promotions'], 'admin');
$r->post('/api/admin/promotions',                [C\AdminController::class, 'createPromotion'], 'admin');
$r->post('/api/admin/promotions/{id}/{action}',  [C\AdminController::class, 'promotionAction'], 'admin');
$r->get('/api/admin/coupons',                    [C\AdminController::class, 'coupons'], 'admin');
$r->post('/api/admin/coupons',                   [C\AdminController::class, 'saveCoupon'], 'admin');
$r->post('/api/admin/coupons/{id}',              [C\AdminController::class, 'saveCoupon'], 'admin');

// AI 问答（预留，当前 FAQ 兜底）
$r->post('/api/ai/ask', [C\AiController::class, 'ask'], '');
$r->get('/api/ai/hot',  [C\AiController::class, 'hot'], '');

// 开发辅助
$r->post('/api/dev/reset', [C\DevController::class, 'reset'], '');
$r->get('/api/dev/coupons', [C\DevController::class, 'coupons'], 'merchant');

return $r;
