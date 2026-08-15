# Discovery: Validate and select the next marketplace

Priority: P2
Suggested labels: `discovery`, `marketplaces`, `product`, `P2`

## Problem

Adding marketplaces increases coverage, but it also increases adapter maintenance, duplicate listings, stale data, API failures, and notification noise. The next source should be selected based on the audience and measurable demand rather than marketplace count.

## Goal

Choose one marketplace that materially improves DealDrop’s usefulness for the target audience and has reliable, permitted access.

## Scope

- Confirm the initial target geography and highest-value shopping categories.
- Review analytics, support requests, interviews, or a short user survey for marketplace demand.
- Evaluate candidate sources for:
  - official or explicitly permitted programmatic access
  - geographic relevance
  - listing volume and freshness
  - price and condition data quality
  - pagination, rate limits, and operational cost
  - deduplication impact
  - ability to deep-link users to the original listing
- Produce a decision record naming one selected source, rejected candidates, and the reason for each decision.
- Define a go/no-go threshold before implementing the adapter.

## Acceptance criteria

- The target audience and priority use cases are written down.
- At least three candidate marketplaces are compared using the same criteria.
- No scraping or browser automation is proposed unless separately approved and legally reviewed.
- One source is selected, deferred, or rejected with evidence.
- The decision includes expected retention or activation impact and a measurement plan.
- If a source is selected, a follow-up implementation issue is created with adapter-specific requirements.

## Out of scope

- Implementing a marketplace adapter in this issue.
- Adding unsupported credentials or bypassing marketplace restrictions.
- Replacing the existing marketplace adapter architecture.

## Technical notes

- Use the existing marketplace catalog and adapter contracts for any future implementation.
- Keep the current enabled sources stable while the decision is being made.

## Definition of done

- A reviewed decision document is committed.
- The follow-up implementation issue exists only if a marketplace passes the go/no-go threshold.
