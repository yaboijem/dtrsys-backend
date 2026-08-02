# Device Name Editing + Shared Device Flag — Design

Date: 2026-08-02
Status: Approved (pending implementation)

## Problem

1. The web admin has no way to attach a friendly, human-readable name to an employee's device. Admins only see the raw `device_id` (e.g. `demo-device-1`), which is not recognizable at a glance.
2. Testing on a single physical phone is impossible for multiple accounts: `DeviceService::resolveForLogin` blocks any employee who is not the device's owner, so only one of EMP001 / HR001 / ADMIN001 can log in on `demo-device-1`.

## Decisions (confirmed with user)

- Add a friendly `name` column to `devices`; `device_id` stays untouched (auth + device-change flows stay safe).
- Editing happens in the existing **employee edit modal** (Super Admin/HR only, already enforced by route middleware `role:Super Admin|HR`).
- The modal edits the employee's **active device** only. If there is no active device, the fields render disabled with a "No active device" hint.
- The friendly name is also displayed in the **Attendance record drawer** next to the raw `device_id`.
- Device name is **optional and clearable** (max 100 chars). Saving with no active device is a no-op.
- Shared-device flag: a new `is_shared` boolean on `devices`. When true, `DeviceService::resolveForLogin` allows any employee to log in on that device. Toggled via the employee edit modal.

## Data Model

One migration on `devices`:

- `name` — `varchar(100)`, nullable — friendly display name.
- `is_shared` — `boolean`, default `false` — allows any employee to log in on this device.

`Device` model: add both to `$fillable`; cast `is_shared` to `boolean`.

## Backend Changes

### `app/Services/DeviceService.php` — `resolveForLogin`

In the "existing device belongs to another employee" branch:

```php
if ($existing && $existing->employee_id !== $employee->id) {
    if ($existing->is_shared) {
        $existing->update(['last_seen_at' => now(), 'is_active' => true, ...$metadata]);
        return ['status' => self::STATUS_REGISTERED, 'device' => $existing];
    }
    // existing strict block + pending request flow unchanged
}
```

Non-shared devices keep today's behavior (block + auto-created device-change request).

### `app/Http/Requests/UpdateEmployeeRequest.php`

Add:

```php
'device_name' => ['nullable', 'string', 'max:100'],
'device_is_shared' => ['boolean'],
```

### `app/Http/Controllers/Api/Admin/EmployeeController.php` — `update()`

After the employee update, when `$request->has('device_name')` or `$request->has('device_is_shared')`:

- Resolve the active device: `$employee->devices()->where('is_active', true)->first()`.
- If none, skip (no-op).
- Build `$deviceUpdate = []`; set `name` when `has('device_name')` (empty string clears to `null` via `nullable` + `max`), set `is_shared` when `has('device_is_shared')`.
- Record audit entry `device.updated` with old/new `name` and `is_shared` via `AuditService::record`.
- **No token revocation** — this is not a security field.

### `app/Http/Resources/EmployeeResource.php`

Add `active_device` when `devices` relation is loaded:

```php
'active_device' => $this->whenLoaded('devices', fn () => $this->devices
    ->firstWhere('is_active', true)
    ?->only(['id', 'device_id', 'name', 'is_shared'])),
```

Eager-load `devices` in `index()`, `show()`, and `update()` (alongside the existing `user.roles`, `branch`).

### `app/Http/Resources/AttendanceAdminResource.php`

Add `name` to the `device` payload (`$this->device?->name`) when loaded.

## Web Changes

### `web/src/api/types.ts`

- `Employee`: add `active_device: { id: number; device_id: string; name: string | null; is_shared: boolean } | null`.
- `AttendanceAdmin` device: add `name: string | null`.

### `web/src/api/endpoints.ts`

- `updateEmployee` payload type accepts optional `device_name: string` and `device_is_shared: boolean`.

### `web/src/pages/EmployeesPage.tsx`

- Extend `FormState` with `device_name: string` and `device_is_shared: boolean`.
- When opening the edit modal, prefill from `editing.active_device`.
- Add to the modal (below existing fields):
  - "Device name" — text input, optional, max length 100, clearable.
  - "Shared device" — toggle labeled "Shared device (any employee can log in)".
  - When `active_device` is null: render both disabled with a "No active device" hint.
- Include both values in `updateEmployee` payload on save.

### `web/src/pages/AttendancePage.tsx`

In the record drawer, show the friendly name next to the raw `device_id`, e.g. `Juan's work phone (demo-device-1)`, falling back to `device_id` alone when `name` is null.

### `web/src/lib/activities.tsx`

Add a definition for `device.updated` (icon + label, e.g. Smartphone icon, "updated a device").

## Testing Setup

After migration: in the employee modal for ADMIN001, enable "Shared device" → EMP001, HR001, and ADMIN001 can all log in on `demo-device-1` from the same phone. No device-change request needed. MFA still applies per user (ADMIN001 uses TOTP/recovery codes; EMP001/HR001 have none).

## Verification

1. Migration runs clean (`php artisan migrate`).
2. Tinker: render `EmployeeResource` for an employee with an active device → `active_device` present with `name`/`is_shared`; device row reflects saved values.
3. API: `PATCH /api/admin/employees/{id}` with `device_name` + `device_is_shared` → resource updated; `device.updated` audit row created; attendance drawer payload includes `name`.
4. `DeviceService::resolveForLogin` with shared device → another employee gets `registered`; with non-shared → still `blocked`.
5. Web: `npm run typecheck` + `npm run build`; browser check of modal prefill/clear/toggle, disabled state with no active device, attendance drawer name display.
