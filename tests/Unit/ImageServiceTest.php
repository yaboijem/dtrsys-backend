<?php

namespace Tests\Unit;

use App\Services\ImageService;
use App\Services\PhotoStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ImageServiceTest extends TestCase
{
    #[Test]
    public function large_selfie_is_downscaled_to_jpeg(): void
    {
        Storage::fake('local');
        config(['dtr.attendance.photo_disk' => 'local']);

        $file = UploadedFile::fake()->image('selfie.png', 2000, 1500);

        $service = new ImageService(new PhotoStorage(new ImageManager(new Driver)));
        $path = $service->compressAndStore($file, 'attendance', 'local');

        Storage::disk('local')->assertExists($path);

        $manager = new ImageManager(new Driver);
        $image = $manager->decode(Storage::disk('local')->path($path));

        $this->assertSame(1024, $image->width());
        $this->assertSame(768, $image->height());
        $this->assertSame('image/jpeg', $image->encode()->mediaType());
    }

    #[Test]
    public function small_image_is_kept_as_is(): void
    {
        Storage::fake('local');
        config(['dtr.attendance.photo_disk' => 'local']);

        $file = UploadedFile::fake()->image('small.png', 200, 100);

        $service = new ImageService(new PhotoStorage(new ImageManager(new Driver)));
        $path = $service->compressAndStore($file, 'attendance', 'local');

        $manager = new ImageManager(new Driver);
        $image = $manager->decode(Storage::disk('local')->path($path));

        $this->assertSame(200, $image->width());
        $this->assertSame(100, $image->height());
        $this->assertSame('image/jpeg', $image->encode()->mediaType());
    }
}
