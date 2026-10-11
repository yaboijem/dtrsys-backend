<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\HomeLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class HomeLocationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');
        Role::findOrCreate('HR', 'web');
    }

    private function makeWfhEmployee(): Employee
    {
        $employee = Employee::factory()->create(['work_arrangement' => 'wfh']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function makeHr(): User
    {
        $user = User::factory()->create();
        $user->syncRoles(['HR']);

        return $user;
    }

    private function attachApprovedHome(Employee $employee, array $attrs = []): HomeLocation
    {
        $home = HomeLocation::factory()->approved()->create(array_merge([
            'latitude' => 14.6000000,
            'longitude' => 121.0000000,
            'radius_meters' => 150,
            'created_by' => $employee->user_id,
            'reviewed_by' => $employee->user_id,
        ], $attrs));

        $employee->homeLocations()->attach($home->id, [
            'is_primary' => true,
            'assigned_at' => now(),
        ]);

        return $home;
    }

    private function homePunchPayload(HomeLocation $home, array $overrides = []): array
    {
        return array_merge([
            'latitude' => (float) $home->latitude + 0.0001,
            'longitude' => (float) $home->longitude + 0.0001,
            'accuracy_meters' => 8,
        ], $overrides);
    }

    #[Test]
    public function wfh_without_home_returns_home_location_required(): void
    {
        Storage::fake('public');
        $employee = $this->makeWfhEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            'latitude' => 14.5,
            'longitude' => 121.0,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'home_location_required');
    }

    #[Test]
    public function wfh_with_pending_only_returns_home_location_pending(): void
    {
        Storage::fake('public');
        $employee = $this->makeWfhEmployee();

        $home = HomeLocation::factory()->pending()->create([
            'created_by' => $employee->user_id,
        ]);
        $employee->homeLocations()->attach($home->id, [
            'is_primary' => false,
            'assigned_at' => now(),
        ]);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->homePunchPayload($home),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'home_location_pending');
    }

    #[Test]
    public function wfh_time_in_inside_home_succeeds(): void
    {
        Storage::fake('public');
        $employee = $this->makeWfhEmployee();
        $home = $this->attachApprovedHome($employee);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->homePunchPayload($home),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated()
            ->assertJsonPath('data.gps_location.is_within_radius', true)
            ->assertJsonPath('data.gps_location.verified_against_type', 'home_location');

        $this->assertDatabaseHas('gps_locations', [
            'employee_id' => $employee->id,
            'verified_against_type' => 'home_location',
            'verified_against_id' => $home->id,
            'is_within_radius' => true,
        ]);
    }

    #[Test]
    public function wfh_time_in_outside_home_returns_gps_out_of_range(): void
    {
        Storage::fake('public');
        $employee = $this->makeWfhEmployee();
        $home = $this->attachApprovedHome($employee);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->homePunchPayload($home, [
                'latitude' => (float) $home->latitude - 1,
                'longitude' => (float) $home->longitude - 1,
            ]),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'gps_out_of_range');
    }

    #[Test]
    public function onsite_still_uses_branch_not_home(): void
    {
        Storage::fake('public');
        $employee = Employee::factory()->create(['work_arrangement' => 'onsite']);
        $employee->user->syncRoles(['Employee']);
        $home = $this->attachApprovedHome($employee);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->homePunchPayload($home),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'gps_out_of_range');
    }

    #[Test]
    public function employee_can_submit_home_and_hr_can_approve(): void
    {
        Storage::fake('public');
        $employee = $this->makeWfhEmployee();
        $hr = $this->makeHr();

        $submit = $this->actingAs($employee->user, 'sanctum')->postJson('/api/home-location', [
            'latitude' => 14.6100000,
            'longitude' => 121.0100000,
            'label' => 'My Home',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $homeId = $submit->json('data.id');

        $this->actingAs($hr, 'sanctum')
            ->getJson('/api/admin/home-locations?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.id', $homeId);

        $this->actingAs($hr, 'sanctum')->patchJson("/api/admin/home-locations/{$homeId}", [
            'action' => 'approve',
            'radius_meters' => 200,
        ])->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            'latitude' => 14.6101000,
            'longitude' => 121.0101000,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();
    }

    #[Test]
    public function non_wfh_cannot_submit_home(): void
    {
        $employee = Employee::factory()->create(['work_arrangement' => 'onsite']);
        $employee->user->syncRoles(['Employee']);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/home-location', [
            'latitude' => 14.61,
            'longitude' => 121.01,
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'home_location_not_allowed');
    }

    #[Test]
    public function submitted_home_defaults_to_a_200_meter_radius(): void
    {
        $employee = $this->makeWfhEmployee();

        $submit = $this->actingAs($employee->user, 'sanctum')->postJson('/api/home-location', [
            'latitude' => 14.6100000,
            'longitude' => 121.0100000,
        ])->assertCreated();

        $this->assertSame(200, $submit->json('data.radius_meters'));
        $this->assertDatabaseHas('home_locations', [
            'id' => $submit->json('data.id'),
            'radius_meters' => 200,
        ]);
    }

    #[Test]
    public function shared_home_pin_works_for_two_employees(): void
    {
        Storage::fake('public');
        $a = $this->makeWfhEmployee();
        $b = $this->makeWfhEmployee();
        $home = $this->attachApprovedHome($a);

        app(\App\Services\HomeLocationService::class)->setPrimary($b, $home);

        foreach ([$a, $b] as $employee) {
            $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
                ...$this->homePunchPayload($home),
                'selfie' => UploadedFile::fake()->image('selfie.jpg'),
            ])->assertCreated();
        }
    }

    #[Test]
    public function hr_can_set_work_arrangement(): void
    {
        $hr = $this->makeHr();
        $employee = Employee::factory()->create(['work_arrangement' => 'onsite']);

        $this->actingAs($hr, 'sanctum')->putJson("/api/admin/employees/{$employee->id}", [
            'work_arrangement' => 'wfh',
            'first_name' => $employee->first_name,
            'last_name' => $employee->last_name,
            'email' => $employee->user->email,
            'employee_id' => $employee->user->employee_id,
            'department_id' => $employee->department_id,
            'position_id' => $employee->position_id,
            'branch_id' => $employee->branch_id,
        ])->assertOk()
            ->assertJsonPath('data.work_arrangement', 'wfh');
    }

    #[Test]
    public function admin_list_backfills_street_city_province_when_missing(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response([
                'display_name' => 'London Street, Angeles, Central Luzon, Philippines',
                'address' => [
                    'road' => 'London Street',
                    'city' => 'Angeles',
                    'region' => 'Central Luzon',
                ],
            ], 200),
        ]);

        $employee = $this->makeWfhEmployee();
        $home = HomeLocation::factory()->pending()->create([
            'created_by' => $employee->user_id,
            'latitude' => 15.1710831,
            'longitude' => 120.5986795,
            'street' => null,
            'city' => null,
            'province' => null,
            'address_text' => null,
        ]);
        $employee->homeLocations()->attach($home->id, [
            'is_primary' => false,
            'assigned_at' => now(),
        ]);

        $hr = $this->makeHr();
        $this->actingAs($hr, 'sanctum')
            ->getJson('/api/admin/home-locations?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.id', $home->id)
            ->assertJsonPath('data.0.street', 'London Street')
            ->assertJsonPath('data.0.city', 'Angeles')
            ->assertJsonPath('data.0.province', 'Central Luzon');

        $this->assertDatabaseHas('home_locations', [
            'id' => $home->id,
            'street' => 'London Street',
            'city' => 'Angeles',
            'province' => 'Central Luzon',
        ]);
    }
}
