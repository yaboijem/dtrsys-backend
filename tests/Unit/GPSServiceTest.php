<?php

namespace Tests\Unit;

use App\Models\Branch;
use App\Services\GPSService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class GPSServiceTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_calculates_distance_using_haversine(): void
    {
        $service = new GPSService;

        $makati = ['lat' => 14.554729, 'lng' => 121.024445];

        $distance = $service->distanceMeters($makati['lat'], $makati['lng'], 14.555729, 121.024445);

        $this->assertGreaterThan(100, $distance);
        $this->assertLessThan(120, $distance);
    }

    #[Test]
    public function it_returns_zero_for_identical_coordinates(): void
    {
        $service = new GPSService;

        $this->assertEqualsWithDelta(0, $service->distanceMeters(14.55, 121.02, 14.55, 121.02), 0.001);
    }

    #[Test]
    public function it_verifies_location_within_branch_radius(): void
    {
        $branch = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
        ]);

        $result = (new GPSService)->verify($branch, 14.554800, 121.024500, 10);

        $this->assertTrue($result['is_within_radius']);
        $this->assertLessThan(100, $result['distance_meters']);
    }

    #[Test]
    public function it_rejects_location_outside_branch_radius(): void
    {
        $branch = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
        ]);

        $result = (new GPSService)->verify($branch, 14.55, 121.02);

        $this->assertFalse($result['is_within_radius']);
        $this->assertGreaterThan(500, $result['distance_meters']);
    }

    #[Test]
    public function it_verifies_travel_speed(): void
    {
        $service = new GPSService;

        $speed = $service->travelSpeedKmh(1000, 5);

        $this->assertEqualsWithDelta(12.0, $speed, 0.01);
    }

    #[Test]
    public function it_verifies_location_against_raw_coordinates(): void
    {
        $result = (new GPSService)->verifyCoordinates(
            14.554729,
            121.024445,
            200,
            14.554800,
            121.024500,
            10,
        );

        $this->assertTrue($result['is_within_radius']);
        $this->assertLessThan(100, $result['distance_meters']);
    }

    #[Test]
    public function it_rejects_outside_raw_coordinate_radius(): void
    {
        $result = (new GPSService)->verifyCoordinates(
            14.554729,
            121.024445,
            200,
            14.55,
            121.02,
            null,
        );

        $this->assertFalse($result['is_within_radius']);
    }

    #[Test]
    public function it_caps_accuracy_expansion_at_the_branch_allowance(): void
    {
        $branch = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
            'accuracy_allowance_meters' => 30,
        ]);

        // ~400 m north: inside 200 m + 9999 m under the old math, outside 200 m + 30 m.
        $result = (new GPSService)->verify($branch, 14.558329, 121.024445, 9999);

        $this->assertFalse($result['is_within_radius']);
    }

    #[Test]
    public function it_uses_each_branchs_own_allowance(): void
    {
        $strict = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
            'accuracy_allowance_meters' => 0,
        ]);
        $tolerant = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
            'accuracy_allowance_meters' => 50,
        ]);

        // ~206 m north: outside both raw radii; only the tolerant branch's allowance covers it.
        $this->assertFalse((new GPSService)->verify($strict, 14.556579, 121.024445, 50)['is_within_radius']);
        $this->assertTrue((new GPSService)->verify($tolerant, 14.556579, 121.024445, 50)['is_within_radius']);
    }

    #[Test]
    public function it_still_allows_a_small_accuracy_allowance(): void
    {
        $branch = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
            'accuracy_allowance_meters' => 30,
        ]);

        // ~206 m north: just outside the raw radius, inside radius + allowance.
        $this->assertFalse((new GPSService)->verify($branch, 14.556579, 121.024445, null)['is_within_radius']);
        $this->assertTrue((new GPSService)->verify($branch, 14.556579, 121.024445, 20)['is_within_radius']);
    }

    #[Test]
    public function it_never_shrinks_the_radius_for_negative_accuracy(): void
    {
        $branch = Branch::factory()->create([
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'radius_meters' => 200,
            'accuracy_allowance_meters' => 30,
        ]);

        // ~178 m north: inside the raw radius; negative accuracy must not shrink it.
        $this->assertTrue((new GPSService)->verify($branch, 14.556329, 121.024445, -50)['is_within_radius']);
    }
}
