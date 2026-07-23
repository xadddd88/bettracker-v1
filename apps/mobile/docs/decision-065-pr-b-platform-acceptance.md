# Decision #065 PR B — Native Platform Acceptance

Date: 2026-07-21
Status: DRAFT / STATIC GATES PASSED / DEVICE EVIDENCE REQUIRED

## Scope

PR B changes only the shared product shell, BetTracker brand assets, native
splash configuration, bottom-tab presentation, safe-area ownership, and the
Android predictive Back opt-in. It preserves every approved route, Supabase and
auth behavior, EAS project identity, slug, scheme, iOS bundle identifier, and
Android package identifier.

No EAS Build or EAS Update is authorized by this Draft.

## Safe-area contract

React Navigation owns the built-in bottom-tab safe-area inset. PR B removes the
manual `useSafeAreaInsets()` height and bottom-padding calculation from the tab
bar so the home indicator/navigation bar is not counted twice. Screen content
continues to own only its documented content edges.

Reference: [React Navigation — Supporting safe areas](https://reactnavigation.org/docs/handling-safe-area/).

## Predictive Back contract

`android.predictiveBackGestureEnabled` is enabled in `app.json`. This maps to
Android's `enableOnBackInvokedCallback` opt-in for Android 13+.

Static tests prove the flag is present, native identifiers are unchanged, the
Tracker stack still exposes index/detail/new, and the tab navigator still uses
`backBehavior="history"`. Static evidence cannot prove the device gesture.

References:

- [Expo app config — predictiveBackGestureEnabled](https://docs.expo.dev/versions/latest/config/app/#predictivebackgestureenabled)
- [Android — Add support for predictive Back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)

## Required device matrix before completion

| Platform | Scenario | Required evidence |
|---|---|---|
| Android 13/14 | Developer option `Predictive back animations` enabled | Back from Tracker detail/new returns to Tracker; back from first tab root previews system Home |
| Android 15+ | Gesture navigation | Same in-app history behavior plus visible system back-to-home preview |
| Android 13+ | More/account and permission-denial states | Back dismisses the current overlay/state before leaving the route |
| iPhone with home indicator | Home/Scan/Tracker | Tab segments remain reachable with one bottom inset |
| iPhone with notch/Dynamic Island | Sign-in and all tab roots | Top content stays within the existing safe area; keyboard does not cover sign-in action |

Until this matrix is recorded against a development build, predictive Back is
`ENABLED / NOT DEVICE-VERIFIED` and PR B must not be described as complete.
