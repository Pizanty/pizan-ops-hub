# Plan: 3 Surgical Fixes

DB schema already exists in Lovable Cloud (briefings, tasks, leads, lead_contacts, dev_items, business_context, user_roles, users, telegram_log all present with RLS). Skipping Step 1 — no migration needed.

## Fix 1 — Dashboard "Generate Briefing" button

File: `src/routes/index.tsx` → `BriefingCard` only.

- Add imports: `useMutation`, `useQueryClient`, `useServerFn`, `generateBriefing`, `Sparkles`, `Loader2`, `toast` (sonner).
- Add a `useMutation` wrapping `useServerFn(generateBriefing)`; on success invalidate `["briefing","latest",userId]` + toast "Briefing generated"; on error toast error message.
- Compute `hasToday = data && new Date(data.generated_at).toDateString() === new Date().toDateString()`.
- Empty state OR `!hasToday`: render a prominent button "Generate Daily Briefing" (Sparkles icon, Loader2 when pending) calling `mutate({ data: { type: "DAILY" }})`.
- Header: add a small "Regenerate" ghost button next to History link, same mutation, disabled while pending.
- Keep all other dashboard cards untouched.

## Fix 2 — WON / LOST modals + onboarding task

Shared helper to avoid duplication: create `src/lib/ptops-stage-actions.tsx` exporting two small controlled dialog components:
- `<WonDialog open lead onOpenChange onDone />` — input "Monthly value (₪)" (number, required). On confirm: update lead `{stage:'WON', monthly_value_nis:value}`, then insert task `{title:"Onboard "+name+" to CaterFlow", domain:"SALES", priority:1, status:"TODO", lead_id, user_id, notes:"New paying customer. Monthly value: ₪"+value+"/mo"}`. Invalidate `leads` + `tasks` queries. Toast "Won! Onboarding task created."
- `<LostDialog open lead onOpenChange onDone />` — Select reason (Price/Timing/Competitor/No Interest/Other). On confirm: update `{stage:'LOST', lost_reason}`. Invalidate `leads`. Toast.

Wire-up:
- `src/routes/crm.tsx` (KanbanBoard): intercept stage changes to WON/LOST — instead of writing immediately, stash pending lead and open the matching dialog. Other stages keep current direct-write path. No DnD behaviour change.
- `src/routes/crm.$id.tsx`: replace existing `markWon` direct call with WonDialog; align existing LOST flow to use LostDialog so behavior matches.

## Fix 3 — Tasks list duplicate bug

File: `src/routes/tasks.tsx`.

- Remove the `rankTasks(data).concat(...)` expression.
- Fetch all tasks once. Build two memoized groups:
  - `active` = filter status ∈ {TODO,IN_PROGRESS,BLOCKED}, sorted via existing `rankTasks` logic (already excludes DONE/ARCHIVED — safe).
  - `completed` = filter status ∈ {DONE,ARCHIVED}, sorted by `completed_at` DESC (nulls last).
- Drive which group renders from the existing status tab filter. Do not modify `rankTasks` in `ptops-logic.ts`.

## Out of scope
Telegram bot, schema changes, restructuring, new screens, RLS edits.
