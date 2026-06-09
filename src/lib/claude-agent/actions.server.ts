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

  const [tasksR, leadsR, devR, ctxR, weekDoneR, weekCreatedR] = await Promise.all([
    sb.from("tasks").select("id,title,domain,priority,status,due_date,notes,ai_rank,lead_id,created_at,completed_at")
      .eq("user_id", userId).neq("status", "ARCHIVED"),
    sb.from("leads").select("id,name,business_name,phone,stage,next_action,next_action_date,monthly_value_nis,source,created_at")
      .eq("user_id", userId),
    sb.from("dev_items").select("id,title,type,severity,priority,status,target_date,is_milestone,blocked_by,assigned_to"),
    sb.from("business_context").select("key,value,updated_at").eq("user_id", userId),
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

  const allDev = (devR.data ?? []) as any[];
  const closedStatuses = new Set(["RESOLVED", "WONT_FIX"]);
  const openDev = allDev.filter((d) => !closedStatuses.has(d.status));
  const milestones = openDev.filter((d) => d.is_milestone);
  const dev_items = openDev.filter((d) => !d.is_milestone);

  const blockingIds = new Set<string>();
  for (const d of openDev) for (const id of (d.blocked_by ?? []) as string[]) blockingIds.add(id);
  const blocking_milestones = milestones
    .filter((m) => blockingIds.has(m.id))
    .map((m) => ({ ...m, blocks_count: openDev.filter((d) => (d.blocked_by ?? []).includes(m.id)).length }));

  const devById = new Map(allDev.map((d) => [d.id, d] as const));
  const unblocked_now = openDev.filter((d) => {
    const bb = (d.blocked_by ?? []) as string[];
    if (bb.length === 0) return false;
    return bb.every((id) => {
      const blocker = devById.get(id);
      return blocker && closedStatuses.has(blocker.status);
    });
  });

  const tasks = (tasksR.data ?? []) as any[];
  const stageSummaries = await fetchStageSummaries(sb, tasks.map((t) => t.id));
  const leadsById = new Map(leads.map((l: any) => [l.id, l] as const));
  const tasksEnriched = tasks.map((t) => {
    const withStages = attachStageSummary(t, stageSummaries.get(t.id));
    if (!withStages.lead_id) return withStages;
    const l = leadsById.get(withStages.lead_id);
    return l ? { ...withStages, lead: { id: l.id, name: l.name, stage: l.stage } } : withStages;
  });
  const openStatuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);
  const tasksByLeadMap = new Map<string, any>();
  for (const t of tasksEnriched) {
    if (!t.lead_id || !openStatuses.has(t.status)) continue;
    const l = leadsById.get(t.lead_id);
    if (!l) continue;
    let entry = tasksByLeadMap.get(t.lead_id);
    if (!entry) {
      entry = { lead_id: l.id, lead_name: l.name, stage: l.stage, open_tasks: [] };
      tasksByLeadMap.set(t.lead_id, entry);
    }
    entry.open_tasks.push({ id: t.id, title: t.title, priority: t.priority, status: t.status, due_date: t.due_date });
  }

  const ctxList = (ctxR.data ?? []) as any[];
  const ctxKv: Record<string, string | null> = {};
  for (const r of ctxList) ctxKv[r.key] = r.value;

  return {
    tasks: tasksEnriched,
    leads,
    tasks_by_lead: Array.from(tasksByLeadMap.values()),
    dev_items,
    milestones,
    blocking_milestones,
    unblocked_now,
    business_context: { kv: ctxKv, list: ctxList },
    weekly_completion: { done: weekDoneR.count ?? 0, created: weekCreatedR.count ?? 0 },
    overdue_leads,
    mrr_nis,
  };
}

// ---------- TASKS ----------
async function fetchStageSummaries(sb: SB, taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, any>();
  const { data, error } = await sb
    .from("task_stages")
    .select("task_id,label,position,done")
    .in("task_id", taskIds)
    .order("position", { ascending: true });
  if (error) throw error;
  const byTask = new Map<string, { label: string; position: number; done: boolean }[]>();
  for (const r of (data ?? []) as any[]) {
    const arr = byTask.get(r.task_id) ?? [];
    arr.push(r);
    byTask.set(r.task_id, arr);
  }
  const out = new Map<string, { stage_count: number; stages_done: number; progress_pct: number; current_stage: string | null }>();
  for (const [id, stages] of byTask) {
    const total = stages.length;
    const done = stages.filter((s) => s.done).length;
    const current = stages.find((s) => !s.done)?.label ?? null;
    out.set(id, {
      stage_count: total,
      stages_done: done,
      progress_pct: total ? Math.round((done / total) * 100) : 0,
      current_stage: current,
    });
  }
  return out;
}

