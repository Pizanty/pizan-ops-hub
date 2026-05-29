# Telegram Integration — Plan

## Current state

- Schema is ready: `users.telegram_chat_id` (bigint, unique) and `telegram_log` table already exist.
- Settings → Telegram lets a user save their chat ID.
- **No Telegram connector linked**, **no webhook route**, **no command handlers** — the bot is non-functional today.
- Briefing generation (`generateBriefing` server fn) already works via Lovable AI Gateway and is reusable for `/brief` and `/weekly`.

## What "working" means (per `09_API_SPEC` + `10_AUTOMATIONS_AND_RULES`)

1. **Connection** — Telegram connector linked to the project so `TELEGRAM_API_KEY` is available server-side.
2. **Webhook receiver** — public endpoint that Telegram POSTs updates to, with secret-token verification.
3. **Command handlers** — `/brief`, `/add`, `/tasks`, `/done`, `/leads`, `/dev`, `/weekly`, `/help`, unknown.
4. **Webhook registered** with Telegram so messages actually arrive.
5. **UX in Settings** — show webhook status + a "Send test message" button.

## Steps

### 1. Link the Telegram connector
Call `standard_connectors--connect` with `connector_id: telegram`. After linking, `TELEGRAM_API_KEY` + `LOVABLE_API_KEY` become available in server runtime; nothing else is needed for sending.

### 2. Public webhook route
Create `src/routes/api/public/telegram/webhook.ts`:
- `POST` handler, no auth middleware (Telegram calls it unauthenticated).
- Verify `X-Telegram-Bot-Api-Secret-Token` header against `sha256("telegram-webhook:" + TELEGRAM_API_KEY)` (base64url), constant-time compare.
- Parse `update.message`. Ignore unknown senders silently: look up `users` row where `telegram_chat_id = message.chat.id`; if none, log to `telegram_log` (direction=`IN`, status=`IGNORED`) and return 200.
- Dispatch on the first whitespace token of `message.text` to a command handler.
- Send reply via gateway `POST https://connector-gateway.lovable.dev/telegram/sendMessage`.
- Log both IN and OUT rows to `telegram_log`.
- Always return 200 (errors become bot messages, per spec).

### 3. Command handlers (server-only helper module)
`src/lib/telegram/commands.server.ts` exporting one function per command, using `supabaseAdmin` scoped by the resolved user_id:

| Command | Behaviour |
|---|---|
| `/help` | Static text listing commands. |
| `/brief` | Get latest `briefings` row (type=DAILY). If older than 8h or none, run the same logic as `generateBriefing` (extracted into a shared `runBriefing(userId, type)` helper). Format `content.summary` + `top_tasks` as plain text. |
| `/weekly` | Same as `/brief` but type=WEEKLY, no staleness check (always regenerate). |
| `/add <text>` | INSERT `tasks` with `title=text`, `priority=3`, `status='TODO'`, `domain` auto-detected via keyword map (A9). Reply with task id + detected domain. |
| `/tasks` | SELECT top 5 by `priority ASC, due_date ASC` WHERE `status != 'DONE'`. Reply as numbered list. |
| `/done <text>` | ILIKE search open tasks. 1 match → UPDATE status='DONE'. Multiple → numbered list. Zero → "not found". |
| `/leads` | Counts by stage + overdue list (`next_action_date <= today`, stage NOT IN WON/LOST/ON_HOLD). |
| `/dev` | S1/S2 unresolved items + milestones. |
| unknown | "Unknown command. Send /help" |

Domain keyword map lives next to the handler so it's easy to tweak.

### 4. Refactor briefing for reuse
Extract the body of `generateBriefing.handler` into `runBriefing(supabase, userId, type)` in `src/lib/api/briefing.server.ts`. The existing server fn stays as a thin wrapper; the Telegram webhook calls it with `supabaseAdmin` + the resolved admin user_id.

### 5. Register the webhook
In build mode, run the sandbox curl from the telegram knowledge file:
- Compute `secret_token = sha256("telegram-webhook:" + TELEGRAM_API_KEY)` (base64url) in Node.
- POST to `https://connector-gateway.lovable.dev/telegram/setWebhook` with `url = https://project--0891c374-4fa6-4eea-891c-4baa1043d222-dev.lovable.app/api/public/telegram/webhook`, `secret_token`, `allowed_updates: ["message","edited_message"]`.
- Verify with `getWebhookInfo`.

(For published, also register the prod URL `https://pto-ops-flow.lovable.app/...` — single bot can only have one webhook, so we use the stable preview URL during dev and switch to prod URL on publish. Decision: register the **published** URL so the live bot points at the published build; preview can be tested via curl.)

→ **Confirm with user**: register webhook against published URL (`pto-ops-flow.lovable.app`) vs preview (`-dev.lovable.app`)? Default: published.

### 6. Settings UX additions (`src/routes/settings.tsx`)
Add to the Telegram section:
- Webhook status pill (calls a new `getTelegramStatus` server fn that hits `getWebhookInfo`) — shows `url`, `pending_update_count`, last error if any.
- "Send test message" button → server fn that sends "PTOPS is connected ✅" to the saved `telegram_chat_id`.
- Small "How to find your chat ID" hint linking to a Telegram bot like `@userinfobot`.

## Technical notes (for me)

- All gateway calls use the standard headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${TELEGRAM_API_KEY}`.
- Reply formatting uses `parse_mode: "HTML"`, escape user-supplied text.
- Webhook handler uses `supabaseAdmin` (RLS bypassed) since Telegram has no Supabase session; user identity comes from `telegram_chat_id` lookup.
- Rate-limit unknown-sender spam by short-circuiting before doing any work.
- No new tables required (schema already covers it).

## Out of scope

- Multi-step conversational state (e.g. waiting for a number reply after `/done` multiple-matches). For v1, just list the matches; user re-issues `/done <more specific text>`.
- Inline buttons / keyboards.
- Per-user Telegram (each end-user connecting their own bot) — this is a single workspace bot for the admin operator.
