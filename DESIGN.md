# DTR — Design System

Companion to `PRODUCT.md` (product truth). Two platforms, two systems: the employee portal PWA (`portal/`, "ID Badge" below) and the web admin console (`web/`, "Deep Dive" below) keep their own layouts and components but share one color palette (abyssal ink, thermocline cyan, sea-mist).

---

# DTR Portal — "ID Badge"

Direction contract and design system for the employee portal PWA (`portal/`). Companion to `PRODUCT.md` (product truth). Platform: adaptive web — the web admin (`web/`) keeps its own system; this document covers the employee portal.

## Direction — "ID Badge"

The phone behaves like the employee's physical ID badge, and punching a time record is like stamping the badge at a gate.

| Element | Design |
|---|---|
| Laminate surfaces | Sea-mist ground, white cards with hairline edges |
| Abyssal ink band | App mark + the employee's badge strip (DTR band) — the deep ink of the shared palette |
| ID digits | Employee ID and times use tabular, letter-spaced digits |
| Gate lamp | Clock state as a lamp: green (open, ready to punch), red (clocked in), amber (offline — punches queue locally and sync later) |
| Punch = the slot | One large thumb-zone action at the top of Home |
| Confirmation = stamp | Rotated, uppercase confirmation plate with a spring settle — the app's single authored motion |
| Dark mode | The badge under the gate light: deep-ink ground, abyssal laminate cards, lighter band |

The mobile palette mirrors the web admin's Deep Dive palette (same hues, adapted to the badge world): light = sea-mist `#eef4f7`, card white, ink `#0a1a26`; dark = abyssal `#0c1b2a` / `#102840`; band = the abyssal ink `#0c1b2a`; accent = thermocline cyan `#0e7490` (light) / `#67e8f9` (dark).

Challengers set aside: transit diagram (legibility), phosphor terminal (identity), streetwear labels (trust), one-bit desktop / Designers Republic noise (tool monoculture), tensegrity (no product path), literal paper time card (spent as the one literal reading).

## Tokens (`portal/src/theme.ts`)

`useThemeColors()` / `useIsDark()` resolve `lightColors` | `darkColors` by scheme. All components consume colors through the hook — no hardcoded hex in components (plates included).

- **ground** light `#eef4f7` / dark `#0c1b2a` — screen background (sea-mist / abyssal ink)
- **card** `#ffffff` / `#102840` — laminate surfaces
- **band** `#0c1b2a` / `#0c1b2a` — abyssal ink identity (web palette deep); primary buttons, active filter plates, tab tint, app mark
- **ink** `#0a1a26` / `#f1f5f9` — primary text
- **muted** `#45616f` / `#94a3b8` — secondary text (≥4.5:1 on card and ground in both schemes)
- **border** `#d7e3e9` / `#1d3a55` — hairline edges (borders never exceed 1px except the stamp)
- **success** `#059669` (text/accent) / **successFill** `#047857` (filled action fill, white label, 5.5:1) / **danger** `#dc2626` (white label, 4.8:1); text variants `successText` / `dangerText` are scheme-tuned for AA
- **warningFill** `#b45309` — lamp fill; warning text `#92400e` (light) / `#fbbf24` (dark)
- **focus** `#0e7490` (light) / `#67e8f9` (dark) — thermocline cyan; **plates** — flat fills with hairline borders per tone (error / warning / success / info); no colored border-left accents
- Type: `micro` 11 (uppercase, tracked 1.2 — the "stamped label"), `sm` 13, `md` 15, `lg` 17, `xl` 20, `xxl` 26. Spacing 4/8/12/16/24/32, radius 6/10/16.

## Components

- `BadgeFace` — the laminate ID badge: DTR band, photo corner with initials, name, position, Employee ID / Branch micro rows, role plates, deterministic barcode strip.
- `GateLamp` — ring + core lamp with label and sub-line; states success / danger / warning / muted.
- `Stamp` — rotated, uppercase result plate; spring-scale entrance (the one authored motion); `accessibilityLiveRegion="polite"`.
- `Button` — variants primary (band) / secondary (card + hairline) / danger / success; sizes default (48) and large (60, the punch slot); busy state via `accessibilityState`.
- `Banner` — flat plate with hairline border, title + detail.
- `SectionCard` — laminate card with micro-label title.
- `Row` — label / value pairs; `Tag` — small plate (tones: neutral, success, warning, danger).
- `LabeledInput` — micro-label field with band border when focused.
- `Screen` — safe-area shell, ground background.
- `CameraModal` — camera chrome `#05070c`, safe-area-aware controls, white capture ring, min 44pt controls, labeled "Capture selfie".

