# HomeplateMetrics sign-in and season import incident

## Verified

- Production `/api/backfill?from=2026-09-01&to=2026-09-01` returns HTTP 401 without a session.
- The dashboard previously exposed import to guests and replaced every error with “Backfill failed”.
- Production uses Clerk at `clerk.homeplatemetrics.com`; its public environment enables Google OAuth and email sign-in.
- The connected Vercel team `real-f1291a6e` lists no projects and cannot resolve the production deployment. Production logs and configuration were unavailable.

## Changes

Guest import directs to sign-in. Import requests cover one day instead of thirty, reducing timeout exposure from point-in-time statistics. Each successful day is saved locally and synchronized before continuing. HTTP authentication, timeout and account-sync failures are visible; earlier days remain saved. A server batch where every day throws returns 502 instead of misleading empty success. Authentication remains required.

## Google OAuth follow-up

`400 invalid_request` with `flowName=GeneralAuthFlow` is insufficient to distinguish a malformed OAuth request, production credential configuration, or browser issue. No Google OAuth fix has been verified.

1. Reproduce in Safari/Chrome directly at https://homeplatemetrics.com/sign-in. Email authentication is enabled as an alternative.
2. In the Clerk **production** instance, inspect the Google social connection and its custom OAuth credentials.
3. Compare its exact authorized redirect URI with the same web OAuth client in Google Cloud. Use the value displayed by Clerk; do not substitute the app's `/sign-in` page.
4. Capture the full Google error description and parameter names, without tokens or credentials, if it still fails. Check consent/publishing configuration and request parameters against that specific error.
5. Connect the Vercel account/team that owns this project to inspect runtime logs and deploy the repair.

Reference: https://developers.google.com/identity/protocols/oauth2/web-server

## Validation after deployment

Verify Google and email login independently, guest import navigation, signed-in import, and expired-session behavior. Interrupt a multi-day import and confirm earlier results remain. Retry to confirm upserts do not duplicate games. Check account history after refresh. One-day batching reduces request duration but does not guarantee upstream availability; production authenticated verification remains required.
