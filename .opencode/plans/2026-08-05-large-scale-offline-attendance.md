# Large-Scale Offline Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DTR reliable for a large company under ~1000 concurrent punches and guarantee employees can time-in/out and break-in/out offline, with automatic sync when connectivity returns.

**Architecture:** Treat every punch as an idempotent event keyed by `client_uuid`. Live online punches stay a fast HTTP path with employee-level locking; heavy work (face verify, fraud HR fan-out) runs on Redis queues. Offline punches (including breaks) are stored in IndexedDB on the portal, flushed via `/api/attendance/sync` in ordered batches, accepted even when face fails, and GPS out-of-range is flagged not rejected. Infra defaults move to MySQL + Redis + object storage for production scale.

**Tech Stack:** Laravel 12, Sanctum, Redis (cache/queue/locks), MySQL, Horizon (optional), portal React/Vite PWA, IndexedDB, existing `SyncService` / `AttendanceService`.

## Global Constraints

- SLA target: **~1000 concurrent punches within 1–2 minutes** at shift start (different employees).
- Offline must support **time_in, time_out, break_in, break_out**.
- Offline/sync face policy: **always keep the punch**; if face fails → fraud flag only (current offline behavior).
- Online live face: move to **async after accept** under scale (config-gated); punch is recorded first, face result updates photo + flags later.
- Prefer extending existing `SyncService`, `AttendanceService`, `portal/src/lib/offlineQueue.ts` over new parallel systems.
- Tests: PHPUnit feature tests for backend; portal/web `npm run typecheck`.
- No secrets in repo; scale knobs via `.env` / `config/dtr.php`.
- Commits: small, one task each.

## Product rules (locked)

| Mode | time_in/out | break_in/out | GPS out of radius | Face fail |
|------|-------------|--------------|-------------------|-----------|
| Online live | Allowed | Allowed | Reject (`GpsOutOfRangeException`) | Accept punch; async verify → flag if fail |
| Offline queue → sync | Allowed | Allowed | Accept + fraud flag | Accept + fraud flag / unverified photo |
| Idempotent retry | Same `client_uuid` → duplicate (no second row) | same | — | — |

## File map

| File | Responsibility |
|------|----------------|
| `config/dtr.php` | Scale/async/offline knobs |
| `app/Services/AttendanceService.php` | Live punches: lock, client_uuid, async face hook |
| `app/Services/SyncService.php` | Offline batch: breaks, ordering, locks, idempotency |
| `app/Jobs/VerifyAttendancePhotoJob.php` | Async face verify + fraud flags |
| `app/Jobs/NotifyFraudFlagJob.php` | Async HR/admin fraud notifications |
| `app/Http/Controllers/Api/AttendanceController.php` | Pass client_uuid; sync validation for breaks |
| `app/Http/Requests/TimePunchRequest.php` | Optional `client_uuid` |
| `app/Http/Requests/BreakPunchRequest.php` | Optional `client_uuid` |
| `app/Http/Requests/SyncAttendanceRequest.php` | Allow break types in records |
| `database/migrations/*_add_attendance_type_employee_index.php` | Query index |
| `portal/src/lib/offlineQueue.ts` | IndexedDB queue, breaks, retry/backoff |
| `portal/src/lib/punchPolicy.ts` | Open-shift/break UI from local+server |
| `portal/src/pages/Home.tsx` | Offline breaks; queue on network/5xx/429 |
| `tests/Feature/AttendanceConcurrencyTest.php` | Lock + duplicate uuid |
| `tests/Feature/SyncServiceTest.php` | Breaks offline + ordering |
| `tests/Feature/AsyncFaceVerificationTest.php` | Job behavior |
| `.env.example` / `README.md` | Prod scale env defaults |
| `scripts/load/punch-storm.k6.js` | Load test |

## Architecture

