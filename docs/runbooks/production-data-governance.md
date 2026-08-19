# Production data governance and recovery runbook

Status: release gate. The controls in this document are versioned with the application. A production
release is not approved until the legal-owner and non-production restore-drill checkboxes are
completed.

## Release gates

- [ ] A legal owner has reviewed and published the DealDrop privacy policy, terms of service, and
      support destination.
- [ ] EAS production variables `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
      `EXPO_PUBLIC_SUPPORT_URL` point to those reviewed destinations. Privacy and terms must use HTTPS;
      support may use HTTPS or `mailto:`.
- [ ] `npm run verify:production-config` passes in the EAS production environment.
- [ ] The Supabase production plan has daily backups enabled and the chosen recovery window is
      recorded below. Enable PITR when the agreed recovery point objective requires it.
- [ ] A recent backup has been restored to a non-production Supabase project and the verification
      queries below have passed.
- [ ] The operator has recorded the drill date, source project, restore point, target project, and
      result in the release record.

The mobile app intentionally has no fallback legal URLs. This prevents an unreviewed or unrelated
DealDrop site from being presented as the product's policy. The Profile screen shows the configured
destinations only after the production configuration check passes.

## Data inventory and retention

The backend uses the `service_role` client only in the server process. User-facing API queries still
include the authenticated user's ID, and the database keeps RLS enabled for direct Supabase access.

| Category                                  | Owner and purpose                                                            | Retention and cleanup                                                                                 | Account deletion behavior                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `profiles`                                | Account team; email and display identity for authentication and support      | Account lifetime                                                                                      | Deleted through `auth.users` cascade                                                 |
| `watchlists` and `watchlist_marketplaces` | Product; saved search criteria and source selection                          | Until the user deletes the watchlist or account; active rows are never removed by retention           | Deleted through profile cascade                                                      |
| `listings`                                | Marketplace ingestion; normalized listing data used for matching and display | Inactive, unreferenced provider data after 180 days; active or user-referenced listings are protected | Not user-owned; a listing is removed only when it has no match or favorite reference |
| `matches`                                 | Product; user-specific match history and notification source                 | Until watchlist/account deletion; inactive listing cleanup cannot remove referenced matches           | Deleted through profile/watchlist cascade                                            |
| `notifications`                           | Notifications; in-app alert history                                          | Read: 90 days; unread: 365 days; cleanup never removes newer or unread records                        | Deleted through profile cascade                                                      |
| `push_tokens`                             | Notifications; device delivery token                                         | Active while seen; inactive tokens after 180 days                                                     | Deleted through profile cascade                                                      |
| `notification_queue`                      | Operations; server-side push delivery state                                  | Terminal (`sent`, `cancelled`, `exhausted`) rows after 30 days; pending and retryable rows remain     | Deleted through notification, token, or profile cascade                              |
| `listing_price_observations`              | Pricing; historical prices used for trend and drop calculations              | Older than 365 days only when the listing has no match or favorite reference                          | Listing cascade where applicable; this is not a separate user-owned table            |
| `match_feedback`                          | Product; relevance feedback attached to a user's match                       | 730 days, or earlier when its match/account is deleted                                                | Deleted through match/profile cascade                                                |
| `product_events`                          | Product; privacy-minimized lifecycle events and weekly summary inputs        | 365 days; properties must remain event-scoped and non-sensitive                                       | Deleted through profile cascade                                                      |

The SQL function `public.cleanup_retained_data()` in migration
`20260821000000_add_data_governance_and_retention.sql` implements these rules. Run it from the
server-only maintenance path or schedule it with Supabase `pg_cron` after reviewing the thresholds:

```sql
select * from public.cleanup_retained_data();
```

If `pg_cron` is enabled for the project, an operator may schedule the function once per day. Keep
the job name and schedule in the release record; do not expose the function to `anon` or
`authenticated`.

## Account deletion verification

The Profile screen tells the user that deletion removes the profile, watchlists, matches, and
notifications. `public.delete_account()` deletes only the current `auth.uid()` and relies on the
foreign-key cascade from `profiles(id)` for all user-owned records. The function is `SECURITY
DEFINER`, has a fixed search path, and is executable by `authenticated` only.

For a non-production test account, capture counts before deletion:

```sql
select
  (select count(*) from public.profiles where id = '<USER_ID>') as profiles,
  (select count(*) from public.watchlists where user_id = '<USER_ID>') as watchlists,
  (select count(*) from public.matches where user_id = '<USER_ID>') as matches,
  (select count(*) from public.notifications where user_id = '<USER_ID>') as notifications,
  (select count(*) from public.push_tokens where user_id = '<USER_ID>') as push_tokens,
  (select count(*) from public.favorites where user_id = '<USER_ID>') as favorites,
  (select count(*) from public.match_feedback where user_id = '<USER_ID>') as feedback,
  (select count(*) from public.product_events where user_id = '<USER_ID>') as product_events;
