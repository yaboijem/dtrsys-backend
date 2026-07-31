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
}
