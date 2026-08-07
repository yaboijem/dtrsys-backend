# Fraud Flag Employee Notify + Admin Alert Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On fraud flag review, always notify the employee with status, flag type, and notes; enrich Super Admin/HR new-flag alerts with employee name, punch time, and reason; rename Fraud flags Type column to Reason.

**Architecture:** Add a shared type→label map on `FraudFlag`. Extend `NotificationService` with `fraudFlagReviewed()` (mirrors device-change review notify). Call it from `FraudFlagController::review` after persist/audit. Enrich `NotifyFraudFlagJob` body/payload using attendance+employee. One-line web rename of table column header.

**Tech Stack:** Laravel 12 (PHP), Sanctum, database notifications (`GenericNotification`), PHPUnit feature tests, React + TypeScript (`web/` admin).

## Global Constraints

- Always notify employee on both `reviewed` and `dismissed` (notes optional; empty → `No notes provided.`).
- Do not notify Super Admin/HR again on review.
- New-flag recipients stay Super Admin + HR only.
- Shared PHP flag type labels must match web `FLAG_LABELS` wording.
- Punch time in admin alert body: `Y-m-d H:i` app timezone; missing → `unknown time`.
- Out of scope: push/email, custom portal alert card UI, required notes, native `frontend/` changes beyond existing generic Alerts list.

## File map

| File | Responsibility |
|------|----------------|
| `app/Models/FraudFlag.php` | `TYPE_LABELS` + `typeLabel(?string): string` |
| `app/Services/NotificationService.php` | `fraudFlagReviewed(FraudFlag)` |
| `app/Http/Controllers/Api/Admin/FraudFlagController.php` | Call notify after review |
| `app/Jobs/NotifyFraudFlagJob.php` | Enrich body + payload with name/time/reason |
| `tests/Feature/FraudFlagReviewTest.php` | Employee notify on review/dismiss |
| `tests/Feature/NotifyFraudFlagJobTest.php` | Admin notification body/payload (new) |
| `web/src/pages/FraudFlagsPage.tsx` | Rename Type column header → Reason |

---

### Task 1: FraudFlag type labels

**Files:**
- Modify: `app/Models/FraudFlag.php`
- Test: `tests/Feature/FraudFlagReviewTest.php` (add label unit-style assertions) or inline in existing test file

