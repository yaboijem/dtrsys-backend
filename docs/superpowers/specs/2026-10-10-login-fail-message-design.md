# Clearer wrong-credentials login message

**Date:** 2026-10-10  
**Status:** Approved  
**Surfaces:** Employee portal (`portal`), admin web (`web`), login API (`AuthService`)

## Problem

A wrong employee ID or password shows: "Employee ID or password does not match. Employee ID is case sensitive." The Employee ID field also has a "Case sensitive" hint. The fail sentence is vague, and the case-sensitive note is repeated and unwanted.

## Goal

Wrong credentials show one sentence on the API, portal, and web: "That employee ID and password do not match. Check both and try again." No case-sensitive wording on the fail message or under the Employee ID field.

## Non-goals

- Do not say which field was wrong
- Do not change empty-field, deactivated-account, missing-profile, network, or Google sign-in messages
- Do not change the portal banner title "Could not sign in"
- Do not change invalid-field styling or focus behavior
- No other login screens

## Design

### Copy

Replace the wrong-credentials validation message in `app/Services/AuthService.php` with:

`That employee ID and password do not match. Check both and try again.`

Use that same sentence as the credential-failure alert in:

- `portal/src/pages/Login.tsx`
- `web/src/pages/LoginPage.tsx`

Keep the existing client match for `credentials are incorrect` and `does not match`, so an older API response still displays the new sentence.

### Hints

Remove the Employee ID "Case sensitive" hint:

- Portal: drop `hint="Case sensitive"` on the Employee ID field
- Web: drop the hint span and its `aria-describedby`

## Testing

- `tests/Feature/AuthTest.php`: both wrong-credentials assertions expect the new sentence
- Portal and web: wrong ID or password shows only the new sentence; Employee ID has no case-sensitive hint
- Empty fields, deactivated account, network failure, and Google sign-in copy are unchanged
