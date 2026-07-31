# DTR System Business Proposal Architecture (Enterprise Version)

## Tech Stack

-   **Frontend (Mobile):** React Native
-   **Backend:** Laravel 12 (REST API)
-   **Database:** MySQL (primary, with read replicas for scale)
-   **Cache / Queue:** Redis (for background jobs and caching — not a database replacement, works alongside MySQL)
-   **Local Storage:** SQLite (for offline attendance)
-   **Authentication:** Laravel Sanctum (+ optional SSO/LDAP for corporate accounts)
-   **Media Storage:** Cloud Object Storage (AWS S3 / DigitalOcean Spaces / Cloudflare R2) with CDN
-   **Monitoring:** Laravel Telescope (staging), Sentry or similar (production)

## 1. Security

### User Authentication

-   Employee ID + Password
-   Laravel Sanctum token
-   Passwords hashed using Laravel's `Hash::make()`
-   **Multi-Factor Authentication (MFA)** required for Admin/HR/Manager accounts
-   **SSO / LDAP / Active Directory integration** (optional) for companies with existing corporate identity systems, so IT doesn't need to manage thousands of separate passwords

### Attendance Validation

-   GPS location check against assigned branch coordinates
-   Selfie required for every Time In/Out
-   **Automated face matching** — selfie compared against employee's registered reference photo; mismatches are flagged automatically instead of relying on manual review
-   **Liveness/spoof detection** to prevent employees from using a photo-of-a-photo to fake attendance
-   **GPS spoof detection** — flag impossible location jumps (e.g., clocked in at Branch A, then Branch B two minutes later)
-   Device ID saved during first login
-   **Device change request/approval flow** for lost or replaced phones, instead of a permanent lock
-   UUID for every attendance record
-   Server validates all synced offline records

### Data Protection

-   HTTPS in production
-   Expanded Role-Based Access Control: **Super Admin, HR, Payroll Officer, Branch Manager, Department Head, Employee** — each with different data visibility
-   Audit logs for all attendance changes
-   No employee can edit attendance records
-   **API rate limiting** to prevent abuse and protect the server during peak clock-in times (e.g., everyone logging in at 8:00 AM)

### Data Privacy & Compliance

-   Selfies and GPS data are biometric/sensitive personal information — compliance with applicable data privacy law required (e.g., Philippines' Data Privacy Act / RA 10173, or GDPR where applicable)
-   Defined **data retention policy** for selfies and GPS logs (how long they're kept before automatic deletion)
-   **Employee consent flow** during onboarding for biometric and location data collection
-   Support for employee data access/deletion requests

## 2. Scalability

Modules: - Authentication Module - Employee Module - Branch Module -
Attendance Module - GPS Verification Module - Selfie/Face Verification
Module - Fraud Detection Module - Offline Sync Module - Shift &
Schedule Module - Payroll Export Module - Reports Module - Admin
Dashboard - Notification Module

### Multi-Branch Support

-   Company can have **multiple branches/offices**, each with its own GPS coordinates and allowed radius
-   Employees are assigned to a specific branch (with support for temporary reassignment, e.g., fieldwork or branch transfers)

### Infrastructure for Scale

-   **MySQL read replicas** to handle heavy read traffic (reports, dashboards) separately from write traffic (attendance logging)
-   **Proper indexing** on high-traffic columns (`employee_id`, `date`, `branch_id`, `device_id`)
-   **Redis queue (Laravel Horizon)** for background processing: selfie uploads, offline sync batches, report generation — so the API doesn't block while these run
-   **Redis cache** for frequently accessed, rarely changing data: branch GPS locations, employee lists, dashboard summaries
-   **Image compression/resizing** before storing selfies, to control storage cost and bandwidth
-   **Async/queued report exports** — large exports for thousands of employees generate in the background and notify the admin when ready, instead of timing out on a live request

## 3. Maintainability

Use Laravel MVC with: - Controllers - Services - Repositories - Models -
Policies - Requests - Resources

Service classes: - AttendanceService - GPSService - SyncService -
FaceVerificationService - FraudDetectionService - PayrollExportService -
ScheduleService - NotificationService

### Testing

-   Unit tests for core services (AttendanceService, GPSService, SyncService, FraudDetectionService)
-   Feature tests for API endpoints, since attendance/payroll bugs are costly at scale

## 4. Functionality

### Employee

-   Login
-   Time In
-   Time Out
-   Capture Selfie
-   Get GPS Location
-   Work Offline
-   Auto Sync when online
-   View attendance history
-   View assigned shift/schedule
-   Request device change (lost/replaced phone)

### Admin / HR / Manager (role-dependent access)

-   Manage employees
-   Manage branches and their GPS/radius settings
-   Manage shifts and schedules
-   View attendance (scoped to branch/department depending on role)
-   View selfies
-   Export reports (async, for large datasets)
-   Review auto-flagged suspicious records (face mismatch, GPS spoof, impossible location jumps)
-   Approve/reject device change requests
-   Export to payroll (CSV or direct payroll system integration)

## 5. Efficiency

Flow: 1. Employee taps **Time In** 2. Capture GPS 3. Capture Selfie 4.
Auto face-match against reference photo 5. Save locally if offline 6.
Sync automatically when internet returns 7. Auto-flag anomalies for HR
review

## Database Design

-   employees
-   branches
-   schedules / shifts
-   attendance
-   attendance_photos
-   gps_locations
-   devices
-   device_change_requests
-   sync_logs
-   audit_logs
-   fraud_flags
-   payroll_exports

## Attendance Flow

``` text
Employee opens app
    ↓
Login
    ↓
Tap Time In
    ↓
GPS Check (against assigned branch)
    ↓
Take Selfie
    ↓
Auto Face Match + Liveness Check
    ↓
Internet?

YES -----------------> Upload to Cloud Storage + Laravel API
                         ↓
                     Save to MySQL
                         ↓
                     Run Fraud Detection Rules

NO ------------------> Save to SQLite
                         ↓
                 Internet Returns
                         ↓
                     Auto Sync (queued)
                         ↓
                 Laravel Validation
                         ↓
                     Save to MySQL
                         ↓
                     Run Fraud Detection Rules
```

## Payroll & Reporting

-   Attendance data can be exported to CSV or integrated directly with a payroll system's API
-   Reports (daily, per-branch, per-department, monthly summary) are generated as background jobs and delivered to the admin once ready
-   Overtime, late, absence, and undertime are calculated automatically based on each employee's assigned shift/schedule

## Why this Design?

This architecture separates responsibilities, supports offline
operation, improves security, and can scale from a small business to a
large, multi-branch organization with thousands of employees. MySQL
remains the system of record; Redis is used only as a supporting layer
for queues and caching, not as a replacement database. The design adds
automated fraud detection, multi-branch support, shift management, and
compliance considerations needed for enterprise deployment, while
keeping a clear migration path from local prototype to production.
