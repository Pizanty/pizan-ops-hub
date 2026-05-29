# Claude Agent API — Plan

External authenticated API that lets Claude (or any external caller with the bearer token) read and write all PTOPS data via a single POST endpoint.

## Endpoint choice (important deviation from prompt)

The prompt asks for a Supabase Edge Function at
`https://[ref].supabase.co/functions/v1/claude-agent`. This project runs on TanStack Start; the stack rule is to use TSS public server routes instead of Edge Functions for app-internal HTTP endpoints. I'll implement it as a TanStack public route — same shape, same auth model, same JSON contract, just a different URL:

- **New URL**: `https://pto-ops-flow.lovable.app/api/public/claude-agent` (published) / `https://project--0891c374-4fa6-4eea-891c-4baa1043d222-dev.lovable.app/api/public/claude-agent` (preview).
- Bypasses Lovable's published-site auth (because of the `/api/public/` prefix), exactly like an Edge Function would.

If you specifically need the `supabase.co/functions/v1/...` URL (because Claude is already configured with it), say so and I'll build it as a real Edge Function instead. Everything else in the spec stays identical.

## File layout

- `src/routes/api/public/claude-agent.ts` — POST + OPTIONS handlers, CORS, token auth, action dispatcher.
- `src/lib/claude-agent/actions.server.ts` — one function per action; takes `(supabaseAdmin, adminUserId, params)` and returns serializable JSON.
- `src/lib/claude-agent/schemas.ts` — Zod schemas for each action's `params`.

No changes to existing routes, components, server functions, or styles.

## Secret

Add `CLAUDE_AGENT_TOKEN` via `add_secret`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist.

## Route handler shape

```
POST /api/public/claude-agent
1. CORS preflight: OPTIONS → 200 with CORS headers, empty body.
2. Verify Authorization: Bearer <token> against process.env.CLAUDE_AGENT_TOKEN
   using constant-time compare. Missing/mismatch → 401 { error: "Unauthorized" } + CORS headers.
3. Parse JSON body { action: string, params: object }. Bad JSON → 400.
4. Resolve admin user_id from user_roles where role='admin' limit 1 (cached per request).
5. Dispatch on action → handler. Validate params with Zod inside the handler.
6. Wrap result as { ok: true, data: <result> }. Logical errors (validation, not found, bad input) → 200 { ok: false, error }. Crashes → 500 { ok: false, error: "Internal error" }.
7. All responses include the three CORS headers.
```

## Actions

All 21 actions from the spec, grouped by area. Each handler uses `supabaseAdmin` (RLS bypassed; auth gate is the bearer token).

**Dashboard**
- `get_dashboard` — parallel fetch of tasks (status ≠ ARCHIVED), leads, dev_items (status ∉ RESOLVED/WONT_FIX), business_context, latest DAILY briefing. Computes weekly_completion (using ISO week start = Monday 00:00 local UTC), overdue_leads count, mrr_nis sum.

**Tasks**
- `list_tasks` (filters: status, domain, priority, limit=50; order priority asc, due_date asc nulls last)
- `get_task` (id)
- `create_task` (title, domain, priority=3, status='TODO', due_date?, notes?, lead_id?; user_id = admin)
- `update_task` (id + partial fields)
- `delete_task` (id → { deleted: true })
- `complete_task` (id → status='DONE'; trigger handles completed_at)

**Leads / CRM**
- `list_leads` (stage?, source?, overdue_only?, limit=50; order updated_at desc)
- `get_lead` (id + lead_contacts ordered contact_date desc)
- `create_lead` (name + optional fields; default stage='PROSPECT')
- `update_lead` (id + partial fields). **Special**: when stage→'WON' AND monthly_value_nis provided, also INSERT onboarding task (title `Onboard <name> to CaterFlow`, domain=SALES, priority=1, status=TODO, lead_id, notes with ₪ value). Returns `{ lead, task? }`.
- `log_contact` (lead_id, method, summary, contact_date=today)
- `get_pipeline_summary` (counts by stage, mrr_nis, total_leads, overdue array)

**Dev Tracker**
- `list_dev_items` (type?, severity?, status?, open_only?; order created_at desc)
- `get_dev_item` (id + dev_item_updates ordered created_at desc)
- `create_dev_item` (type, title, optional rest; created_by = admin)
- `update_dev_item` (id + partial; if status='RESOLVED' also set resolved_at = now())

**Business Context**
- `get_business_context` — returns flat `{ key: value }` object for admin user.
- `update_business_context` (updates: Record<string,string>) — upsert each pair on `(user_id, key)`. Note: current schema lacks a unique constraint on `(user_id, key)`; I'll add a migration creating that unique index so the upsert is atomic. Returns the full updated map.

**Briefings**
- `get_latest_briefing` (type='DAILY')
- `list_briefings` (limit=20; fields id, type, generated_at, content)
- `save_briefing` (type, content, optional snapshots; user_id = admin)

**Unknown action**
- Returns the exact error message from the spec listing all 21 valid actions.

## Validation & safety

- Every action's params validated with Zod; enum fields restrict domain/stage/source/method/type/severity to the documented values.
- IDs validated as UUIDs.
- Dates validated as `YYYY-MM-DD`.
- All Supabase errors are caught and returned as `{ ok: false, error: <message> }` (no stack traces leaked).
- The endpoint is rate-limited only by the bearer token — that's by design (matches the prompt). Document this in a header comment.

## Migration

One small migration: `CREATE UNIQUE INDEX IF NOT EXISTS business_context_user_key_uniq ON public.business_context (user_id, key);` so `update_business_context` upsert works.

## Testing after deploy

1. `curl -X POST .../api/public/claude-agent -H 'Authorization: Bearer <token>' -d '{"action":"get_dashboard","params":{}}'` → 200 `{ ok:true, data:{...} }`.
2. Missing token → 401 `{ error:"Unauthorized" }`.
3. Wrong action → 200 `{ ok:false, error:"Unknown action: ..." }`.
4. `create_task` → `get_task` → `complete_task` → `delete_task` round-trip via curl.

## Out of scope

- No UI surface (Settings stays untouched).
- No changes to existing server fns, briefing logic, or types.
- No per-end-user auth — this is a single workspace bearer token, intentional.
