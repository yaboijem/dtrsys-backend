<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\PhotoBlob;
use App\Services\PhotoStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PhotoStorageDatabaseTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }

        config(['dtr.attendance.photo_disk' => 'database']);
    }

    #[Test]
    public function stores_and_reads_jpeg_from_database(): void
    {
        $file = UploadedFile::fake()->image('selfie.png', 800, 600);
        $storage = app(PhotoStorage::class);

        $path = $storage->store($file, 'attendance');

        $this->assertStringStartsWith('db:attendance/', $path);
        $this->assertTrue($storage->exists($path));
        $this->assertDatabaseHas('photo_blobs', ['path' => $path]);

        $bytes = $storage->get($path);
        $this->assertNotEmpty($bytes);
        $this->assertSame("\xFF\xD8", substr($bytes, 0, 2)); // JPEG SOI
    }

    #[Test]
    public function admin_can_stream_attendance_photo_from_database(): void
    {
        $hr = Employee::factory()->create();
        $hr->user->syncRoles(['HR']);

        $employee = Employee::factory()->create();
        $attendance = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'type' => 'time_in',
        ]);

        $file = UploadedFile::fake()->image('selfie.png', 400, 400);
        $path = app(PhotoStorage::class)->store($file, 'attendance');

        $attendance->photo()->create([
            'path' => $path,
            'is_verified' => false,
            'liveness_status' => 'pending',
            'captured_at' => now(),
        ]);

        $this->actingAs($hr->user, 'sanctum')
            ->get("/api/admin/attendance/{$attendance->id}/photo")
            ->assertOk()
            ->assertHeader('content-type', 'image/jpeg');
    }

    #[Test]
    public function photo_blob_count_matches_store(): void
    {
        $file = UploadedFile::fake()->image('a.png', 100, 100);
        app(PhotoStorage::class)->store($file, 'reference-photos');

        $this->assertSame(1, PhotoBlob::query()->count());
    }
}
