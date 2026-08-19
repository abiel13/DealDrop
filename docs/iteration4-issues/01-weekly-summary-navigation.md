# Bug: Make weekly summary reachable and links actionable

Priority: P0  
Suggested labels: `bug`, `retention`, `navigation`, `P0`

## Problem

The weekly summary UI and API exist, but the summary screen is not connected to the authenticated app flow. The current tab layout exposes Feed, Watchlists, Alerts, and Profile, while the summary is implemented in an unused `HomeScreen`. Summary links also need destinations that match their labels: a quiet watchlist should open its matches or detail view, not only the edit form.

## Goal

Make the weekly summary a visible, trustworthy reason for users to return to DealDrop.

## Scope

- Choose the existing authenticated surface where the summary should appear and wire it into Expo Router.
- Make the summary visible when the user is eligible and the preference is enabled.
- Keep the summary hidden or show the approved no-activity state when there is no activity.
- Make new-match links open the relevant notification or match view.
- Make saved-listing and price-drop links open the correct listing.
- Make quiet-watchlist links open the relevant watchlist or match view rather than an unrelated edit-only destination.
- Preserve loading, error, opt-out, and signed-out behavior.
- Add route and component tests for visibility and every link destination.

## Acceptance criteria

- A signed-in user can reach the weekly summary from the normal authenticated navigation.
- The summary is not stranded in an unused screen or route.
- Each summary link opens the screen described by its label and carries the correct identifier.
- Opted-out users do not see the summary.
- No-activity users do not see fabricated counts or misleading links.
- A failed summary request does not block Feed, Watchlists, Alerts, or Profile.
- Cold-start navigation and back navigation work on Android and iOS.
- Relevant mobile tests pass.

## Out of scope

- New summary metrics.
- A new analytics provider.
- A full home-screen redesign.

## Technical notes

- Keep Expo Router route files thin.
- Reuse the existing weekly summary API and `WeeklySummaryCard`.
- Coordinate with the watchlist-detail issue if the destination screen is not yet available.

## Definition of done

- The existing weekly summary is visible and navigable in the authenticated app.
- All links have correct destinations and error handling.
- Mobile tests and the standard lint, formatting, and TypeScript checks pass.
