// External authenticated API for Claude / other automation.
// Auth: single workspace bearer token (CLAUDE_AGENT_TOKEN). All ops use
// supabaseAdmin (RLS bypassed); the bearer token IS the auth gate.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VALID_ACTIONS } from "@/lib/claude-agent/schemas";
import * as A from "@/lib/claude-agent/actions.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function getAdminUserId(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No admin user found");
  return data.user_id as string;
}

const IDAN_EMAIL = "idanach7972@gmail.com";
async function getIdanUserId(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("users").select("id").eq("email", IDAN_EMAIL).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Idan user not found");
  return data.id as string;
}

// Actions Idan's token is allowed to invoke (dev items only).
const IDAN_ALLOWED_ACTIONS = new Set<string>([
  "list_dev_items",
  "get_dev_item",
  "create_dev_item",
  "update_dev_item",
  "delete_dev_item",
  "list_unblocked",
  "batch",
]);

async function dispatch(action: string, userId: string, params: unknown): Promise<unknown> {
  switch (action) {
    case "get_dashboard": return A.get_dashboard(supabaseAdmin, userId);
    case "list_tasks": return A.list_tasks(supabaseAdmin, userId, params);
    case "get_task": return A.get_task(supabaseAdmin, userId, params);
    case "create_task": return A.create_task(supabaseAdmin, userId, params);
    case "update_task": return A.update_task(supabaseAdmin, userId, params);
    case "delete_task": return A.delete_task(supabaseAdmin, userId, params);
    case "complete_task": return A.complete_task(supabaseAdmin, userId, params);
    case "list_leads": return A.list_leads(supabaseAdmin, userId, params);
    case "get_lead": return A.get_lead(supabaseAdmin, userId, params);
    case "create_lead": return A.create_lead(supabaseAdmin, userId, params);
    case "update_lead": return A.update_lead(supabaseAdmin, userId, params);
    case "delete_lead": return A.delete_lead(supabaseAdmin, userId, params);
    case "log_contact": return A.log_contact(supabaseAdmin, userId, params);
    case "list_contacts": return A.list_contacts(supabaseAdmin, userId, params);
    case "get_lead_contacts": return A.get_lead_contacts(supabaseAdmin, userId, params);
    case "delete_contact": return A.delete_contact(supabaseAdmin, userId, params);
    case "lead_data_quality": return A.lead_data_quality(supabaseAdmin, userId);
    case "get_pipeline_summary": return A.get_pipeline_summary(supabaseAdmin, userId);
    case "list_dev_items": return A.list_dev_items(supabaseAdmin, userId, params);
    case "get_dev_item": return A.get_dev_item(supabaseAdmin, userId, params);
    case "create_dev_item": return A.create_dev_item(supabaseAdmin, userId, params);
    case "update_dev_item": return A.update_dev_item(supabaseAdmin, userId, params);
    case "delete_dev_item": return A.delete_dev_item(supabaseAdmin, userId, params);
    case "list_unblocked": return A.list_unblocked(supabaseAdmin, userId);
    case "get_business_context": return A.get_business_context(supabaseAdmin, userId);
    case "update_business_context": return A.update_business_context(supabaseAdmin, userId, params);
    case "set_business_context": return A.set_business_context(supabaseAdmin, userId, params);
    case "append_business_context": return A.append_business_context(supabaseAdmin, userId, params);
    case "clear_business_context_key": return A.clear_business_context_key(supabaseAdmin, userId, params);
    case "delete_business_context_key": return A.delete_business_context_key(supabaseAdmin, userId, params);
    case "list_attachments": return A.list_attachments(supabaseAdmin, userId, params);
    case "get_attachment": return A.get_attachment(supabaseAdmin, userId, params);
    case "upload_attachment": return A.upload_attachment(supabaseAdmin, userId, params);
    case "delete_attachment": return A.delete_attachment(supabaseAdmin, userId, params);
    case "list_task_stages": return A.list_task_stages(supabaseAdmin, userId, params);
    case "add_task_stage": return A.add_task_stage(supabaseAdmin, userId, params);
    case "update_task_stage": return A.update_task_stage(supabaseAdmin, userId, params);
    case "delete_task_stage": return A.delete_task_stage(supabaseAdmin, userId, params);
    case "reorder_task_stages": return A.reorder_task_stages(supabaseAdmin, userId, params);
    case "set_task_stages": return A.set_task_stages(supabaseAdmin, userId, params);
    case "batch": {
      const parsed = (await import("@/lib/claude-agent/schemas")).Schemas.batch.parse(params);
      const results: Array<{ ok: boolean; action: string; data?: unknown; error?: string }> = [];
      for (const op of parsed.operations) {
        if (op.action === "batch") {
          results.push({ ok: false, action: op.action, error: "Nested batch not allowed" });
          continue;
        }
        if (!(VALID_ACTIONS as readonly string[]).includes(op.action)) {
          results.push({ ok: false, action: op.action, error: `Unknown action: ${op.action}` });
          continue;
        }
        try {
          const data = await dispatch(op.action, userId, op.params ?? {});
          results.push({ ok: true, action: op.action, data });
        } catch (e) {
          results.push({ ok: false, action: op.action, error: A.err(e, "Operation failed") });
        }
      }
      return { results };
    }
    default:
      throw new Error(
        `Unknown action: ${action}. Valid actions are: ${VALID_ACTIONS.join(", ")}`,
      );
  }
}

