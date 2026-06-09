# Task Stage Checklists

Add a per-task ordered checklist of "stages" (sub-steps the user works through and checks off). Same model across all domains. Available in the web UI and via the Claude Agent API.

## Data model

New table `public.task_stages`:

- `id uuid pk`
- `task_id uuid fk → tasks(id) on delete cascade`
- `user_id uuid` (owner, mirrors `tasks.user_id` for RLS)
- `label text not null`
- `position int not null` (ordering)
- `done bool not null default false`
- `done_at timestamptz`
- `created_at`, `updated_at`

RLS: user can manage stages where `user_id = auth.uid()`. GRANTs to `authenticated` + `service_role`. Trigger: when `done` flips true set `done_at = now()`, flips false → null.

Derived helpers (computed in app/API, not stored):
- `stage_count`, `stages_done`, `progress_pct`
- `current_stage`: first stage with `done=false` ordered by `position`

## Claude Agent API

New actions in `src/lib/claude-agent/{schemas,actions.server}.ts` and dispatcher:

- `list_task_stages { task_id }` → ordered stages
- `add_task_stage { task_id, label, position? }` → appends (or inserts at position)
- `update_task_stage { id, label?, position?, done? }`
- `delete_task_stage { id }`
- `reorder_task_stages { task_id, ordered_ids: string[] }` → bulk set positions
- `set_task_stages { task_id, labels: string[] }` → replace whole checklist (convenience)

Enrich existing payloads:
- `get_task` / `list_tasks` items gain `stage_count`, `stages_done`, `progress_pct`, `current_stage`
- `get_dashboard` task entries include the same summary fields
- `create_task` accepts optional `stages: string[]` to seed the checklist
- Update `/mnt/documents/claude-api-summary.md` with the new actions

## Web UI

- `src/components/task-stages-panel.tsx`: ordered checklist with add row, inline-edit label, checkbox to toggle done, drag handle (dnd-kit if installed, otherwise up/down arrow buttons to keep scope tight), delete button, progress bar header (`X / Y · Z%`).
- Embed the panel inside `src/routes/tasks.$id.tsx` next to AttachmentsPanel.
- On the tasks list (`src/routes/tasks.tsx`): show a compact progress indicator (e.g. `3/5`) and `current_stage` label when present.
- Auto-complete behavior (opt-in, documented): toggling the last remaining stage to done does NOT auto-set task status — keep status independent so the user/agent decide.

## Types

Add to `src/lib/ptops-types.ts`:

```ts
export interface TaskStage {
  id: string;
  task_id: string;
  user_id: string;
  label: string;
  position: number;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}
```

## Files touched

- new migration: `task_stages` table + RLS + grants + done_at trigger
- new: `src/components/task-stages-panel.tsx`
- edit: `src/lib/ptops-types.ts`
- edit: `src/lib/claude-agent/schemas.ts`, `actions.server.ts`
- edit: `src/routes/api/public/claude-agent.ts`
- edit: `src/routes/tasks.$id.tsx`, `src/routes/tasks.tsx`
- edit: `/mnt/documents/claude-api-summary.md`

## Open question (optional, default = no)

When all stages are done, should task `status` auto-flip to `DONE`? Default plan: **no** (keep independent). Tell me if you want auto-complete instead.
