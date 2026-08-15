# Feature: Accessibility and poor-network resilience

Priority: P1  
Suggested labels: `quality`, `accessibility`, `mobile`, `reliability`, `P1`

## Problem

The main screens have loading and error states, but production users will encounter slow networks, dropped connections, denied permissions, expired sessions, small screens, screen readers, keyboard navigation, and dynamic text sizes. These paths need a deliberate release check rather than only a successful-network test.

## Goal

Make DealDrop usable and recoverable across supported devices, accessibility settings, and unreliable connections.

## Scope

- Audit Feed, Watchlists, Alerts, Profile, watchlist form, listing details, authentication, premium, and notification flows with a screen reader.
- Verify labels, roles, selected/disabled states, focus order, touch targets, contrast, dynamic type, and reduced-motion behavior where supported.
- Add clear offline, timeout, expired-session, and retry states for remote operations.
- Preserve safe local UI state while a mutation is in progress and roll back failed optimistic changes.
- Verify refresh, pagination, duplicate-submit prevention, and app-resume behavior after a network interruption.
- Test dark mode, small and large device sizes, and keyboard-visible form layouts.
- Document supported platform and accessibility test coverage.

## Acceptance criteria

- A screen-reader user can understand and operate the core auth, watchlist, feed, alert, and listing flows.
- Interactive controls expose meaningful labels and state.
- A failed request explains what happened and provides a safe retry path.
- Network loss does not silently discard a watchlist edit, favorite, dismissal, or preference change.
- Reconnecting allows the user to refresh without restarting the app.
- Text and controls remain usable at supported accessibility sizes and in dark mode.
- Manual test results are recorded for iOS and Android production-like builds.

## Out of scope

- A full offline-first database.
- Replacing the existing design system.
- Supporting platforms not listed in the release plan.

## Technical notes

- Reuse existing `Loading`, `EmptyState`, `ErrorState`, refresh, and mutation patterns.
- Keep remote state in TanStack Query and avoid duplicating it in global client state.
- Add dependencies only when an Expo-compatible existing solution is insufficient.

## Definition of done

- Core flows pass the accessibility and poor-network test matrix.
- User-visible failure and recovery states are complete.
- Relevant mobile tests and release documentation are updated.
