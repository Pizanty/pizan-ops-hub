
# Claude Agent API — Round 2

Targeted improvements to make the Claude API usable as a real assistant interface, plus full delete + context-write coverage. All changes scoped to `src/lib/claude-agent/*` and `src/routes/api/public/claude-agent.ts` — no UI changes, no auth, no new tables (one seed pass only).

## 1. `get_business_context` returns empty → seed defaults + expanded keys

- Extend `CONTEXT_KEYS` in `src/lib/ptops-types.ts` with high-signal fields: `90_day_priorities`, `active_warnings`, `product_stability`, `execution_bias_flag` (plus existing keys).
- Seed admin user's `business_context` with placeholder values via `supabase--insert` so the endpoint returns populated data immediately.
- Update `get_business_context` to return `{ kv: {...}, list: [{key,value,updated_at}] }` — map for convenience, list for timestamps.
- `src/routes/context.tsx` picks up new keys automatically; add their labels to `LABELS`.

## 2. Contact log retrieval

Add to schemas, `VALID_ACTIONS`, `actions.server.ts`, and `dispatch()`:
- `list_contacts({ lead_id?, since?, method?, limit=50 })` — across all leads, newest first, joined with lead name.
- `get_lead_contacts({ lead_id })` — full history + `days_since_last_contact`.
- Enrich `get_lead` with top-level `last_contact_at` and `days_since_last_contact`.

## 3. Lead data quality

Add `lead_data_quality` action returning per-lead missing-field report + aggregate stats (% missing phone/email/etc.) + `next_actions_needed` list. No automatic backfill — surfaces gaps for Claude to drive cleanup conversation.

## 4. Batch endpoint

`batch({ operations: [{action, params}, ...] })`, max 25 ops, no nesting (`batch` itself rejected). Runs sequentially, returns `{ results: [{ok, data?, error?}, ...] }` preserving order. One failure does NOT abort the rest.

## 5. Task ↔ lead linkage in `get_dashboard`

- Attach `lead: { id, name, stage }` inline on each task with `lead_id`.
- Add derived `tasks_by_lead` grouping (only leads with ≥1 open task) for pre-call prep.

## 6. Filters on list endpoints

- `list_tasks`: add `due_before`, `due_after`, `has_lead`, `search` (ILIKE title/notes); accept `status` as string or array.
- `list_leads`: add `search` (name/business_name/phone/email), `next_action_before`, `next_action_after`; accept `stage` as string or array.
- `list_dev_items`: add `search` (title/description); accept `status` and `type` as string or array.

All filters optional, fully backwards compatible.

## 7. NEW — Delete coverage

Currently `delete_task` and `delete_dev_item` exist. Add the missing ones:

- **`delete_lead({ id, cascade?: boolean = false })`**
  - With `cascade: false` (default): refuse if the lead has linked tasks or contacts, returning `{ ok: false, error: "Lead has N tasks and M contacts. Pass cascade:true to delete all." }`.
  - With `cascade: true`: delete `lead_contacts` for the lead, null out `tasks.lead_id` (preserve task history), then delete the lead.
- **`delete_contact({ id })`** — delete a single `lead_contacts` row scoped to `user_id`.
- **`delete_business_context_key({ key })`** — delete one row from `business_context` for the admin user.
- All return `{ deleted: true, id }` (or a structured refusal in the lead-cascade case).

## 8. NEW — Context write surface

`update_business_context` already exists (bulk upsert). Add finer-grained complements that map better to natural assistant flows:

- **`set_business_context({ key, value })`** — single-key upsert. Validates `key` against the expanded `CONTEXT_KEYS` allowlist (rejects unknown keys to prevent schema drift).
- **`append_business_context({ key, value, separator?: "\n" })`** — read current value, append `separator + value`, upsert. Useful for `active_warnings` and `current_blockers` log-style fields.
- **`clear_business_context_key({ key })`** — sets value to empty string (preserves the row + history) vs. `delete_business_context_key` which removes it entirely.

All three reuse the existing `business_context` table — no schema change.

## Out of scope

- No new tables, no auth changes, no UI for the new actions.
- No webhook / realtime push.
- No automatic backfill of lead fields.

## Files touched

- `src/lib/claude-agent/schemas.ts` — new schemas, expanded filters, batch, deletes, context writes.
- `src/lib/claude-agent/actions.server.ts` — new handlers, dashboard join, filter wiring, batch dispatcher, cascade delete logic.
- `src/routes/api/public/claude-agent.ts` — register new actions in `dispatch()` and `VALID_ACTIONS`.
- `src/lib/ptops-types.ts` — extended `CONTEXT_KEYS`.
- `src/routes/context.tsx` — labels for new context keys.
- One `supabase--insert` seed for default `business_context` rows.
