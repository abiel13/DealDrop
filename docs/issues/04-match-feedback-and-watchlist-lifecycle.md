# Feature: Match feedback and watchlist lifecycle

Priority: P1
Suggested labels: `feature`, `retention`, `watchlists`, `P1`

## Problem

Users need a way to manage the end of a shopping search. Without snoozing, dismissing, or completing a watchlist, DealDrop can continue sending alerts for items the user no longer wants.

## Goal

Make watchlists feel like active shopping tasks that naturally pause or complete instead of becoming stale notification sources.

## Scope

- Add listing actions: relevant, not relevant, save, and dismiss.
- Add watchlist actions: snooze for a selected period, resume, pause, and mark as purchased/completed.
- Hide dismissed matches from the default feed while preserving them in history.
- Stop or reduce alerts for completed watchlists.
- Show the current lifecycle state clearly on watchlist cards.
- Record feedback in a way that can be used later to improve matching, without silently changing behavior in this issue.

## Acceptance criteria

- A user can dismiss a match and it no longer appears in the default active feed.
- A user can undo or review dismissed matches from a predictable location.
- Snoozed and completed watchlists do not generate normal alerts during the relevant state.
- A user can resume a snoozed watchlist.
- Completing a watchlist is reversible until the user deletes it.
- State changes are optimistic only when rollback is implemented for failures.
- Existing favorites and match history remain intact.
- Lifecycle and feedback behavior is covered by API, worker, and mobile tests.

## Out of scope

- Automatically learning from feedback to change matching thresholds.
- Social sharing or collaborative watchlists.
- A new recommendation engine.

## Technical notes

- Keep dismissal/feedback separate from favorites; saving a listing should not imply that it is relevant to every future match.
- Define retention rules for historical feedback before adding indexes or cleanup jobs.

## Definition of done

- Database/API changes, worker behavior, mobile controls, and tests are complete.
- `npm run lint`, `npm run format:check`, and `npx tsc --noEmit` pass.
