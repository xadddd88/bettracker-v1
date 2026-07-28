-- Decision #056 durable one-time execution ledger.
--
-- The immutable execution key is the authority boundary. The primary key makes
-- concurrent claims atomic across Vercel instances and across new GitHub
-- workflow dispatches. The table is append-only from the application:
-- service_role may INSERT exactly once and cannot SELECT, UPDATE, or DELETE.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.decision_056_execution_ledger (
  execution_key text PRIMARY KEY
    CHECK (
      execution_key =
        'decision-056:sportmonks-structural-presence-dry-run'
    ),
  token_jti_sha256 text NOT NULL
    CHECK (token_jti_sha256 ~ '^[0-9a-f]{64}$'),
  deployment_sha text NOT NULL
    CHECK (deployment_sha ~ '^[0-9a-f]{40}$'),
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decision_056_execution_ledger
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.decision_056_execution_ledger
  FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE public.decision_056_execution_ledger TO service_role;

COMMENT ON TABLE public.decision_056_execution_ledger IS
  'Append-only one-time authorization ledger for Decision #056';

COMMIT;
