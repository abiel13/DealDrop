# Feature: API security and abuse protection

Priority: P0  
Suggested labels: `security`, `backend`, `reliability`, `P0`

## Problem

The API uses a custom Node HTTP server and a service-role Supabase client. The current implementation has authentication and validation, but production also needs request abuse protection, browser-origin policy where applicable, response hardening, and a complete authorization review for service-role queries.

## Goal

Make the public API safe to expose to real users and resilient to accidental or malicious high-volume usage.

## Scope

- Add rate limits for authenticated search, watchlist mutations, event capture, push-token registration, and notification actions.
- Add an explicit CORS policy if the web build is supported; reject unexpected origins.
- Add appropriate security response headers for the deployment target.
- Review request size, query length, pagination, timeout, and concurrency limits.
- Audit every service-role repository query for user scoping and least-privilege behavior.
- Resolve the listing-detail authorization decision explicitly: either enforce match/favorite ownership or document why public listing access is intended.
- Ensure marketplace errors, tokens, credentials, and raw provider payloads are not exposed to clients or logs unnecessarily.
- Add abuse and authorization tests, including cross-user resource access attempts.

## Acceptance criteria

- Repeated requests from one user or IP are throttled with a structured retryable error.
- Search cannot create unbounded provider calls, body sizes, pagination, or concurrent work.
- Web requests succeed only from configured origins when web is a supported client.
- A user cannot read or mutate another user’s watchlists, matches, notifications, favorites, events, or private data.
- Listing access follows the documented authorization policy even when the server uses the Supabase service role.
- No API response or structured log contains access tokens, provider secrets, or unnecessary raw listing payloads.
- Security behavior is covered by automated API tests.

## Out of scope

- Replacing Supabase Auth.
- Building a WAF or enterprise identity system.
- Adding a second database client.

## Technical notes

- Prefer existing validation and error-envelope conventions.
- Use deployment-level controls where they are more reliable than application-only controls, but document both layers.
- Do not expose the service-role key to Expo or browser code.

## Definition of done

- Security and abuse controls are implemented or explicitly delegated to the production platform.
- Cross-user and rate-limit tests pass.
- A short security review checklist is stored with the deployment documentation.