**Interfaces:**
- Produces: `FraudFlag::TYPE_LABELS` (`array<string, string>`), `FraudFlag::typeLabel(?string $type): string`

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/FraudFlagReviewTest.php`:

```php
#[Test]
public function type_label_matches_known_types_and_falls_back(): void
{
    $this->assertSame('Out of radius', FraudFlag::typeLabel('out_of_radius'));
    $this->assertSame('Face mismatch', FraudFlag::typeLabel('face_mismatch'));
    $this->assertSame('GPS spoofing', FraudFlag::typeLabel('gps_spoof'));
    $this->assertSame('Impossible travel', FraudFlag::typeLabel('impossible_jump'));
    $this->assertSame('Rapid clock in/out', FraudFlag::typeLabel('rapid_clock'));
    $this->assertSame('No face detected', FraudFlag::typeLabel('no_face'));
    $this->assertSame('custom_type', FraudFlag::typeLabel('custom_type'));
    $this->assertSame('unknown', FraudFlag::typeLabel(null));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=FraudFlagReviewTest::type_label_matches_known_types_and_falls_back`

Expected: FAIL (method undefined)

- [ ] **Step 3: Implement labels on FraudFlag**

In `app/Models/FraudFlag.php` add:

```php
public const TYPE_LABELS = [
    'gps_spoof' => 'GPS spoofing',
    'impossible_jump' => 'Impossible travel',
    'face_mismatch' => 'Face mismatch',
    'rapid_clock' => 'Rapid clock in/out',
    'out_of_radius' => 'Out of radius',
    'no_face' => 'No face detected',
];

public static function typeLabel(?string $type): string
{
    if ($type === null || $type === '') {
        return 'unknown';
    }

    return self::TYPE_LABELS[$type] ?? $type;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=FraudFlagReviewTest::type_label_matches_known_types_and_falls_back`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/Models/FraudFlag.php tests/Feature/FraudFlagReviewTest.php
git commit -m "feat(fraud): shared flag type labels for notifications"
```

---

### Task 2: Notify employee on fraud flag review

**Files:**
- Modify: `app/Services/NotificationService.php`
- Modify: `app/Http/Controllers/Api/Admin/FraudFlagController.php`
- Modify: `tests/Feature/FraudFlagReviewTest.php`

**Interfaces:**
- Consumes: `FraudFlag::typeLabel()`, existing `NotificationService::send()`
- Produces: `NotificationService::fraudFlagReviewed(FraudFlag $flag): void`

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/FraudFlagReviewTest.php` (imports: `App\Notifications\GenericNotification`, `Illuminate\Support\Facades\Notification`):

```php
#[Test]
public function review_notifies_employee_with_notes_status_and_type(): void
{
    Notification::fake();

    $hr = $this->makeUser('HR');
    $branch = Branch::factory()->create();
    $flag = $this->makeFlag($branch);
    $employeeUser = $flag->attendance->employee->user;

    $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flag->id}/review", [
        'status' => 'reviewed',
        'notes' => 'Verified employee was on field duty.',
    ])->assertOk();

    Notification::assertSentTo($employeeUser, GenericNotification::class, function (GenericNotification $n) use ($flag) {
        return $n->title === 'Attendance flag reviewed'
            && str_contains($n->body, 'Out of radius')
            && str_contains($n->body, 'reviewed')
            && str_contains($n->body, 'Verified employee was on field duty.')
            && ($n->data['fraud_flag_id'] ?? null) === $flag->id
            && ($n->data['attendance_id'] ?? null) === $flag->attendance_id
            && ($n->data['status'] ?? null) === 'reviewed'
            && ($n->data['type'] ?? null) === 'out_of_radius'
            && ($n->data['notes'] ?? null) === 'Verified employee was on field duty.';
    });
}

#[Test]
public function dismiss_without_notes_still_notifies_employee(): void
{
    Notification::fake();

    $hr = $this->makeUser('HR');
    $branch = Branch::factory()->create();
    $flag = $this->makeFlag($branch);
    $employeeUser = $flag->attendance->employee->user;

    $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flag->id}/review", [
        'status' => 'dismissed',
    ])->assertOk();

    Notification::assertSentTo($employeeUser, GenericNotification::class, function (GenericNotification $n) use ($flag) {
        return $n->title === 'Attendance flag dismissed'
            && str_contains($n->body, 'Out of radius')
            && str_contains($n->body, 'dismissed')
            && str_contains($n->body, 'No notes provided.')
            && ($n->data['status'] ?? null) === 'dismissed'
            && ($n->data['fraud_flag_id'] ?? null) === $flag->id
            && array_key_exists('notes', $n->data)
            && ($n->data['notes'] === null || $n->data['notes'] === '');
    });
}
```

Ensure `makeFlag` loads relations needed after create — tests should use `$flag->load('attendance.employee.user')` if lazy load fails under Notification::fake.

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=FraudFlagReviewTest::review_notifies_employee_with_notes_status_and_type`

Expected: FAIL (notification not sent)

Run: `php artisan test --filter=FraudFlagReviewTest::dismiss_without_notes_still_notifies_employee`

Expected: FAIL (notification not sent)

- [ ] **Step 3: Implement NotificationService::fraudFlagReviewed**

In `app/Services/NotificationService.php`:

```php
public function fraudFlagReviewed(FraudFlag $flag): void
{
    $flag->loadMissing('attendance.employee.user');

    $user = $flag->attendance?->employee?->user;

    if (! $user) {
        return;
    }

    $label = FraudFlag::typeLabel($flag->type);
    $status = $flag->status; // 'reviewed' | 'dismissed'
    $title = $status === 'dismissed'
        ? 'Attendance flag dismissed'
        : 'Attendance flag reviewed';

    $notes = is_string($flag->notes) ? trim($flag->notes) : '';
    $notesPart = $notes !== ''
        ? "Notes: {$notes}"
        : 'No notes provided.';

    $verb = $status === 'dismissed' ? 'dismissed' : 'reviewed';
    $body = "Your {$label} flag was {$verb}. {$notesPart}";

    $this->send($user, $title, $body, [
        'fraud_flag_id' => $flag->id,
        'attendance_id' => $flag->attendance_id,
        'status' => $status,
        'type' => $flag->type,
        'notes' => $notes !== '' ? $notes : null,
    ]);
}
```

