<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class MysqlConfigTest extends TestCase
{
    #[Test]
    public function sqlite_and_pgsql_are_not_configured(): void
    {
        $connections = config('database.connections');

        $this->assertArrayHasKey('mysql', $connections);
        $this->assertArrayNotHasKey('sqlite', $connections);
        $this->assertArrayNotHasKey('pgsql', $connections);
        $this->assertSame('InnoDB', $connections['mysql']['engine']);
        $this->assertSame('utf8mb4', $connections['mysql']['charset']);
        $this->assertSame('utf8mb4_unicode_ci', $connections['mysql']['collation']);
        $this->assertArrayHasKey('mariadb', $connections);
        $this->assertArrayHasKey('sqlsrv', $connections);
    }
}
