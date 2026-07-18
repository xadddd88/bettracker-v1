# Decision #062 — Mobile Phase 1C product shell and local Tracker draft

## Scope

Phase 1C turns the Founder mobile client into a coherent product shell while keeping every new
financial action local-only. The persistent navigation contains Home, AI, Tracker, Stats, and More.
The Tracker tab owns a nested Stack so the list, bet detail, and Add Bet editor retain native Back
navigation.

The stable JavaScript `Tabs` API from Expo Router SDK 57 is used. Native Tabs remain alpha in this
SDK and are intentionally deferred.

## Implemented

- Five persistent product sections with Safe Area-aware tab navigation.
- Home workflow and quick actions for AI, Tracker, and Add Bet.
- Existing Phase 1B Coupon/Event capture screen preserved at `ai/index.tsx`.
- Tracker list actions for Scan and Add Bet.
- Local-only Single/Express editor with ordered legs, per-leg sport and odds, nullable selection,
  manual stake, bookmaker, notes, and separately entered Express total odds.
- Strict local validation mirrors the accepted Tracker input limits: one to 20 legs, odds greater
  than one, bounded stake/text values, and a required total for Express.
- Stats and settings surfaces that clearly label deferred behavior instead of estimating data.
- Existing bet detail remains read-only and displays ordered legs with each saved leg coefficient.

## Explicitly deferred

- No request is sent from the Add Bet editor.
- No idempotency key, Bearer bridge, tracked-bet RPC, balance deduction, settlement, or scanner
  analysis request is introduced.
- Stats calculations, notification settings, and native account settings are placeholders.
- Phase 1B native device camera/gallery smoke and real AI connection remain separately gated.

## Native build impact

Phase 1C adds no native dependency and does not itself require a replacement development build.
The replacement builds already required by Phase 1B remain necessary for its image picker,
manipulator, network, and permission configuration.
