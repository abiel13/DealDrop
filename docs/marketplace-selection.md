# DealDrop Third Marketplace Selection

Date: 2026-08-08

## Decision

DealDrop will integrate Etsy as its third marketplace.

The repository does not specify a single beta country. Existing examples include Lagos, but the product currently describes a broader marketplace monitor. Etsy is the best fit for the current beta because it offers a permitted first-party public listings search API, global reach, useful search filters, and a straightforward offset pagination model without changing the DealDrop adapter contract.

## Candidate evaluation

| Candidate           | Listing volume and geography                                                                        | Categories                                                       | Access and reliability                                                                                                                        | Rate limits                                                                        | Integration assessment                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Etsy                | 86.6 million active buyers in Q3 2025 and 5.6 million active sellers in Q4 2025; global marketplace | Handmade, vintage, craft supplies, gifts, and related categories | Official Open API v3; Personal Apps support limited-scale applications, with Commercial Access available later; screen scraping is prohibited | API-key-level QPS and rolling QPD limits exposed in response headers               | Medium difficulty; public active-listings search maps cleanly to DealDrop keywords, prices, location, and pagination |
| Amazon              | Very large global retail catalog; PA API documentation lists 15 supported marketplaces              | Broad retail catalog                                             | Official Creators API, but access requires Amazon Associates enrollment, API approval, and currently 10 qualifying sales in 30 days           | Account and API policy limits; access eligibility is a significant beta dependency | High difficulty and policy coupling; product catalog is less like marketplace listings                               |
| Walmart Marketplace | Large retail catalog, primarily relevant to supported Walmart markets                               | Broad retail catalog                                             | Official APIs focus on a seller's catalog and require marketplace seller onboarding/access tokens                                             | Throttling applies to catalog APIs                                                 | Poor fit for buyer-side cross-marketplace discovery                                                                  |
| Jiji                | Strong local relevance if the beta is Nigeria-focused; marketplace categories align with used goods | General classifieds and used goods                               | No official public buyer-search API was identified during this review; scraping would be fragile and requires separate permission review      | No dependable public API limit was identified                                      | Not selected until a permitted, supportable access method is available                                               |

## Why Etsy

- `GET /v3/application/listings/active` supports keyword search, minimum and maximum price, currency conversion, buyer country, shop location, taxonomy, and `limit`/`offset` pagination.
- Public active listings require the Etsy API key header; OAuth is reserved for private or write operations, so DealDrop does not need to store user Etsy tokens for this read-only adapter.
- Etsy exposes API-key-level QPS and rolling daily limits in response headers, allowing the adapter to log and handle rate limiting explicitly.
- Etsy's Personal App path is appropriate for a limited beta. Commercial Access can be requested later if DealDrop expands beyond limited scale.

## Sources

- [Etsy Open API overview and access levels](https://developers.etsy.com/documentation/)
- [Etsy active listings reference](https://developers.etsy.com/documentation/reference/)
- [Etsy request and pagination standards](https://developers.etsy.com/documentation/essentials/requests/)
- [Etsy authentication](https://developers.etsy.com/documentation/essentials/authentication/)
- [Etsy rate limits](https://developers.etsy.com/documentation/essentials/rate-limits/)
- [Etsy Q3 2025 results](https://investors.etsy.com/_assets/_6bbdcca32dae0009d81abf198bd829d6/etsy/db/938/9725/earnings_release/Exhibit%2B99.1%2BQ3%2B2025%2B%281%29.pdf)
- [Etsy Q4 2025 results](https://investors.etsy.com/_assets/_d5c51ce974b0cb9df4cd28e3d32f3c7b/etsy/db/938/10062/earnings_release/Exhibit%2B99.1%2B12.31.2025.pdf)
- [Amazon Creators API prerequisites](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
- [Walmart catalog search](https://developer.walmart.com/us-marketplace/reference/getcatalogsearch)
