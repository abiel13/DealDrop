# DealDrop

Never miss the perfect deal.

DealDrop continuously monitors Facebook Marketplace for items matching your saved searches and notifies you the moment a new listing appears.

> More marketplaces will be supported in future releases.

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

## Facebook Marketplace Worker

The Playwright worker runs outside Expo, reads active Facebook watchlists from Supabase, and upserts normalized listings. Fill in the ignored `workers/facebook-marketplace/.env` file (or copy `workers/facebook-marketplace/.env.example`), install Chromium with `npx playwright install chromium`, then run:

```bash
npm run worker:facebook-marketplace
```

Prefer `FACEBOOK_STORAGE_STATE_PATH` for an authenticated browser session. Credentials and `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must never use an `EXPO_PUBLIC_*` variable.
