# DealDrop

Never miss the perfect deal.

DealDrop continuously monitors eBay, Etsy, and Rakuten Ichiba for items matching your saved searches and notifies you when a new result appears.

Marketplace credentials and provider access are configured on the server only.

## Tech Stack

- React Native
- Expo
- TypeScript
- Supabase
- Zustand
- TanStack Query
- NativeWind

## Getting Started

```bash
npm install
npm start
```

## Database Migrations

The Supabase CLI is installed as a project dependency. Use the linked project for remote database changes:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Create and review new migrations with `npx supabase migration new <name>`, then apply them with `npx supabase db push`. Keep migrations in `supabase/migrations/`, never paste schema changes directly into the Dashboard, and do not commit access tokens or database passwords.

## DealDrop Server

The Node server runs independently from Expo and exposes a lightweight health endpoint:

```bash
cp server/.env.example server/.env
npm run server:dev
```

Check `http://localhost:3000/health` after providing the server-only Supabase variables.
For a production build, use `npm run server:build` followed by `npm run server:start`.

## Production Watchlist Monitoring Worker

The production worker runs independently of Expo, loads active multi-marketplace watchlists from Supabase, groups compatible searches, ingests normalized listings, runs matching, and processes notifications. Configure the server-only eBay, Etsy, and Rakuten variables in `server/.env`, then run:

```bash
npm run worker:watchlists
```

Set `WATCHLIST_MONITOR_INTERVAL_MS=0` for a single run. The default interval is five minutes. Use `WATCHLIST_MONITOR_ENABLED_SOURCES` with stable marketplace IDs to disable a configured source without changing the watchlist schema.
For a compiled production process, run `npm run server:build` and then `npm run server:worker:watchlists:prod`.

The production API/worker Compose definition, health checks, alert rules, and recovery procedures are in [docs/runbooks/production-worker.md](docs/runbooks/production-worker.md).

Credentials, API tokens, and `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must never use an `EXPO_PUBLIC_*` variable.

For Rakuten application setup and server-only variables, see [`docs/rakuten-setup.md`](docs/rakuten-setup.md).
