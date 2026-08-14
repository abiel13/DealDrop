# Rakuten Ichiba backend setup

DealDrop uses the official Rakuten Ichiba Item Search API. It does not scrape Rakuten or use browser automation. Rakuten Ichiba is a retail product marketplace: its Item Search API excludes auctions, flea-market listings, and customer-to-customer auction items.

## Register the application

1. Create or sign in to a Rakuten Web Service account.
2. Register a Web Service application and copy its application ID.
3. Generate or copy the access key for the application.
4. Add both values to the server environment only:

```env
RAKUTEN_APPLICATION_ID=your_server_only_application_id
RAKUTEN_ACCESS_KEY=your_server_only_access_key
RAKUTEN_CURRENCY=JPY
RAKUTEN_AVAILABLE_ONLY=true
```

The remaining Rakuten settings in `server/.env.example` are optional operational defaults. Keep the application ID and access key out of `EXPO_PUBLIC_*` variables, mobile bundles, logs, and source control.

## API behavior in DealDrop

The adapter uses the versioned official Item Search endpoint with keyword search, Rakuten's price bounds, availability, standard sorting, and page-number pagination. Rakuten limits each page to 30 results and supports pages through 100, so DealDrop translates its opaque cursor into those bounded page values.

Rakuten prices are normalized as JPY. Location, radius, and condition filters are not fabricated because the Item Search API does not provide equivalent DealDrop listing fields. Item genre IDs, shop information, review information, sale windows, availability, and overseas-shipping areas are retained in normalized metadata. DealDrop does not automatically restrict results to overseas-shippable products.

## Official references

- [Rakuten Ichiba Item Search API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)
- [Rakuten Ichiba Genre Search API](https://webservice.rakuten.co.jp/documentation/ichiba-genre-search)
- [Rakuten API test form](https://webservice.rakuten.co.jp/explorer/api/IchibaItem/Search)
