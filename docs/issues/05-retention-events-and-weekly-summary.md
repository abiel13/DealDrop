# Feature: Retention measurement and useful weekly summary

Priority: P1
Suggested labels: `feature`, `analytics`, `retention`, `P1`

## Problem

We need to distinguish “the app found nothing useful” from “the user did not return.” The current product also lacks a recurring, user-centered reason to revisit active watchlists.

## Goal

Measure the alert loop and give users a concise weekly summary of useful activity.

## Scope

- Record privacy-conscious product events for:
  - account activation
  - first watchlist created
  - push permission result
  - first match received
  - notification opened
  - listing opened externally
  - listing favorited
  - match dismissed as not relevant
  - watchlist paused, resumed, or completed
- Define a “meaningful alert” event as a notification or in-app match that the user opens, saves, or marks relevant.
- Add an in-app weekly summary for active users showing new matches, saved listings, price drops when available, and watchlists with no recent matches.
- Make the summary opt-out capable and avoid sending empty promotional messages.

## Acceptance criteria

- Events are emitted once per user action and do not contain listing descriptions, tokens, or other unnecessary personal data.
- Event names and required properties are documented in the codebase.
- Weekly summary counts match the underlying user-visible data.
- A user with no new activity receives a useful status message in-app or no summary, according to the final product decision; no misleading activity is shown.
- Summary links open the relevant watchlist, listing, or notification screen.
- The feature does not block the main app when analytics or summary data is unavailable.
- Tests cover event payload validation and summary aggregation.

## Out of scope

- Choosing a third-party analytics vendor.
- A/B testing framework.
- Personalized recommendations beyond the user’s existing watchlists.

## Technical notes

- Start with the existing API/server architecture and keep event capture non-blocking.
- Avoid introducing a new dependency unless the selected analytics provider requires it.
- The summary should be generated from existing match/listing data before adding a new recommendation system.

## Definition of done

- Event contract, capture points, summary UI/data, preferences, and tests are complete.
- `npm run lint`, `npm run format:check`, and `npx tsc --noEmit` pass.
