# xaddd mobile

Expo SDK 57 development client for the Founder-first BetTracker flow.

## Decision #062 mobile founder client

The current founder build includes:

- email/password sign-in;
- encrypted persisted session and foreground token refresh;
- owner-scoped bet list and bet detail through Supabase RLS;
- Single and Express presentation with ordered `leg_index` values;
- local logout;
- local camera/gallery preparation for coupon screenshots;
- authenticated Coupon analysis through the BetTracker Next API;
- a review-only scanner result with no automatic financial write.

Event analysis, secure bet creation, settlement, deposits, and automatic financial writes remain deferred. The mobile bundle never contains a provider, operator, or service-role credential.

## Local environment

Create `apps/mobile/.env.local` locally (it is ignored by git):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
# Optional. Defaults to the production web origin:
EXPO_PUBLIC_API_BASE_URL=https://btdk.app
```

Only a Supabase publishable key may be used. Never place a secret/service-role, provider, or operator key in an Expo environment variable. `EXPO_PUBLIC_API_BASE_URL` must be HTTPS except for an explicit loopback development URL.

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

The already approved Android and iOS replacement development clients contain the native capture modules used here. This scanner-wiring change is JavaScript/TypeScript only and does not require another replacement build.