- [ ] **Step 4: Wire controller**

In `app/Http/Controllers/Api/Admin/FraudFlagController.php`:

- Inject `NotificationService` in constructor (alongside `AuditService`).
- After audit record, before return:

```php
$this->notificationService->fraudFlagReviewed($fraudFlag->fresh(['attendance.employee.user']));
```

Use the updated flag instance that already has new status/notes; `fresh` with relations is fine. Do **not** change response shape.

Constructor becomes:

```php
public function __construct(
    private readonly AuditService $auditService,
    private readonly NotificationService $notificationService,
) {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --filter=FraudFlagReviewTest`

Expected: all PASS (including existing auth/scope tests)

- [ ] **Step 6: Commit**

```bash
git add app/Services/NotificationService.php app/Http/Controllers/Api/Admin/FraudFlagController.php tests/Feature/FraudFlagReviewTest.php
git commit -m "feat(fraud): notify employee when flag is reviewed"
```

---

### Task 3: Enrich admin new-fraud-flag notification

**Files:**
- Modify: `app/Jobs/NotifyFraudFlagJob.php`
- Create: `tests/Feature/NotifyFraudFlagJobTest.php`

**Interfaces:**
- Consumes: `FraudFlag::typeLabel()`, `NotificationService::send()`, `Employee::full_name`
- Produces: enriched notification title/body/payload (no new public API methods)

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/NotifyFraudFlagJobTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Jobs\NotifyFraudFlagJob;
use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Notifications\GenericNotification;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class NotifyFraudFlagJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    #[Test]
    public function job_notifies_hr_with_employee_name_time_and_reason(): void
    {
        Notification::fake();

        $hr = Employee::factory()->create();
        $hr->user->syncRoles(['HR']);

        $branch = Branch::factory()->create();
        $employee = Employee::factory()->create([
            'branch_id' => $branch->id,
            'first_name' => 'Jane',
            'middle_name' => null,
            'last_name' => 'Doe',
        ]);

        $punchAt = Carbon::parse('2026-08-08 09:15:00', config('app.timezone'));
        $attendance = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
            'timestamp' => $punchAt,
        ]);

        $flag = FraudFlag::create([
            'attendance_id' => $attendance->id,
            'type' => 'face_mismatch',
            'severity' => 'high',
            'details' => [],
            'status' => 'open',
        ]);

        (new NotifyFraudFlagJob($flag->id))->handle(app(\App\Services\NotificationService::class));

        Notification::assertSentTo($hr->user, GenericNotification::class, function (GenericNotification $n) use ($flag, $punchAt, $employee) {
            $expectedTime = $punchAt->timezone(config('app.timezone'))->format('Y-m-d H:i');

            return $n->title === 'New fraud flag'
                && str_contains($n->body, $employee->full_name)
                && str_contains($n->body, $expectedTime)
                && str_contains($n->body, 'Face mismatch')
                && str_contains($n->body, (string) $flag->attendance_id)
                && ($n->data['fraud_flag_id'] ?? null) === $flag->id
                && ($n->data['attendance_id'] ?? null) === $flag->attendance_id
                && ($n->data['employee_name'] ?? null) === $employee->full_name
                && ($n->data['flag_type'] ?? null) === 'face_mismatch'
                && ($n->data['severity'] ?? null) === 'high'
                && ! empty($n->data['attendance_timestamp']);
        });
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=NotifyFraudFlagJobTest::job_notifies_hr_with_employee_name_time_and_reason`

Expected: FAIL (body lacks name/time/reason label or payload keys missing)

- [ ] **Step 3: Update NotifyFraudFlagJob**

Replace `handle` body construction in `app/Jobs/NotifyFraudFlagJob.php`:

```php
public function handle(NotificationService $notificationService): void
{
    $flag = FraudFlag::query()
        ->with(['attendance.employee'])
        ->find($this->fraudFlagId);

    if (! $flag) {
        if ($this->attempts() === 1) {
            $this->release(2);
        }

        return;
    }

    $employee = $flag->attendance?->employee;
    $employeeName = $employee?->full_name ?: 'Unknown employee';
    $timestamp = $flag->attendance?->timestamp;
    $timeText = $timestamp
        ? $timestamp->timezone(config('app.timezone'))->format('Y-m-d H:i')
        : 'unknown time';
    $reason = FraudFlag::typeLabel($flag->type);

    $body = "{$employeeName} — {$timeText} — {$reason}. Attendance #{$flag->attendance_id}.";

    $users = User::whereHas('roles', function ($query) {
        $query->whereIn('name', ['Super Admin', 'HR']);
    })->get();

    foreach ($users as $user) {
        $notificationService->send(
            $user,
            'New fraud flag',
            $body,
            [
                'fraud_flag_id' => $flag->id,
                'attendance_id' => $flag->attendance_id,
                'employee_name' => $employeeName,
                'attendance_timestamp' => $timestamp?->toISOString(),
                'flag_type' => $flag->type,
                'severity' => $flag->severity,
            ],
        );
    }
}
```

Keep existing queue name `attendance`, `$tries`, `afterCommit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=NotifyFraudFlagJobTest`

Expected: PASS

Also run: `php artisan test --filter=AsyncFaceVerificationTest`

Expected: PASS (dispatch assertions unchanged)

- [ ] **Step 5: Commit**

```bash
git add app/Jobs/NotifyFraudFlagJob.php tests/Feature/NotifyFraudFlagJobTest.php
git commit -m "feat(fraud): enrich admin fraud flag alerts with name time reason"
```

---

### Task 4: Fraud flags web — Reason column header

**Files:**
- Modify: `web/src/pages/FraudFlagsPage.tsx`

**Interfaces:**
- No API changes. Column still renders `FLAG_LABELS[r.type]` badge.

- [ ] **Step 1: Rename column header**

In `web/src/pages/FraudFlagsPage.tsx`, find the Type column:

```tsx
{
  key: 'type',
  header: 'Type',
  render: (r) => <Badge tone={FLAG_TONES[r.type]}>{FLAG_LABELS[r.type]}</Badge>,
},
```

Change to:

```tsx
{
  key: 'type',
  header: 'Reason',
  render: (r) => <Badge tone={FLAG_TONES[r.type]}>{FLAG_LABELS[r.type]}</Badge>,
},
```

Do not add a second column. Leave Employee and Punch time columns unchanged. Drawer unchanged.

- [ ] **Step 2: Sanity check**

If the project has a web typecheck script, run it (e.g. `npm run build` or `npx tsc -b` in `web/`). Otherwise visual/manual: open Fraud flags list and confirm header says Reason.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/FraudFlagsPage.tsx
git commit -m "fix(web): rename fraud flags Type column to Reason"
```

