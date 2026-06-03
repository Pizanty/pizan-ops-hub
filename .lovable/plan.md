## Goal
Add file attachments to **tasks** and **dev_items**, with upload + download available both via the web UI (you) and via the Claude Agent API (Claude).

## Architecture

### 1. Storage
- New private Supabase Storage bucket: **`attachments`** (created via `storage_create_bucket`, public=false).
- Object path convention: `{entity_type}/{entity_id}/{attachment_id}-{filename}` where `entity_type ∈ {task, dev_item}`. This makes per-entity listing/cleanup trivial.
- Max size enforced in API: 25 MB per file (configurable constant).

### 2. Database
New table `public.attachments`:
- `id uuid pk`, `user_id uuid` (uploader), `entity_type text check in ('task','dev_item')`, `entity_id uuid`, `bucket text default 'attachments'`, `storage_path text`, `filename text`, `mime_type text`, `size_bytes bigint`, `created_at timestamptz`.
- Index on `(entity_type, entity_id)`.
- RLS: admin/developer can select/insert/delete their workspace's rows (mirrors existing tasks/dev_items policy style). `service_role` full access (used by Claude API + signed URLs).
- Storage RLS on `storage.objects` for bucket `attachments`: authenticated users can read/write; service_role bypasses.

### 3. Web UI (you)
- Reusable `<AttachmentsPanel entityType entityId />` component used in:
  - `src/routes/tasks.$id.tsx`
  - `src/routes/dev.$id.tsx`
- Features: drag-and-drop / file picker upload, list with filename + size + uploader + date, download (opens signed URL), delete (with confirm).
- Uses `supabase.storage.from('attachments').upload(...)` + insert row, all under the user's session (RLS-scoped).

### 4. Claude Agent API
New actions in `src/lib/claude-agent/actions.server.ts` + `schemas.ts` + dispatcher:

| Action | Params | Returns |
|---|---|---|
| `list_attachments` | `{ entity_type, entity_id }` | array of attachment rows (with `download_url` signed for 1h) |
| `get_attachment` | `{ id }` | row + signed `download_url` |
| `upload_attachment` | `{ entity_type, entity_id, filename, mime_type, content_base64 }` | created row + signed `download_url` |
| `delete_attachment` | `{ id }` | `{ deleted: true, id }` |

- `upload_attachment` decodes base64, enforces 25 MB limit, validates entity exists, uploads via `supabaseAdmin.storage`, inserts row.
- `delete_attachment` removes storage object then row.
- All added to `VALID_ACTIONS`, work inside `batch`.
- `get_dashboard` / `get_task` / `get_dev_item` enriched with `attachment_count` (cheap count query), so Claude knows when to fetch.

### 5. API summary doc
Update `/mnt/documents/claude-api-summary.md` with the 4 new actions, base64 upload example, and the 1h signed-URL note.

## Files to touch
- **Migration**: create `attachments` table + RLS + indexes.
- **Storage**: create `attachments` bucket (private) + storage.objects RLS.
- **Backend**: `src/lib/claude-agent/schemas.ts`, `src/lib/claude-agent/actions.server.ts`, `src/routes/api/public/claude-agent.ts`, `src/lib/ptops-types.ts` (add `Attachment` type).
- **Frontend**: new `src/components/attachments-panel.tsx`; mount in `src/routes/tasks.$id.tsx` and `src/routes/dev.$id.tsx`.
- **Doc**: regenerate `/mnt/documents/claude-api-summary.md`.

## Out of scope
- Inline image previews beyond a simple thumbnail for `image/*`.
- Attachments on leads or contacts (easy to extend later by adding `'lead'` to the enum).
- Virus scanning, versioning, multi-file zip download.
- Per-attachment ACLs beyond workspace-wide.

## Open question
**Default size limit: 25 MB OK, or do you want larger (e.g. 100 MB)?** Anything above ~50 MB will require Claude to use direct-to-storage signed-URL uploads instead of base64 in the JSON body — let me know and I'll add a `create_attachment_upload_url` action for that flow too.
