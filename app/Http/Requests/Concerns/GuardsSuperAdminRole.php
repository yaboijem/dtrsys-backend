<?php

namespace App\Http\Requests\Concerns;

use App\Models\User;
use Illuminate\Validation\Validator;

trait GuardsSuperAdminRole
{
    protected function guardSuperAdminRole(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $actor = $this->user();
            if (! $actor instanceof User) {
                return;
            }

            $employee = $this->route('employee');
            $target = $employee?->user;
            $targetIsSuper = $target?->hasRole('Super Admin') ?? false;
            $assigningSuper = $this->input('role') === 'Super Admin';

            if (($assigningSuper || $targetIsSuper) && ! $actor->hasRole('Super Admin')) {
                $validator->errors()->add('role', 'Only a Super Admin can assign or edit the Super Admin role.');
            }

            if ($targetIsSuper && $this->filled('role') && $this->input('role') !== 'Super Admin') {
                $others = User::role('Super Admin')->where('id', '!=', $target->id)->count();
                if ($others < 1) {
                    $validator->errors()->add('role', 'The last Super Admin cannot be demoted.');
                }
            }

            if ($targetIsSuper && $this->has('is_active') && ! $this->boolean('is_active') && $target->isLastActiveSuperAdmin()) {
                $validator->errors()->add('is_active', 'The last Super Admin cannot be deactivated.');
            }
        });
    }
}
