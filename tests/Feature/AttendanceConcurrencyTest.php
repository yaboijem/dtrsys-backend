<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Device;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AttendanceConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');
        Storage::fake('public');
    }

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-CONC']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function punchPayload(Branch $branch, ?string $clientUuid = null, array $overrides = []): array
    {
        $payload = array_merge([
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ], $overrides);

        if ($clientUuid !== null) {
            $payload['client_uuid'] = $clientUuid;
        }

        return $payload;
    }

    #[Test]
    public function live_time_in_with_same_client_uuid_is_idempotent(): void
    {
        $employee = $this->makeEmployee();
        Device::factory()->create(['employee_id' => $employee->id, 'device_id' => 'd1']);
        $uuid = (string) Str::uuid();
        $payload = $this->punchPayload($employee->branch, clientUuid: $uuid);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $payload)
            ->assertCreated();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $payload)
            ->assertSuccessful();

        $this->assertSame(1, Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count());
        $this->assertDatabaseHas('attendance', [
            'employee_id' => $employee->id,
            'type' => 'time_in',
            'uuid' => $uuid,
        ]);
    }

    #[Test]
    public function second_time_in_without_uuid_conflicts(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchPayload($employee->branch))
            ->assertCreated();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchPayload($employee->branch))
            ->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');

        $this->assertSame(1, Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count());
    }
}
