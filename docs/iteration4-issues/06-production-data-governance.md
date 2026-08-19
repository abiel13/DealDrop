# Feature: Production data governance, backups, and legal readiness

Priority: P0  
Suggested labels: `release`, `security`, `privacy`, `operations`, `P0`

## Problem

DealDrop now stores listings, match history, notifications, push tokens, price observations, feedback, and product events. Production needs a clear retention policy, recovery plan, and verified legal/support destinations before collecting real user data at scale.

## Goal

Protect user data, make recovery possible, and ensure the production product accurately explains how data is collected and deleted.

## Scope

- Verify the production privacy policy, terms of service, support destination, and account-deletion language.
- Document the data inventory and purpose for profiles, watchlists, listings, matches, notifications, push tokens, price observations, feedback, and product events.
- Define retention and cleanup rules for stale listings, notifications, queue rows, price observations, feedback, and analytics events.
- Confirm account deletion cascades through all user-owned data and removes push tokens.
- Configure Supabase backups and document a restore procedure.
- Perform a restore drill against a non-production environment.
- Document migration ordering, preflight checks, rollback limitations, and post-migration verification.
- Review RLS policies, service-role usage, database grants, and production secrets.
- Document marketplace-specific data-use and API-license obligations.

## Acceptance criteria

- Every stored data category has an owner, purpose, retention rule, and deletion behavior.
- Privacy, terms, and support links resolve to real reviewed content in the production build.
- Account deletion removes the user’s owned data and is verified after restore/test sign-in.
- A recent backup can be restored in a non-production project using the documented runbook.
- Migration deployment and verification steps are reproducible by another operator.
- No server-only credential appears in mobile configuration, source control, logs, or API responses.
- Marketplace terms and license restrictions are recorded for every enabled adapter.

## Out of scope

- Legal advice or selecting a compliance framework.
- A third-party analytics vendor.
- Migrating away from Supabase.

## Technical notes

- Preserve the existing Supabase migration workflow.
- Retention jobs must not delete active user-visible data unexpectedly.
- Privacy-conscious analytics payload rules from Iteration 3 remain in force.

## Definition of done

- Data inventory, retention policy, backup/restore runbook, and migration runbook are documented.
- Legal/support destinations and deletion behavior are verified.
- Database security review and recovery drill are complete.
