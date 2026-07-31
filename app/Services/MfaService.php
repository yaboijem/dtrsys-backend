<?php

namespace App\Services;

use App\Models\User;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use PragmaRX\Google2FA\Google2FA;

class MfaService
{
    public const PRIVILEGED_ROLES = ['Super Admin', 'HR', 'Payroll Officer', 'Branch Manager', 'Department Head'];

    private const TOKEN_TTL_MINUTES = 10;

    private const RECOVERY_CODE_COUNT = 8;

    private const RECOVERY_CODE_LENGTH = 16;

    public function __construct(
        private readonly Google2FA $google2fa,
    ) {}

    public function isPrivileged(User $user): bool
    {
        return $user->hasAnyRole(self::PRIVILEGED_ROLES);
    }

    public function generateSecret(): array
    {
        $secret = $this->google2fa->generateSecretKey();

        $otpauthUrl = $this->google2fa->getQRCodeUrl(
            config('app.name'),
            'employee',
            $secret,
        );

        return [
            'secret' => $secret,
            'otpauth_url' => $otpauthUrl,
        ];
    }

    public function qrCodeDataUrl(string $otpauthUrl): string
    {
        $writer = new Writer(
            new ImageRenderer(
                new RendererStyle(220),
                new SvgImageBackEnd,
            ),
        );

        return 'data:image/svg+xml;base64,'.base64_encode($writer->writeString($otpauthUrl));
    }

    public function verifyCode(string $secret, string $code): bool
    {
        return $this->google2fa->verifyKey($secret, trim($code));
    }

    public function generateRecoveryCodes(): array
    {
        $codes = [];

        for ($i = 0; $i < self::RECOVERY_CODE_COUNT; $i++) {
            $codes[] = $this->randomCode();
        }

        return $codes;
    }

    public function hashRecoveryCodes(array $codes): array
    {
        return array_map(fn (string $code) => Hash::make($code), $codes);
    }

    public function consumeRecoveryCode(User $user, string $code): bool
    {
        $codes = $user->two_factor_recovery_codes ?? [];

        foreach ($codes as $index => $hashed) {
            if (! Hash::check(trim($code), $hashed)) {
                continue;
            }

            unset($codes[$index]);

            $user->update(['two_factor_recovery_codes' => array_values($codes)]);

            return true;
        }

        return false;
    }

    public function issueToken(User $user, string $purpose, array $extra = [], ?array $deviceData = null): string
    {
        $payload = array_merge([
            'uid' => $user->id,
            'purpose' => $purpose,
            'exp' => Carbon::now()->addMinutes(self::TOKEN_TTL_MINUTES)->getTimestamp(),
        ], $extra);

        if ($deviceData !== null) {
            $payload['device'] = $deviceData;
        }

        return Crypt::encryptString(json_encode($payload));
    }

    public function resolveToken(string $token): array
    {
        try {
            $payload = json_decode(Crypt::decryptString($token), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        if (! isset($payload['uid'], $payload['purpose'], $payload['exp'])
            || $payload['exp'] < Carbon::now()->getTimestamp()) {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        $user = User::find($payload['uid']);

        if (! $user) {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        return ['user' => $user, 'payload' => $payload];
    }

    private function randomCode(): string
    {
        $bytes = random_bytes((int) ceil(self::RECOVERY_CODE_LENGTH / 2));

        return strtoupper(substr(bin2hex($bytes), 0, self::RECOVERY_CODE_LENGTH));
    }
}
