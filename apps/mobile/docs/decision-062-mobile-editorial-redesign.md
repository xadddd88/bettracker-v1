# Decision #062 — editorial mobile redesign

## Intent

Replace the rejected neon/card dashboard with an original high-fashion editorial system. The implementation borrows interaction principles from contemporary luxury commerce—full-bleed hero fields, alternating black and white planes, compact utility labels, sharp rules, restrained actions, and kinetic type—without copying Balenciaga branding, photography, copy, or proprietary assets.

## Product hierarchy

1. **Home** opens as a full-bleed decision manifesto rather than a dashboard card stack. Real bankroll and tracker totals remain visible in the following portfolio section.
2. **Scan** is a dedicated capture stage. Coupon/Event choice, camera, library, preview, replacement, removal, and offline feedback remain intact. The later Coupon Scanner wiring keeps this visual system while adding an authenticated review-only result.
3. **Tracker** is an editorial archive. Bets are separated by rules instead of rounded cards; real odds, financial values, status, and detail navigation are unchanged.
4. **Details and draft editor** use the same flat black/white language while preserving ordered Express legs, nullable fields, validation, and local-only behavior.

## Motion

- Large background type drifts slowly behind the Home and Scan hero fields.
- Screen content enters with short, reduced-motion-aware reveals.
- Tabs use a shifting transition and animated active rule.
- Buttons use a spring press response and a subtle moving surface, with no perpetual glow.
- All continuous motion respects the platform reduced-motion preference.

## Boundaries

- No new dependency or native module.
- The redesign itself introduced no API, AI, provider, Supabase, RPC, or financial write. Network behavior is owned by the later, separately reviewed Coupon Scanner stage.
- Event Analyze remains explicitly deferred; Coupon Analyze never saves a financial record automatically.
- Existing camera and library preparation/security policies are unchanged.
