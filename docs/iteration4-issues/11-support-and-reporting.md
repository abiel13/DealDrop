# Feature: Support and listing problem reports

Priority: P1  
Suggested labels: `feature`, `support`, `trust`, `P1`

## Problem

DealDrop depends on third-party listing data and external links. Users need a fast way to report a broken link, stale price, incorrect match, unavailable listing, or marketplace problem. A static support link alone does not provide enough context for diagnosis.

## Goal

Give users a predictable support path and give operators enough safe context to resolve listing and alert problems.

## Scope

- Verify the support destination from Profile and relevant error states.
- Add a report action from listing details and, where appropriate, match history.
- Support report categories such as broken link, wrong price, stale listing, incorrect match, missing image, and other.
- Include safe diagnostic context: listing ID, marketplace, match/watchlist ID when appropriate, app version, and request ID if available.
- Exclude tokens, passwords, private listing descriptions, and unnecessary personal data from reports.
- Provide confirmation, duplicate-submit protection, and a user-friendly failure state.
- Define how reports are stored or delivered and who is responsible for reviewing them.

## Acceptance criteria

- A user can reach support from Profile and report a relevant listing problem from listing details.
- A report confirms submission or clearly explains that it could not be sent.
- Reports contain enough context to identify the affected listing without exposing secrets.
- A report cannot be submitted repeatedly by accidental double taps.
- The user can continue using the app if support service is unavailable.
- Report storage, access, and retention follow the production data policy.
- Mobile/API tests cover validation, authorization, safe payloads, and error states.

## Out of scope

- A full customer-support ticketing platform.
- Public comments or seller-to-user messaging.
- Automatic marketplace dispute filing.

## Technical notes

- Reuse the shared API client and authenticated server path.
- Do not send reports directly from the mobile app with server-only credentials.
- Prefer structured categories over free-text-only submissions.

## Definition of done

- Users can report common listing and matching problems.
- Operators can access safe, actionable report context.
- Support and failure behavior is tested and documented.
