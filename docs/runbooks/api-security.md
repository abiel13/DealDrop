# API security checklist

This checklist covers the controls required before exposing the DealDrop API to production traffic.

## Deployment configuration

- Keep `SUPABASE_SERVICE_ROLE_KEY`, marketplace credentials, and provider tokens in the server secret store. They must never be placed in Expo public variables, returned in API responses, or logged.
- Set `NODE_ENV=production` and configure `SERVER_ALLOWED_ORIGINS` with exact `http` or `https` origins only when a web client is deployed. For public Deal Room pages, include the exact website origins `https://get-deal-drop.com` and any separately used `https://www.get-deal-drop.com` origin. The production default is an empty allowlist; native requests do not require an `Origin` header.
- Leave `API_TRUST_PROXY=false` unless the server is behind a trusted proxy that replaces `X-Forwarded-For`. When enabled, the first forwarded address is used for IP throttling.
- Review the `API_RATE_LIMIT_*`, `API_MAX_*`, and `API_REQUEST_TIMEOUT_MS` values for the deployment size. Application limits are per process, so a multi-replica deployment must also enforce equivalent limits at the load balancer, API gateway, or WAF.

The server applies security headers, a request body limit, URL limit, request/socket timeout, a maximum of 100 records per page, per-user and per-client-IP fixed-window limits, and a bounded number of concurrent searches. A throttled response is JSON with code `rate_limited` and includes `Retry-After`.

## Authorization review

The server uses the Supabase service role only on the server. Every user-owned repository operation receives the authenticated user ID from the bearer token; it is never accepted from the request body or query string.

| Data                                            | Required scope                                                                           | Review status |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| Watchlists and watchlist marketplace selections | `watchlists.user_id = authenticated user`; selection RPC is called only after this check | Verified      |
| Matches and match feedback                      | `matches.user_id` and `match_feedback.user_id`                                           | Verified      |
| Notifications and preferences                   | `notifications.user_id` and `notification_preferences.user_id`                           | Verified      |
| Favorites and push tokens                       | `favorites.user_id` and `push_tokens.user_id`                                            | Verified      |
| Product events                                  | `product_events.user_id`                                                                 | Verified      |
| Weekly summary                                  | Matches, favorites, and active watchlists are each user-scoped                           | Verified      |

### Listing-detail policy

Authenticated listing detail is intentionally normalized-public within the app: a user may open an active cached listing by ID from search or an external marketplace link. The response contains normalized listing fields and user-scoped match/favorite/price-target enrichment; it never returns `raw_data` or provider payloads. Match and favorite mutations still require the authenticated user-owned records, and an unknown or inactive listing returns not found.

This policy must remain explicit when adding listing endpoints. If DealDrop later requires private listing access, change `getListingForUser` to require a user match or favorite and update the route tests.

## Abuse and data-leak checks

- Search input is bounded by validation, page size is capped at 100, each provider call has a timeout, and API-level concurrent searches are capped.
- Marketplace partial failures use source/category-safe messages. Provider exception text, credentials, access tokens, and raw provider payloads must not be copied into responses or structured logs.
- Search and monitoring logs record query length, not the user’s search text. Review new logs for tokens, URLs with credentials, request bodies, and raw listings.
- Verify rate-limit behavior for search, watchlist mutations, event capture, push-token registration, notification actions, and listing/match mutations after changing route names.
- Keep API error envelopes stable: clients may retry `429` responses after `Retry-After`; `503` search-capacity responses are temporary.

## Release and incident checklist

Before release:

1. Run the automated API security tests and the standard lint, format, and TypeScript checks.
2. From two authenticated accounts, attempt to read and mutate the other account’s watchlists, matches, notifications, favorites, events, preferences, and push tokens. Each attempt must return not found or an equivalent denial without leaking existence.
3. Test an allowed browser origin, an unexpected browser origin, a native request without `Origin`, an oversized body, an oversized URL, a limit above 100, repeated requests, and concurrent searches.
4. Confirm logs and responses contain no bearer tokens, service-role keys, marketplace credentials, or raw provider payloads.

During an incident:

- Reduce or disable a failing marketplace at the worker/source configuration layer while leaving successful sources available.
- Tighten gateway limits or temporarily block a client/IP, then restart only the affected API process or worker.
- Revoke exposed credentials immediately, rotate them in the server secret store, and inspect logs for the affected request IDs.
- Roll back to the last known-good server build if a security control causes broad failures. Re-run the cross-user and rate-limit checks after rollback.
