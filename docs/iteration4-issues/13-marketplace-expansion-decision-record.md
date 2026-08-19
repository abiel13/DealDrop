# Marketplace expansion decision record

Date: 2026-08-19

Decision owner: DealDrop product and engineering

Status: No new marketplace selected

## Decision

Keep eBay, Etsy, and Rakuten Ichiba as the enabled sources. Do not create an adapter implementation issue yet.

The current evidence does not establish enough demand for a new source, and the most geographically relevant candidate—Jiji Nigeria—does not have verified, permitted buyer-search API access in the official resources reviewed. Scraping, reverse-engineering private endpoints, and browser automation are explicitly out of scope.

## Target audience and geography

The working launch target is Nigeria-first mobile bargain shoppers, initially concentrated in Lagos and other large urban markets. Priority use cases are:

- used and new phones, computers, cameras, and consumer electronics;
- fashion, footwear, and accessories;
- home goods and selected collectibles; and
- price-watch alerts for listings where condition, location, and seller freshness matter.

This is the working product target supported by the existing marketplace-selection note, Lagos-focused location examples and tests, and Jiji’s Nigeria-only posting rules. It is not a substitute for a larger user study. Before changing production marketplace configuration, Product must confirm this target and whether DealDrop is intended to serve local Nigerian transactions or imported/global inventory.

The current server configuration is not fully aligned with that target: eBay is configured for `EBAY_US`, Etsy has no buyer country configured, and Rakuten prices are JPY. This record does not change those settings.

## Demand evidence reviewed

The anonymized hosted-project snapshot on 2026-08-19 showed:

| Evidence                              |             Count | Interpretation                                                |
| ------------------------------------- | ----------------: | ------------------------------------------------------------- |
| `account_activated` events            |                 1 | Too little activation volume for source preference inference  |
| `first_watchlist_created` events      |                 2 | Too little demand volume for a marketplace winner             |
| Current watchlist rows by marketplace |            1 eBay | No observed Etsy, Rakuten, or new-source preference           |
| `first_match_received` events         |                 1 | Useful for validating the existing loop, not source expansion |
| `match_opened` events                 |                 2 | Existing engagement signal only                               |
| `listing_opened_externally` events    |                 2 | Existing outbound intent signal only                          |
| Listing problem reports               | 1 `stale_listing` | No marketplace-specific expansion request                     |

No interview notes or user-survey results were found in the repository. The sample is therefore a baseline, not evidence that any candidate will improve activation or retention.

## Go/no-go threshold

A candidate may receive a follow-up adapter issue only when every required gate below is satisfied:

1. Demand: at least 10 distinct target users request the source in a 30-day demand probe, or the source represents at least 20% of source choices after a minimum of 10 first-watchlist choices.
2. Geography: the source has meaningful inventory or delivery relevance for the confirmed launch geography and at least two priority categories.
3. Permission: an official or explicitly permitted programmatic access path allows the intended commercial use, including displaying fields and linking users to the provider.
4. Data quality: a documented sample shows stable listing/product identity, deep links, title, price and currency, and enough condition/location/freshness data for honest filtering. Pagination and rate-limit behavior must be documented.
5. Operations: expected request volume, retry behavior, provider limits, and operating cost fit the existing worker and notification budgets. No unbounded polling is acceptable.
6. Legal: provider terms, image/content use, retention, attribution, and marketplace-specific restrictions are reviewed and recorded.

Any failed gate is a defer or reject. It is not permission to scrape or use undocumented endpoints.

## Candidate comparison

