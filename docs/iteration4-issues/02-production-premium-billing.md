# Feature: Production premium access and billing readiness

Priority: P0  
Suggested labels: `release`, `billing`, `premium`, `P0`

## Problem

Every authenticated user is currently held behind the RevenueCat premium gate. A production build is not usable unless the store products, entitlement, paywall, public SDK keys, account restoration, and subscription management are configured and tested. The product also needs an explicit decision about whether DealDrop is paid-only after the trial or has a free tier.

## Goal

Ensure a new user can reliably start, restore, manage, and continue using the approved access model on real iOS and Android production builds.

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

## Definition of done

- The approved monetization model works end-to-end on both native platforms.
- Restore, manage, failure, and sign-out behavior are verified.
- Release configuration and a repeatable billing test checklist are documented.
