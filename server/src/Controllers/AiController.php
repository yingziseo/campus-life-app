<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{Db, Request};
use App\Services\AiService;

final class AiController
{
    public function ask(Request $req): array
    {
        return AiService::ask($req->user, $req->str('question', 200, true, '问题'));
    }

    public function hot(Request $req): array
    {
        $sid = $req->user['school_id'] ?? null;
        return Db::all('SELECT id, question FROM faqs WHERE school_id IS NULL OR school_id = ? ORDER BY hits DESC, id LIMIT 8', [$sid]);
    }
}
