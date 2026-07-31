<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

trait ScopesByRole
{
    protected function applyRoleScope(Builder $query, ?User $user, string $branchColumn): Builder
    {
        if (! $user || $user->hasAnyRole(['Super Admin', 'HR'])) {
            return $query;
        }

        if ($user->hasRole('Branch Manager')) {
            $branchId = $user->employee?->branch_id;

            if (! $branchId) {
                return $query->whereRaw('1 = 0');
            }

            if (str_contains($branchColumn, '.')) {
                [$relation, $column] = explode('.', $branchColumn, 2);

                return $query->whereHas($relation, fn (Builder $q) => $q->where($column, $branchId));
            }

            return $query->where($branchColumn, $branchId);
        }

        if ($user->hasRole('Department Head')) {
            $department = $user->employee?->department;

            if (! $department) {
                return $query->whereRaw('1 = 0');
            }

            return $query->whereHas('employee', fn (Builder $q) => $q->where('department', $department));
        }

        return $query->whereRaw('1 = 0');
    }
}
