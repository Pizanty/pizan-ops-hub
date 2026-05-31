## 1. Canonical agent endpoint (no redirect)

Lovable serves the custom domain (`ops.pizantech.com`) as canonical and 302-redirects the `*.lovable.app` host. We can't disable that. Two-part fix:

- **Docs:** Update the agent context entry in the app (Context page / `business_context`) and any README to use `https://ops.pizantech.com/api/public/claude-agent` as the documented URL. Add a note: "Always follow 3xx redirects; `*.lovable.app` URLs may redirect to the custom domain."
- **Endpoint robustness:** Add an explicit `GET` handler on `/api/public/claude-agent` that returns `{ ok:true, endpoint, methods:["POST"], canonical_url }` so agents probing the URL get a useful 200 instead of a redirect-then-empty response. POST stays the only action method.

## 2. `delete_dev_item` action

- Add `delete_dev_item` to `Schemas` (`{ id: uuid }`) and `VALID_ACTIONS`.
- Add handler in `actions.server.ts` that deletes the row (cascades `dev_item_updates`).
- Wire into `dispatch()` in `src/routes/api/public/claude-agent.ts`.
- Add a delete button in `src/routes/dev.tsx` (admin only) with confirm dialog.

## 3. Rename build-priority away from `severity` → add `priority` (P1/P2/P3)

`severity` stays in the schema but is repurposed for live-incident tickets only. Build priority moves to a new field.

Migration:
- `ALTER TABLE public.dev_items ADD COLUMN priority text` with check constraint `IN ('P1','P2','P3')`.
- Backfill: `UPDATE dev_items SET priority = REPLACE(severity, 'S', 'P') WHERE severity IS NOT NULL`.
- Leave `severity` nullable; document it as "operational impact for live incidents only".

Code:
- Add `Priority = z.enum(["P1","P2","P3"])` in `schemas.ts`; add `priority` to `create_dev_item` / `update_dev_item` / `list_dev_items` filter.
- `src/lib/ptops-types.ts`: add `priority: DevPriority | null` to `DevItem`.
- `src/routes/dev.tsx`: replace the Severity badge/select on build items with Priority (P1/P2/P3); keep Severity field visible only when `type === 'BUG'` (incident-shaped).

## 4. Milestone visual grouping + blocking surfacing

- `get_dashboard` action: split returned `dev_items` into:
  - `milestones`: open items where `is_milestone = true`
  - `dev_items`: open non-milestone items
  - `blocking_milestones`: milestones that appear in any open item's `blocked_by` array (see #5)
- `src/routes/index.tsx` (`DevStatusCard`): render Milestones as a separate top section with a "Blocking N features" badge; show a divider before regular dev items.
- `src/routes/dev.tsx`: add a "Milestones" pinned strip above the status columns on desktop, and a Milestones first card-group on mobile.

## 5. `blocked_by` dependency field

Migration:
- `ALTER TABLE public.dev_items ADD COLUMN blocked_by uuid[] NOT NULL DEFAULT '{}'`.
- Add GIN index for array containment lookups.

Code:
- Schemas: `blocked_by: z.array(uuid).optional()` on create/update.
- `list_dev_items`: support `blocking: uuid` filter (`.contains('blocked_by',[id])`) and `ready_only: boolean` filter ("all blockers resolved").
- New derived action `list_unblocked` (or include `unblocked_now: DevItem[]` in `get_dashboard`): for every open item, return those whose `blocked_by` IDs all have status in `(RESOLVED, WONT_FIX)`.
- `src/routes/dev.tsx`: in the edit/create sheet, multi-select picker bound to existing dev_items; show "Blocked by:" chips on the item card; show "Unblocks: …" on milestone cards.

## 6. Domain-weighted task ranking

Update `rankTasks` in `src/lib/ptops-logic.ts` to apply a domain weight when `ai_rank` is null/tied:

```
weight(domain) = PRODUCT: 0, OPS: 1, SALES: 2, STRATEGY: 3
order: ai_rank → priority → domainWeight → due_date
```

PRODUCT tasks (build-pipeline blockers for Eidan) float to the top among ties. Update `src/lib/__tests__/ptops-logic.test.ts` with a new case asserting PRODUCT beats SALES at equal priority/due_date. The agent's `list_tasks` SQL ordering stays as-is (DB sort is just `priority, due_date`); UI ranking via `rankTasks` is the surface that matters since the daily-briefing logic is gone.

## Out of scope
- No changes to auth, CRM, or mobile shell.
- No new tables; severity column is kept (repurposed, not dropped) to avoid breaking historical data.
- No edge functions; everything stays in the existing TanStack server route + Supabase client.

## Verification
- `POST /api/public/claude-agent` with `{action:"delete_dev_item", params:{id}}` returns `{ok:true}` and the row is gone.
- `GET /api/public/claude-agent` returns JSON, not a redirect-to-empty.
- `get_dashboard` returns `milestones`, `dev_items`, `blocking_milestones`, `unblocked_now` keys.
- Dev page shows Milestones grouped above other items with a "blocks N" badge.
- Unit test for `rankTasks` confirms PRODUCT-domain task wins over SALES at equal priority.
