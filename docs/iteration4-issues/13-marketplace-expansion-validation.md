# Discovery: Select the next marketplace using demand and permitted access

Priority: P2  
Suggested labels: `discovery`, `marketplaces`, `product`, `P2`

## Problem

DealDrop already contains eBay, Etsy, and Rakuten adapters. Adding more sources can increase coverage, but it can also multiply stale listings, duplicates, API failures, source-specific limitations, and notification noise.

## Goal

Choose one next marketplace only if it materially improves usefulness for the target audience and has reliable, permitted programmatic access.

## Scope

- Confirm the initial target geography and highest-value shopping categories.
- Review current analytics, support reports, interviews, or a short user survey for marketplace demand.
- Compare at least three candidates using the same criteria:
  - official or explicitly permitted programmatic access
  - geographic relevance
  - listing volume and freshness
  - price, currency, condition, and location quality
  - pagination, rate limits, and operating cost
  - deduplication impact
  - stable listing identity and deep-link quality
  - provider terms and commercial usage rights
- Define a go/no-go threshold before implementing an adapter.
- Produce a decision record selecting, deferring, or rejecting each candidate.
- Create a follow-up implementation issue only if one candidate passes the threshold.

## Acceptance criteria

- The target audience, geography, and priority use cases are written down.
- At least three candidate marketplaces are compared using documented evidence.
- No scraping or browser automation is proposed without separate approval and legal review.
- Rakuten’s Japan-focused retail and currency limitations are reflected in the decision.
- The selected, deferred, or rejected outcome has an expected activation/retention impact and measurement plan.
- Current enabled sources remain stable while the decision is made.

## Out of scope

- Implementing a marketplace adapter.
- Adding unsupported credentials or bypassing provider restrictions.
- Replacing the marketplace adapter architecture.

## Technical notes

- Reuse the existing marketplace catalog and adapter contracts for any future source.
- Preserve honest capability reporting for price, condition, location, radius, currency, and pagination.
- Treat local classifieds without a permitted stable API as a discovery constraint, not an invitation to scrape.

## Definition of done

- A reviewed marketplace decision record is committed under the Iteration 4 issue docs.
- A follow-up adapter issue exists only if a source passes the go/no-go threshold.
- The decision identifies how usefulness and retention will be measured after launch.
