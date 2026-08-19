# Support and listing problem reports

## User paths

- Profile → Support opens the reviewed `EXPO_PUBLIC_SUPPORT_URL` destination.
- Listing details → Report a listing problem opens the structured category picker.
- Listing-load and report-submit failures keep the listing screen usable and offer Contact support
  when the production support destination is configured.

## Categories and safe context

Supported categories are `broken_link`, `wrong_price`, `stale_listing`, `incorrect_match`,
`missing_image`, and `other`.

Each report stores only:

- the authenticated user ID;
- DealDrop listing ID and server-derived marketplace ID;
- optional match and watchlist IDs after user-ownership validation;
- app version and the server request ID;
- category, status, and timestamps.

Do not add free-form listing descriptions, access tokens, passwords, seller contact data, raw
provider payloads, or authorization headers to reports or support exports.

## Storage, access, and retention

Reports are submitted through `POST /api/v1/listing-reports` and stored in the backend-only
`listing_problem_reports` table. The mobile app uses the shared authenticated API client; it never
receives or embeds a Supabase service-role credential. The `(user_id, idempotency_key)` unique key and
the mobile pending state prevent accidental duplicate submissions.

Support Operations is responsible for triage and review. Product owns incorrect-match follow-up,
Marketplace Partnerships owns provider escalation, and Engineering owns API or delivery failures.
Open and reviewed reports remain available until handled. Resolved and dismissed reports are
eligible for deletion after 730 days through the server-only
`public.cleanup_listing_problem_reports()` function. Account deletion removes a user's reports by
the profile foreign-key cascade.

## Operator checklist

1. Find the report by report ID, listing ID, marketplace, or request ID in the server-only support
   tooling.
2. Confirm the category and listing state without copying private listing content into tickets.
3. Check the request ID in structured server logs for the API failure or provider response category.
4. If a provider is stale or unavailable, follow the marketplace adapter runbook and disable only
   the affected source when required.
5. Mark the report reviewed, resolved, or dismissed, recording only the minimum operational note in
   the approved support system.
