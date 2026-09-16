# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary users are employees who punch in and out at company branches once or twice a day. They use their own phones, often one-handed, standing at the branch entrance or near the clock location, outdoors or in bright conditions, and sometimes at night for later shifts. HR, branch managers, and department heads review the resulting data in the separate web admin dashboard.

## Product Purpose

DTR (Daily Time Record) is the employee attendance app for a GPS-based timekeeping system. The app makes punching in and out reliable: capture a selfie, verify location against the branch radius, and record the punch — even when the network is down, by queuing punches locally and syncing them automatically. Success means a trustworthy attendance record with zero friction for the employee.

## Positioning

Attendance that verifies the person (selfie face check) and the place (GPS within branch radius) while still working offline. A neighboring time-tracking product could not truthfully copy the offline-first verified punch loop: every punch carries photo evidence and location evidence, and the employee always knows whether a punch is pending, synced, or flagged.

## Operating Context

- Punch ritual: enter branch → open app → one selfie capture → Time In or Time Out → confirmation. Twice a day, under time pressure (grace periods count).
- Physical scene: outdoors, daylight, or dim night-shift conditions; one hand; possibly a cracked or older phone on a slow or flaky network.
- Philippines: dates and times are Asia/Manila; payroll culture around time-in/out honesty.
- Offline reality: the app must keep working with no connection and be transparent about queued punches.
- MFA (TOTP) is required for some admin roles; employee portal auto-registers device IDs on login (no device-change approval flow).

## Capabilities and Constraints

- Employee surface is the portal PWA (`portal/`: React 19 + Vite). Admin console is `web/`.
- Login (employee ID + password); admin MFA via TOTP where required; token persisted; role-gated navigation.
- Punch in/out with selfie (front camera), GPS required and verified against the branch radius (or approved home pin for WFH/hybrid); no manual coordinate entry.
- Offline-first: punches queue locally with photo attached and auto-sync on reconnect.
- Today's schedule (shift, start/end, grace), attendance history with filters, notifications, consent, home location for WFH.
- Visual identity: the Deep Dive palette (abyssal ink `#0c1b2a`, thermocline cyan `#0e7490`, sea-mist `#eef4f7`) shared across portal and web admin; type identity stays neutral.

## Brand Commitments

Name: DTR / Daily Time Record. Visual identity: the Deep Dive palette — abyssal ink `#0c1b2a`, deep-2 `#102840`, thermocline cyan `#0e7490`, sea-mist `#eef4f7` — shared by the mobile app and web admin; no logo or committed typography. Copy must stay factual about product behavior (offline queue, verification, grace periods).

## Evidence on Hand

No real marketing assets, screenshots, or testimonials exist. Employee-facing copy in `frontend/src/screens` and `frontend/src/components` is the source of factual product language. Do not fabricate claims about verification accuracy or payroll outcomes.

## Product Principles

1. The punch is the product — one clear action, impossible to miss, with the employee's current clocked state always visible.
2. State is honest — offline, pending sync, verified, and flagged states are shown plainly, never hidden or sugar-coated.
3. Evidence over claims — face and GPS verification outcomes are visible and explainable to the employee.
4. Designed for the field — one hand, bright daylight and dark night, slow networks, older devices; high contrast, big targets, no fragile interactions.
5. Privacy is a first-class feature — consent and data-request flows must be reachable and understandable.

## Accessibility & Inclusion

Contrast AA (4.5:1) for text in both light and dark themes; touch targets ≥44pt; full screen-reader semantics (labels, roles, states, live announcements for punch results); no color-only status; safe-area-aware layouts; support system font scaling.
