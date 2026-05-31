# Remove Briefings + Telegram

Both features go away end-to-end. No edge functions exist for them; the removal is just code, types, and a DB migration.

## Files to delete

- `src/routes/briefing.tsx` — the Briefings page (route auto-unregisters from `routeTree.gen.ts` on next build).
- `src/lib/api/briefing.functions.ts` — the `generateBriefing` server function.

## Files to edit

**`src/components/app-shell.tsx`**
- Remove the Briefings entry (`{ to: "/briefing", ... }`) from `ADMIN_NAV`.

**`src/routes/index.tsx`** (Dashboard)
- Drop `BriefingCard` import/usage and the import of `generateBriefing` + `Briefing` type.
- Remove `<BriefingCard />` from the grid. Rework the grid so it doesn't look empty: keep `TopTasksCard`, `CrmSummaryCard`, `DevStatusCard`, `WeeklyMeterCard` — the meter goes full-width at the bottom as today.
- Update `PageHeader` description to drop the "briefing" word.

**`src/routes/context.tsx`**
- Page description currently says "passed to AI briefing prompts" — change to "Shared business context for the team."

**`src/routes/settings.tsx`**
- Remove the entire **Telegram** `<Section>` (form + `saveTelegram` mutation + `telegramId` state + `useEffect`).
- Remove the **External services** `<Section>` (it only listed `generate-briefing` and `telegram-webhook` edge fns — neither exists anymore).
- Drop unused imports (`Input`, `Label`, `useEffect`, `useMutation`, `useQueryClient`, `toast`).

**`src/lib/ptops-types.ts`**
- Remove `BriefingType`, `BriefingContent`, `Briefing` exports.
- Remove `telegram_chat_id` from the `UserProfile` interface.

**`src/lib/claude-agent/schemas.ts`**
- Remove `BriefingType` enum.
- Remove `get_latest_briefing`, `list_briefings`, `save_briefing` from `Schemas`.
- Remove those three names from the `ACTIONS` array.

**`src/lib/claude-agent/actions.server.ts`**
- Remove the `latest_briefing` field from the dashboard snapshot (and the `briefR` query that feeds it).
- Remove the three exported briefing action handlers and their entries in the action dispatcher.

## Database migration

A single migration that drops both feature surfaces:

```sql
DROP TABLE IF EXISTS public.briefings CASCADE;
DROP TABLE IF EXISTS public.telegram_log CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS telegram_chat_id;
```

(The unique index on `telegram_chat_id` is dropped automatically with the column.)

## Out of scope

- No edge functions to delete (none currently exist in `supabase/functions/`).
- No changes to mobile layout, auth, CRM, tasks, dev tracker, or Claude-agent transport — only the briefing/telegram actions are pruned from the agent surface.
- `LOVABLE_API_KEY` / `TELEGRAM_API_KEY` secrets: not touched by this change (no-op if present).

## Verification

- Build passes (TS errors would flag missing types or routes).
- Navigate to `/`, `/tasks`, `/crm`, `/dev`, `/context`, `/reports`, `/settings` — no console errors, sidebar no longer shows "Briefings", Settings no longer shows Telegram or External services sections.
- Hitting the old `/briefing` URL falls through to the root 404 page.
- `POST /api/public/claude-agent` with `action: "get_dashboard"` returns 200 without `latest_briefing`; calling the removed actions returns the standard "unknown action" error.