| Candidate           | Demand and geography                                                                                                                                                                                           | Access and terms                                                                                                                                                                                                                                                                                         | Data and operations fit                                                                                                                                                                                                     | Identity/deep link                                                                                                                                                    | Outcome                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jiji Nigeria        | Best apparent geographic fit for Nigeria; its official posting rules state that products and services must be located in Nigeria. It covers general classifieds and used goods.                                | No public buyer-search/developer API or commercial data-access agreement was verified in the official Jiji resources reviewed. The Terms prohibit software or actions aimed at interfering with normal operation and prohibit copying or distributing user content without consent.                      | Cannot responsibly assess volume, freshness, pagination, rate limits, or cost without a permitted API.                                                                                                                      | Consumer ads have provider URLs, but a supported stable API identity contract was not verified.                                                                       | **Rejected for now.** Reconsider only after Jiji provides written API/partner permission and technical documentation. No scraping or browser automation. |
| Amazon Creators API | Large catalog and broad categories, but no Nigeria locale appears in the official locale list. It is better aligned to product discovery and affiliate offers than local used-listing monitoring.              | Official API, but access requires Amazon Associates enrollment for the target marketplace, at least 10 qualifying sales in the previous 30 days, registration, credentials, and an approved partner tag.                                                                                                 | Search returns up to 10 items per request and supports item pages 1–10, images, offer resources, price filters, and locale-specific currencies. Access eligibility and request throttling are material launch dependencies. | ASIN is a stable product identity and Amazon provides marketplace landing pages, but offer freshness and seller-level semantics differ from DealDrop’s listing model. | **Deferred.** Revisit only if the audience expands to an Amazon-supported locale and affiliate/commercial requirements are approved.                     |
| Mercado Libre       | Broad retail and marketplace coverage in Latin America, but the official developer-country selector lists Latin American sites and not Nigeria. It does not improve the confirmed Nigeria-first launch target. | Official developer API with country/site-specific resources and OAuth. Public item/search resources, filters, sorting, and paging are documented.                                                                                                                                                        | The API documents item IDs, price and available filters/sorts, with offset/limit paging; site-specific behavior and quotas would need a country pilot.                                                                      | Marketplace item IDs and provider URLs are suitable for deep links; cross-site deduplication would need site-aware keys.                                              | **Deferred/rejected for current geography.** Reconsider only after a product decision to target a supported Latin American country.                      |
| Reverb              | Strong listing relevance for music gear, but it is a narrow category and there is no current demand signal or Nigeria-first advantage.                                                                         | Official API and sandbox exist. Reverb documents a public scope, HAL pagination, 429 rate limiting, a default 10,000 calls/day allocation, mandatory listing links, and revocable API access. Its terms restrict replication, excessive use, unauthorized image/content use, and some revenue/data uses. | Structured listing concepts, price/currency, condition, location, images, and provider links are documented, but a read-only public search proof and commercial display review would still be required.                     | HAL self-links and required “View on Reverb” links are good integration primitives.                                                                                   | **Deferred.** It is the strongest technical candidate only for a validated music-gear segment, not for the current target.                               |

## Existing-source guardrails

The decision does not change or disable current sources:

- eBay remains the broad marketplace baseline, subject to the configured site/country and provider image/offer behavior.
- Etsy remains a craft, vintage, and handmade source with its existing buyer-country and currency limitations.
- Rakuten Ichiba remains a Japan-focused retail catalog. Its official item-search API and stable item codes are useful, but its JPY pricing, Japan-centric availability, and retail—not local C2C—semantics must remain explicit to users.

Any future source must preserve the existing adapter contract and honest capability reporting for price, currency, condition, location, radius, pagination, images, and deep links.

## Activation and retention measurement plan

Before selecting a source, run a 30-day demand probe using a short survey or structured support/request tag. Record only the candidate name, broad category, geography, and whether the user would create a watchlist; do not collect unnecessary personal data. A candidate passes the demand gate only when the threshold above is met.

If a source later launches behind a flag, compare it with the current-source baseline using:

- first-watchlist completion and time to first match;
- first-match receipt, match open, external listing open, favorite, and relevant-feedback rates;
- 7-day return and active-watchlist retention;
- stale-listing and incorrect-match report rates; and
- provider failure rate, duplicate rate, notification volume, request volume, and cost per valid match.

The existing privacy-conscious events (`first_watchlist_created`, `first_match_received`, `match_opened`, `listing_opened_externally`, and `listing_favorited`) and structured support reports are sufficient for the first comparison. No new analytics provider or marketplace adapter is part of this discovery issue.

## Follow-up

No adapter issue is created. The next product decision is to confirm Nigeria-first versus a broader international target and run the demand probe. If Jiji supplies a permitted API or another candidate passes every gate, create a narrowly scoped adapter issue with the provider evidence attached.

## Sources

- [Jiji Terms of Use](https://jiji.ng/rules.html)
- [Jiji Nigeria posting rules](https://jiji.ng/faq/posting-rules)
- [Jiji app capabilities](https://jiji.ng/faq/app-vs-website)
- [Amazon Creators API introduction](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
- [Amazon Creators API SearchItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/search-items)
- [Amazon Creators API locale reference](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference)
- [Mercado Libre Items & Search](https://developers.mercadolivre.com.br/en_us/api-docs/items-and-searches)
- [Mercado Libre developer documentation](https://developers.mercadolibre.com/api-docs)
- [Reverb API getting started](https://www.reverb-api.com/docs/getting-started)
- [Reverb API rate limiting and terms](https://www.reverb-api.com/docs/rate-limiting-and-terms-of-service)
- [Reverb API Terms of Use](https://reverb.com/legal/reverbcom-api-terms-of-use)
- [Rakuten Ichiba Item Search API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)
- [eBay Browse API](https://developer.ebay.com/api-docs/buy/api-browse.html)
- [Etsy Open API](https://developer.etsy.com/documentation/)