```
Employee device (portal PWA)
  │
  ├─ Online OK ──► POST /attendance/time-in|out|break-*
  │                   │ Cache lock attendance:employee:{id}
  │                   │ write attendance + gps (+ store photo bytes)
  │                   │ dispatch VerifyAttendancePhotoJob
  │                   └─ 201 + attendance resource
  │
  └─ Offline / 5xx / timeout ──► IndexedDB queue (client_uuid, type, ts, gps, selfie?)
                                    │
                         online event / flush
                                    │
                         POST /attendance/sync (≤5 w/ photos, ≤50 w/o)
                                    │ ordered by timestamp per employee
                                    │ idempotent on uuid; breaks allowed
                                    └─ SyncLog + results[]
```

---

### Task 1: Config knobs + production env documentation

**Files:**
- Modify: `config/dtr.php`
- Modify: `.env.example`
- Modify: `README.md` (Deployment Notes)

**Interfaces:**
- Produces: `config('dtr.attendance.async_face_verification')` bool  
  `config('dtr.attendance.client_uuid_required_online')` bool  
  `config('dtr.attendance.employee_lock_seconds')` int  
  `config('dtr.sync.max_records')` int  
  `config('dtr.sync.max_records_with_photos')` int

- [ ] **Step 1: Extend `config/dtr.php`**

```php
'attendance' => [
    'photo_disk' => env('ATTENDANCE_PHOTO_DISK', 'public'),
    'async_face_verification' => env('ATTENDANCE_ASYNC_FACE', true),
    'client_uuid_required_online' => env('ATTENDANCE_CLIENT_UUID_REQUIRED', false),
    'employee_lock_seconds' => (int) env('ATTENDANCE_EMPLOYEE_LOCK_SECONDS', 15),
],
'sync' => [
    'max_records' => (int) env('ATTENDANCE_SYNC_MAX_RECORDS', 100),
    'max_records_with_photos' => (int) env('ATTENDANCE_SYNC_MAX_WITH_PHOTOS', 5),
],
```

- [ ] **Step 2: Update `.env.example`**

```env
# Production-oriented (local may still use sqlite/array/sync)
CACHE_STORE=redis
QUEUE_CONNECTION=redis
ATTENDANCE_PHOTO_DISK=public
ATTENDANCE_ASYNC_FACE=true
ATTENDANCE_EMPLOYEE_LOCK_SECONDS=15
ATTENDANCE_SYNC_MAX_RECORDS=100
ATTENDANCE_SYNC_MAX_WITH_PHOTOS=5
```

- [ ] **Step 3: README deployment bullets**

Add:
- Size PHP-FPM/Octane workers for burst: rough `concurrent ≈ workers × (window_sec / avg_latency_sec)`. Example: 1000 punches in 30s at 0.5s each needs ~17+ workers; use 50–100 for headroom + selfies.
- Run `php artisan queue:work redis --queue=attendance,default` (or Horizon).
- Redis required for locks + rate limiters under load (`CACHE_STORE=redis`).
- MySQL `max_connections` > (app servers × workers) + queue workers.
- Nginx `client_max_body_size 12m`; read/send timeouts ≥ 60s for selfie uploads.

- [ ] **Step 4: Commit**

```bash
git add config/dtr.php .env.example README.md
git commit -m "chore: add large-scale attendance config knobs"
```

---

### Task 2: Idempotent `client_uuid` on live punches + employee lock

**Files:**
- Modify: `app/Http/Requests/TimePunchRequest.php`
- Modify: `app/Http/Requests/BreakPunchRequest.php`
- Modify: `app/Services/AttendanceService.php`
- Create: `tests/Feature/AttendanceConcurrencyTest.php`

**Interfaces:**
- Consumes: `config('dtr.attendance.employee_lock_seconds')`
- Produces: optional `client_uuid` on live punches; existing uuid for same employee returns existing row (no duplicate)
- Lock: `Cache::lock('attendance:employee:'.$employee->id, $seconds)->block(5)`

- [ ] **Step 1: Write failing tests**

