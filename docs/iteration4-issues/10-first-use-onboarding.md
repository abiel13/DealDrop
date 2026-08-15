# Feature: First-use onboarding and activation path

Priority: P1  
Suggested labels: `feature`, `activation`, `onboarding`, `P1`

## Problem

The welcome screen explains the concept, but the first successful value moment depends on the user finding the Watchlists tab and understanding marketplace capabilities and filters. Users should reach a valid first watchlist quickly and know what will happen next.

## Goal

Move a new user from account creation to a useful first watchlist and a clear expectation of when results will appear.

## Scope

- After account creation, guide the user directly to creating the first watchlist.
- Explain currently enabled marketplaces and meaningful source differences.
- Provide a small set of optional use-case examples or templates without generating AI queries.
- Explain filter support, currency limitations, monitoring cadence, and alert behavior at the point of setup.
- Show what happens after saving a watchlist, including first-check and no-results states.
- Preserve sign-in, email-confirmation, and returning-user flows.
- Track activation events through the existing privacy-conscious event contract.

## Acceptance criteria

- A new user can create a valid first watchlist without searching through unrelated screens.
- The onboarding never advertises a marketplace that is disabled in the current environment.
- Source-specific limitations are understandable before the user saves the watchlist.
- The user sees a clear success state after saving and knows how to return to the watchlist.
- Returning users are not forced through onboarding again.
- Email confirmation and failed profile setup remain recoverable.
- Activation funnel behavior is covered by mobile tests and a manual usability check.

## Out of scope

- AI-generated search terms or automatic category detection.
- A full marketing redesign.
- Adding new marketplace adapters.

## Technical notes

- Reuse the existing watchlist form and marketplace catalog.
- Keep onboarding state local to the authenticated user or derive it from existing watchlist data.
- Do not introduce a second watchlist creation path.

## Definition of done

- New users reach first-watchlist creation through a clear path.
- Enabled-source and filter limitations are accurate.
- Activation and error states are tested.
