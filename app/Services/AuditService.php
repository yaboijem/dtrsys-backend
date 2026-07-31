<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class AuditService
{
    private const IGNORED_KEYS = ['created_at', 'updated_at'];

    public function record(
        ?User $actor,
        string $action,
        ?Model $subject = null,
        ?array $oldValues = null,
        ?array $newValues = null,
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $actor?->id,
            'action' => $action,
            'model_type' => $subject ? $subject->getMorphClass() : null,
            'model_id' => $subject ? (string) $subject->getKey() : null,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }

    public function created(?User $actor, string $action, Model $subject): AuditLog
    {
        return $this->record($actor, $action, $subject, null, $this->valuesOf($subject));
    }

    public function changes(?User $actor, string $action, Model $subject, ?array $before = null): AuditLog
    {
        if (empty($subject->getChanges())) {
            return $this->record($actor, $action, $subject);
        }

        [$old, $new] = $this->changesOf($subject, $before);

        return $this->record($actor, $action, $subject, $old, $new);
    }

    public function deleted(?User $actor, string $action, Model $subject): AuditLog
    {
        return $this->record($actor, $action, $subject, $this->valuesOf($subject));
    }

    public function valuesOf(Model $subject): array
    {
        return array_filter(
            $subject->getAttributes(),
            fn (string $key) => ! in_array($key, self::IGNORED_KEYS, true),
            ARRAY_FILTER_USE_KEY,
        );
    }

    private function changesOf(Model $subject, ?array $before): array
    {
        $old = [];
        $new = [];

        foreach ($subject->getChanges() as $key => $value) {
            if (in_array($key, self::IGNORED_KEYS, true)) {
                continue;
            }

            $old[$key] = $before[$key] ?? $subject->getOriginal($key);
            $new[$key] = $value;
        }

        return [$old, $new];
    }
}
