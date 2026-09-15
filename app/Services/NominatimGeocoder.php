<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class NominatimGeocoder
{
    /**
     * @return array{display_name: string, street: ?string, city: ?string, province: ?string}|null
     */
    public function reverse(float $lat, float $lng): ?array
    {
        $cacheKey = sprintf('nominatim:reverse:%.5f:%.5f', $lat, $lng);
        $ttl = (int) config('dtr.nominatim.cache_seconds', 86400);

        return Cache::remember($cacheKey, $ttl, function () use ($lat, $lng) {
            try {
                $response = Http::timeout(8)
                    ->withHeaders([
                        'User-Agent' => (string) config('dtr.nominatim.user_agent', 'DTRSys/1.0'),
                        'Accept-Language' => 'en',
                    ])
                    ->get(rtrim((string) config('dtr.nominatim.base_url'), '/').'/reverse', [
                        'lat' => $lat,
                        'lon' => $lng,
                        'format' => 'jsonv2',
                        'addressdetails' => 1,
                    ]);
            } catch (Throwable) {
                return null;
            }

            if (! $response->successful()) {
                return null;
            }

            $json = $response->json();
            if (! is_array($json)) {
                return null;
            }

            $address = is_array($json['address'] ?? null) ? $json['address'] : [];

            $street = $this->firstFilled($address, [
                'road', 'pedestrian', 'path', 'residential', 'neighbourhood', 'suburb', 'quarter',
            ]);
            $city = $this->firstFilled($address, [
                'city', 'town', 'municipality', 'city_district', 'village', 'hamlet',
            ]);
            $province = $this->firstFilled($address, [
                'state', 'province', 'region', 'county',
            ]);

            $display = is_string($json['display_name'] ?? null) ? $json['display_name'] : null;
            if (! $display) {
                $display = collect([$street, $city, $province])->filter()->implode(', ') ?: null;
            }

            if (! $display && ! $street && ! $city && ! $province) {
                return null;
            }

            return [
                'display_name' => $display ?? '',
                'street' => $street,
                'city' => $city,
                'province' => $province,
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $address
     * @param  list<string>  $keys
     */
    private function firstFilled(array $address, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = $address[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }
}
