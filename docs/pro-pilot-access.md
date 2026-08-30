# Pro pilot access

DealDrop Pro access is separate from consumer Free/Premium billing. The mobile app only receives a read-only entitlement response; it never receives the Supabase service-role key.

To grant temporary pilot access from an internal server environment:

```bash
npm run pro:grant-pilot -- --user <profile-uuid> --days 30
```

To grant access to every member of an existing workspace instead:

```bash
npm run pro:grant-pilot -- --workspace <workspace-uuid> --days 30
```

The command requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server environment. The database function rejects calls from public, anonymous, and authenticated roles, validates the target scope and duration, and records the grant as a time-bounded `pilot` entitlement.