```php
// tests/Feature/AttendanceConcurrencyTest.php
#[Test]
public function live_time_in_with_same_client_uuid_is_idempotent(): void
{
    $employee = Employee::factory()->create();
    Device::factory()->create(['employee_id' => $employee->id, 'device_id' => 'd1']);
    $uuid = (string) Str::uuid();
    $payload = $this->punchPayload($employee->branch, clientUuid: $uuid);

    $this->actingAs($employee->user, 'sanctum')
        ->post('/api/attendance/time-in', $payload) // multipart like AttendanceApiTest
        ->assertCreated();

    $this->actingAs($employee->user, 'sanctum')
        ->post('/api/attendance/time-in', $payload)
        ->assertSuccessful();

    $this->assertSame(1, Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count());
}

#[Test]
public function second_time_in_without_uuid_conflicts(): void
{
    // existing attendance_conflict behavior
}
```

Reuse selfie fixture pattern from `tests/Feature/AttendanceApiTest.php`.

- [ ] **Step 2: Run test — expect FAIL**

```bash
php artisan test --filter=AttendanceConcurrencyTest
```

- [ ] **Step 3: Request validation**

`TimePunchRequest` + `BreakPunchRequest`:

```php
'client_uuid' => [
    config('dtr.attendance.client_uuid_required_online') ? 'required' : 'nullable',
    'uuid',
],
```

- [ ] **Step 4: AttendanceService lock + idempotency**

Wrap each of `timeIn`, `timeOut`, `breakIn`, `breakOut`:

```php
$employee = $user->employee;
$lock = Cache::lock(
    'attendance:employee:'.$employee->id,
    config('dtr.attendance.employee_lock_seconds', 15),
);

if (! $lock->block(5)) {
    throw new AttendanceConflictException('Attendance is busy. Please try again.');
}

try {
    if (! empty($data['client_uuid'])) {
        $existing = Attendance::query()
            ->where('uuid', $data['client_uuid'])
            ->where('employee_id', $employee->id)
            ->first();
        if ($existing) {
            return $existing->load(['branch', 'photo', 'gpsLocation']);
        }
    }

    // openPunchFor / openBreakFor checks MUST be inside the lock
    return DB::transaction(function () use (...) {
        // createPunch: 'uuid' => $data['client_uuid'] ?? null (model generates if null)
    });
} finally {
    optional($lock)->release();
}
```

In `createPunch`, pass uuid when provided. Confirm `Attendance` model `HasUuids` / creating hook does not overwrite a set uuid.

- [ ] **Step 5: Run related tests**

```bash
php artisan test --filter=AttendanceConcurrencyTest
php artisan test --filter=AttendanceApiTest
php artisan test --filter=BreakAttendanceTest
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/Services/AttendanceService.php app/Http/Requests tests/Feature/AttendanceConcurrencyTest.php
git commit -m "feat: lock employee punches and honor client_uuid idempotency"
```

---

### Task 3: Async face verification + fraud notify jobs

**Files:**
- Create: `app/Jobs/VerifyAttendancePhotoJob.php`
- Create: `app/Jobs/NotifyFraudFlagJob.php`
- Modify: `app/Services/AttendanceService.php`
- Modify: `app/Services/SyncService.php` (use storePhotoOnly + job)
- Modify: `app/Services/FraudDetectionService.php` or call sites only
- Create: `tests/Feature/AsyncFaceVerificationTest.php`

**Interfaces:**
- `AttendanceService::storePhotoOnly(Employee $employee, Attendance $attendance, UploadedFile $selfie): AttendancePhoto`
- `AttendanceService::applyFaceResult(AttendancePhoto $photo, FaceVerificationResult $result): void`
- `VerifyAttendancePhotoJob` on queue name `attendance`
- When `config('dtr.attendance.async_face_verification') === true`: live punches never throw `FaceVerificationFailedException`
- When `false`: keep sync verify + throw (local strict mode)
- Offline/sync: always keep punch; face via job (or sync apply without throw)

- [ ] **Step 1: Failing test**

