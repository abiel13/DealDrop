# Feature: Price history and deal quality

Priority: P1
Suggested labels: `feature`, `retention`, `pricing`, `P1`

## Problem

A low absolute price is not necessarily a good deal. DealDrop currently shows listing prices but does not help users understand whether a price is low compared with the same listing, product, or recent marketplace history.

## Goal

Help users answer “Is this a deal?” quickly and confidently.

## Scope

- Store normalized price observations when listings are ingested or refreshed.
- Expose a price-history summary for listings with enough observations.
- Show relevant history on the listing details screen.
- Show a simple deal indicator based on available historical or comparable-listing data.
- Show the user’s target price and the current difference when a watchlist has one.
- Clearly label estimates, missing history, currencies, and marketplace-specific limitations.

## Acceptance criteria

- Price observations are associated with the correct marketplace listing identity.
- Repeated ingestion updates history without creating duplicate observations for the same timestamp/value.
- A listing with insufficient history does not show a misleading deal score.
- The UI can display current price, historical low or range when available, and data age.
- Currency is never compared without an explicit conversion or a clear same-currency restriction.
- Price-history API and matching/storage behavior are covered by tests.
- Existing listings without history continue to render normally.

## Out of scope

- Automatic currency conversion.
- Predictions about future prices.
- Auto-buying or checkout automation.
- A full analytics dashboard.

## Technical notes

- Prefer a small append-only price-observation model with an index on listing and observed time.
- Keep the initial deal indicator explainable; avoid an opaque score.
- Reuse the existing normalized listing and marketplace adapter contracts.

## Definition of done

- Database migration, ingestion/storage, API response, mobile UI, and tests are complete.
- `npm run lint`, `npm run format:check`, and `npx tsc --noEmit` pass.
