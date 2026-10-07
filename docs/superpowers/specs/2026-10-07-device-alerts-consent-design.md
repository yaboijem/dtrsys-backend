# Device Alerts in Consent Preferences — Design

Date: 2026-10-07
Status: Approved by user in chat.

## Purpose

Device alerts (web push) are currently enabled from a "Device alerts" section on the More page, next to a "Send test alert" button. This change moves the whole device-alert control into Consent Preferences as a consent toggle, and removes the More page section including the test alert.

## Scope

In:

- Consent Preferences gains a "Device alerts" row whose toggle enables or disables push on this device and records a `device_alerts` consent entry.
- The More page loses the "Device alerts" section, the Enable button, and the Send test alert button.
- `UpdateConsentRequest` accepts the `device_alerts` type.
- The portal `Consent` type union gains `device_alerts`.
- The unused `POST /api/push/test` route and `PushSubscriptionController::test()` are removed.
- One test update in `ConsentApiTest` for granting and revoking `device_alerts`.

Out:

- Server-side enforcement of the consent when sending push. `WebPushService` keeps sending to any stored subscription. The consent row is the audit trail, and revoking unsubscribes this device.
- Revoking alerts on other devices. Consent rows are per employee, push subscriptions are per device; toggling off only affects the current browser. This is a known limitation.
- Any database migration. `consents.type` is a string column.
- Redesigning the More page or the Alerts tab.

## Consent Preferences

`portal/src/pages/Consent.tsx`.

`CONSENT_TYPES` gains a third entry:

- key `device_alerts`
- label "Device alerts"
- description "Allow this phone to show break and alert notifications."

The checkbox reflects the `device_alerts` consent record and defaults to off when there is no record. Granted/Revoked timestamps render like the other rows.

When push is not supported (`pushSupported()` false), the row still renders, the checkbox is disabled, and the description is replaced with "This browser cannot show device alerts."

Toggle ON, in order:

1. Mark the row as saving.
2. `enableDevicePush(api, token)` — requests notification permission, registers the service worker, subscribes, and `POST /api/push/subscribe`.
3. `POST /api/employee/consent` with `device_alerts: true`.
4. Replace the row's record in local state.

If any step fails (permission denied, insecure context, push not configured), show the failure with the existing alert style and leave the checkbox off. Nothing is recorded, and the consent entry is not created.

Toggle OFF, in order:

1. Mark the row as saving.
2. `disableDevicePush(api, token)` — unsubscribes the current browser subscription and deletes it server-side.
3. `POST /api/employee/consent` with `device_alerts: false`.
4. Replace the row's record in local state.

If disabling fails, show the failure and leave the checkbox on.

The existing `toggleConsent` path stays for biometric photos and GPS. Device alerts uses a dedicated flow because it also talks to the browser push APIs.

## Portal push lib

`portal/src/lib/push.ts` gains:

`disableDevicePush(api: ApiClient, token: string): Promise<void>`

- Return early when `pushSupported()` is false.
- Get the service worker registration; when there is none, do nothing browser-side.
- When a push subscription exists: `unsubscribe()` it in the browser, then `DELETE /api/push/subscribe` with its endpoint.
- Errors from the browser or the API propagate to the caller.

## More page

`portal/src/pages/More.tsx`.

- Remove the "Device alerts" `SectionCard`, `enableAlerts`, `sendTestAlert`, `pushBusy`, `pushNote`, and the push and `ApiError` imports.
- `api` and `token` are no longer used on this page and are dropped from the `useAuth()` destructuring.
- The Consent preferences subtitle becomes "Biometric photos, GPS location, and device alerts".

## Backend

- `app/Http/Requests/UpdateConsentRequest.php`: the `type` rule becomes `in:biometric_photos,gps_location,device_alerts`.
- `routes/api.php`: remove `Route::post('/push/test', ...)`.
- `app/Http/Controllers/Api/PushSubscriptionController.php`: remove `test()` and the now-unused `NotificationService` dependency and import. `publicKey`, `store`, and `destroy` are unchanged.
- `portal/src/api/types.ts`: `Consent.type` becomes `'biometric_photos' | 'gps_location' | 'device_alerts'`.

## Testing

Backend, in `tests/Feature/ConsentApiTest.php`:

- An employee can grant `device_alerts`; response 200, `data.type` is `device_alerts`, `data.granted` is true, and the row exists in `consents`.
- Revoking `device_alerts` sets `granted` false and a `revoked_at` timestamp.
- The existing unknown-type rejection test keeps passing with the widened list.

No frontend test runner exists for the portal. Verification is:

- `npm run typecheck` and `npm run build` in `portal/`.
- `php artisan test --filter=ConsentApiTest`.
- Manual check on the running portal: the row renders in Consent, the More page no longer shows Device alerts, and a failed enable (for example permission denied) shows the error and leaves the toggle off. A full subscribe/unsubscribe round trip depends on browser push availability in the test browser.

## Error handling

- Enable failures never write a consent grant; the checkbox stays off.
- Disable failures leave the consent record granted; the checkbox stays on.
- If the consent call fails after a successful subscribe, the device is subscribed without a consent row. The user can toggle again; there is no automatic rollback.
