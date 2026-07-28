# Decision #056 GitHub Actions OIDC Runbook

## Scope

This runbook covers only the authorization path for the already implemented Decision #056 structural-presence dry-run.

The OIDC pull request:

- adds no migration, Supabase write, provider write, environment value, or secret;
- does not call Vercel, Supabase, BetTracker production, or SportMonks;
- does not merge or deploy itself;
- removes the static operator-token fallback only from the Decision #056 route;
- leaves every other admin route and the existing `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN` environment value unchanged.

The workflow is manual-only. It has no `push`, `pull_request`, `schedule`, or reusable-workflow trigger.

## Trust Boundary

The Decision #056 endpoint accepts only a GitHub OIDC JWT that satisfies every pinned condition:

| Claim | Required value |
|---|---|
| `iss` | `https://token.actions.githubusercontent.com` |
| `aud` | `urn:btdk:decision-056:production` |
| `sub` | `repo:xadddd88/bettracker-v1:environment:decision-056-production` |
| `repository` | `xadddd88/bettracker-v1` |
| `repository_id` | `1280991721` |
| `repository_owner` | `xadddd88` |
| `repository_owner_id` | `295055646` |
| `actor` / `actor_id` | `xadddd88` / `295055646` |
| `environment` | `decision-056-production` |
| `event_name` | `workflow_dispatch` |
| `ref` / `ref_type` | `refs/heads/main` / `branch` |
| `workflow` | `Decision 056 Production Dry Run` |
| `workflow_ref` | `xadddd88/bettracker-v1/.github/workflows/decision-056-production.yml@refs/heads/main` |
| `sha` / `workflow_sha` | exact `VERCEL_GIT_COMMIT_SHA` of the production deployment |
| `run_attempt` | `1` |
| `runner_environment` | `github-hosted` |
| `repository_visibility` | `public` |

The verifier also requires an `RS256` JWT with `typ: JWT`, a bounded non-empty `kid`, a bounded non-empty `jti`, all standard time claims, a maximum lifetime of ten minutes, and no more than 30 seconds of clock tolerance.

The pinned subject is the repository's legacy environment subject. If GitHub changes this repository to immutable or customized subject claims, authorization intentionally fails closed until a separately reviewed code change pins the observed replacement.

## Required GitHub Environment Configuration

Before any merge or runtime execution is authorized, create or verify the GitHub Environment `decision-056-production` with all of these rules:

1. At least one required reviewer who is not the workflow initiator.
2. Prevent self-review enabled.
3. Deployment branches restricted to the protected `main` branch only.
4. Administrator bypass disabled.
5. No environment secrets or variables are required by this workflow.

Repository settings are not changed by this pull request. The environment must be reviewed separately in GitHub before the workflow can be considered executable.

## Separate Merge and Deploy Gates

This pull request must remain draft until:

1. the code and negative authorization tests are reviewed;
2. all hermetic PR checks pass;
3. the exact GitHub Environment protection rules above are verified;
4. Founder separately authorizes merge;
5. Founder separately authorizes production deployment.

An automatic preview check created by repository integrations is not authority to run the workflow or call production. The endpoint additionally rejects OIDC on non-production Vercel environments.

## Separate Runtime Gate

The workflow must not be dispatched merely because the PR was merged or deployed.

For a future separately authorized run:

1. Confirm `btdk.app` is deployed from the exact current `main` SHA.
2. Enter that exact 40-character SHA as `approved_production_sha`.
3. Enter the exact confirmation `RUN_SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_D056`.
4. Obtain the required GitHub Environment approval.
5. Dispatch once only.

The workflow obtains one GitHub OIDC token and sends one POST. It has no retry path. Any HTTP response, timeout, authentication failure, or provider failure consumes the one-call authorization.

## Replay Boundary

The endpoint consumes each observed `jti` in an in-memory TTL cache. This blocks replay on the same warm application instance.

The cache is not durable across Vercel instances or cold starts. Full cross-instance replay prevention would require a short durable security-ledger write, which is outside this PR's zero-write authorization. The remaining short-window replay risk must be explicitly accepted or replaced by a separately approved durable ledger before runtime execution.

## References

- <https://docs.github.com/en/actions/reference/security/oidc>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>
- <https://github.com/panva/jose>
