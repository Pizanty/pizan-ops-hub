// Pure logic helpers — used by routes and unit-tested in src/lib/__tests__.
import type { Lead, Task } from "./ptops-types";

const DOMAIN_WEIGHT: Record<string, number> = { PRODUCT: 0, OPS: 1, SALES: 2, STRATEGY: 3 };

export function rankTasks(tasks: Task[]): Task[] {
  const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "ARCHIVED");
  return [...open].sort((a, b) => {
    const ra = a.ai_rank ?? 999;
    const rb = b.ai_rank ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const wa = DOMAIN_WEIGHT[a.domain] ?? 9;
    const wb = DOMAIN_WEIGHT[b.domain] ?? 9;
    if (wa !== wb) return wa - wb;
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });
}

export function leadStageCounts(leads: Lead[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of leads) out[l.stage] = (out[l.stage] ?? 0) + 1;
  return out;
}

export function pipelineValueNis(leads: Lead[]): number {
  return leads
    .filter((l) => !["WON", "LOST", "ON_HOLD"].includes(l.stage))
    .reduce((sum, l) => sum + (Number(l.monthly_value_nis) || 0), 0);
}

export function overdueFollowups(leads: Lead[], today: Date = new Date()): Lead[] {
  const t = new Date(today.toDateString());
  return leads.filter(
    (l) =>
      l.next_action_date != null &&
      !["WON", "LOST"].includes(l.stage) &&
      new Date(l.next_action_date) < t,
  );
}

export function weekRange(today: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(today);
  const day = d.getDay(); // 0=Sun
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const head = cols.map(csvEscape).join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return head + "\n" + body;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
