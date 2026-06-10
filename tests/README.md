# PTOps Test Suite

Three layers, runnable independently.

## 1. Unit (Vitest) — pure logic & schemas

```bash
bun run test               # one-shot
bun run test:watch         # dev loop
```

Covers:
- `src/lib/claude-agent/__tests__/schemas.test.ts` — every Zod schema, happy + rejection paths.
- `src/lib/claude-agent/__tests__/actions.test.ts` — server-side action logic with a mocked Supabase client.
- `src/lib/__tests__/ptops-logic.test.ts` — pre-existing ranking / pipeline helpers.

## 2. Database / RLS (psql)

Requires `PGHOST` env (auto-provided in Lovable sandbox).

```bash
psql -f tests/rls/check-rls.sql
```

Reports:
- RLS enabled on every public table.
- GRANTs present for `authenticated` and `service_role`; flags `anon SELECT` for review.
- Lists every policy with its USING clause.
- Lists SECURITY DEFINER functions and verifies `search_path` is set.
- Simulates a user reading their own row.

## 3. API integration (live HTTP) — `/api/public/claude-agent`

```bash
API_BASE=https://ops.pizantech.com bun tests/api/test-api.ts          # prod
API_BASE=https://id-preview--<id>.lovable.app bun tests/api/test-api.ts # preview
```

Required env: `CLAUDE_AGENT_TOKEN`, optionally `IDAN_AGENT_TOKEN`.

Covers:
- Auth (no/bad/good token), CORS preflight, GET metadata.
- Full CRUD: tasks, leads (incl. cascade delete + WON onboarding side-effect), dev items, stages.
- Validation rejections (bad uuid, bad enum, missing fields).
- Batch limits (25 max, nested rejected, unknown action per-op marked).
- Idan token: allowlist enforcement (dev_items only), 403 for everything else, attribution to Idan's user_id.

## 4. E2E (Playwright) — scaffold

`playwright.config.ts` + `tests/e2e/*.spec.ts` are scaffolded but require a test
user. Provide credentials in env, then:

```bash
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... BASE_URL=https://ops.pizantech.com bunx playwright test
```
