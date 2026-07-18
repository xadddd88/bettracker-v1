# xaddd mobile

Expo SDK 57 development client for the Founder-first BetTracker flow.

## Decision #062 Phase 0

Phase 0 is intentionally read-only:

- email/password sign-in;
- encrypted persisted session and foreground token refresh;
- owner-scoped bet list and bet detail through Supabase RLS;
- Single and Express presentation with ordered `leg_index` values;
- local logout.

Scanner, bet creation, settlement, deposits, analytics, provider calls, and every financial write are outside this phase.

## Local environment

Create `apps/mobile/.env.local` locally (it is ignored by git):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Only a Supabase publishable key may be used. Never place a secret/service-role, provider, or operator key in an Expo environment variable.

Install and start the existing development client:

```powershell
cd C:\BT\apps\mobile
npm.cmd install
npx.cmd expo start --dev-client --tunnel
```

## Validation

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
```

Adding `expo-secure-store` changes the native binary. The previously installed Android build does not contain it; make one separately approved replacement development build after this implementation is accepted. iOS remains blocked until the Apple Developer membership becomes active and the device is registered.
