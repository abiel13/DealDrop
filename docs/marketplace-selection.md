# DealDrop Third Marketplace Selection

Date: 2026-08-10

## Current status

Reverb was evaluated as a third marketplace but is not being integrated because its API access is not reliably available across the countries DealDrop needs to support. eBay and Etsy remain the active marketplace sources. No third marketplace is currently selected.

## Candidate evaluation

| Candidate     | Listing volume and geography                                                                 | Categories                                         | Official access and reliability                                                                                                    | Filters and pagination                                                                                                | Integration assessment                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Reverb        | Specialized music-gear marketplace, but API access has material regional availability limits | Instruments, recording, DJ, pro audio, accessories | Official Reverb JSON API and sandbox registration; API is the only permitted programmatic access method and scraping is prohibited | Keyword, price, condition, item city/region/country, `page`/`per_page`, and HAL next links                            | Not selected because regional availability is not dependable enough for DealDrop's initial audience              |
| Amazon        | Very large global retail catalog                                                             | Broad retail catalog                               | Official Product Advertising/Creators API, but approval and affiliate eligibility create a material beta dependency                | Product search and pagination are available, but data is product-catalog oriented rather than seller-listing oriented | Not selected because access eligibility and marketplace-listing semantics are weaker for DealDrop                |
| Mercado Libre | Very large Latin American marketplace across supported country sites                         | General retail and classifieds                     | Official public APIs and OAuth, but coverage is concentrated in Latin America and application/account requirements vary by site    | Search, price, location, condition, and offset-style pagination are available by site                                 | Not selected because it narrows geographic coverage and adds site/account configuration complexity for this beta |
| Jiji          | Strong local relevance for a Nigeria-first classifieds beta                                  | General classifieds and used goods                 | No official public buyer-search API was identified; scraping would be fragile and requires a separate permission review            | No dependable supported API pagination or rate-limit contract was identified                                          | Rejected until a permitted, stable API becomes available                                                         |

## Sources

- [Reverb JSON API](https://reverb.com/page/api)
- [Reverb API terms of use](https://reverb.com/legal/reverbcom-api-terms-of-use)
- [eBay Browse API](https://developer.ebay.com/api-docs/buy/api-browse.html)
- [Etsy Open API](https://developer.etsy.com/documentation/)
- [Mercado Libre developer documentation](https://developers.mercadolibre.com/)
- [Amazon Creators API introduction](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
