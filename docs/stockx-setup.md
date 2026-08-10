# StockX backend setup

StockX access must be approved before DealDrop can make live requests. Use only the official [StockX Developer Portal](https://developer.stockx.com/portal/getting-started).

1. Create or sign in to a StockX account and submit the developer access form.
2. After approval, copy the generated API key from the portal’s Keys page.
3. Create a StockX application and record its Client ID and Client Secret.
4. Complete the OAuth2 authorization-code flow for the application, then exchange the authorization code for a refresh token. DealDrop uses the refresh token server-side to mint twelve-hour access tokens.
5. Add the resulting values to `server/.env`:

```env
STOCKX_API_KEY=your_server_only_api_key
STOCKX_CLIENT_ID=your_server_only_client_id
STOCKX_CLIENT_SECRET=your_server_only_client_secret
STOCKX_REFRESH_TOKEN=your_server_only_refresh_token
STOCKX_CURRENCY=USD
```

Never put these values in `EXPO_PUBLIC_*` variables or the React Native application. The adapter uses the official catalog search, product variants, and market-data endpoints. It does not use browser automation, scraping, unofficial endpoints, or session cookies.

StockX’s current license describes API access and StockX data as for internal use. Obtain StockX’s confirmation before using this integration in a commercial production deployment.
