# Decision #062 Mobile Phase 1B Design

## Status

APPROVED FOR LOCAL IMPLEMENTATION AND CPO PATCH REVIEW.

This phase does not approve a Draft PR, a runtime AI request, a provider call,
or a Supabase write.

## Goal

Add a Founder-first screenshot preparation flow to the mobile AI screen:

- capture a coupon or event screenshot with the camera;
- choose a screenshot from the photo library;
- convert the selected image to JPEG;
- resize and compress it until the complete prospective JSON body is safely
  below the 4.5 MB transport ceiling;
- preview, replace, or remove the prepared screenshot;
- keep Analyze local-only until the Bearer-authenticated bridge is approved.

## Boundaries

- All changed files stay under `apps/mobile/**`.
- `apps/mobile/src/app/(app)/bets/**` is immutable in this phase.
- No `fetch`, computed global network primitive, `Linking.openURL`, HTTP client,
  Supabase call, provider call, or AI call is added.
- No write path, financial behavior, tracker behavior, or settlement behavior
  is added.
- No API URL, provider key, service-role key, or production credential is
  introduced.
- No Draft PR is created before CPO review.

## Navigation

`apps/mobile/src/app/(app)/_layout.tsx` keeps the existing Expo Router native
Stack so bet details retain their native header and back behavior. A persistent
bottom navigation bar is rendered below that Stack:

- Bets routes to `/(app)/bets`;
- AI routes to `/(app)/ai`;
- bet detail remains inside the existing Stack;
- the bar remains visible on authenticated screens;
- each item has a symbol, text label, active state, accessibility role, and a
  minimum 44-point target.

The navigation does not add or modify any file under `bets/**`.

## Screen

The AI screen is a quiet operational surface, not a marketing page.

1. Header: `AI capture` and a short local-preparation description.
2. Segmented mode control: `Coupon` and `Event`.
3. Empty state:
   - Take photo;
   - Choose photo.
4. Prepared state:
   - contained JPEG preview;
   - mode, dimensions, and prepared body size;
   - Replace;
   - Remove;
   - Analyze.
5. Analyze:
   - performs no network request;
   - when online or network state is unknown, displays
     `Secure AI connection is being prepared`;
   - when offline, remains disabled and explains that the image stays local.

Changing Coupon/Event mode keeps the prepared screenshot. The mode is part of
the prospective JSON-size calculation and can be changed without another
camera or gallery round trip.

## Capture And Preprocessing

Native dependencies are installed from `apps/mobile` with Expo's compatible
version resolver:

```text
npx expo install expo-image-picker expo-image-manipulator expo-network
```

Picker rules:

- images only;
- one image;
- no picker-side editing;
- no EXIF or picker base64;
- no implicit iCloud network download;
- explicit camera and photo-library permission handling.

ImageManipulator uses the contextual API:

```text
ImageManipulator.manipulate(uri)
context.resize(...)
context.renderAsync()
rendered.saveAsync({ format: JPEG, compress, base64: true })
```

The original HEIC, PNG, or JPEG is never sent anywhere. Every accepted image is
a newly rendered JPEG.

## Size Contract

The implementation measures UTF-8 bytes of the complete prospective body:

```json
{
  "mode": "coupon",
  "image": {
    "contentType": "image/jpeg",
    "base64": "..."
  }
}
```

The local acceptance limit is `4,400,000` bytes. This stays below the 4.5 MB
ceiling and fails closed before any future request.

Profiles are attempted from the original local image in this order:

| Max dimension | JPEG quality |
| --- | --- |
| 2048 | 0.82 |
| 1600 | 0.70 |
| 1280 | 0.58 |
| 1024 | 0.48 |

The first result whose complete JSON body is strictly below `4,400,000` bytes is
accepted. If every profile remains too large, the result is `oversize` and no
prepared image is returned.

## State And Failure Handling

Capture outcomes are explicit and sanitized:

- `ready`: valid JPEG and body size;
- `cancelled`: current prepared image is preserved;
- `permission-denied`: current image is preserved and Open Settings is offered;
- `corrupt`: current image is preserved and a generic local-processing error is
  shown;
- `oversize`: current image is preserved and a size-specific error is shown.

While picker/manipulation work is in progress, mode, capture, replace, remove,
and analyze controls are disabled. Camera and photo-library actions share a
synchronous `useRef` lock that is acquired before the first asynchronous
permission/picker operation and released in `finally`; simultaneous actions
therefore launch at most one picker. No raw URI, native exception, base64, or
asset metadata is shown in an error.

Offline is a presentation state only. Camera and local photo preparation remain
available, but Analyze is disabled and no network fallback is attempted.

## Accessibility And Responsive Rules

- Root content keeps native ScrollView inset adjustment for iOS. Android adds
  only `safeAreaInsets.top` to the standard content padding so the header stays
  below the status bar.
- The AI screen never consumes `safeAreaInsets.bottom`; the persistent bottom
  navigation remains the sole owner of the bottom safe-area inset.
- Every interactive target has `minHeight: 44`.
- All icon buttons have a visible label or accessibility label.
- Status and error text use live-region semantics.
- The mode control exposes selected state.
- The layout uses one content column, flex wrapping, bounded preview height, and
  `minWidth: 0` so 320 px and 375 px widths do not overflow.
- The preview uses `expo-image` with `contentFit="contain"`.

## Tests

Node tests cover:

1. UTF-8 byte calculation for the complete prospective JSON body.
2. Acceptance strictly within the `4,400,000`-byte policy.
3. Progressive profile selection.
4. Fail-closed oversize behavior.
5. Resize behavior without upscaling.
6. Source boundaries:
   - the AI entrypoint's complete local import graph is scanned;
   - external imports use a strict local-only allowlist;
   - AI source has no direct or computed-global `fetch`, `expo/fetch`, Axios,
     `XMLHttpRequest`, `WebSocket`, `EventSource`, `Linking.openURL`, `/api/`,
     Supabase call, provider secret, or privileged key;
   - negative behavioral fixtures cover direct primitives, string-concatenated
     computed properties on `globalThis`, `global`, `window`, and `self`,
     external URL opening, and a network helper reached through a transitive
     local import;
   - `Linking.openSettings()` remains explicitly allowed;
   - required local-only copy is present;
   - `bets/**` is not part of the resulting patch.
7. A behavioral concurrency test proves that two simultaneous capture actions
   launch the picker operation exactly once and that the lock is released in
   `finally`.

## Follow-Up: Prepared Image Cache Lifecycle

Prepared JPEG cache-file cleanup remains a post-Phase-1B follow-up. This patch
does not add `expo-file-system`, delete native cache files, or claim persistent
cache lifecycle ownership. Before a real AI upload is approved, a separate
design must define cleanup for Replace, Remove, screen unmount, failed
preprocessing attempts, and successful upload without risking deletion of
picker-owned source assets.

This follow-up is implemented by the reviewed Coupon Scanner wiring stage. It
deletes only generated files inside Expo's cache directory, cleans rejected
compression outputs, preserves the current preview after a failed replacement,
and releases the retained preview on successful replacement, Remove, successful
Coupon analysis, or screen unmount.

## Native Build Impact

Replacement Android and iOS development builds are required because this phase
adds native modules and an ImagePicker config plugin. The iOS replacement build
can only be produced after Apple Developer membership and device registration
are available. No build is started by this implementation task.
