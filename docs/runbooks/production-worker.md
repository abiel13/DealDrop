# DealDrop production API and worker runbook

The API and watchlist worker are intentionally separate services. The API serves mobile requests and readiness output; the worker runs `server:worker:watchlists:prod`, records its heartbeat in `worker_health`, ingests listings, creates idempotent matches, and processes the notification queue.

## Configuration and secrets

1. Apply the Supabase migrations, including `20260820000000_add_worker_health.sql`, before deploying the new image.
2. Copy `server/.env.example` to a server-only `server/.env` file. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the marketplace credentials there.
3. Keep the service-role key, marketplace secrets, and push-provider credentials out of the repository, image, logs, and all `EXPO_PUBLIC_*` variables.
4. Set `WATCHLIST_MONITOR_INTERVAL_MS`, `WATCHLIST_MONITOR_ENABLED_SOURCES`, retry values, timeouts, and the stale/alert thresholds for the environment. The five-minute interval and fifteen-minute stale threshold are the defaults.

## Deploy and verify

From the repository root on the production host:

```bash
docker compose -f deploy/production/docker-compose.yml up -d --build
curl --fail http://127.0.0.1:3000/health/live
curl --fail-with-body http://127.0.0.1:3000/health
docker compose -f deploy/production/docker-compose.yml ps
```

The API and worker use the same compiled image but different commands. Compose restarts either process after a crash or host restart. `/health/live` checks only the API process. `/health` checks database access, configured/available marketplaces, the durable worker heartbeat, and notification queue health. A non-`ok` readiness response is HTTP 503 and includes actionable `alerts` without provider secrets or raw error payloads.

## Normal operations

- Inspect run age, watchlist count, matches, source failure streaks, queue processed counts, and backlog age in the `/health` JSON response.
- Use structured JSON logs for the run ID, source, failure category, retry attempt, and queue delivery result. Never copy credentials or access tokens into an incident ticket.
- Let the worker finish its current search on `SIGTERM`. The process wakes from its interval wait, closes the marketplace runtime, and exits so Compose can restart it cleanly.

To disable one source, edit only `WATCHLIST_MONITOR_ENABLED_SOURCES` in the server-side env file, then recreate only the worker:

```bash
docker compose -f deploy/production/docker-compose.yml up -d --no-deps --force-recreate dealdrop-worker
```

The API reports configured versus available/disabled sources, so successful marketplaces remain visible while one source is disabled or failing.

To restart one process:

```bash
docker compose -f deploy/production/docker-compose.yml restart dealdrop-worker
docker compose -f deploy/production/docker-compose.yml restart dealdrop-api
```

## Alerts and incident recovery

Use `deploy/production/alerts.yml` with the host monitor. Alert rules are keyed to the readiness response:

- `worker_stale` or `worker_unavailable`: check worker logs, database access, and the last run ID; restart only `dealdrop-worker`.
- `provider_failure_streak`: confirm the source credentials/rate limit, disable that source if needed, and keep healthy sources enabled.
- `notification_delivery_failures`: inspect `failed`, `exhausted`, and `oldestPendingAgeMs`; verify the push provider and token health before replaying anything.
- `database_unavailable`: treat as a dependency incident; do not repeatedly restart both services until connectivity is restored.

Queue claims are conditional, match inserts use the existing `(watchlist_id, listing_id)` uniqueness boundary, and notification enqueueing uses `(notification_id, push_token_id)`. Restarting the worker therefore resumes monitoring without creating duplicate matches or notification queue items.

For a rollback, deploy the previous immutable image tag and keep the database migration applied. The worker health table is additive and backward-compatible with the existing listing/matching pipeline:

```bash
docker compose -f deploy/production/docker-compose.yml up -d --no-deps --force-recreate dealdrop-api dealdrop-worker
```

## Manual production-like drill

1. Start the Compose stack against a test Supabase project and sandbox marketplace credentials.
2. Confirm both services are independently running and `/health/live` is `200`.
3. Create a test watchlist, let one worker run create a match, and record the health metrics.
4. Stop and restart only the worker. Confirm the heartbeat advances and the same listing does not create a second match or queue item.
5. Disable one source and force a run. Confirm the disabled/failing source appears in health/logs while another source still completes.
6. Stop the worker longer than `WATCHLIST_MONITOR_STALE_AFTER_MS`; confirm the readiness endpoint returns `503` with `worker_stale` before restoring the worker.
7. Use a test notification provider failure to observe retry and exhaustion metrics, then restore the provider and confirm recovery.
