# Amazon Business Product Search API setup

DealDrop's Amazon Business source uses Amazon's official Product Search API. It does not use browser automation, HTML scraping, unofficial endpoints, or a persistent Amazon account session.

## Access checklist

1. Create the Amazon Business developer application and complete the Amazon Business API onboarding process.
2. Request the Business Product Catalog role for Product Search API access.
3. Configure the application for the required product region and use the sandbox first.
4. Complete the Amazon Business customer authorization flow with Login with Amazon (LWA) and obtain a refresh token for the configured business customer.
5. Store the client ID, client secret, refresh token, and customer email only in the server runtime environment.
6. Set `AMAZON_BUSINESS_PRODUCTION_APPROVED=true` only after production access has been approved, then explicitly enable the adapter.

Official references:

- [Product Search API overview](https://docs.business.amazon.com/docs/product-search-api-overview)
- [Product Search API v1 reference](https://docs.business.amazon.com/docs/product-search-api-v1-reference)
- [Amazon Business API endpoints](https://docs.business.amazon.com/docs/ab-api-endpoints)
- [App Center authorization workflow](https://docs.business.amazon.com/docs/app-center-authorization-workflow)
- [Amazon Business API sandbox](https://docs.business.amazon.com/docs/amazon-business-api-sandbox)

The adapter is disabled by default. The worker's example source list intentionally remains `ebay,etsy,rakuten`; add `amazon_business` only after the approved credentials are configured. Offer retrieval is read-only and uses the Product Search API offer endpoint. Ordering, checkout, and purchasing are not implemented.