---

### Task 5: Full regression

**Files:** none (verification only)

- [ ] **Step 1: Run full related test suite**

```bash
php artisan test --filter=FraudFlagReviewTest
php artisan test --filter=NotifyFraudFlagJobTest
php artisan test --filter=AsyncFaceVerificationTest
php artisan test --filter=NotificationApiTest
```

Expected: all PASS

- [ ] **Step 2: Optional broader run**

```bash
php artisan test
```

Expected: PASS (or only pre-existing failures unrelated to this work)

- [ ] **Step 3: Final commit only if any leftover fixes**

If fixes were needed, commit them with a clear message. Otherwise done.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Always notify employee on review/dismiss with status + type + notes | Task 2 |
| Empty notes → `No notes provided.` | Task 2 |
| Payload fraud_flag_id, attendance_id, status, type, notes | Task 2 |
| Shared PHP type labels matching web FLAG_LABELS | Task 1 |
| Admin new-flag body: name — time — reason. Attendance #id | Task 3 |
| Admin payload employee_name, attendance_timestamp, flag_type, severity | Task 3 |
| Rename Type → Reason on Fraud flags table | Task 4 |
| No re-notify admins on review | Task 2 (only employee path) |
| Tests for review notes, dismiss no notes, job body | Tasks 2–3, 5 |
