import type { SupabaseClient } from "@supabase/supabase-js";
import { Schemas } from "./schemas";

type SB = SupabaseClient;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekUTC(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return monday.toISOString();
}

function err(e: unknown, fallback = "Database error"): string {
  if (!e) return fallback;
  if (typeof e === "object" && e !== null && "message" in e) return String((e as any).message);
  return fallback;
}

// ---------- DASHBOARD ----------
export async function get_dashboard(sb: SB, userId: string) {
  const weekStart = startOfWeekUTC();
  const t = today();

  const [tasksR, leadsR, devR, ctxR, briefR, weekDoneR, weekCreatedR] = await Promise.all([
    sb.from("tasks").select("id,title,domain,priority,status,due_date,notes,ai_rank,lead_id,created_at,completed_at")
      .eq("user_id", userId).neq("status", "ARCHIVED"),
    sb.from("leads").select("id,name,business_name,phone,stage,next_action,next_action_date,monthly_value_nis,source,created_at")
      .eq("user_id", userId),
    sb.from("dev_items").select("id,title,type,severity,status,target_date,is_milestone,assigned_to")
      .not("status", "in", "(RESOLVED,WONT_FIX)"),
    sb.from("business_context").select("key,value").eq("user_id", userId),
    sb.from("briefings").select("id,content,generated_at").eq("user_id", userId).eq("type", "DAILY")
      .order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("completed_at", weekStart),
    sb.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", weekStart),
  ]);

  if (tasksR.error) throw tasksR.error;
  if (leadsR.error) throw leadsR.error;
  if (devR.error) throw devR.error;
  if (ctxR.error) throw ctxR.error;

  const leads = leadsR.data ?? [];
  const overdue_leads = leads.filter(
    (l: any) => l.next_action_date && l.next_action_date < t && !["WON", "LOST", "ON_HOLD"].includes(l.stage),
  ).length;
  const mrr_nis = leads.filter((l: any) => l.stage === "WON")
    .reduce((s: number, l: any) => s + Number(l.monthly_value_nis ?? 0), 0);

  return {
    tasks: tasksR.data ?? [],
    leads,
    dev_items: devR.data ?? [],
    business_context: ctxR.data ?? [],
    latest_briefing: briefR.data ?? null,
    weekly_completion: { done: weekDoneR.count ?? 0, created: weekCreatedR.count ?? 0 },
    overdue_leads,
    mrr_nis,
  };
}

