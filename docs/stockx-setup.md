# StockX backend setup

StockX access must be approved before DealDrop can make live requests. Use only the official [StockX Developer Portal](https://developer.stockx.com/portal/getting-started).

1. Create or sign in to a StockX account and submit the developer access form.
2. After approval, copy the generated API key from the portal’s Keys page.
3. Create a StockX application and record its Client ID and Client Secret.
4. For local authorization, start DealDrop with `npm run server:dev` and expose port 3000 through an HTTPS tunnel such as ngrok:

```text
ngrok http 3000
```

Register the resulting URL with this path as the StockX callback URL:

```text
https://your-ngrok-domain.ngrok-free.app/stockx/oauth/callback
```

The callback is enabled by the development server only. After StockX redirects to it, copy the one-time authorization code from the response and exchange it immediately for a refresh token using StockX's authorization-code token exchange. Use the exact same callback URL in that exchange. Never commit the code or refresh token.

5. Add the resulting values to `server/.env`:

```env
STOCKX_API_KEY=your_server_only_api_key
STOCKX_CLIENT_ID=your_server_only_client_id
STOCKX_CLIENT_SECRET=your_server_only_client_secret
STOCKX_REFRESH_TOKEN=your_server_only_refresh_token
STOCKX_CURRENCY=USD
```

Never put these values in `EXPO_PUBLIC_*` variables or the React Native application. The adapter uses the official catalog search, product variants, and market-data endpoints. It does not use browser automation, scraping, unofficial endpoints, or session cookies.

The development callback is intentionally disabled when `NODE_ENV=production`. A deployed production callback must be implemented with HTTPS, redirect-URI validation, and OAuth state validation before enabling it publicly.

StockX’s current license describes API access and StockX data as for internal use. Obtain StockX’s confirmation before using this integration in a commercial production deployment.
