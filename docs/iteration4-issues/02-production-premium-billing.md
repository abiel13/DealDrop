# Feature: Production premium access and billing readiness

Priority: P0  
Suggested labels: `release`, `billing`, `premium`, `P0`

## Problem

Every authenticated user is currently held behind the RevenueCat premium gate. A production build is not usable unless the store products, entitlement, paywall, public SDK keys, account restoration, and subscription management are configured and tested. The product also needs an explicit decision about whether DealDrop is paid-only after the trial or has a free tier.

## Goal

Ensure a new user can reliably start, restore, manage, and continue using the approved access model on real iOS and Android production builds.

## Approved access model

DealDrop is paid-only after a 7-day free trial. There is no free tier. A user without the active `premium` entitlement is shown the RevenueCat paywall; a cancelled or expired subscription removes access after RevenueCat reports that the entitlement is inactive.

If RevenueCat is temporarily unavailable, the app shows a recoverable subscription-check error with retry and log-out actions. It does not silently convert a billing failure into free access.

## Scope

- Confirm and document the approved access model: paid-only after trial or free tier with premium limits.
- Configure RevenueCat products, entitlement identifiers, offerings, trial terms, and paywall content for iOS and Android.
- Configure EAS production environment variables without exposing secret credentials in the mobile bundle.
- Verify new purchases, cancelled purchases, expired trials, restored purchases, and subscription changes.
- Verify the RevenueCat customer identity matches the authenticated Supabase user.
- Provide a recoverable loading and error state when billing is unavailable.
- Ensure users are not permanently locked out because of a temporary SDK, network, or store error.
- Test the Profile subscription-management and restore flows.

## Acceptance criteria

- A production-like iOS build and Android build can complete the approved purchase flow with sandbox/test-store accounts.
- A restored purchase unlocks the correct account after sign-in refresh and app restart.
- An expired or cancelled entitlement changes access according to the approved product decision.
- The paywall shows accurate trial, renewal, price, and cancellation information for each store.
- Missing configuration is detected before release and is not silently presented as a billing failure to users.
- RevenueCat public keys and entitlement IDs are correct for each platform.
- Subscription state changes are covered by tests or a documented manual test matrix.

## Out of scope

- Changing the pricing strategy without product approval.
- Adding another payment provider.
- Building a custom payment form.

## Technical notes

- Keep RevenueCat configuration in the existing premium service and provider.
- Do not place RevenueCat secret keys or Supabase service-role credentials in Expo public variables.
- Store and app-review requirements must be checked before submission.

## Release configuration

The mobile app expects these EAS environment variables in `development`, `preview`, and `production` as needed:

- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`: the RevenueCat Android app-specific public SDK key.
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`: the RevenueCat iOS app-specific public SDK key.
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`: the shared active entitlement identifier; the committed project example uses `premium`, and production must set the value explicitly.

The public RevenueCat SDK keys and entitlement identifier are safe to embed in the client bundle, but RevenueCat secret API keys, Supabase service-role credentials, and store signing credentials must never use `EXPO_PUBLIC_*` variables. Configure the build profiles to use the matching EAS environment, then run:

```bash
npm run verify:premium-config
eas env:list --environment production
eas build --platform ios --profile production
eas build --platform android --profile production
```

Before building, configure RevenueCat with:

- iOS app bundle ID `com.abiel13.DealDrop` and Android package ID `com.abiel13.DealDrop`.
- An entitlement matching `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`.
- A current offering with at least one product connected to both stores.
- The 7-day introductory trial, renewal period, localized prices, cancellation copy, and legal links required for each store.
- Customer Center management and restore behavior for the active entitlement.

Prices, product identifiers, renewal periods, and localized legal copy remain in RevenueCat and App Store Connect/Google Play configuration. They are intentionally not duplicated in the mobile bundle.

## Billing verification matrix

Run this matrix against sandbox/test-store accounts on production-like iOS and Android builds. Record the build number, platform, store account, RevenueCat app user ID, product identifier, and result for every row.

| Scenario               | Action                                                                                              | Expected result                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| New user               | Sign in with a new Supabase account and open the paywall                                            | RevenueCat app user ID equals the Supabase user ID; the paywall shows the store's current price, 7-day trial, renewal, and cancellation terms. |
| Purchase               | Start the trial and complete a test-store purchase                                                  | The `premium` entitlement becomes active and the authenticated app opens without restarting.                                                   |
| Cancelled subscription | Cancel in the platform subscription settings, then refresh or relaunch                              | Access remains available until the store entitlement expires, then the paywall returns.                                                        |
| Expired trial          | Use a test account whose trial has expired without renewal                                          | The entitlement is inactive and the paywall is shown; no free-tier access is granted.                                                          |
| Restore                | Sign out, sign in to the same Supabase account on a clean install/device, and tap Restore purchases | The same RevenueCat app user ID is restored and the active entitlement unlocks after refresh and app restart.                                  |
| Subscription change    | Change or renew the plan in the store, then open Profile                                            | Customer Center and the Profile status reflect the latest RevenueCat customer info.                                                            |
| Account isolation      | Sign out of account A, sign in to account B, and restore                                            | Account B does not inherit account A's entitlement unless the configured RevenueCat transfer behavior explicitly permits it.                   |
| Network/SDK failure    | Block network access or use a build with missing RevenueCat configuration                           | A clear retryable billing error is shown; the app does not present the failure as a successful subscription or permanently hang on loading.    |
| Profile management     | From Profile, open Manage subscription and Restore purchases                                        | Customer Center opens on both platforms, and restore provides a success or no-active-subscription result.                                      |

The native store, RevenueCat dashboard, and EAS environment steps require project-owner access and cannot be verified by JavaScript unit tests alone.

## Definition of done

- The approved monetization model works end-to-end on both native platforms.
- Restore, manage, failure, and sign-out behavior are verified.
- Release configuration and a repeatable billing test checklist are documented.