export const Route = createFileRoute("/api/public/claude-agent")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 200, headers: CORS }),
      GET: async () =>
        json({
          ok: true,
          endpoint: "/api/public/claude-agent",
          methods: ["POST"],
          canonical_url: "https://ops.pizantech.com/api/public/claude-agent",
          note: "POST { action, params } with Bearer CLAUDE_AGENT_TOKEN. Always follow 3xx redirects — *.lovable.app may 302 to the custom domain.",
          valid_actions: VALID_ACTIONS,
        }),
      POST: async ({ request }) => {
        const adminToken = process.env.CLAUDE_AGENT_TOKEN;
        const idanToken = process.env.IDAN_AGENT_TOKEN;
        if (!adminToken) {
          return json({ ok: false, error: "Server misconfigured: CLAUDE_AGENT_TOKEN not set" }, 500);
        }
        const auth = request.headers.get("authorization") ?? "";
        const m = auth.match(/^Bearer\s+(.+)$/i);
        const presented = m?.[1];
        let principal: "admin" | "idan" | null = null;
        if (presented && timingSafeEq(presented, adminToken)) principal = "admin";
        else if (presented && idanToken && timingSafeEq(presented, idanToken)) principal = "idan";
        if (!principal) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: { action?: string; params?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" });
        }
        const action = body?.action;
        if (!action || typeof action !== "string") {
          return json({ ok: false, error: "Missing 'action' field" });
        }

        // Idan's token: restrict to dev_items allowlist (incl. nested batch ops).
        if (principal === "idan") {
          if (!IDAN_ALLOWED_ACTIONS.has(action)) {
            return json({ ok: false, error: `Forbidden: action '${action}' not allowed for this token` }, 403);
          }
          if (action === "batch") {
            const ops = (body.params as { operations?: Array<{ action?: string }> })?.operations ?? [];
            for (const op of ops) {
              if (!op.action || !IDAN_ALLOWED_ACTIONS.has(op.action) || op.action === "batch") {
                return json({ ok: false, error: `Forbidden: batch action '${op.action}' not allowed for this token` }, 403);
              }
            }
          }
        }

        try {
          const userId = principal === "idan" ? await getIdanUserId() : await getAdminUserId();

          // For Idan's token: enforce ownership on dev_item mutations.
          // He can only update/delete dev_items he created.
          if (principal === "idan") {
            const mutating = ["update_dev_item", "delete_dev_item"];
            const opsToCheck: Array<{ action: string; params?: unknown }> =
              action === "batch"
                ? ((body.params as { operations?: Array<{ action: string; params?: unknown }> })?.operations ?? [])
                : [{ action, params: body.params }];
            for (const op of opsToCheck) {
              if (!mutating.includes(op.action)) continue;
              const targetId = (op.params as { id?: string } | undefined)?.id;
              if (!targetId) continue; // schema validation will catch it later
              const { data: row, error: ownErr } = await supabaseAdmin
                .from("dev_items").select("created_by").eq("id", targetId).maybeSingle();
              if (ownErr) return json({ ok: false, error: ownErr.message }, 500);
              if (!row) return json({ ok: false, error: `Dev item ${targetId} not found` }, 404);
              if (row.created_by !== userId) {
                return json({ ok: false, error: `Forbidden: dev_item ${targetId} is not owned by this token's user` }, 403);
              }
            }
          }

          const data = await dispatch(action, userId, body.params ?? {});
          return json({ ok: true, data });
        } catch (e: unknown) {
          const message = A.err(e, "Unknown error");
          if (message.startsWith("Unknown action:")) return json({ ok: false, error: message });
          return json({ ok: false, error: message });
        }
      },
    },
  },
});
