<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class MysqlDocsTest extends TestCase
{
    #[Test]
    public function deploy_docs_require_mysql_not_postgres_or_sqlite(): void
    {
        $root = dirname(__DIR__, 2);
        $deploy = file_get_contents($root.'/docs/DEPLOY.md');
        $readme = file_get_contents($root.'/README.md');
        $render = file_get_contents($root.'/render.yaml');
        $example = file_get_contents($root.'/.env.example');
        $dtr = file_get_contents($root.'/config/dtr.php');

        $this->assertStringNotContainsString('Neon', $deploy);
        $this->assertStringNotContainsString('pgsql', $deploy);
        $this->assertStringNotContainsString('Neon', $readme);
        $this->assertStringNotContainsString('in-memory SQLite', $readme);
        $this->assertStringNotContainsString('SQLite for tests', $readme);
        $this->assertStringNotContainsString('pgsql', $render);
        $this->assertStringNotContainsString('Neon', $render);
        $this->assertStringContainsString('DB_CONNECTION=mysql', $example);
        $this->assertStringNotContainsString('DB_CONNECTION=sqlite', $example);
        $this->assertStringNotContainsString('Neon', $dtr);
        $this->assertStringNotContainsString('Postgres', $dtr);
    }
}