// ---------- TASKS ----------
export async function list_tasks(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.list_tasks.parse(raw ?? {});
  let q = sb.from("tasks").select("*").eq("user_id", userId);
  if (p.status) q = q.eq("status", p.status);
  if (p.domain) q = q.eq("domain", p.domain);
  if (p.priority != null) q = q.eq("priority", p.priority);
  q = q.order("priority", { ascending: true }).order("due_date", { ascending: true, nullsFirst: false }).limit(p.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function get_task(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.get_task.parse(raw);
  const { data, error } = await sb.from("tasks").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Task not found");
  return data;
}

export async function create_task(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.create_task.parse(raw);
  const { data, error } = await sb.from("tasks").insert({ ...p, user_id: userId }).select("*").single();
  if (error) throw error;
  return data;
}

export async function update_task(sb: SB, userId: string, raw: unknown) {
  const { id, ...rest } = Schemas.update_task.parse(raw);
  const { data, error } = await sb.from("tasks").update(rest).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

export async function delete_task(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.delete_task.parse(raw);
  const { error } = await sb.from("tasks").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { deleted: true };
}

export async function complete_task(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.complete_task.parse(raw);
  const { data, error } = await sb.from("tasks").update({ status: "DONE" }).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

// ---------- LEADS ----------
export async function list_leads(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.list_leads.parse(raw ?? {});
  let q = sb.from("leads").select("*").eq("user_id", userId);
  if (p.stage) q = q.eq("stage", p.stage);
  if (p.source) q = q.eq("source", p.source);
  if (p.overdue_only) q = q.lt("next_action_date", today()).not("stage", "in", "(WON,LOST,ON_HOLD)");
  q = q.order("updated_at", { ascending: false }).limit(p.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function get_lead(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.get_lead.parse(raw);
  const [leadR, contactsR] = await Promise.all([
    sb.from("leads").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
    sb.from("lead_contacts").select("*").eq("lead_id", id).order("contact_date", { ascending: false }),
  ]);
  if (leadR.error) throw leadR.error;
  if (!leadR.data) throw new Error("Lead not found");
  if (contactsR.error) throw contactsR.error;
  return { ...leadR.data, contacts: contactsR.data ?? [] };
}

export async function create_lead(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.create_lead.parse(raw);
  const { data, error } = await sb.from("leads").insert({ ...p, user_id: userId }).select("*").single();
  if (error) throw error;
  return data;
}

export async function update_lead(sb: SB, userId: string, raw: unknown) {
  const { id, ...rest } = Schemas.update_lead.parse(raw);
  const { data: lead, error } = await sb.from("leads").update(rest).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) throw error;

  let onboardTask: unknown = null;
  if (rest.stage === "WON" && rest.monthly_value_nis != null) {
    const { data: t, error: tErr } = await sb.from("tasks").insert({
      title: `Onboard ${lead.name} to CaterFlow`,
      domain: "SALES",
      priority: 1,
      status: "TODO",
      lead_id: lead.id,
      notes: `New paying customer. Monthly value: ₪${rest.monthly_value_nis}/mo`,
      user_id: userId,
    }).select("*").single();
    if (tErr) throw tErr;
    onboardTask = t;
  }
  return { lead, task: onboardTask };
}

export async function log_contact(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.log_contact.parse(raw);
  const { data, error } = await sb.from("lead_contacts").insert({
    lead_id: p.lead_id,
    method: p.method,
    summary: p.summary,
    contact_date: p.contact_date ?? today(),
    user_id: userId,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function get_pipeline_summary(sb: SB, userId: string) {
  const { data: leads, error } = await sb.from("leads")
    .select("id,name,stage,next_action,next_action_date,monthly_value_nis").eq("user_id", userId);
  if (error) throw error;
  const t = today();
  const stages: Record<string, number> = {};
  let mrr = 0;
  const overdue: any[] = [];
  for (const l of leads ?? []) {
    stages[l.stage] = (stages[l.stage] ?? 0) + 1;
    if (l.stage === "WON") mrr += Number(l.monthly_value_nis ?? 0);
    if (l.next_action_date && l.next_action_date < t && !["WON", "LOST", "ON_HOLD"].includes(l.stage)) {
      overdue.push({ id: l.id, name: l.name, next_action: l.next_action, next_action_date: l.next_action_date, stage: l.stage });
    }
  }
  return { stages, mrr_nis: mrr, total_leads: leads?.length ?? 0, overdue };
}

// ---------- DEV ITEMS ----------
export async function list_dev_items(sb: SB, _userId: string, raw: unknown) {
  const p = Schemas.list_dev_items.parse(raw ?? {});
  let q = sb.from("dev_items").select("*");
  if (p.type) q = q.eq("type", p.type);
  if (p.severity) q = q.eq("severity", p.severity);
  if (p.status) q = q.eq("status", p.status);
  if (p.open_only) q = q.not("status", "in", "(RESOLVED,WONT_FIX)");
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function get_dev_item(sb: SB, _userId: string, raw: unknown) {
  const { id } = Schemas.get_dev_item.parse(raw);
  const [itemR, updatesR] = await Promise.all([
    sb.from("dev_items").select("*").eq("id", id).maybeSingle(),
    sb.from("dev_item_updates").select("*").eq("dev_item_id", id).order("created_at", { ascending: false }),
  ]);
  if (itemR.error) throw itemR.error;
  if (!itemR.data) throw new Error("Dev item not found");
  if (updatesR.error) throw updatesR.error;
  return { ...itemR.data, updates: updatesR.data ?? [] };
}

export async function create_dev_item(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.create_dev_item.parse(raw);
  const { data, error } = await sb.from("dev_items").insert({ ...p, created_by: userId }).select("*").single();
  if (error) throw error;
  return data;
}

export async function update_dev_item(sb: SB, _userId: string, raw: unknown) {
  const { id, ...rest } = Schemas.update_dev_item.parse(raw);
  const payload: Record<string, unknown> = { ...rest };
  if (rest.status === "RESOLVED") payload.resolved_at = new Date().toISOString();
  const { data, error } = await sb.from("dev_items").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

// ---------- BUSINESS CONTEXT ----------
export async function get_business_context(sb: SB, userId: string) {
  const { data, error } = await sb.from("business_context").select("key,value").eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, string | null> = {};
  for (const r of data ?? []) out[r.key] = r.value;
  return out;
}

export async function update_business_context(sb: SB, userId: string, raw: unknown) {
  const { updates } = Schemas.update_business_context.parse(raw);
  const rows = Object.entries(updates).map(([key, value]) => ({ user_id: userId, key, value, updated_at: new Date().toISOString() }));
  if (rows.length > 0) {
    const { error } = await sb.from("business_context").upsert(rows, { onConflict: "user_id,key" });
    if (error) throw error;
  }
  return get_business_context(sb, userId);
}

// ---------- BRIEFINGS ----------
export async function get_latest_briefing(sb: SB, userId: string, raw: unknown) {
  const { type } = Schemas.get_latest_briefing.parse(raw ?? {});
  const { data, error } = await sb.from("briefings").select("*").eq("user_id", userId).eq("type", type)
    .order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function list_briefings(sb: SB, userId: string, raw: unknown) {
  const { limit } = Schemas.list_briefings.parse(raw ?? {});
  const { data, error } = await sb.from("briefings").select("id,type,generated_at,content")
    .eq("user_id", userId).order("generated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function save_briefing(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.save_briefing.parse(raw);
  const { data, error } = await sb.from("briefings").insert({ ...p, user_id: userId }).select("*").single();
  if (error) throw error;
  return data;
}

export { err };
