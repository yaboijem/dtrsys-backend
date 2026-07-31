<?php

namespace Tests\Unit;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AuditServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AuditService
    {
        return new AuditService;
    }

    #[Test]
    public function it_records_an_audit_entry(): void
    {
        $actor = User::factory()->create();
        $branch = Branch::factory()->create(['name' => 'Original']);

        $this->service()->record($actor, 'custom.action', $branch, ['name' => 'Original'], ['name' => 'Changed']);

        $log = AuditLog::first();

        $this->assertNotNull($log);
        $this->assertSame($actor->id, $log->user_id);
        $this->assertSame('custom.action', $log->action);
        $this->assertSame(Branch::class, $log->model_type);
        $this->assertSame((string) $branch->id, $log->model_id);
        $this->assertSame(['name' => 'Original'], $log->old_values);
        $this->assertSame(['name' => 'Changed'], $log->new_values);
    }

    #[Test]
    public function it_records_creates_without_timestamps(): void
    {
        $actor = User::factory()->create();
        $branch = Branch::factory()->create();

        $this->service()->created($actor, 'branch.created', $branch);

        $newValues = AuditLog::first()->new_values;

        $this->assertArrayNotHasKey('created_at', $newValues);
        $this->assertArrayNotHasKey('updated_at', $newValues);
        $this->assertSame($branch->name, $newValues['name']);
    }

    #[Test]
    public function it_records_only_changed_attributes_on_update(): void
    {
        $actor = User::factory()->create();
        $branch = Branch::factory()->create(['name' => 'Original']);

        $before = $this->service()->valuesOf($branch);
        $branch->update(['name' => 'Changed']);

        $this->service()->changes($actor, 'branch.updated', $branch, $before);

        $log = AuditLog::first();

        $this->assertSame(['name' => 'Original'], $log->old_values);
        $this->assertSame(['name' => 'Changed'], $log->new_values);
    }

    #[Test]
    public function it_skips_ignored_keys_in_change_diffs(): void
    {
        $actor = User::factory()->create();
        $branch = Branch::factory()->create();

        $branch->update(['name' => 'Renamed']);

        $this->service()->changes($actor, 'branch.updated', $branch);

        $log = AuditLog::first();

        $this->assertArrayNotHasKey('updated_at', $log->new_values);
    }

    #[Test]
    public function it_records_deletes_with_previous_values(): void
    {
        $actor = User::factory()->create();
        $branch = Branch::factory()->create(['name' => 'Gone']);

        $this->service()->deleted($actor, 'branch.deleted', $branch);

        $log = AuditLog::first();

        $this->assertNull($log->new_values);
        $this->assertSame('Gone', $log->old_values['name']);
        $this->assertSame($branch->id, $log->old_values['id']);
        $this->assertArrayNotHasKey('updated_at', $log->old_values);
    }

    #[Test]
    public function it_allows_null_actor(): void
    {
        $branch = Branch::factory()->create();

        $this->service()->created(null, 'branch.created', $branch);

        $this->assertNull(AuditLog::first()->user_id);
    }
}
