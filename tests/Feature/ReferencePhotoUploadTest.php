<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ReferencePhotoUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUser(string $role): Employee
    {
        $employee = Employee::factory()->create(['branch_id' => Branch::factory()]);
        $employee->user->update(['employee_id' => 'USR-'.strtoupper(uniqid())]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function hr_can_upload_reference_photo(): void
    {
        Storage::fake('public');
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();

        $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/employees/{$employee->id}/reference-photo", [
            'photo' => UploadedFile::fake()->image('reference.jpg'),
        ])->assertOk()
            ->assertJsonPath('data.reference_photo_path', $employee->fresh()->reference_photo_path);

        $path = $employee->fresh()->reference_photo_path;
        $this->assertStringStartsWith('reference-photos/', $path);
        Storage::disk('public')->assertExists($path);

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'reference_photo_path' => $path,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'employee.reference_photo_updated',
            'user_id' => $hr->user->id,
            'model_id' => (string) $employee->id,
        ]);
    }

    #[Test]
    public function non_image_upload_is_rejected(): void
    {
        Storage::fake('public');
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();

        $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/employees/{$employee->id}/reference-photo", [
            'photo' => UploadedFile::fake()->create('notes.txt', 10),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('photo');

        Storage::disk('public')->assertDirectoryEmpty('reference-photos');
    }

    #[Test]
    public function photo_required_validation(): void
    {
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();

        $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/employees/{$employee->id}/reference-photo", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('photo');
    }

    #[Test]
    public function employees_cannot_upload_reference_photos(): void
    {
        $employee = $this->makeUser('Employee');
        $target = Employee::factory()->create();

        $this->actingAs($employee->user, 'sanctum')->postJson("/api/admin/employees/{$target->id}/reference-photo", [
            'photo' => UploadedFile::fake()->image('reference.jpg'),
        ])->assertForbidden();
    }
}
