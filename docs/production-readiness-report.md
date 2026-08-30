# DealDrop Production Readiness Report

Date: 2026-08-28
Scope: Issue 21 — final marketability QA for Track Anything, Anywhere; DealDrop Intelligence; DealDrop Pro; and Deal Rooms.

## Release decision

DealDrop's feature scope is now frozen. No additional product features should be started before release and real production usage has been collected.

Production-ready sign-off is **not yet granted**. The implementation and automated suites are healthy, but externally configured release gates remain unresolved. Work after this report must be limited to deployment, production configuration, native/store release verification, monitoring, or fixes required to launch.

## Verified implementation

### Track Anything, Anywhere

Automated coverage verifies the shared capture entry point, validation, safe URL metadata parsing, marketplace routing, share payload handling, exact barcode identification, screenshot/photo recognition, structured confidence, conservative product identity, variant and condition separation, watch creation services, and unsupported/uncertain states.

### DealDrop Intelligence

Automated coverage verifies observed-only price history, insufficient-history honesty, currency-safe delivered-cost calculations, unknown cost components, seller and purchase-context normalization, equivalent alternatives, deterministic Buy/Wait/Skip recommendations, evidence explanations, recommendation confidence, and Pro profit/ROI/margin/maximum-buy-price calculations.

### Deal Rooms and creators

Automated coverage verifies private/public room authorization, opaque public slugs, collaboration roles, invitations, comments, votes, shortlists, creator collections, public API privacy, merchant-link attribution, live price/availability monitoring, expired listings, alternatives, notification cooldowns, and direct-link fallback when affiliate attribution is unavailable.

### Access, security, and analytics

Automated coverage verifies authenticated API boundaries, cross-user and cross-workspace isolation, private-room denial, Pro entitlement checks, pilot grants, RevenueCat webhook authentication, provider partial-failure isolation, bounded retries, safe logs, CORS and request limits.

The existing analytics pipeline now accepts privacy-conscious events for:

- product capture and tracker creation;
- recommendation usage;
- Deal Room creation and sharing;
- shared-link acquisition and merchant outbound clicks;
- trial, Premium conversion, and Pro conversion lifecycle events.

Migration `20260917000000_complete_marketability_analytics.sql` was applied to the linked Supabase project and confirmed in the remote migration ledger.

## QA evidence

| Check                                | Result                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| Exhaustive server tests              | Passed — 288/288                                                      |
| Mobile/API tests                     | Passed — 48/48                                                        |
| ESLint                               | Passed                                                                |
| Prettier check                       | Passed                                                                |
| Mobile TypeScript                    | Passed                                                                |
| Server TypeScript build              | Passed                                                                |
| Expo Doctor                          | Passed — 21/21                                                        |
| Android production JS export         | Passed — 2,071 modules, 7.6 MB Hermes bundle                          |
| iOS production JS export             | Passed — 1,979 modules, 7.4 MB Hermes bundle                          |
| Public website responsive smoke test | Passed at 390×844 and 1440×900                                        |
| Production configuration gate        | Failed — unresolved launch configuration below                        |
| Chromium extension production build  | Passed — production API endpoint and manifest validation completed    |
| Native EAS Android/iOS binaries      | Not run; production configuration is incomplete                       |
| Live store trial/upgrade/downgrade   | Not run; iOS RevenueCat configuration and store builds are incomplete |

The production-code marker scan found no temporary mocks, debug UI, TODO, FIXME, or HACK markers in `src`, `server/src`, `website`, `extension`, or release scripts.

## Production blockers

1. Replace the Android test-store RevenueCat key with the production Android public SDK key, and replace the placeholder `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` with the iOS public key after the iOS app is configured in RevenueCat.
2. Publish the mobile apps, then configure the real App Store and Play Store URLs in `website/site-config.js` and the mobile release environment.
3. Complete owner/legal review and remove the explicit placeholders in the privacy policy and terms.
4. Configure the production Render environment with the strict website and published extension origins; the local `server/.env` value is not the deployed server configuration.
5. Produce signed EAS Android and iOS builds and perform physical-device release smoke tests, including share-sheet cold start, camera/barcode/photo permissions, keyboard/form behavior, deep links, network failure, and small/large screens.
6. Verify real RevenueCat trial, Premium/Pro purchase, restore, upgrade, downgrade, cancellation, and webhook behavior against the store builds.
7. Deploy the current public site/API revisions, then verify logged-out public Deal Rooms, store fallbacks, creator pages, merchant redirects, analytics receipt, and private-room fail-closed behavior against production.

## Externally pending integrations

- **Amazon Business:** the official adapter remains disabled until DealDrop receives approved production API access. Runtime configuration intentionally requires both `AMAZON_BUSINESS_ENABLED=true` and `AMAZON_BUSINESS_PRODUCTION_APPROVED=true`.
- **Affiliate programs:** marketplace-specific URL attribution must remain disabled until DealDrop has approved participation. Ordinary direct merchant links continue to work.

The enabled watchlist-monitoring source configuration currently targets eBay, Etsy, and Rakuten. Each still requires valid production credentials and provider health verification after deployment.

## Production environment requirements

### Mobile

- deployed `EXPO_PUBLIC_API_URL`;
- Supabase URL and public key;
- EAS project ID;
- privacy, terms, and support URLs;
- RevenueCat Android/iOS public keys plus Premium and Pro entitlement/offering identifiers.

### Server and workers

- Supabase URL and service-role key, kept server-side;
- RevenueCat secret API key, Pro entitlement ID, and webhook authentication token;
- strict `SERVER_ALLOWED_ORIGINS` entries for the public site and published extension;
- provider credentials for enabled marketplaces;
- Gemini image-recognition credentials;
- Frankfurter exchange-rate provider configuration or another explicitly supported provider;
- production worker processes, health checks, retention jobs, and notification delivery configuration.

### Website and extension

- Cloudflare/public website API and store destinations;
- final reviewed legal pages and support destination;
- extension public Supabase configuration, production API URL, and exact published extension origin.

Use a supported modern Node runtime for Expo 57 release operations; the clean exports in this QA pass used Node 24.

## Known non-blocking limitations

- `npm audit --omit=dev` reports 12 moderate `uuid` advisories through Expo's Xcode project-generation tooling. No high or critical runtime advisory remains. The available forced fix would install an Expo-incompatible package version, so it was not applied.
- Marketplace fields that providers do not expose remain unknown by design. DealDrop does not fabricate shipping, tax, duty, quantity, return, seller, historical, or resale data.
- Recommendation and history statistics intentionally show insufficient-data states until DealDrop has enough real observations.

## Freeze policy

The product feature freeze is active immediately. Production-ready sign-off may be granted only after every blocker above is cleared and the signed Android/iOS builds, extension package, public website, deployed API, billing lifecycle, and production analytics are verified end to end.
