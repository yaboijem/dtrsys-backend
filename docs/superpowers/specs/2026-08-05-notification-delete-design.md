# Notification delete (employee portal Alerts)

## Goal
Employees can hard-delete individual alerts and clear all alerts from the portal Alerts page.

## API
- `DELETE /api/notifications/{notification}` — delete one notification owned by the auth user; 404 if not owner.
- `DELETE /api/notifications` — delete all notifications for the auth user; returns `{ deleted: N }`.

Ownership checks match existing `markRead` behavior.

## Portal
- Per-card trash control (stop propagation so it does not mark-read).
- Header “Clear all” when there is at least one alert; confirm before bulk delete.
- Optimistic UI remove; refresh unread count after success; reload on failure.

## Tests
Extend `NotificationApiTest` for delete one, clear all, and cross-user 404.