```php
#[Test]
public function async_face_accepts_punch_and_flags_mismatch_later(): void
{
    config(['dtr.attendance.async_face_verification' => true]);
    config(['dtr.face_verification.force_mismatch' => true]);
    Queue::fake();

    // perform time-in with selfie → assertCreated
    Queue::assertPushed(VerifyAttendancePhotoJob::class);

    $photoId = AttendancePhoto::first()->id;
    (new VerifyAttendancePhotoJob($photoId))->handle(
        app(AttendanceService::class),
        app(FraudDetectionService::class),
        app(FaceVerificationService::class),
    );

    $this->assertDatabaseHas('fraud_flags', ['type' => 'face_mismatch']);
    $this->assertDatabaseHas('attendance', ['type' => 'time_in']);
}
```

- [ ] **Step 2: Implement `storePhotoOnly` / `applyFaceResult`**

Split current `captureAndVerifyPhoto`:
1. compress + store + `AttendancePhoto::create` (`liveness_status` = `pending`)
2. either dispatch job or sync verify

```php
public function captureAndVerifyPhoto(...): ?AttendancePhoto
{
    if (! $selfie) {
        return null;
    }
    $photo = $this->storePhotoOnly($employee, $attendance, $selfie);

    if (config('dtr.attendance.async_face_verification')) {
        VerifyAttendancePhotoJob::dispatch($photo->id);
        return $photo;
    }

    $result = $this->faceVerificationService->verify($employee, $photo->path);
    $this->applyFaceResult($photo, $result);
    if (! $result->matched || ! $result->livenessPassed || ! $result->faceDetected) {
        throw new FaceVerificationFailedException('Face verification failed. Please try again.', $result->toArray());
    }
    return $photo;
}
```

- [ ] **Step 3: Job classes**

```php
class VerifyAttendancePhotoJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $attendancePhotoId)
    {
        $this->onQueue('attendance');
    }

    public function handle(
        AttendanceService $attendanceService,
        FraudDetectionService $fraudDetectionService,
        FaceVerificationService $faceVerificationService,
    ): void {
        $photo = AttendancePhoto::query()->with(['attendance.employee'])->find($this->attendancePhotoId);
        if (! $photo || ! $photo->attendance) {
            return;
        }
        $result = $faceVerificationService->verify($photo->attendance->employee, $photo->path);
        $attendanceService->applyFaceResult($photo, $result);
        $attendance = $photo->attendance()->with(['photo', 'gpsLocation'])->first();
        foreach ($fraudDetectionService->evaluate($attendance) as $flag) {
            NotifyFraudFlagJob::dispatch($flag->id);
        }
    }
}
```

`NotifyFraudFlagJob`: load flag, call existing `NotificationService::fraudFlagCreated` body (or move loop into job).

Update live `runFraudChecks` to dispatch `NotifyFraudFlagJob` instead of inline notify when flags created for non-face rules still evaluated sync (gps spoof etc.). Simplest: change `NotificationService::fraudFlagCreated` to always `NotifyFraudFlagJob::dispatch($flag->id)` and put send loop in job handle.

- [ ] **Step 4: SyncService photo path**

Replace try/catch face block with:

```php
if ($selfie) {
    $this->attendanceService->storePhotoOnly($employee, $attendance, $selfie);
    VerifyAttendancePhotoJob::dispatch($attendance->photo->id);
    // Or captureAndVerifyPhoto with async true
}
$this->fraudDetectionService->evaluate($attendance); // gps flags etc.; face flags come from job
```

Avoid double face fraud: either job-only face flags, or evaluate without face checks until job runs. Prefer: `evaluate` stays full but face checks no-op until photo verified (`liveness_status === pending` → skip face rules).

- [ ] **Step 5: Run tests**

```bash
php artisan test --filter=AsyncFaceVerificationTest
php artisan test --filter=AttendanceApiTest
php artisan test --filter=SyncServiceTest
```

- [ ] **Step 6: Commit**

```bash
git add app/Jobs app/Services tests/Feature/AsyncFaceVerificationTest.php
git commit -m "feat: async face verification and fraud notify jobs"
```

