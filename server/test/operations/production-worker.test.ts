import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260820000000_add_worker_health.sql", "utf8");
const compose = readFileSync("deploy/production/docker-compose.yml", "utf8");
const dockerfile = readFileSync("deploy/production/Dockerfile", "utf8");
const alerts = readFileSync("deploy/production/alerts.yml", "utf8");

test("worker health migration is durable and server-only", () => {
  assert.match(migration, /create table if not exists public\.worker_health/);
  assert.match(migration, /last_heartbeat_at timestamptz/);
  assert.match(migration, /last_queue_items_processed integer/);
  assert.match(migration, /last_queue_backlog_age_ms bigint/);
  assert.match(migration, /alter table public\.worker_health enable row level security/);
  assert.match(migration, /revoke all on public\.worker_health from anon, authenticated/);
});

test("production services use independent compiled commands and restart policies", () => {
  assert.match(dockerfile, /npm run server:build/);
  assert.match(compose, /command: \["npm", "run", "server:start"\]/);
  assert.match(compose, /command: \["npm", "run", "server:worker:watchlists:prod"\]/);
  assert.equal((compose.match(/restart: unless-stopped/g) ?? []).length, 2);
  assert.match(compose, /health\/live/);
  assert.match(alerts, /worker-stale/);
  assert.match(alerts, /provider-failure-streak/);
  assert.match(alerts, /notification-delivery-failures/);
  assert.match(alerts, /database-unavailable/);
});
