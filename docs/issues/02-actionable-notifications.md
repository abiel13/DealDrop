# Feature: Actionable and configurable deal alerts

Priority: P0
Suggested labels: `feature`, `retention`, `notifications`, `P0`

## Problem

The current notification loop tells users that a listing matches a watchlist, but it does not give enough decision-making information or enough control over alert volume. Users should be able to understand the opportunity before opening the app and avoid notification fatigue.

## Goal

Make every alert clear, useful, and appropriately timed.

## Scope

- Improve notification title and body to include listing title, price, marketplace, watchlist name, and listing age when available.
- Deep-link directly from a notification to the matched listing.
- Add per-watchlist alert mode: instant or digest.
- Add global quiet hours with a timezone-aware configuration.
- Add a configurable daily alert limit or equivalent deduplication rule.
- Preserve the in-app notification history when push delivery is disabled.
- Provide a clear empty/error state when notification preferences cannot be loaded or saved.

## Acceptance criteria

- A push notification contains enough context to identify the listing and why it matched.
- Tapping a notification opens the correct listing, including when the app was closed.
- Users can change alert mode and quiet hours from the existing notification/settings experience.
- Quiet hours prevent push delivery during the configured period but do not delete the in-app notification.
- Duplicate matches do not create repeated notifications for the same user and listing.
- Digest mode groups eligible matches without losing the listing deep link.
- Preference changes are persisted and remain correct after app restart and sign-in refresh.
- Delivery, preference, and deep-link behavior are covered by tests.

## Out of scope

- Email, SMS, WhatsApp, or third-party messaging channels.
- Notification personalization based on machine learning.
- A new push provider; use the existing notification pipeline.

## Technical notes

- Coordinate mobile preferences, API validation, database migration, notification queue processing, and worker behavior.
- Treat timezone and daylight-saving changes deliberately; store an explicit IANA timezone when required.
- Do not expose server-only credentials in the mobile app.

## Definition of done

- Preferences, persistence, delivery behavior, UI, and deep links work end-to-end.
- Relevant server and mobile tests pass.
- `npm run lint`, `npm run format:check`, and `npx tsc --noEmit` pass.
