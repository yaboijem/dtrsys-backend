<?php

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        Branch::updateOrCreate(['code' => 'MAK-001'], [
            'name' => 'Makati Headquarters',
            'address' => 'Ayala Avenue, Makati City',
            'latitude' => 14.5547290,
            'longitude' => 121.0244452,
            'radius_meters' => 300,
            'is_active' => true,
        ]);

        Branch::updateOrCreate(['code' => 'QCN-002'], [
            'name' => 'Quezon City Branch',
            'address' => 'Quezon Avenue, Quezon City',
            'latitude' => 14.6325486,
            'longitude' => 121.0382915,
            'radius_meters' => 200,
            'is_active' => true,
        ]);
    }
}