## Screen architecture

- **Login / MFA** — brand band plate; centered form (Employee ID + Password only). Dev affordance "Get code (dev)" on MFA is gated behind `DEV_OTP_ENABLED` in `src/config.ts` (single dev flag; MFA uses the same value surfaced by `AuthContext`). Device ID and server URL are edited after login (More) or via app config — not shown on Login.
- **Home** — punch hero: BadgeFace → gate lamp → slot button → hint → banners (at most one system banner: offline only; queue count folds into it) → stamp result → schedule card → today's punches → offline queue card (with Sync now). GPS is resolved before the camera opens: no GPS fix (or location permission denied) blocks the punch with a "GPS required" error stamp; there is no manual coordinate entry.
- **History** — segmented filter plates (min 44pt, `accessibilityState.selected`), date fields, wrapping tag rows.
- **Alerts** — tab and screen both named "Alerts"; unread = laminate card + band dot; "Mark all read" micro-label action.
- **More** — Account, Privacy (→ Consent & data), Security, Server, Device cards. Consent & data is now reachable via a native-stack wrapper (`MoreStack`).
- **Consent & data** — back affordance, themed switches, data request buttons.

## Accessibility rules

- All interactive targets ≥44pt (buttons, filters, rows, back, mark-all, camera controls).
- Roles and states on interactive elements; `busy` on loading actions; `selected` on filters.
- Result announcements via `accessibilityLiveRegion`; status text is never color-only.
- Contrast ≥4.5:1 for text in both schemes; dark mode is a first-class scheme, not an afterthought.
- Camera modal safe-area aware (controls never sit under the home indicator).

## Motion

One authored moment: the confirmation stamp (spring scale + rotate settle). Everything else is static or system-provided (navigation, focus). No decorative looping animation.

## Verification

Commands (from `frontend/`):

```
npx tsc --noEmit
npx expo export --platform android   # bundle sanity
node "C:\Users\Jem\.agents\skills\impeccable\scripts\detect.mjs" --json src
```

Detector run on `src`: clean (`[]`, exit 0). Known caveat: the detector is web-oriented; judge its hits on RN code with a grain of salt.

### Manual device checklist (no emulator available in this session)

1. Login → MFA in light and dark; status bar text flips with scheme.
2. Home: badge, lamp (open → green), punch slot in first viewport; punch → camera → stamp springs in and reads out.
3. Clock in, then Home shows red "Clocked in" lamp; clock out shows duration row.
4. Location services off (or permission denied): tapping Time In/Out shows the "GPS required" stamp and no camera opens; enabling GPS + retry completes the punch.
5. Airplane mode: offline banner appears, punch queues; "pending" plates show; restore network → auto-sync.
5. History filters (44pt) and date range; pull-to-refresh; tags wrap on narrow screens.
6. Alerts: unread dot, mark-all; tab badge counts down.
7. More → Consent & data: toggles round-trip, back returns to More.
8. Font scaling (large text) on Home and History; camera modal on a small device (safe areas).
9. Camera permission denied flow shows the grant plate.
10. Offline queue: a punch made while offline carries real GPS (resolved before the camera); queue rows show "pending sync".

---

# DTR Web Admin — "Modern SaaS"

Direction contract and design system for the web admin console (`web/`). Companion to `PRODUCT.md` (product truth). Platform: operate/admin console — HR and branch managers review attendance, schedules, and fraud evidence at a desk. Replaces the former Mesophotic Deep Dive world (2026-08 redesign). Mobile/portal "ID Badge" is unchanged.

## Direction — Modern B2B SaaS

Dense, scannable HR console. Slate shell for navigation, crisp neutral canvas for work surfaces, teal primary for actions and focus. Tables and metric widgets carry the product; decoration stays minimal.

