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

## Cloudflare Pages

Create a separate Cloudflare Pages project connected to this repository with:

- Root directory: `website`
- Framework preset: `None`
- Build command: leave blank (or use `exit 0` if the UI requires a command)
- Build output directory: `/`

The custom domain should only be attached after the Pages deployment is healthy. This site does not configure DNS, publish legal approval, or assume that `https://api.get-deal-drop.com/api/v1` exists.

## Configuration

`site-config.js` is the single public configuration point for the future app and support destinations. Keep `appUrl` empty until a real app link is available; the site then shows the configured “Coming soon” state instead of a fake store URL. Update `supportUrl` only after the owner has supplied a reviewed destination.
