# Feature: Match explainability and marketplace monitoring health

Priority: P1  
Suggested labels: `feature`, `trust`, `matching`, `marketplaces`, `P1`

## Problem

The feed shows a listing, price, marketplace, and recency, but it does not clearly explain which watchlist produced the match or which filters were satisfied. Watchlists show a last-checked date, but users cannot tell whether a source failed, became disabled, or has stale results.

## Goal

Help users understand why a result is useful and whether DealDrop is actively monitoring their search.

## Scope

- Show the matching watchlist name on feed cards, listing details, and notification history where available.
- Show relevant match context such as target price, current difference, condition, location, or alias match without exposing unnecessary raw provider data.
- Show the source’s supported capabilities and clearly distinguish unsupported filters.
- Add per-watchlist monitoring status: last successful check, latest failure, stale-data warning, and enabled source state.
- Preserve partial marketplace failures while identifying which source failed and what data remains usable.
- Add retry or recovery guidance where a user can take action.
- Cover explainability and health data in API and mobile tests.

## Acceptance criteria

- A user can identify which watchlist caused each match.
- A user can see a concise, human-readable reason a listing matched.
- Unsupported marketplace filters are not presented as if they were enforced.
- A failed or stale source is visible without falsely claiming that monitoring is healthy.
- Successful sources continue to provide results when another source fails.
- Health timestamps use an explicit timezone or device-local presentation consistently.
- Explanations do not expose server credentials, raw tokens, or excessive provider payloads.

## Out of scope

- AI-generated explanations.
- Automatic threshold changes based on feedback.
- A full operator administration dashboard.

## Technical notes

- Reuse normalized listing, marketplace capability, worker summary, and match contracts.
- Prefer explainable deterministic fields over opaque scores.
- Coordinate persisted health data with the worker operations issue.

## Definition of done

- Match context and source health are visible in the relevant user flows.
- Partial failures and stale monitoring states are tested.
- Standard mobile/server checks pass.
