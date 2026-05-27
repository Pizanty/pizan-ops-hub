import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BriefingContent } from "../ptops-types";

const InputSchema = z.object({ type: z.enum(["DAILY", "WEEKLY"]).default("DAILY") });

export const generateBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [tasksRes, leadsRes, devRes, ctxRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,domain,priority,status,due_date,ai_rank,lead_id")
        .neq("status", "ARCHIVED")
        .order("priority", { ascending: true })
        .limit(200),
      supabase
        .from("leads")
        .select("id,name,stage,next_action,next_action_date,monthly_value_nis")
        .limit(200),
      supabase
        .from("dev_items")
        .select("id,title,type,severity,status,target_date,is_milestone")
        .neq("status", "RESOLVED")
        .neq("status", "WONT_FIX")
        .limit(100),
      supabase.from("business_context").select("key,value").limit(50),
    ]);

    const tasks = tasksRes.data ?? [];
    const leads = leadsRes.data ?? [];
    const devItems = devRes.data ?? [];
    const ctx = Object.fromEntries(
      (ctxRes.data ?? []).map((r) => [r.key as string, r.value as string | null]),
    );

    const apiKey = process.env.LOVABLE_API_KEY;
    let content: BriefingContent;

    if (!apiKey) {
      // Deterministic fallback when AI key is missing
      const openTasks = tasks
        .filter((t) => t.status !== "DONE")
        .sort(
          (a, b) =>
            (a.ai_rank ?? 999) - (b.ai_rank ?? 999) || (a.priority ?? 5) - (b.priority ?? 5),
        )
        .slice(0, 3);
      content = {
        summary: `${data.type} briefing (fallback): ${openTasks.length} priority tasks, ${leads.length} leads, ${devItems.length} open dev items.`,
        top_tasks: openTasks.map((t, i) => ({
          task_id: t.id,
          title: t.title,
          rank: i + 1,
          reasoning: "Highest priority open task",
        })),
        skip_today: "",
        lead_to_contact: null,
        risk_flag: null,
      };
    } else {
      const systemPrompt = `You are a sharp operator's briefing AI for a solo founder running a SaaS business (PTOPS). Output STRICT JSON only matching the schema. Be terse, specific, and prioritize action. Israeli market context (NIS currency).`;
      const userPrompt = `Generate a ${data.type} briefing.

BUSINESS CONTEXT:
${JSON.stringify(ctx, null, 2)}

OPEN TASKS (${tasks.length}):
${JSON.stringify(tasks.slice(0, 50), null, 2)}

LEADS (${leads.length}):
${JSON.stringify(leads.slice(0, 50), null, 2)}

OPEN DEV ITEMS (${devItems.length}):
${JSON.stringify(devItems.slice(0, 30), null, 2)}

Today: ${new Date().toISOString().slice(0, 10)}

Return JSON: { summary, top_tasks:[{task_id,title,rank,reasoning}] (max 3), skip_today, lead_to_contact:{lead_id,name,reason}|null, risk_flag:string|null${data.type === "WEEKLY" ? ", wins:[], losses:[], next_week_focus" : ""} }`;

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`AI gateway error ${resp.status}: ${txt.slice(0, 200)}`);
      }
      const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      try {
        content = JSON.parse(raw) as BriefingContent;
      } catch {
        content = { summary: raw.slice(0, 500) };
      }
    }

    const { data: inserted, error } = await supabase
      .from("briefings")
      .insert({
        user_id: userId,
        type: data.type,
        content: content as never,
        tasks_snapshot: tasks as never,
        leads_snapshot: leads as never,
        dev_snapshot: devItems as never,
        context_snapshot: ctx as never,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });
