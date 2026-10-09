# Portal Google login

**Date:** 2026-10-08
**Status:** Approved
**Surfaces:** API, employee portal (`portal`)

## Goal

An employee can sign in to the portal with Google, in addition to employee ID and password.

Google sign-in succeeds only when the Google account's verified email already belongs to an active user who has an employee profile. It does not create an account. It returns the same Sanctum token and user payload as password login, and it registers the device the same way.

## Non-goals

- Google sign-in on the admin site (`web`)
- Replacing or hiding employee ID and password
- Self-signup, invite links, or creating a user from a Google profile
- A "link Google" screen after password login
- Restricting sign-in to a company domain
- Storing a Google subject id, refresh token, or access token
- One Tap, FedCM auto-prompt, or a redirect fallback if the Google popup is blocked
- Laravel Socialite

Password login, logout, and `GET /api/auth/me` stay as they are.

## Operator setup

The operator creates a Google Cloud OAuth client of type **Web application**. This repo does not contain a client id or secret.

- Put the same client id in `GOOGLE_CLIENT_ID` (API) and `VITE_GOOGLE_CLIENT_ID` (portal).
- Authorized JavaScript origins must include every portal origin that shows the button (local dev and production). No redirect URI is required for this flow.
- No client secret is used. Do not add one to the portal bundle.

If `VITE_GOOGLE_CLIENT_ID` is empty, the portal hides the Google control. Password login still works.

If `GOOGLE_CLIENT_ID` is empty, `POST /api/auth/google` rejects the request. It does not call Google.

## Login screen

Keep Employee ID, Password, and Login. Under Login, a quiet "or", then Google's own button from Google Identity Services. Not a custom button with a Google logo.

- The button follows the portal theme: `outline` in light mode, `filled_black` in dark mode. Text is `continue_with`. Size is `large`. Width is the form column width, at least 240px. Re-render when the theme or width changes.
- Load `https://accounts.google.com/gsi/client` once. No new frontend package.
- While either sign-in is in flight, the Login button is disabled and a non-interactive cover sits over Google's button. A second Google callback is ignored until the first request finishes.
- Offline before the click uses the same message as password login: "Connect to the internet and try again."
- Closing the popup does not show an error.
- If the script fails to load, show "Google sign-in failed. Try again." Password login stays usable.
- Success navigates to `/home` and stores the token the same way password login does.

## API

`POST /api/auth/google`

Public. Uses the existing `throttle:login` limiter (5 per minute). No new limiter.

Request:

```json
{
  "id_token": "string, required, max 8192",
  "device_id": "nullable string, max 64",
  "platform": "nullable string, max 20",
  "model": "nullable string, max 255",
  "app_version": "nullable string, max 20"
}
```

The portal sends `platform: "web"`, `app_version` from `APP_VERSION`, and the current `device_id`. `model` may be omitted.

Success is the same JSON as `POST /api/auth/login`: `message`, `token`, `user` (`UserResource`, with employee, branch, department, and position loaded). The token name stays `mobile`.

## Verification

A `GoogleIdTokenVerifier` verifies the ID token locally with `google/auth` (`Google\Auth\AccessToken::verify`). Do not call Google's tokeninfo endpoint. Tests bind a fake verifier and never call Google.

The verifier rejects the token unless all of these hold:

- Signature is valid.
- `aud` equals `GOOGLE_CLIENT_ID`.
- `iss` is `accounts.google.com` or `https://accounts.google.com`.
- The token is not expired.
- `email` is a non-empty string.

It normalizes `email_verified`: boolean `true` and the string `"true"` become `true`. Anything else becomes `false`. It does not query users.

Cache Google's signing certs for the library's normal TTL so a login does not download certs every time. Do not add Redis for this.

Do not log the raw ID token.

On success the verifier returns `email`, `email_verified` (bool), and `sub`. `sub` is not stored. A failed verify throws. `AuthService` does not match an account when verify throws.

## Matching

If `GOOGLE_CLIENT_ID` is empty, do not call the verifier.

If `email_verified` is false, do not query users.

Otherwise compare `email` to `users.email` case-insensitively. Do not rely on database collation.

Every rejection is HTTP 422 with exactly one `errors` entry, so the portal shows that sentence:

| Case | `errors` key | Sentence |
|---|---|---|
| Client id missing | `id_token` | Google sign-in is not configured. |
| Verifier throws | `id_token` | Google sign-in failed. Try again. |
| `email_verified` is false | `email` | Google sign-in failed. Try again. |
| No matching user | `email` | No employee account uses this Google email. |
| More than one matching user | `email` | Google sign-in failed. Try again. |
| Inactive user | `email` | Your account has been deactivated. Contact HR. |
| No employee profile | `email` | No employee profile is linked to this account. |

Do not insert a user. Inactive and missing-profile copy matches password login. Unknown email is specific because the person already proved they own that Google email.

After a single active match with an employee profile, call `DeviceService::resolveForLogin` with the same device fields as password login, then issue the Sanctum token.

## Portal handoff

`AuthContext` gains `loginWithGoogle(idToken)`. It posts to `/api/auth/google` and, on a token plus user, calls the existing login completion (store token and user, status `authed`). It does not add a second session format.

Validation errors already surface the first `errors` message on the login screen. Use that. Network failure uses the existing offline copy.

## Tests

Feature tests, with a fake verifier:

- Verified email matches an active user with an employee profile: `200`, token, user payload, device registered for that employee.
- Email case differs (`Emp@Company.com` vs `emp@company.com`): still signs in.
- Unknown email: `422`, no user created, no token.
- Inactive user: `422` and the deactivated message.
- User with no employee profile: `422` and the missing-profile message.
- Fake verifier returns `email_verified: false`: `422`, and no user query runs.
- Fake verifier throws: `422` and "Google sign-in failed. Try again."
- Empty `GOOGLE_CLIENT_ID`: `422` and "Google sign-in is not configured." The verifier is not called.

Do not add a separate rate-limit test. The route uses the existing login limiter.

Portal verification is `npm run typecheck` in `portal/`. No new portal test runner.

## Docs

- `.env.example`: `GOOGLE_CLIENT_ID=`
- `portal` reads `import.meta.env.VITE_GOOGLE_CLIENT_ID`. Mention that variable next to the existing portal env notes in `portal/README.md`.
- `docs/FEATURES.md` auth section: Google sign-in is an additional portal path, email match only, no self-signup.
- `config/services.php`: `google.client_id`.

## Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `GoogleIdTokenVerifier` | Validate an ID token and return claims | `GOOGLE_CLIENT_ID`, `google/auth` |
| `AuthService::loginWithGoogle` | Match email, apply the same account gates, register device, issue token | Verifier, `DeviceService`, `User` |
| `POST /api/auth/google` | Validate input, return the login JSON or a 422 | `AuthService` |
| Portal Google button + `loginWithGoogle` | Render Google's button and store the returned session | GIS script, auth API |