| Element | Design |
|---|---|
| Canvas | `#F8FAFC` ground, white cards, `#E2E8F0` hairline borders, 12px radius |
| Shell | Sidebar `#0F172A` / raised `#1E293B`; active nav = teal text + 3px left bar |
| Primary | Teal `#0D9488` / dark `#0F766E` |
| Type | Inter Variable; data uses `font-mono` + tabular numerals |
| Badges | Soft semantic pills; solid severity for high/medium/low fraud |
| Motion | Standard pulse skeletons; no decorative snowfall |

## Tokens (`web/src/index.css`, Tailwind v4 `@theme`)

- `primary` `#0d9488` / `primary-dark` `#0f766e`
- `danger` `#dc2626`, `success` `#059669`, `warning` `#d97706`
- `bg` `#f8fafc`, `card` `#ffffff`, `border` `#e2e8f0`, `text` `#0f172a`, `muted` `#64748b`
- `deep` `#0f172a`, `deep-2` `#1e293b`, `deep-border` `#334155`
- Focus ring: 2px primary outline with offset

## Components

- `Layout` — collapsible slate sidebar, avatar user block, nav badge counts (fraud / data requests), mobile drawer
- `MetricCard` — value + delta vs yesterday + optional click-through
- `DataTable` — sticky header, pulse skeleton, teal row hover
- `Badge` / `Avatar` / `PageHeader` / Radix `DropdownMenu`
- `Drawer` / `Modal` — light or dark panels; fraud evidence may stay dark for contrast

## Page architecture

- **Dashboard** — Attendance metrics + security severity strip; humanized activity feed with relative time
- **Attendance** — compact filter bar + more-filters panel; avatar rows; time/status pills; URL query deep-links from dashboard
- **Fraud flags** — severity summary bar; solid severity badges; inline Resolve/Dismiss; evidence drawer
- **Requests** — data access/deletion only
- **Schedules** — list / week toggle; bulk assign; shift chips
- **Employees** — unified search; avatar + org tags; row ellipsis menu
- **Shifts** — management cards with hours/grace/break icons and active toggle
- **Branches** — shared tokens/table density

## Accessibility rules

- Focus rings on all interactive elements (rows are keyboard-activatable with Enter/Space).
- Muted text ≥4.5:1 on both ground and card; on dark surfaces use `slate-400`+; badges are never color-only (text labels always).
- Dialogs: focus trap, Escape, focus restore, `aria-modal` + `aria-labelledby`; toasts `role="status"` + `aria-live`.
- The fraud drawer keeps the audit-consequence copy and per-button loading states.

## Motion

One authored moment: marine snow on skeleton load. Everything else is `transition-colors` on hover/focus. No looping decoration outside the skeleton.

## Verification

Commands (from `web/`):

```
npx tsc --noEmit
npm run build
node "C:\Users\Jem\.agents\skills\impeccable\scripts\detect.mjs" --json src
```

Detector run on `src`: clean (`[]`, exit 0). Browser-inspection caveat: this session has no browser tooling; a rendered-DOM pass (`impeccable detect http://localhost:<vite-port>`) is the recommended follow-up.

### Manual review checklist (no browser tooling in this session)

1. Login → MFA: brand chip, light-shaft ground, focus rings; error banners readable.
2. Sidebar: active nav seam follows the route; user mono ID row; sign-out hover state.
3. Dashboard: mono figures align in a row (tabular numerals); chip tones distinct.
4. Attendance: apply an inverted date range → inline error; clear filters recovers. Open a record → light drawer, photos stack on a narrow window.
5. Fraud flags: open a flag → dark drawer; badges legible on dark; C/D kbd hints visible; photos load into white-tinted frames; confirm → toast + status badge updates.
6. Schedules: filter card has padding around controls; Clear filters aligns with fields.
7. Shifts: submit with empty start/end → inline field errors, no midnight shift created.
8. Skeleton load: marine snow falls through pulse rows; rows don't jump on load (py-3 both).
9. 404 route and a forced render error: readable messages, no raw internals.
10. Mobile width (~375px): sidebar consumes its fixed column (known p1 — collapsible nav left on the ledger), tables scroll horizontally, drawers and modals fit.
