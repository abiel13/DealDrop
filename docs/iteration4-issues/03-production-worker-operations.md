# Feature: Production worker deployment, health, and observability

Priority: P0  
Suggested labels: `release`, `backend`, `operations`, `observability`, `P0`

## Problem

The API server and watchlist-monitoring worker run as separate processes. The worker performs marketplace searches, listing ingestion, matching, and notification delivery. If it is not deployed, scheduled, or restarted correctly, the API can remain healthy while users receive no matches or alerts.

## Goal

Operate the API and monitoring worker as dependable production services with visible failures and a recoverable runbook.

## Scope

- Define the production deployment for the API server and watchlist worker.
- Ensure the worker starts with the compiled production entry point and restarts after crashes or host restarts.
- Configure the worker interval, source allowlist, retry limits, and timeout values per environment.
- Add a worker heartbeat or last-successful-run signal.
- Extend health reporting to distinguish process health from database, marketplace, worker, and notification-queue health.
- Record or expose worker run age, watchlist count, source failures, matches created, queue items processed, and queue backlog age.
- Add alerts for stale workers, repeated provider failures, notification delivery failures, and database errors.
- Document deployment, secret configuration, graceful shutdown, rollback, and incident recovery.

## Acceptance criteria

- A production-like environment can run API and worker processes independently.
- Restarting the worker resumes monitoring without creating duplicate matches or notifications.
- A failed marketplace is visible in logs and health/operations output without hiding successful sources.
- A stale or stopped worker produces an actionable alert before users experience a long silent gap.
- Notification queue failures and retry exhaustion are visible to operators.
- Health checks do not report the service as fully healthy when required dependencies are unavailable.
- Secrets remain server-side and are not logged.
- A runbook explains how to disable one source, restart one process, and roll back a deployment.

## Out of scope

- Replacing the existing marketplace adapter architecture.
- Building a new notification provider.
- A full internal administration dashboard.

## Technical notes

- Reuse the existing `server:build`, `server:start`, and `server:worker:watchlists:prod` entry points.
- Keep monitoring and notification delivery idempotent.
- Prefer provider-neutral metrics and structured JSON logs.

## Definition of done

- API and worker deployment configuration is tested in a production-like environment.
- Health, metrics, alerts, and an operator runbook exist.
- Failure and restart behavior is covered by automated tests where practical and a manual drill.
