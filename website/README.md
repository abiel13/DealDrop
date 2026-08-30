# DealDrop website

This directory is a dependency-free static marketing, privacy, terms, and support site for DealDrop.

## Local preview

From the repository root, serve this directory with any static HTTP server. For example:

```bash
npx serve website
```

The routes are:

- `/`
- `/privacy`
- `/terms`
- `/support`
- `/deal-room/<public-slug>`
- `/deal-room-invite?token=<invitation-token>`
- `/creator/<public-slug>`

## Cloudflare Workers static assets

The repository's `website` directory is deployed by the `dealdrop` Worker service with:

- Root directory: `website`
- Build command: none
- Deploy command: `npx wrangler deploy`

`wrangler.jsonc` serves the directory as static assets and invokes `worker.js` for public Deal Room
and creator-profile routes. The Worker renders the route metadata and seeds each page with its
public API response. The source files in `functions/` are imported by that Worker and excluded from
the public asset upload.

The static invitation bridge at `/deal-room-invite` turns shared HTTPS invitation links into an app
deep link with a store/site fallback. `DEALDROP_API_URL` is configured in `wrangler.jsonc` with the
deployed API base URL. The API must allow the website origin in its exact `SERVER_ALLOWED_ORIGINS`
value. These route handlers only request unauthenticated public endpoints; they never receive a
user token.

Public room merchant links use the API's `/merchant-links` redirect so clicks can be attributed to
the room and creator context without exposing provider credentials. If no API URL is configured,
the page keeps using the original merchant URL. Affiliate adapters are disabled until DealDrop has
approved participation and a provider-specific server-side URL builder.

The custom domain should only be attached after the Pages deployment is healthy. This site does not configure DNS, publish legal approval, or assume that `https://api.get-deal-drop.com/api/v1` exists.

## Configuration

`site-config.js` is the single public configuration point for the API, app, store, and support
destinations. Keep `apiUrl`, `appUrl`, and the store URLs empty until real destinations are available;
the room page then remains honest about its unavailable app fallback instead of using fake links.
Update `supportUrl` only after the owner has supplied a reviewed destination.
