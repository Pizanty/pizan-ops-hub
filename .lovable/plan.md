# PTOPS Build Plan

Internal ops dashboard for PizanTech. Frontend only — Edge Functions (`generate-briefing`, `telegram-webhook`) are deployed separately and called via HTTP.

## Stack notes (important deviations from your brief)

This Lovable project uses **TanStack Start** (file-based routing under `src/routes/`), not React Router DOM. Same URLs, same behavior — only the routing implementation differs:
- `/tasks/:id` → `src/routes/tasks.$id.tsx`
- Route guards via `_authenticated` and `_admin` pathless layout routes (`beforeLoad` redirects).
- Data fetching: **TanStack Query** + Supabase client SDK (already in the template stack).
- UI: shadcn/ui + Tailwind, all components present.

## Supabase wiring

Your spec says Supabase is already provisioned externally and you'll supply `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The Lovable preview doesn't accept arbitrary env vars from the chat — it injects them when **Lovable Cloud** is enabled, which creates a managed Supabase project.

Two paths (need your call — see question after this plan):
- **A. Lovable Cloud**: I enable it, you migrate your existing schema (tables, RLS, triggers) into the new project via SQL editor. Cleanest for in-preview iteration.
- **B. Your existing Supabase**: I hardcode the URL + anon key into `src/integrations/supabase/client.ts` (anon key is public, safe to commit). You paste them when we start build.

Everything else below is identical for both paths.

## Build order

### 1. Foundation
- `src/integrations/supabase/client.ts` — browser Supabase client (`persistSession: true`, `autoRefreshToken: true`).
- `src/hooks/use-auth.ts` — session + `users.role` lookup, exposed via router context.
- `src/lib/types.ts` — TS types for all 9 tables.
- Design tokens in `src/styles.css`: dark neutral theme (#0a0a0a bg, subtle borders, JetBrains Mono for IDs/timestamps), domain/severity/priority badge tokens.
- `QueryClientProvider` + `Toaster` (sonner) in `__root.tsx`.

### 2. Auth + route guards
- `src/routes/login.tsx` — email/password form, redirect by role on success.
- `src/routes/_authenticated.tsx` — `beforeLoad` redirects to `/login` if no session.
- `src/routes/_authenticated/_admin.tsx` — `beforeLoad` redirects developers to `/dev`.
- Developer-accessible routes live directly under `_authenticated`; everything else nests under `_admin`.

### 3. Sidebar shell
`src/components/app-sidebar.tsx` using shadcn `Sidebar`. Items: Dashboard, Tasks, CRM, Dev Tracker, Briefings, Context, Reports, Settings. Active highlight via `useRouterState`. User email + role badge + logout at bottom. Collapses on mobile.

### 4. P0 screens

**`/` Dashboard** (`_admin/index.tsx`)
- Briefing card: queries today's `briefings` where `type='DAILY'`. If absent → "Generate Daily Briefing" button → POSTs to `${SUPABASE_URL}/functions/v1/generate-briefing` with `{type:'DAILY'}` and bearer JWT. On success: invalidate briefings query.
- Top 3 tasks (order by `ai_rank` nulls last, `priority`). Mark Done mutates `status='DONE'`, `completed_at=now()`.
- CRM summary: stage counts + red overdue count.
- Dev Status: S1/S2 open counts, next milestone with day-remaining color logic (amber <14, red <7).
- Weekly completion meter (done this week / created this week).
- Generate Weekly Briefing button + Add Task button (opens shared task sheet).

**`/tasks`** + **`/tasks/$id`**
- Table with status tabs, domain/priority/date/text filters, sortable columns.
- Domain badges: SALES=blue, PRODUCT=purple, OPS=amber, STRATEGY=green.
- Priority display: 1🔴 2🟠 3🟡 4🔵 5⚪.
- Row actions: Edit (slide-over Sheet), Mark Done, Archive, Delete (AlertDialog).
- Detail page: inline edit all fields, link to lead, Reopen clears `completed_at`.

**`/crm`** + **`/crm/$id`**
- Kanban with 8 columns, drag-drop via `@dnd-kit/core` (already used elsewhere — will add if missing). WON header green tint, LOST red tint.
- Cards: name, business, days in stage, next action, next action date (red if ≤ today).
- Filter bar: source, overdue toggle, search. Export CSV via in-browser blob.
- WON transition: modal for `monthly_value_nis`, then update lead + insert onboarding task (SALES, P1, TODO, lead_id linked).
- LOST transition: modal for `lost_reason` enum.
- Lead detail: header info, Log Contact modal (inserts `lead_contacts`), Mark Won/Lost, next-action editor, timeline (contacts + inferred stage events), notes autosave on blur, linked tasks list.

**`/dev`** + **`/dev/$id`**
- Status columns OPEN/IN_PROGRESS/BLOCKED/RESOLVED.
- Milestone banner at top when any `is_milestone=true && status != RESOLVED`.
- Type/severity/assignee filters. Severity badges S1=red, S2=orange, S3=yellow (only for BUG).
- Admin: create/edit/resolve/won't-fix. Developer: status + notes only on own items.
- Detail page: update log from `dev_item_updates` ordered DESC.

### 5. P1 screens

**`/briefing`** — list `briefings` DESC; expandable rows render same briefing card component as dashboard; delete per row; trigger buttons at top.

**`/context`** — form with 9 keys. Load via `select * from business_context where user_id=auth.uid()`. "Save All" upserts via single `.upsert(rows, {onConflict:'user_id,key'})`. Show latest `updated_at`.

**`/reports`** — Tabs (Tasks / CRM / Dev). All charts via Recharts (already a shadcn dep). CSV export via blob download. KPI cards for MRR, avg days to win, S1/S2 avg resolution time.

**`/settings`** — Telegram registration display + clear, API status indicators (static "Configured"), users table with role dropdown + invite (`supabase.auth.admin.inviteUserByEmail` requires service role — fallback: standard `signUp` invite or note this requires Edge Function; I'll implement as documented + disabled button with tooltip if service role isn't reachable). Danger Zone: Archive All Done, Export All Data (JSON of user's rows).

## Global behaviors
- All queries: `.eq('user_id', user.id)` defensively even with RLS.
- Destructive actions: shadcn `AlertDialog` confirm.
- Empty states with CTA for every list.
- Skeleton loaders during fetch.
- Errors → sonner toast.
- Mobile: sidebar → hamburger Sheet, tables → card stacks at `md` breakpoint.

## Out of scope (per your brief)
Edge Functions, payment/billing, OAuth, onboarding wizard.

---

**One question before I start** (will ask via ask_questions on approve):
Lovable Cloud (managed Supabase, requires migrating your schema) or hardcoded existing project URL + anon key?