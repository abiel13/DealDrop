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

## Cloudflare Pages

Create a separate Cloudflare Pages project connected to this repository with:

- Root directory: `website`
- Framework preset: `None`
- Build command: leave blank (or use `exit 0` if the UI requires a command)
- Build output directory: `/`

Cloudflare Pages Functions in `functions/` render public Deal Room metadata and seed the page with
the public room response. Add a Pages environment variable named `DEALDROP_API_URL` containing the
deployed API base URL, for example `https://api.example.com/api/v1`, before publishing room links.
The API must allow the website origin in its exact `SERVER_ALLOWED_ORIGINS` value. The function only
requests the unauthenticated public Deal Room endpoint; it never receives a user token.

The custom domain should only be attached after the Pages deployment is healthy. This site does not configure DNS, publish legal approval, or assume that `https://api.get-deal-drop.com/api/v1` exists.

## Configuration

`site-config.js` is the single public configuration point for the API, app, store, and support
destinations. Keep `apiUrl`, `appUrl`, and the store URLs empty until real destinations are available;
the room page then remains honest about its unavailable app fallback instead of using fake links.
Update `supportUrl` only after the owner has supplied a reviewed destination.