---

### Task 4: SyncService — offline breaks + ordered apply + locks

**Files:**
- Modify: `app/Services/SyncService.php`
- Modify: `app/Http/Controllers/Api/AttendanceController.php` (records.*.type enum)
- Modify: `app/Services/AttendanceService.php` (public helpers if needed)
- Modify: `tests/Feature/SyncServiceTest.php`

**Interfaces:**
- Record types: `time_in|time_out|break_in|break_out`
- Sort incoming batch by `timestamp` ASC before apply
- Entire `sync()` under `Cache::lock('attendance:employee:'.$id)`
- break_out sets `break_minutes`, `is_overbreak` (>60)
- GPS OOR: accept + flag (existing)
- Face: never fail the record

**Server rules (same spirit as live):**
1. `break_in`: need open time_in; no open break; no completed break since that time_in
2. `break_out`: need open break_in; minutes = diff
3. `time_out`: need open time_in; no open break
4. Per-record failure does not abort whole batch

- [ ] **Step 1: Failing tests**

```php
#[Test]
public function offline_break_in_and_out_are_synced(): void
{
    $employee = $this->makeEmployee();
    $t0 = now()->subHours(3);
    $result = app(SyncService::class)->sync($employee->user, [
        $this->record(['client_uuid' => 'ti', 'type' => 'time_in', 'timestamp' => $t0->toDateTimeString()]),
        $this->record(['client_uuid' => 'bi', 'type' => 'break_in', 'timestamp' => $t0->copy()->addHour()->toDateTimeString()]),
        $this->record(['client_uuid' => 'bo', 'type' => 'break_out', 'timestamp' => $t0->copy()->addHour()->addMinutes(30)->toDateTimeString()]),
        $this->record(['client_uuid' => 'to', 'type' => 'time_out', 'timestamp' => $t0->copy()->addHours(8)->toDateTimeString()]),
    ], 'sync-phone');

    $this->assertSame(4, $result['synced']);
    $bo = Attendance::where('uuid', 'bo')->first();
    $this->assertSame(30, $bo->break_minutes);
    $this->assertFalse((bool) $bo->is_overbreak);
}

#[Test]
public function break_in_without_time_in_fails(): void
{
    $employee = $this->makeEmployee();
    $result = app(SyncService::class)->sync($employee->user, [
        $this->record(['client_uuid' => 'bi', 'type' => 'break_in']),
    ], 'sync-phone');
    $this->assertSame(0, $result['synced']);
    $this->assertSame(1, $result['failed']);
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
php artisan test --filter=SyncServiceTest::offline_break
```

- [ ] **Step 3: Implement**

- Expand type allow-list in `storeRecord`
- `usort` records by timestamp at start of `sync`
- Employee lock around loop
- Reuse `AttendanceService` open-break/open-time-in helpers (make public)
- break_out minute math copy from `breakOut`
- Controller validator: `'records.*.type' => ['required', 'in:time_in,time_out,break_in,break_out']`

- [ ] **Step 4: Tests**

```bash
php artisan test --filter=SyncServiceTest
php artisan test --filter=BreakAttendanceTest
```

- [ ] **Step 5: Commit**

```bash
git add app/Services/SyncService.php app/Services/AttendanceService.php app/Http/Controllers/Api/AttendanceController.php tests/Feature/SyncServiceTest.php
git commit -m "feat: sync offline breaks with ordered validation and locks"
```

---

### Task 5: Portal offline queue — IndexedDB + breaks + resilient flush

**Files:**
- Modify: `portal/src/lib/offlineQueue.ts`
- Create: `portal/src/lib/idbQueue.ts` (optional thin helper)
- Modify: `portal/src/api/types.ts`
- Modify: `portal/src/pages/Home.tsx`

**Interfaces:**
- `PunchType = 'time_in' | 'time_out' | 'break_in' | 'break_out'`
- `enqueueOfflinePunch(type, coords, selfieUri?, clientUuid?)`
- Storage in **IndexedDB** (not localStorage — selfie data-URLs exceed 5MB quota)
- One-time migration from `localStorage[dtr_offline_queue]`
- Flush: remove only `created|duplicate`; keep failures with `attempts` + `last_error`
- Retry-friendly: do not drop queue on 429/502/503/504

