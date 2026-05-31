# Mobile UX overhaul

The desktop sidebar is hidden below `md` (`hidden md:flex`) with no replacement — there is currently **no way to navigate on mobile**. On top of that, page paddings, tables, filters, and dialogs are sized for desktop.

## Scope (frontend / presentation only)

No business logic, no data, no API changes.

## 1. Mobile navigation shell (`src/components/app-shell.tsx`)

- Add a **top app bar** visible only on `<md`: brand on the left, hamburger button on the right (and a theme toggle).
- Hamburger opens an off-canvas **Sheet** (left side) containing the existing grouped nav + user/sign-out block — reuse the same `nav` array so admin/dev role filtering stays identical.
- Auto-close the sheet on route change (`useRouterState` pathname effect).
- Keep the existing desktop sidebar untouched (`hidden md:flex`).
- Add a `pt-14 md:pt-0` to `<main>` so content clears the fixed top bar.
- Add `safe-area` padding (`pb-[env(safe-area-inset-bottom)]`) on the sheet footer.

## 2. PageHeader + page padding

- `PageHeader`: `px-8 py-6` → `px-4 py-4 md:px-8 md:py-6`. Stack title and actions vertically on mobile (`flex-col items-start md:flex-row md:items-end`). Action buttons get `w-full sm:w-auto` where it makes sense.
- All route content wrappers: `p-6` → `p-4 md:p-6`.

## 3. Tasks page (`src/routes/tasks.tsx`)

- Filters: selects `w-40` → `flex-1 min-w-[140px] md:w-40` so they don't overflow.
- Replace the desktop table with a **responsive dual view**:
  - `<md`: card list — each task is a tappable card with title, badges row (domain · P# · status), due date, and a "Done" + delete action row with `min-h-11` tap targets.
  - `≥md`: keep the existing table inside `overflow-x-auto`.
- "New task" header button shrinks to icon-only on mobile (`<Plus/>` with `aria-label`).

## 4. CRM page (`src/routes/crm.tsx`)

- Kanban is already 1-col on mobile. Tighten card padding and ensure each card has `min-h-14` tap area.
- Convert the long stage strip into a **horizontal scroll snap** on mobile (`flex overflow-x-auto snap-x` with `w-[80vw] snap-start` columns) so users can swipe through stages instead of an endless vertical stack. Keep the grid layout from `md` up.

## 5. Dashboard (`src/routes/index.tsx`)

- Grid is already `lg:grid-cols-3`. Verify card internals: 
  - `BriefingCard` header — stack title/actions on mobile.
  - `WeeklyMeterCard` `flex items-end` → `flex-col sm:flex-row` so the bar doesn't squeeze.
  - Reduce inner padding `p-5` → `p-4 md:p-5`.

## 6. Dev tracker (`src/routes/dev.tsx`), Briefing, Context, Reports, Settings

- Apply the same table→card pattern where tables exist (`overflow-x-auto` fallback at minimum).
- Apply padding / header tweaks consistently.

## 7. Dialogs (`GlassDialog`)

- Verify content is scrollable on short viewports: `max-h-[85dvh] overflow-y-auto` on the body, full-width on mobile (`w-[calc(100vw-1rem)] sm:max-w-lg`).
- Form grids `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` so labels/inputs don't get clipped.

## 8. Login page

- Quick pass: center card with `w-[calc(100vw-2rem)] max-w-sm`, padding tuned for mobile.

## Out of scope

- No new routes, no router changes, no schema or server-function changes, no Claude-agent changes.
- No design-system token edits (colors stay as-is).

## Verification

- Resize to 390×844, 360×800, 414×896: check nav opens/closes, no horizontal scroll, all primary actions reachable with thumb, dialogs scrollable.
- `≥md`: visual diff should be effectively zero (paddings change at the breakpoint, sidebar unchanged).
