# Feature: Native push notification release readiness

Priority: P0  
Suggested labels: `release`, `notifications`, `mobile`, `P0`

## Problem

Push behavior is implemented, but notification delivery depends on real iOS and Android builds, device permissions, EAS project configuration, APNs/FCM credentials, token registration, and provider behavior. A simulator or web build cannot prove the production alert loop.

## Goal

Prove that a real user receives a useful alert, can open the correct listing, and retains in-app history across every supported notification state.

## Scope

- Configure and verify EAS production push credentials for iOS and Android.
- Test permission granted, denied, later-enabled, unavailable, and token-refresh flows on physical devices.
- Test instant and digest alert modes.
- Test quiet hours, timezone changes, daily limits, duplicate suppression, and push-disabled history preservation.
- Test notification delivery while the app is foregrounded, backgrounded, terminated, and reopened after a device restart.
- Test cold-start deep links to an active listing and to an expired/unavailable listing.
- Verify invalid or revoked push tokens are disabled without stopping other users’ delivery.
- Add a repeatable release test matrix and automated coverage for notification intent parsing and delivery decisions.

## Acceptance criteria

- A new match creates the expected in-app notification and push message on a physical iOS device and Android device.
- Tapping a push notification opens the matching listing or a clear unavailable state when the listing has expired.
- Quiet hours suppress push delivery but preserve the in-app notification.
- Digest mode groups eligible matches without losing a valid listing deep link.
- Duplicate matches do not produce repeated user-visible alerts.
- Denied permissions and provider failures show actionable, non-blocking UI.
- Token rotation and invalid-token cleanup are verified.
- The release checklist records device, OS, build, provider, and timezone coverage.

## Out of scope

- Adding email, SMS, or another push provider.
- Redesigning the Alerts screen.

## Technical notes

- Use the existing Expo Notifications and notification queue pipeline.
- Web and simulator behavior must not be treated as proof of native push readiness.
- Do not log device tokens or provider credentials.

## Definition of done

- Native production-like builds pass the notification test matrix.
- EAS, APNs, FCM, and Expo project configuration are documented and verified.
- Relevant server and mobile tests pass.