- [ ] **Step 1: Types**

```ts
export type PunchType = 'time_in' | 'time_out' | 'break_in' | 'break_out';
export interface OfflinePunch {
  client_uuid: string;
  type: PunchType;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  queued_at: string;
  selfieUri?: string;
  attempts?: number;
  last_error?: string;
}
```

- [ ] **Step 2: IndexedDB queue implementation**

Single-key approach is fine:

```ts
// idb: DB dtr_portal, store kv, key 'offline_queue' -> OfflinePunch[]
export async function getOfflineQueue(): Promise<OfflinePunch[]>
export async function setOfflineQueue(items: OfflinePunch[]): Promise<void>
```

On boot of `getOfflineQueue`, if IDB empty and localStorage has data, migrate and `localStorage.removeItem`.

- [ ] **Step 3: Flush remaining logic**

```ts
const remaining: OfflinePunch[] = [];
const syncedItems: OfflinePunch[] = [];
for (let i = 0; i < batch.length; i++) {
  const status = result.records?.[i]?.status;
  if (status === 'created' || status === 'duplicate') {
    syncedItems.push(batch[i]);
  } else {
    remaining.push({
      ...batch[i],
      attempts: (batch[i].attempts ?? 0) + 1,
      last_error: result.records?.[i]?.message ?? 'sync failed',
    });
  }
}
```

- [ ] **Step 4: Home.tsx — queue breaks + queue on server errors**

```ts
function shouldQueueOffline(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'network_error') return true;
  return [429, 502, 503, 504].includes(err.status);
}
```

- Generate `clientUuid` before live request; on `shouldQueueOffline`, enqueue **same** uuid (idempotent retry).
- `handleBreakPress`: on offline errors, enqueue `break_in` / `break_out` without selfie.
- Success copy: “Queued offline — will sync when you’re back online.”

- [ ] **Step 5: Typecheck**

```bash
cd portal && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add portal/src/lib/offlineQueue.ts portal/src/lib/idbQueue.ts portal/src/api/types.ts portal/src/pages/Home.tsx
git commit -m "feat(portal): IndexedDB offline queue with breaks and resilient sync"
```

---

### Task 6: Portal punch policy (merge server + queue)

**Files:**
- Create: `portal/src/lib/punchPolicy.ts`
- Modify: `portal/src/pages/Home.tsx`

**Interfaces:**

```ts
export function deriveAttendanceState(
  server: Attendance[],
  queue: OfflinePunch[],
): { isOpen: boolean; onBreak: boolean; openBreakStartedAt: string | null }
```

Chronologically apply time_in/out/break_* from server punches plus queue items whose uuid is not already on server. Hide Time Out while `onBreak`. Show pending break in UI.

- [ ] **Step 1: Implement pure function**
- [ ] **Step 2: Replace ad-hoc isOpen/onBreak derivation in Home**
- [ ] **Step 3: Typecheck + commit**

```bash
git commit -m "feat(portal): derive shift and break state from server plus offline queue"
```

---

### Task 7: Client selfie compress + always send client_uuid

**Files:**
- Modify: `portal/src/components/CameraModal.tsx` and/or `portal/src/lib/image.ts` (new)
- Modify: `portal/src/pages/Home.tsx`

**Goal:** Cut upload/CPU cost under 1000 concurrent time-ins.

- [ ] **Step 1: `compressDataUrl(dataUrl, maxEdge=1024, quality=0.8): Promise<string>` via canvas**
- [ ] **Step 2: Run compress before `submitPunch` / enqueue**
- [ ] **Step 3: Append `client_uuid` on live time + break posts**
- [ ] **Step 4: Typecheck + commit**

```bash
git commit -m "perf(portal): compress selfies client-side and send client_uuid"
```

---

