import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { rankTasks, leadStageCounts, pipelineValueNis, overdueFollowups, weekRange } from "@/lib/ptops-logic";
import { DomainBadge, PriorityDot, DevPriorityBadge, EmptyState, isOverdue } from "@/lib/ptops-ui";
import type { Task, Lead, DevItem } from "@/lib/ptops-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({ component: DashboardPage });

function DashboardPage() {
  return (
    <AppShell requireAdmin>
      <PageHeader
        title="Dashboard"
        description="Today's snapshot — tasks, leads, dev status."
      />
      <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-3">
        <TopTasksCard />
        <CrmSummaryCard />
        <DevStatusCard />
        <WeeklyMeterCard className="lg:col-span-3" />
      </div>
    </AppShell>
  );
}

function useUserId() {
  const { user } = useAuth();
  return user?.id ?? null;
}

function TopTasksCard() {
  const userId = useUserId();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", "top", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("user_id", userId!);
      return rankTasks((data ?? []) as Task[]).slice(0, 3);
    },
  });
  return (
    <div className="rounded-lg border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Top 3 tasks</div>
        <Link to="/tasks"><Button size="sm" variant="ghost">All →</Button></Link>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : !tasks || tasks.length === 0 ? (
        <EmptyState title="Inbox zero" />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded border p-2">
              <div className="flex items-center justify-between gap-2">
                <Link to="/tasks/$id" params={{ id: t.id }} className="truncate text-sm hover:underline">{t.title}</Link>
                <PriorityDot priority={t.priority} />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <DomainBadge domain={t.domain} />
                {t.due_date && <span className={"font-mono text-[10px] " + (isOverdue(t.due_date) ? "text-destructive" : "text-muted-foreground")}>{t.due_date}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CrmSummaryCard() {
  const userId = useUserId();
  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", "summary", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("user_id", userId!);
      return (data ?? []) as Lead[];
    },
  });
  const counts = useMemo(() => leadStageCounts(leads ?? []), [leads]);
  const value = useMemo(() => pipelineValueNis(leads ?? []), [leads]);
  const overdue = useMemo(() => overdueFollowups(leads ?? []), [leads]);
  return (
    <div className="rounded-lg border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">CRM</div>
        <Link to="/crm"><Button size="sm" variant="ghost">Open →</Button></Link>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="space-y-2 text-sm">
          <div className="font-mono text-xs text-muted-foreground">Active pipeline value</div>
          <div className="text-2xl font-semibold">₪{value.toLocaleString()}<span className="ml-1 text-xs text-muted-foreground">/mo</span></div>
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(counts).map(([s, n]) => (
              <span key={s} className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{s}: {n}</span>
            ))}
          </div>
          {overdue.length > 0 && (
            <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {overdue.length} overdue follow-up{overdue.length === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DevStatusCard() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["dev_items", "summary"],
    queryFn: async () => {
      const { data } = await supabase.from("dev_items").select("*");
      return (data ?? []) as DevItem[];
    },
  });
  const all = items ?? [];
  const open = all.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS" || i.status === "BLOCKED");
  const openMilestones = open.filter((i) => i.is_milestone);
  const p1 = open.filter((i) => i.priority === "P1" && !i.is_milestone);
  const p2 = open.filter((i) => i.priority === "P2" && !i.is_milestone);
  return (
    <div className="rounded-lg border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Dev</div>
        <Link to="/dev"><Button size="sm" variant="ghost">Open →</Button></Link>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <div><span className="font-mono text-2xl">{p1.length}</span> <DevPriorityBadge priority="P1" /></div>
            <div><span className="font-mono text-2xl">{p2.length}</span> <DevPriorityBadge priority="P2" /></div>
            <div className="text-xs text-muted-foreground">{open.length} open total</div>
          </div>
          {openMilestones.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase text-primary">★ Milestones ({openMilestones.length})</div>
              {openMilestones.slice(0, 3).map((m) => {
                const blocks = open.filter((i) => (i.blocked_by ?? []).includes(m.id)).length;
                return (
                  <Link key={m.id} to="/dev/$id" params={{ id: m.id }} className="block rounded border border-primary/20 bg-primary/5 p-2 hover:border-primary/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs font-medium">{m.title}</div>
                      {blocks > 0 && <span className="shrink-0 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">blocks {blocks}</span>}
                    </div>
                    {m.target_date && <div className="font-mono text-[10px] text-muted-foreground">target {m.target_date}</div>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeeklyMeterCard({ className }: { className?: string }) {
  const userId = useUserId();
  const { data } = useQuery({
    queryKey: ["tasks", "week", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { start, end } = weekRange();
      const { data: created } = await supabase
        .from("tasks").select("id, created_at, completed_at, status")
        .eq("user_id", userId!).gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
      const { data: done } = await supabase
        .from("tasks").select("id, completed_at")
        .eq("user_id", userId!).gte("completed_at", start.toISOString()).lt("completed_at", end.toISOString());
      return { created: created?.length ?? 0, done: done?.length ?? 0 };
    },
  });
  const pct = data ? Math.min(100, Math.round((data.done / Math.max(1, data.created)) * 100)) : 0;
  return (
    <div className={"rounded-lg border bg-card p-4 md:p-5 " + (className ?? "")}>
      <div className="mb-3 text-sm font-semibold">This week</div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="font-mono text-3xl">{data?.done ?? 0}<span className="text-muted-foreground">/{data?.created ?? 0}</span></div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">done / created</div>
        </div>
        <div className="flex-1">
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">{pct}% completion</div>
        </div>
      </div>
    </div>
  );
}
