<?php

namespace App\Services;

use App\Models\PhotoBlob;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\ImageManager;
use Symfony\Component\HttpFoundation\Response;

class PhotoStorage
{
    public function __construct(
        private readonly ImageManager $manager = new ImageManager(new Driver),
    ) {}

    public function disk(): string
    {
        return (string) config('dtr.attendance.photo_disk', 'public');
    }

    public function usesDatabase(): bool
    {
        return $this->disk() === 'database';
    }

    /**
     * Compress upload to JPEG and store. Returns a path key for later retrieval.
     */
    public function store(UploadedFile $file, string $directory, int $maxWidth = 1024, int $quality = 80): string
    {
        $bytes = $this->compressToJpeg($file, $maxWidth, $quality);

        if ($this->usesDatabase()) {
            $path = 'db:'.trim($directory, '/').'/'.Str::uuid()->toString().'.jpg';
            PhotoBlob::query()->updateOrCreate(
                ['path' => $path],
                ['data' => base64_encode($bytes), 'byte_size' => strlen($bytes)],
            );

            return $path;
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'photo_').'.jpg';
        file_put_contents($tempPath, $bytes);

        try {
            return Storage::disk($this->disk())->putFile(
                $directory,
                new UploadedFile($tempPath, 'photo.jpg', 'image/jpeg', null, true),
            );
        } finally {
            @unlink($tempPath);
        }
    }

    public function exists(string $path): bool
    {
        if ($path === '') {
            return false;
        }

        if ($this->isDatabasePath($path) || $this->usesDatabase()) {
            return PhotoBlob::query()->where('path', $path)->exists();
        }

        return Storage::disk($this->disk())->exists($path);
    }

    public function get(string $path): ?string
    {
        if ($this->isDatabasePath($path) || ($this->usesDatabase() && str_starts_with($path, 'db:'))) {
            $blob = PhotoBlob::query()->where('path', $path)->first();

            return $blob ? (base64_decode($blob->data, true) ?: null) : null;
        }

        if ($this->usesDatabase()) {
            $blob = PhotoBlob::query()->where('path', $path)->first();

            return $blob ? (base64_decode($blob->data, true) ?: null) : null;
        }

        if (! Storage::disk($this->disk())->exists($path)) {
            return null;
        }

        return Storage::disk($this->disk())->get($path);
    }

    public function response(string $path, string $filename): Response
    {
        $bytes = $this->get($path);

        if ($bytes === null || $bytes === '') {
            abort(404, 'Photo not found.');
        }

        return response($bytes, 200, [
            'Content-Type' => 'image/jpeg',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
            'Cache-Control' => 'private, max-age=3600',
            'Content-Length' => (string) strlen($bytes),
        ]);
    }

    public function delete(string $path): void
    {
        if ($path === '') {
            return;
        }

        if ($this->isDatabasePath($path) || $this->usesDatabase()) {
            PhotoBlob::query()->where('path', $path)->delete();

            return;
        }

        Storage::disk($this->disk())->delete($path);
    }

    private function isDatabasePath(string $path): bool
    {
        return str_starts_with($path, 'db:');
    }

    private function compressToJpeg(UploadedFile $file, int $maxWidth, int $quality): string
    {
        $image = $this->manager->decode($file->getRealPath());
        $image->scaleDown($maxWidth);

        return (string) $image->encode(new JpegEncoder(quality: $quality, strip: true));
    }
}
