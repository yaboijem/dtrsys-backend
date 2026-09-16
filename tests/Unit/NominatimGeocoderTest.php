<?php

namespace Tests\Unit;

use App\Services\NominatimGeocoder;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class NominatimGeocoderTest extends TestCase
{
    #[Test]
    public function reverse_maps_street_city_province(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response([
                'display_name' => '123 Rizal St, Angeles, Pampanga, Philippines',
                'address' => [
                    'road' => 'Rizal Street',
                    'city' => 'Angeles',
                    'state' => 'Pampanga',
                ],
            ], 200),
        ]);

        $result = (new NominatimGeocoder)->reverse(15.14, 120.59);

        $this->assertNotNull($result);
        $this->assertSame('Rizal Street', $result['street']);
        $this->assertSame('Angeles', $result['city']);
        $this->assertSame('Pampanga', $result['province']);
        $this->assertStringContainsString('Angeles', $result['display_name']);
    }

    #[Test]
    public function reverse_does_not_cache_failures(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::sequence()
                ->push('error', 500)
                ->push([
                    'display_name' => 'London Street, Angeles, Pampanga',
                    'address' => [
                        'road' => 'London Street',
                        'city' => 'Angeles',
                        'state' => 'Pampanga',
                    ],
                ], 200),
        ]);

        $geocoder = new NominatimGeocoder;

        $this->assertNull($geocoder->reverse(15.17, 120.59));

        $result = $geocoder->reverse(15.17, 120.59);
        $this->assertNotNull($result);
        $this->assertSame('London Street', $result['street']);
        $this->assertSame('Angeles', $result['city']);
        $this->assertSame('Pampanga', $result['province']);
    }
}
