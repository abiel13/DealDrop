# Feature: Watchlist details, saved listings, and complete history navigation

Priority: P1  
Suggested labels: `feature`, `retention`, `navigation`, `P1`

## Problem

Users can create and manage watchlists, but there is no dedicated view for one watchlist’s matches. Saved listings and dismissed history are available only as filters inside the global feed. The API exposes pagination, while the mobile client currently loads only the first page for matches and notifications.

## Goal

Give users predictable places to review each shopping task, saved opportunities, and older activity.

## Scope

- Add a watchlist detail screen showing query, filters, selected marketplaces, lifecycle state, last check, and its matches.
- Link watchlist cards and weekly-summary watchlists to the detail screen.
- Add a saved-listings view with listing detail deep links.
- Add a predictable dismissed/history view while preserving existing favorites and match history.
- Add cursor pagination or infinite scrolling for watchlist matches, global matches, notifications, and saved history where needed.
- Preserve loading, empty, error, refresh, and retry states.
- Keep dismissal, feedback, favorites, and watchlist lifecycle actions separate.

## Acceptance criteria

- A user can open one watchlist and see only its matches.
- A user can open saved listings without searching through the global feed.
- Dismissed matches remain reviewable from a predictable history location.
- Older matches and notifications can be loaded beyond the initial page.
- Deep links from notifications and weekly summary land on the relevant watchlist or listing.
- Loading additional pages does not duplicate or reorder existing items unexpectedly.
- Existing favorites, match feedback, and lifecycle behavior remain intact.
- Mobile navigation and pagination are covered by tests.

## Out of scope

- A new recommendation engine.
- Social sharing or collaborative watchlists.
- A full analytics dashboard.

## Technical notes

- Reuse the existing API pagination envelope and TanStack Query patterns.
- Keep route files thin and feature logic under the relevant feature folders.
- Do not copy remote data into Zustand.

## Definition of done

- Watchlist detail, saved listings, history, and pagination are usable end-to-end.
- Existing deep links and optimistic rollback behavior remain correct.
- Relevant mobile/server tests and standard checks pass.
