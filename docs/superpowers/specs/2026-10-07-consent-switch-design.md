# Consent Slide Toggle Switches — Design

Date: 2026-10-07
Status: Approved by user in chat.

## Purpose

Consent Preferences uses native checkboxes. Replace them with slide toggle switches on all three rows (Biometric photos, GPS location, Device alerts) for a more conventional settings look.

## Scope

In:

- New portal component `portal/src/components/Switch.tsx`.
- Consent Preferences uses the switch on all three rows.
- Existing disabled and error behavior is preserved.

Out:

- Backend, API contracts, and consent payloads.
- The admin web `Toggle` in `web/src/components/ui.tsx` and its consumers.
- `ThemeToggle`, the More page, and any other checkbox in the portal.
- New dependencies or animation libraries.

## Component

`portal/src/components/Switch.tsx`:

```tsx
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
})
```

- Renders a native `<button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>`.
- Controlled only. The caller owns the state; the switch never holds internal state.
- Keyboard behavior comes from the button element (Enter and Space activate it).
- Focus is visible: a 2px primary focus ring using `outline` with `outlineOffset`, so it reads in both themes.

## Styling

Portal-native inline styles with `useThemeColors`, `radius`, and `spacing` from `../theme`. No Tailwind classes and no admin web styling.

- Track: 44×26 px, `borderRadius: 999`, 1px border `colors.border`.
- On: `background: colors.primary`. Off: `color-mix(in srgb, var(--muted) 22%, var(--card))`.
- Thumb: 20×20 white circle, positioned at the track's content box top offset 2px, `boxShadow: var(--shadow-sm)`, `transform: translateX(20px)` when on, `translateX(2px)` when off (44px track, 1px borders, 42px content: 2px outer gap, 20px travel), `transition: transform 160ms ease`.
- Track background transition: `background-color 160ms ease`.
- Disabled: `opacity: 0.5`, `cursor: not-allowed`, no hover effect.
- `aria-hidden` on the thumb; the button carries the accessible name.

## Consent wiring

`portal/src/pages/Consent.tsx`:

- Replace each `<input type="checkbox" ... />` with:

```tsx
<Switch
  checked={grantedFor(key)}
  onChange={(next) =>
    key === 'device_alerts' ? toggleDeviceAlerts(next) : toggleConsent(key, next)
  }
  disabled={saving === key || unsupported}
  label={label}
/>
```

- `toggleConsent` and `toggleDeviceAlerts` already take a boolean, so only the call site changes. No API or flow changes.
- The loading/saving and unsupported states already disable the control and remain as they are.

## Verification

- `npm run typecheck` and `npm run build` in `portal/`.
- Browser check on the running portal in light and dark mode: all three switches render, reflect granted state, animate on toggle, show the disabled state while saving and for unsupported Device alerts, and the Device alerts enable/disable flow still subscribes and unsubscribes.
