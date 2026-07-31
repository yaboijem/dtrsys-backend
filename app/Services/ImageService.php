<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\ImageManager;

class ImageService
{
    public function __construct(
        private readonly ImageManager $manager = new ImageManager(new Driver),
    ) {}

    public function compressAndStore(UploadedFile $file, string $directory, string $disk, int $maxWidth = 1024, int $quality = 80): string
    {
        $image = $this->manager->decode($file->getRealPath());
        $image->scaleDown($maxWidth);

        $tempPath = tempnam(sys_get_temp_dir(), 'photo_').'.jpg';
        $image->encode(new JpegEncoder(quality: $quality, strip: true))->save($tempPath);

        try {
            return Storage::disk($disk)->putFile($directory, new UploadedFile($tempPath, 'photo.jpg', 'image/jpeg', null, true));
        } finally {
            @unlink($tempPath);
        }
    }
}