```

Then, while signed in as that test account:

1. Use Profile → Delete account and confirm the app signs out.
2. Verify the account cannot sign in again with the deleted credentials.
3. Run the count query again; every user-owned count must be zero.
4. Verify no row remains in `notification_queue` for the deleted user.
5. Verify a newly created test account does not inherit any previous rows.

Run this test after the restore drill as well. Database backups can retain historical data until the
provider's backup window expires; account deletion removes the live project rows, not past backup
images.

## Supabase backup and restore

Supabase daily database backups are configured in the project Dashboard. Pro projects currently
expose seven days of daily backups, Team fourteen days, and Enterprise up to thirty days. PITR is an
add-on for a finer recovery point. Backups cover database data, not Storage API objects, so the
current DealDrop data inventory has no stored user media to restore.

Record the production settings here before release:

| Setting                       | Production value                                      |
| ----------------------------- | ----------------------------------------------------- |
| Supabase project ref          | `<record in deployment system, never commit secrets>` |
| Plan and daily backup window  | `<record>`                                            |
| PITR enabled and retention    | `<record or not enabled>`                             |
| Target RPO / RTO              | `<product decision>`                                  |
| Last successful restore drill | `<date, operator, target project>`                    |

### Logical backup drill

Use a temporary non-production project and credentials stored in the operator's secret manager. Do
not put connection strings, database passwords, access tokens, or dumps in the repository.

```powershell
npx supabase db dump --db-url $env:SOURCE_DB_URL -f roles.sql --role-only
npx supabase db dump --db-url $env:SOURCE_DB_URL -f schema.sql
npx supabase db dump --db-url $env:SOURCE_DB_URL -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes

psql --single-transaction --variable ON_ERROR_STOP=1 `
  --file roles.sql --file schema.sql `
  --command "set session_replication_role = replica" `
  --file data.sql --dbname $env:TARGET_DB_URL
```

After restore, configure the target's Auth settings, API keys, Realtime publications, extensions,
and any server environment separately. Run the migration and account-deletion verification below.
Destroy or securely reset the temporary project after the drill.

For a managed physical/PITR drill, use Supabase Dashboard → Database → Backups → Restore to a New
Project. Record the selected backup or recovery timestamp and the target project. Do not restore
over production for a drill. A production PITR rollback causes downtime and may lose writes after
the selected recovery point.

## Migration deployment and verification

1. Review the migration order with `npx supabase migration list` and confirm the target project is
   on the expected branch/release. Every migration filename must have a unique timestamp prefix;
   the database test suite enforces this because Supabase keys migration history by version.
2. Confirm a recent backup exists; for a destructive change, take a logical export as an additional
   rollback aid.
3. Run `npx supabase db lint --linked` and the repository server/database tests in CI.
4. Apply timestamped migrations with `npx supabase db push --linked` from the release commit.
5. Verify that the new migration appears in `supabase_migrations.schema_migrations`.
6. Run the health check and the SQL checks in this document, then run one synthetic watchlist,
   match, notification, and account-deletion test.

Migrations do not have automatic down migrations. A failed migration is repaired with a forward
migration. A backup/PITR restore is reserved for data loss or an unrecoverable deployment and can
lose writes made after the recovery point. Never use `git revert` as a database rollback plan.

## Database security review

- All application tables in `public` have RLS enabled in the migrations. User-owned policies use
  `auth.uid()` or an ownership join through `watchlists`/`matches`.
- `supabase/config.toml` sets `auto_expose_new_tables = false`; the governance migration revokes
  `anon` and `authenticated` access to backend-owned queue, price-history, feedback, and event
  tables.
- The only mobile-invoked destructive database function is `delete_account()`. Maintenance and
  event functions are restricted to `service_role` or trigger execution.
- `server/src/database/client.ts` is the only server-role client construction. The
  `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never appear in `EXPO_PUBLIC_*`, the mobile
  bundle, source control, logs, or API responses.
- Before release, run the Supabase security advisor for the production project and review table
  grants, function grants, Auth settings, database password, API keys, and server secret rotation.

## Marketplace data-use obligations

The monitoring runtime can enable eBay, Etsy, and Rakuten Ichiba through
`WATCHLIST_MONITOR_ENABLED_SOURCES`. An adapter is not considered production-ready until its
credentials, API approval, terms, display rules, rate limits, retention, and attribution have been
reviewed by the owner responsible for marketplace partnerships.

| Adapter         | Required source review and operational rule                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eBay Browse API | Use the official Browse API and current eBay API License Agreement. Confirm public-display, attribution, user-data, caching, and rate-limit requirements for the application before enabling the adapter. Keep OAuth credentials server-side and retain only normalized fields needed by DealDrop.                                  |
| Etsy Open API   | Use the official Etsy API Terms and approved application purpose. Listing content must not be displayed more than six hours older than Etsy; other Etsy content has a 24-hour freshness limit and may only be cached as reasonably necessary. Include the required Etsy trademark disclaimer in the application if Etsy is enabled. |
| Rakuten Ichiba  | Use the official Item Search API and current Rakuten Web Service terms/usage guide. Keep application ID/access key server-side, honor request/display restrictions, include required Rakuten branding, and do not scrape or use browser automation.                                                                                 |

Primary references:

- [eBay Browse API](https://developer.ebay.com/api-docs/buy/api-browse.html) and [eBay API License Agreement](https://developer.ebay.com/devzone/license-agreement/api_license_agreement.pdf)
- [Etsy API documentation](https://developers.etsy.com/documentation/) and [Etsy API Terms of Use](https://www.etsy.com/legal/api/)
- [Rakuten Ichiba Item Search API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search), [Rakuten terms](https://webservice.rakuten.co.jp/guide/rule), and [usage guide](https://webservice.rakuten.co.jp/guide)

This record is an operational checklist, not legal advice. Re-check each linked agreement before
enabling a new adapter or changing stored/displayed fields.

## Operator sign-off

| Check                             | Result                                                      | Evidence                             |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| Legal URLs reviewed and reachable | Pending owner-provided production URLs                      | EAS environment + release record     |
| Account deletion cascade          | Pending non-production test account                         | SQL counts before/after              |
| Backup configured                 | Pending production Supabase access                          | Dashboard backup settings            |
| Restore drill                     | Pending non-production project access                       | Drill record and verification output |
| RLS/grants/security advisor       | Migration controls committed; hosted-project review pending | Supabase advisor export              |
| Marketplace terms/licensing       | Operational obligations recorded; owner approval pending    | Partnership/legal review record      |
