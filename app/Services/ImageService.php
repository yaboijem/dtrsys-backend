<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

class ImageService
{
    public function __construct(
        private readonly PhotoStorage $photoStorage = new PhotoStorage,
    ) {}

    public function compressAndStore(UploadedFile $file, string $directory, ?string $disk = null, int $maxWidth = 1024, int $quality = 80): string
    {
        // $disk kept for call-site compatibility; PhotoStorage reads config when null/ignored for database mode.
        if ($disk !== null && $disk !== '' && $disk !== config('dtr.attendance.photo_disk')) {
            // Temporary override for tests that pass an explicit disk name.
            $previous = config('dtr.attendance.photo_disk');
            config(['dtr.attendance.photo_disk' => $disk]);
            try {
                return $this->photoStorage->store($file, $directory, $maxWidth, $quality);
            } finally {
                config(['dtr.attendance.photo_disk' => $previous]);
            }
        }

        return $this->photoStorage->store($file, $directory, $maxWidth, $quality);
    }
}
