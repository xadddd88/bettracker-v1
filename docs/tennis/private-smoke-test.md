# Tennis Calculator private smoke test

## Purpose

This is a founder-controlled private smoke for two already approved testers. It
checks whether real users can understand and use the Tennis Calculator without
opening broader external beta access.

This is not a public beta launch, not a betting recommendation test, and not a
provider-quality certification.

## Access boundary

- Production URL: `https://btdk.app/tennis-calculator`
- Access requires a normal authenticated Supabase user session.
- Calculator access requires `TENNIS_CALC_ENABLED=true` and one of:
  - `OWNER_USER_ID`
  - the user's Supabase auth id in `TENNIS_CALC_ALLOWED_USER_IDS`
- If a tester sees `404`, first confirm they signed in with the intended email.
  If the email is correct, verify the exact UUID in the Vercel production env
  and redeploy.

## Tester script

Send this short instruction to each tester:

```txt
Open https://btdk.app/tennis-calculator

1. Sign in to your existing BetTracker account.
2. Create a Tennis Calculator series:
   - coefficient: 3.00
   - bank: 5000
   - games: 10
3. Check that profit grows from game 1 to game 10.
4. Run "Analysis for the last 24 hours".
5. Send a screenshot and answer:
   - did the calculator open without 404?
   - how many matches did the 24h analysis find?
   - what was confusing?
   - what was uncomfortable on mobile?
```

## Founder observation checklist

Record one line per tester:

```txt
Tester A
Access: PASS / FAIL
Create 3.00 / 5000 / 10: PASS / FAIL
Growing profit visible: PASS / FAIL
24h analysis completed: PASS / FAIL
Found matches: ___
Mobile issue: none / brief note
Confusing copy: none / brief note
Screenshot received: YES / NO

Tester B
Access: PASS / FAIL
Create 3.00 / 5000 / 10: PASS / FAIL
Growing profit visible: PASS / FAIL
24h analysis completed: PASS / FAIL
Found matches: ___
Mobile issue: none / brief note
Confusing copy: none / brief note
Screenshot received: YES / NO
```

## Pass criteria

The private smoke passes only if both testers can:

- open the calculator without a `404`;
- create the requested series without help;
- see that projected profit grows across the configured games;
- run the 24h analysis and report the found/analyzed match counts;
- send at least one screenshot that matches the requested flow.

## Triage rules

- P0: tester cannot sign in, calculator returns `404` for a correctly
  allowlisted user, or production logs show unhandled runtime errors.
- P1: series creation fails, profit does not grow, 24h analysis fails, or the
  UI gives misleading money/odds output.
- P2: tester completes the flow but needs explanation for labels, language, or
  mobile layout.
- P3: copy polish, cosmetic spacing, or non-blocking preference feedback.

Do not expand tester access until P0 and P1 findings are closed or explicitly
accepted.

## Post-smoke checks

After both testers report back:

1. Check Vercel runtime logs for the production deployment used by the testers.
2. Check Sentry for new production issues during the smoke window.
3. Check PostHog only for approved event names; do not inspect raw money, odds,
   match labels, IDs, or tester free text in analytics.
4. Record the result in the next release/decision note before broadening access.