function attachStageSummary(task: any, summary?: any) {
  return summary
    ? { ...task, ...summary }
    : { ...task, stage_count: 0, stages_done: 0, progress_pct: 0, current_stage: null };
}

export async function list_tasks(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.list_tasks.parse(raw ?? {});
  let q = sb.from("tasks").select("*").eq("user_id", userId);
  if (p.status) {
    if (Array.isArray(p.status)) q = q.in("status", p.status);
    else q = q.eq("status", p.status);
  }
  if (p.domain) q = q.eq("domain", p.domain);
  if (p.priority != null) q = q.eq("priority", p.priority);
  if (p.due_before) q = q.lte("due_date", p.due_before);
  if (p.due_after) q = q.gte("due_date", p.due_after);
  if (p.has_lead === true) q = q.not("lead_id", "is", null);
  if (p.has_lead === false) q = q.is("lead_id", null);
  if (p.search) q = q.or(`title.ilike.%${p.search}%,notes.ilike.%${p.search}%`);
  q = q.order("priority", { ascending: true }).order("due_date", { ascending: true, nullsFirst: false }).limit(p.limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const summaries = await fetchStageSummaries(sb, rows.map((r) => r.id));
  return rows.map((r) => attachStageSummary(r, summaries.get(r.id)));
}

export async function get_task(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.get_task.parse(raw);
  const [taskR, stagesR] = await Promise.all([
    sb.from("tasks").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
    sb.from("task_stages").select("*").eq("task_id", id).order("position", { ascending: true }),
  ]);
  if (taskR.error) throw taskR.error;
  if (!taskR.data) throw new Error("Task not found");
  if (stagesR.error) throw stagesR.error;
  const stages = (stagesR.data ?? []) as any[];
  const total = stages.length;
  const done = stages.filter((s) => s.done).length;
  return {
    ...taskR.data,
    stages,
    stage_count: total,
    stages_done: done,
    progress_pct: total ? Math.round((done / total) * 100) : 0,
    current_stage: stages.find((s) => !s.done)?.label ?? null,
  };
}

export async function create_task(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.create_task.parse(raw);
  const { stages, ...taskPayload } = p as any;
  const { data, error } = await sb.from("tasks").insert({ ...taskPayload, user_id: userId }).select("*").single();
  if (error) throw error;
  if (Array.isArray(stages) && stages.length > 0) {
    const rows = stages.map((label: string, i: number) => ({
      task_id: data.id,
      user_id: userId,
      label,
      position: i,
    }));
    const { error: sErr } = await sb.from("task_stages").insert(rows);
    if (sErr) throw sErr;
  }
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

// ---------- TASK STAGES ----------
async function ensureTaskOwned(sb: SB, userId: string, task_id: string) {
  const { data, error } = await sb.from("tasks").select("id").eq("id", task_id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Task not found");
}

export async function list_task_stages(sb: SB, userId: string, raw: unknown) {
  const { task_id } = Schemas.list_task_stages.parse(raw);
  await ensureTaskOwned(sb, userId, task_id);
  const { data, error } = await sb.from("task_stages").select("*").eq("task_id", task_id).order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function add_task_stage(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.add_task_stage.parse(raw);
  await ensureTaskOwned(sb, userId, p.task_id);
  let position = p.position;
  if (position == null) {
    const { data: last, error } = await sb
      .from("task_stages").select("position")
      .eq("task_id", p.task_id).order("position", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    position = last ? (last.position as number) + 1 : 0;
  }
  const { data, error } = await sb.from("task_stages").insert({
    task_id: p.task_id,
    user_id: userId,
    label: p.label,
    position,
    done: p.done ?? false,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function update_task_stage(sb: SB, userId: string, raw: unknown) {
  const { id, ...rest } = Schemas.update_task_stage.parse(raw);
  const { data, error } = await sb.from("task_stages").update(rest).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

export async function delete_task_stage(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.delete_task_stage.parse(raw);
  const { error } = await sb.from("task_stages").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { id, deleted: true };
}

export async function reorder_task_stages(sb: SB, userId: string, raw: unknown) {
  const { task_id, ordered_ids } = Schemas.reorder_task_stages.parse(raw);
  await ensureTaskOwned(sb, userId, task_id);
  for (let i = 0; i < ordered_ids.length; i++) {
    const { error } = await sb.from("task_stages")
      .update({ position: i })
      .eq("id", ordered_ids[i]).eq("task_id", task_id).eq("user_id", userId);
    if (error) throw error;
  }
  const { data, error } = await sb.from("task_stages").select("*").eq("task_id", task_id).order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function set_task_stages(sb: SB, userId: string, raw: unknown) {
  const { task_id, labels } = Schemas.set_task_stages.parse(raw);
  await ensureTaskOwned(sb, userId, task_id);
  const { error: delErr } = await sb.from("task_stages").delete().eq("task_id", task_id).eq("user_id", userId);
  if (delErr) throw delErr;
  if (labels.length > 0) {
    const rows = labels.map((label, i) => ({ task_id, user_id: userId, label, position: i }));
    const { error } = await sb.from("task_stages").insert(rows);
    if (error) throw error;
  }
  const { data, error } = await sb.from("task_stages").select("*").eq("task_id", task_id).order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------- LEADS ----------
export async function list_leads(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.list_leads.parse(raw ?? {});
  let q = sb.from("leads").select("*").eq("user_id", userId);
  if (p.stage) {
    if (Array.isArray(p.stage)) q = q.in("stage", p.stage);
    else q = q.eq("stage", p.stage);
  }
  if (p.source) q = q.eq("source", p.source);
  if (p.overdue_only) q = q.lt("next_action_date", today()).not("stage", "in", "(WON,LOST,ON_HOLD)");
  if (p.next_action_before) q = q.lte("next_action_date", p.next_action_before);
  if (p.next_action_after) q = q.gte("next_action_date", p.next_action_after);
  if (p.search) {
    const s = p.search;
    q = q.or(`name.ilike.%${s}%,business_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }
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
  const contacts = (contactsR.data ?? []) as any[];
  const last = contacts[0]?.contact_date ?? null;
  const days_since_last_contact = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  return { ...leadR.data, contacts, last_contact_at: last, days_since_last_contact };
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
  if (p.type) {
    if (Array.isArray(p.type)) q = q.in("type", p.type);
    else q = q.eq("type", p.type);
  }
  if (p.severity) q = q.eq("severity", p.severity);
  if (p.priority) q = q.eq("priority", p.priority);
  if (p.status) {
    if (Array.isArray(p.status)) q = q.in("status", p.status);
    else q = q.eq("status", p.status);
  }
  if (typeof p.is_milestone === "boolean") q = q.eq("is_milestone", p.is_milestone);
  if (p.open_only) q = q.not("status", "in", "(RESOLVED,WONT_FIX)");
  if (p.blocking) q = q.contains("blocked_by", [p.blocking]);
  if (p.search) q = q.or(`title.ilike.%${p.search}%,description.ilike.%${p.search}%`);
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as any[];
  if (p.ready_only) {
    const { data: all, error: allErr } = await sb.from("dev_items").select("id,status");
    if (allErr) throw allErr;
    const byId = new Map(((all ?? []) as any[]).map((d) => [d.id, d.status]));
    const closed = new Set(["RESOLVED", "WONT_FIX"]);
    rows = rows.filter((r) => {
      const bb = (r.blocked_by ?? []) as string[];
      return bb.length > 0 && bb.every((id) => closed.has(byId.get(id) ?? ""));
    });
  }
  return rows;
}

export async function list_unblocked(sb: SB, _userId: string) {
  const { data, error } = await sb.from("dev_items").select("*");
  if (error) throw error;
  const all = (data ?? []) as any[];
  const closed = new Set(["RESOLVED", "WONT_FIX"]);
  const byId = new Map(all.map((d) => [d.id, d] as const));
  return all.filter((d) => {
    if (closed.has(d.status)) return false;
    const bb = (d.blocked_by ?? []) as string[];
    if (bb.length === 0) return false;
    return bb.every((id) => {
      const b = byId.get(id);
      return b && closed.has(b.status);
    });
  });
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

export async function delete_dev_item(sb: SB, _userId: string, raw: unknown) {
  const { id } = Schemas.delete_dev_item.parse(raw);
  const { error } = await sb.from("dev_items").delete().eq("id", id);
  if (error) throw error;
  return { id, deleted: true };
}

// ---------- BUSINESS CONTEXT ----------
export async function get_business_context(sb: SB, userId: string) {
  const { data, error } = await sb.from("business_context").select("key,value,updated_at").eq("user_id", userId);
  if (error) throw error;
  const list = (data ?? []) as any[];
  const kv: Record<string, string | null> = {};
  for (const r of list) kv[r.key] = r.value;
  return { kv, list };
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

export async function set_business_context(sb: SB, userId: string, raw: unknown) {
  const { key, value } = Schemas.set_business_context.parse(raw);
  const { error } = await sb.from("business_context").upsert(
    { user_id: userId, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) throw error;
  return { key, value };
}

export async function append_business_context(sb: SB, userId: string, raw: unknown) {
  const { key, value, separator } = Schemas.append_business_context.parse(raw);
  const { data: existing, error: readErr } = await sb
    .from("business_context").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  if (readErr) throw readErr;
  const prev = existing?.value ?? "";
  const next = prev ? `${prev}${separator}${value}` : value;
  const { error } = await sb.from("business_context").upsert(
    { user_id: userId, key, value: next, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) throw error;
  return { key, value: next };
}

export async function clear_business_context_key(sb: SB, userId: string, raw: unknown) {
  const { key } = Schemas.clear_business_context_key.parse(raw);
  const { error } = await sb.from("business_context").upsert(
    { user_id: userId, key, value: "", updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) throw error;
  return { key, value: "" };
}

export async function delete_business_context_key(sb: SB, userId: string, raw: unknown) {
  const { key } = Schemas.delete_business_context_key.parse(raw);
  const { error } = await sb.from("business_context").delete().eq("user_id", userId).eq("key", key);
  if (error) throw error;
  return { key, deleted: true };
}

// ---------- CONTACTS (read) ----------
export async function list_contacts(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.list_contacts.parse(raw ?? {});
  let q = sb.from("lead_contacts").select("*").eq("user_id", userId);
  if (p.lead_id) q = q.eq("lead_id", p.lead_id);
  if (p.method) q = q.eq("method", p.method);
  if (p.since) q = q.gte("contact_date", p.since);
  q = q.order("contact_date", { ascending: false }).limit(p.limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean)));
  if (leadIds.length === 0) return rows;
  const { data: leads } = await sb.from("leads").select("id,name,stage").in("id", leadIds);
  const byId = new Map(((leads ?? []) as any[]).map((l) => [l.id, l]));
  return rows.map((r) => ({ ...r, lead: byId.get(r.lead_id) ?? null }));
}

export async function get_lead_contacts(sb: SB, userId: string, raw: unknown) {
  const { lead_id } = Schemas.get_lead_contacts.parse(raw);
  const { data, error } = await sb.from("lead_contacts").select("*")
    .eq("user_id", userId).eq("lead_id", lead_id).order("contact_date", { ascending: false });
  if (error) throw error;
  const contacts = (data ?? []) as any[];
  const last = contacts[0]?.contact_date ?? null;
  const days_since_last_contact = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  return { lead_id, contacts, last_contact_at: last, days_since_last_contact, count: contacts.length };
}

export async function delete_contact(sb: SB, userId: string, raw: unknown) {
  const { id } = Schemas.delete_contact.parse(raw);
  const { error } = await sb.from("lead_contacts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { id, deleted: true };
}

// ---------- LEAD DELETE + DATA QUALITY ----------
export async function delete_lead(sb: SB, userId: string, raw: unknown) {
  const { id, cascade } = Schemas.delete_lead.parse(raw);
  const [{ count: taskCount }, { count: contactCount }] = await Promise.all([
    sb.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("lead_id", id),
    sb.from("lead_contacts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("lead_id", id),
  ]);
  const tc = taskCount ?? 0;
  const cc = contactCount ?? 0;
  if (!cascade && (tc > 0 || cc > 0)) {
    throw new Error(`Lead has ${tc} tasks and ${cc} contacts. Pass cascade:true to delete all.`);
  }
  if (cascade) {
    if (cc > 0) {
      const { error } = await sb.from("lead_contacts").delete().eq("user_id", userId).eq("lead_id", id);
      if (error) throw error;
    }
    if (tc > 0) {
      const { error } = await sb.from("tasks").update({ lead_id: null }).eq("user_id", userId).eq("lead_id", id);
      if (error) throw error;
    }
  }
  const { error } = await sb.from("leads").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { id, deleted: true, unlinked_tasks: cascade ? tc : 0, deleted_contacts: cascade ? cc : 0 };
}

export async function lead_data_quality(sb: SB, userId: string) {
  const { data, error } = await sb.from("leads").select("*").eq("user_id", userId);
  if (error) throw error;
  const leads = (data ?? []) as any[];
  const critical = ["phone", "email", "business_name", "monthly_value_nis", "next_action_date"] as const;
  const total = leads.length || 1;
  const counts: Record<string, number> = {};
  for (const f of critical) counts[f] = 0;
  const per_lead: any[] = [];
  const t = today();
  const next_actions_needed: any[] = [];
  for (const l of leads) {
    const missing: string[] = [];
    for (const f of critical) {
      const v = (l as any)[f];
      if (v == null || v === "") {
        missing.push(f);
        counts[f]++;
      }
    }
    if (missing.length > 0) per_lead.push({ id: l.id, name: l.name, stage: l.stage, missing });
    if (!["WON", "LOST", "ON_HOLD"].includes(l.stage) && (!l.next_action_date || l.next_action_date < t)) {
      next_actions_needed.push({ id: l.id, name: l.name, stage: l.stage, next_action_date: l.next_action_date });
    }
  }
  const aggregate: Record<string, { missing: number; pct: number }> = {};
  for (const f of critical) aggregate[f] = { missing: counts[f], pct: Math.round((counts[f] / total) * 100) };
  return { total_leads: leads.length, aggregate, per_lead, next_actions_needed };
}

export { err };

// ---------- ATTACHMENTS ----------
const ATTACHMENT_BUCKET = "attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

async function signAttachment(sb: SB, storage_path: string): Promise<string | null> {
  const { data } = await sb.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

async function withSignedUrl(sb: SB, row: any) {
  return { ...row, download_url: await signAttachment(sb, row.storage_path) };
}

async function assertEntityExists(sb: SB, entity_type: "task" | "dev_item", entity_id: string) {
  const table = entity_type === "task" ? "tasks" : "dev_items";
  const { data, error } = await sb.from(table).select("id").eq("id", entity_id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${entity_type} ${entity_id} not found`);
}

export async function list_attachments(sb: SB, _userId: string, raw: unknown) {
  const { entity_type, entity_id } = Schemas.list_attachments.parse(raw);
  const { data, error } = await sb.from("attachments").select("*")
    .eq("entity_type", entity_type).eq("entity_id", entity_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return Promise.all(rows.map((r) => withSignedUrl(sb, r)));
}

export async function get_attachment(sb: SB, _userId: string, raw: unknown) {
  const { id } = Schemas.get_attachment.parse(raw);
  const { data, error } = await sb.from("attachments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Attachment not found");
  return withSignedUrl(sb, data);
}

export async function upload_attachment(sb: SB, userId: string, raw: unknown) {
  const p = Schemas.upload_attachment.parse(raw);
  await assertEntityExists(sb, p.entity_type, p.entity_id);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(p.content_base64, "base64");
  } catch {
    throw new Error("Invalid base64 content");
  }
  if (bytes.length === 0) throw new Error("Empty file");
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large: ${bytes.length} bytes (max ${MAX_ATTACHMENT_BYTES})`);
  }

  const attachment_id = crypto.randomUUID();
  const safeName = p.filename.replace(/[^\w.\-]+/g, "_").slice(0, 200);
  const storage_path = `${p.entity_type}/${p.entity_id}/${attachment_id}-${safeName}`;
  const mime_type = p.mime_type ?? "application/octet-stream";

  const { error: upErr } = await sb.storage.from(ATTACHMENT_BUCKET).upload(storage_path, bytes, {
    contentType: mime_type,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data: row, error } = await sb.from("attachments").insert({
    id: attachment_id,
    user_id: userId,
    entity_type: p.entity_type,
    entity_id: p.entity_id,
    bucket: ATTACHMENT_BUCKET,
    storage_path,
    filename: p.filename,
    mime_type,
    size_bytes: bytes.length,
  }).select("*").single();
  if (error) {
    await sb.storage.from(ATTACHMENT_BUCKET).remove([storage_path]).catch(() => {});
    throw error;
  }
  return withSignedUrl(sb, row);
}

export async function delete_attachment(sb: SB, _userId: string, raw: unknown) {
  const { id } = Schemas.delete_attachment.parse(raw);
  const { data: row, error: readErr } = await sb.from("attachments").select("*").eq("id", id).maybeSingle();
  if (readErr) throw readErr;
  if (!row) throw new Error("Attachment not found");
  await sb.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]).catch(() => {});
  const { error } = await sb.from("attachments").delete().eq("id", id);
  if (error) throw error;
  return { id, deleted: true };
}
