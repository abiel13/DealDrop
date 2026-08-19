# Feature: Listing freshness and unavailable-listing lifecycle

Priority: P1  
Suggested labels: `feature`, `trust`, `listings`, `P1`

## Problem

Listings have first-seen and last-seen timestamps, but the user experience does not clearly distinguish fresh opportunities from listings that have disappeared, sold, expired, or not been observed recently. A stale match can reduce trust even when the original external URL is no longer usable.

## Goal

Make listing freshness and availability clear enough for a user to decide whether to open or save a deal.

## Scope

- Define how an ingestion cycle marks listings as observed, stale, unavailable, or active.
- Avoid repeatedly creating notifications for listings that have not materially changed.
- Preserve historical matches and favorites when a listing becomes unavailable.
- Show listing age, last observed time, stale warnings, and unavailable state consistently in feed, details, and notifications.
- Handle price changes and marketplace status changes without losing the original match context.
- Ensure deep links to unavailable listings show a useful fallback rather than a generic failure.
- Add ingestion, matching, API, and mobile tests for freshness transitions.

## Acceptance criteria

- A listing’s freshness state is derived from documented observation data and is not guessed from the UI load time.
- Repeated ingestion of an unchanged listing does not create repeated user-visible alerts.
- A missing or unavailable listing remains visible in history and favorites with a clear status.
- A stale listing is not presented as a newly discovered deal.
- A changed price is shown with the correct observation time and currency.
- A user can still open the original marketplace URL when it is available.
- Existing price-history and matching behavior remain correct.

## Out of scope

- Predicting future availability.
- Automated purchasing or seller contact.
- Marketplace-specific scraping or unsupported status inference.

## Technical notes

- Reuse `first_seen_at`, `last_seen_at`, normalized listing identity, and price observations.
- Do not mark a listing sold merely because one provider response omitted it unless the provider contract supports that conclusion.
- Keep historical rows recoverable according to the data-retention policy.

## Definition of done

- Freshness and unavailable states are persisted and shown consistently.
- Duplicate-alert and lifecycle behavior is covered by tests.
- Relevant mobile/server checks pass.
