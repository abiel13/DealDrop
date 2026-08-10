# DealDrop Third Marketplace Selection

Date: 2026-08-10

## Current status

StockX is the selected third marketplace alongside eBay and Etsy. It provides an official catalog search API with stable product and variant identifiers, pagination, and market data. StockX developer access must be approved, and the API license currently describes the data/API grant as for internal use; commercial production use requires confirmation from StockX.

## Candidate evaluation

| Candidate     | Listing volume and geography                                                                 | Categories                                                                                | Official access and reliability                                                                                                    | Filters and pagination                                                                                                | Integration assessment                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| StockX        | Global catalog focused on sneakers, apparel, collectibles, electronics, and accessories      | Sneakers, streetwear, collectibles, handbags, trading cards, electronics, and accessories | Official StockX Public API with developer approval, API key, and OAuth2; no scraping or browser automation                         | Free-text/GTIN/style ID search, product/variant identity, market data, and page-number pagination                     | Selected; adds a differentiated global product catalog with stable identity and official buyer-facing search/market data |
| Reverb        | Specialized music-gear marketplace, but API access has material regional availability limits | Instruments, recording, DJ, pro audio, accessories                                        | Official Reverb JSON API and sandbox registration; API is the only permitted programmatic access method and scraping is prohibited | Keyword, price, condition, item city/region/country, `page`/`per_page`, and HAL next links                            | Not selected because regional availability is not dependable enough for DealDrop's initial audience                      |
| Amazon        | Very large global retail catalog                                                             | Broad retail catalog                                                                      | Official Product Advertising/Creators API, but approval and affiliate eligibility create a material beta dependency                | Product search and pagination are available, but data is product-catalog oriented rather than seller-listing oriented | Not selected because access eligibility and marketplace-listing semantics are weaker for DealDrop                        |
| Mercado Libre | Very large Latin American marketplace across supported country sites                         | General retail and classifieds                                                            | Official public APIs and OAuth, but coverage is concentrated in Latin America and application/account requirements vary by site    | Search, price, location, condition, and offset-style pagination are available by site                                 | Not selected because it narrows geographic coverage and adds site/account configuration complexity for this beta         |
| Jiji          | Strong local relevance for a Nigeria-first classifieds beta                                  | General classifieds and used goods                                                        | No official public buyer-search API was identified; scraping would be fragile and requires a separate permission review            | No dependable supported API pagination or rate-limit contract was identified                                          | Rejected until a permitted, stable API becomes available                                                                 |

## Sources

- [StockX Getting Started](https://developer.stockx.com/portal/getting-started)
- [StockX Authentication](https://developer.stockx.com/portal/authentication)
- [StockX API Reference](https://developer.stockx.com/portal/api-reference)
- [StockX License Agreement](https://developer.stockx.com/portal/license-agreement)
- [eBay Browse API](https://developer.ebay.com/api-docs/buy/api-browse.html)
- [Etsy Open API](https://developer.etsy.com/documentation/)
- [Mercado Libre developer documentation](https://developers.mercadolibre.com/)
- [Amazon Creators API introduction](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
