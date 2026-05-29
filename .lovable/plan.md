# Replace Side Sheets with Glass Modal Dialogs

Convert every non-navigation `Sheet` in the app to a centered, glass-style `Dialog`. Sidebars stay only for navigation (`app-shell`, shadcn `sidebar.tsx`).

## Scope (6 sheets, all object management)

| File | Current sheet | Becomes |
|---|---|---|
| `src/routes/tasks.tsx` | `TaskSheet` (create) | `TaskDialog` |
| `src/routes/tasks.$id.tsx` | Edit task sheet | Edit task dialog |
| `src/routes/crm.tsx` | `LeadSheet` (create) | `LeadDialog` |
| `src/routes/crm.$id.tsx` | Lead detail sheet | Lead detail dialog |
| `src/routes/dev.tsx` | `DevSheet` (create) | `DevDialog` |
| `src/routes/dev.$id.tsx` | Dev item detail sheet | Dev item detail dialog |

No changes to: `src/components/app-shell.tsx`, `src/components/ui/sidebar.tsx`, navigation.

## Visual style — "Large glass-style modal"

A new reusable `GlassDialogContent` wrapper around shadcn `DialogContent`:

- Width: `max-w-2xl` (default) / `max-w-3xl` for detail views (CRM lead, dev item)
- Max height: `max-h-[85vh]` with internal scroll on body
- Backdrop: heavier blur + darker overlay (override `DialogOverlay` via className)
- Surface:
  - `bg-card/70 backdrop-blur-xl backdrop-saturate-150`
  - `border border-white/10`
  - Top hairline: `before:` pseudo with `bg-gradient-primary` (matches sidebar active indicator)
  - `shadow-elegant` + subtle `shadow-glow` ring
  - `rounded-xl`
- Header: title in Sora, optional badge/subtitle row; sticky on scroll
- Footer: right-aligned actions, divider above (`border-t border-white/10`)
- Uses existing Midnight Indigo tokens from `src/styles.css` — no new colors

## Implementation steps

1. **Add `GlassDialogContent` component** at `src/components/ui/glass-dialog.tsx` — thin wrapper exporting `GlassDialog`, `GlassDialogContent`, `GlassDialogHeader`, `GlassDialogTitle`, `GlassDialogFooter`. Re-exports shadcn `Dialog`, `DialogTrigger`, etc. Centralizes the glass styling so every modal is consistent.

2. **Convert each route** (mechanical swap):
   - Replace `Sheet/SheetContent/SheetHeader/SheetTitle` imports with the glass equivalents.
   - Keep all existing form logic, mutations, and validation untouched.
   - For detail routes (`tasks.$id`, `crm.$id`, `dev.$id`) keep the "close → navigate to list" behavior on `onOpenChange`.
   - Wrap form body in a scrollable div; move primary/secondary buttons into `GlassDialogFooter`.

3. **Polish per route**:
   - `crm.$id.tsx`: keep stage badge next to title; the WON/LOST sub-dialogs already exist and continue to work (Dialog over Dialog is fine).
   - `tasks.tsx`: ensure the new dialog still opens from the "New task" button and from edit affordances.
   - No layout shift on open (overlay handles scroll lock via shadcn defaults).

## Out of scope

- Navigation sidebar and its collapse behavior
- Confirm dialogs (already `AlertDialog`)
- WON/LOST stage dialogs (already dialogs)
- Any business logic, queries, or server functions

## Verification

- Build passes (typecheck strict).
- Open each route, trigger create + detail flows, confirm: modal centers, glass effect visible, form submit + close behavior unchanged, ESC + backdrop click close, no horizontal scroll, content scrolls internally when tall.
