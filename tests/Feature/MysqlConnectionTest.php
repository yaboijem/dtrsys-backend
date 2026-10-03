<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class MysqlConnectionTest extends TestCase
{
    #[Test]
    public function tests_use_the_mysql_testing_database(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertSame('dtrsys_testing', DB::connection()->getDatabaseName());
    }
}
