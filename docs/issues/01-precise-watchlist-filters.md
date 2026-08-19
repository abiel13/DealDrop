# Feature: Precise watchlist filters and matching

Priority: P0
Suggested labels: `feature`, `retention`, `matching`, `P0`

## Problem

DealDrop currently lets a user provide a watchlist name, a free-text search term, and marketplace selection. The server already has filter concepts for price, location, distance, conditions, and aliases, but the mobile form does not expose them. Broad matches create noisy notifications and reduce trust in the product.

## Goal

Let users describe the deal they actually want so that matches are more relevant and alerts are worth opening.

## Scope

- Add optional minimum price, maximum price, and currency fields.
- Add optional condition selection.
- Add optional location and maximum-distance fields where marketplace data supports them.
- Add optional alias/include terms for common names, model numbers, and spelling variations.
- Add optional excluded keywords for terms the user does not want.
- Support creating and editing these filters from the existing watchlist form.
- Persist filters through the existing watchlist API and apply them in server-side matching.
- Explain when a selected marketplace cannot apply a specific filter.

## Acceptance criteria

- A user can create a watchlist with any valid combination of the supported filters.
- A user can edit filters without changing the watchlist name, query, or marketplace selection.
- Invalid ranges and invalid values show user-friendly validation errors.
- Listings outside the price, condition, location, distance, or excluded-keyword rules do not create matches.
- Existing watchlists with empty filters continue to work unchanged.
- Matching behavior is covered by unit tests for each filter and for combined filters.
- Partial marketplace failures remain visible and do not silently produce false matches.

## Out of scope

- New marketplace adapters.
- AI-generated queries or automatic category detection.
- Redesigning the watchlist screen.

## Technical notes

- Preserve the existing `WatchlistFilters` shape where possible.
- Use the shared API client and Supabase client; do not create a second data path.
- Keep Expo Router route files thin.

## Definition of done

- Mobile UI, API validation, persistence, and server matching are implemented.
- Relevant server and mobile tests pass.
- `npm run lint`, `npm run format:check`, and `npx tsc --noEmit` pass.