### Task 8: Dedicated sync throttle

**Files:**
- Modify: `app/Providers/AppServiceProvider.php`
- Modify: `routes/api.php`
- Modify: `tests/Feature/RateLimitApiTest.php` (optional assertion)

```php
RateLimiter::for('attendance-sync', function (Request $request) {
    $key = $request->user()?->employee_id ?? $request->ip();
    return Limit::perMinute(10)->by('attendance-sync:'.$key)->response(fn () => response()->json([
        'message' => 'Too many sync requests. Please wait.',
        'code' => 'too_many_attempts',
    ], 429));
});
```

Register on `POST /attendance/sync` (in addition to or instead of generic attendance throttle for that route).

- [ ] **Step 1: Implement + test**
- [ ] **Step 2: Commit**

```bash
git commit -m "feat: dedicated throttle for attendance sync batches"
```

---

### Task 9: DB index for open-punch lookups

**Files:**
- Create: `database/migrations/2026_08_05_180000_add_attendance_employee_type_timestamp_index.php`

```php
Schema::table('attendance', function (Blueprint $table) {
    $table->index(['employee_id', 'type', 'timestamp'], 'attendance_employee_type_timestamp_index');
});
```

- [ ] **Step 1: Migration**
- [ ] **Step 2: `php artisan test --filter=Attendance`**
- [ ] **Step 3: Commit**

```bash
git commit -m "perf: index attendance by employee, type, timestamp"
```

---

### Task 10: Load-test script + ops runbook

**Files:**
- Create: `scripts/load/punch-storm.k6.js`
- Modify: `README.md`

**k6 outline:**

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    shift_start: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

// Each VU: use pre-issued token OR login; POST time-in multipart with tiny JPEG + branch gps
```

Document second scenario: 1000 VUs each calling `/api/attendance/sync` with one offline record (simulates reconnect storm — often worse than live).

**Runbook:** Redis up, queue workers on `attendance`, MySQL connections, S3/public disk, Telescope off, async face on.

- [ ] **Step 1: Write script**
- [ ] **Step 2: README section**
- [ ] **Step 3: Commit**

```bash
git commit -m "docs: add punch-storm load test and scale runbook"
```

---

### Task 11: Full regression

- [ ] **Step 1:** `php artisan test`
- [ ] **Step 2:** `cd portal && npm run typecheck` ; `cd web && npm run typecheck`
- [ ] **Step 3: Manual smoke**
  1. Online time-in/out/break
  2. DevTools Offline → time-in, break-in, break-out, time-out → Online → auto flush → history complete
  3. Double time-in same `client_uuid` → one row
  4. `FACE_VERIFICATION_FORCE_MISMATCH` + async → punch kept + fraud flag after job
- [ ] **Step 4: Fix any failures; commit if needed**

---

## Out of scope

- Multi-region active-active DB
- Real third-party face provider wiring (job boundary is enough)
- React Native `frontend/` parity (same API later)
- Changing **online** GPS reject-to-flag behavior
- Admin bulk punch APIs

## Risks

| Risk | Mitigation |
|------|------------|
| Async face changes online UX (no instant reject) | `ATTENDANCE_ASYNC_FACE=false` for strict sites |
| Offline break order wrong | Server rejects record; UI shows `last_error` |
| User clears site data | Warn in offline banner; cannot fully prevent |
| Queue workers down | Photos stay pending; monitor queue lag |
| Selfie stampede still heavy | Client compress + async face + worker sizing + object storage |

## Self-review

1. **Spec coverage:** 1k concurrent → Tasks 2–3, 7–10; offline time harden → Task 5; offline breaks → Tasks 4–6; face keep punch → Tasks 3–4.
2. **No TBD placeholders** in task steps.
3. **Naming:** `client_uuid`, `PunchType`, `VerifyAttendancePhotoJob`, lock key `attendance:employee:{id}` consistent.

---

## Execution handoff

Plan complete and saved to `.opencode/plans/2026-08-05-large-scale-offline-attendance.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
