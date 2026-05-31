import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { rankTasks, leadStageCounts, pipelineValueNis, overdueFollowups, weekRange } from "@/lib/ptops-logic";
import { DomainBadge, PriorityDot, SeverityBadge, EmptyState, isOverdue } from "@/lib/ptops-ui";
import type { Task, Lead, DevItem, Briefing } from "@/lib/ptops-types";
import { generateBriefing } from "@/lib/api/briefing.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({ component: DashboardPage });

function DashboardPage() {
  return (
    <AppShell requireAdmin>
      <PageHeader
        title="Dashboard"
        description="Today's snapshot — briefing, tasks, leads, dev status."
      />
      <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-3">
        <BriefingCard className="lg:col-span-3" />
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

function BriefingCard({ className }: { className?: string }) {
  const userId = useUserId();
  const qc = useQueryClient();
  const generate = useServerFn(generateBriefing);
  const { data, isLoading } = useQuery({
    queryKey: ["briefing", "latest", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("briefings")
        .select("*")
        .eq("user_id", userId!)
        .eq("type", "DAILY")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Briefing | null) ?? null;
    },
  });
  const mutation = useMutation({
    mutationFn: () => generate({ data: { type: "DAILY" as const } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefing", "latest", userId] });
      qc.invalidateQueries({ queryKey: ["briefings", userId] });
      toast.success("Briefing generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const hasToday = !!data && new Date(data.generated_at).toDateString() === new Date().toDateString();

  return (
    <div className={"rounded-lg border bg-card p-4 md:p-5 " + (className ?? "")}>
      <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Today's briefing</div>
          {data && <div className="font-mono text-[10px] text-muted-foreground">{new Date(data.generated_at).toLocaleString()}</div>}
        </div>
        <div className="flex items-center gap-1">
          {data && (
            <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Regenerate"}
            </Button>
          )}
          <Link to="/briefing"><Button size="sm" variant="outline">History</Button></Link>
        </div>
      </div>
      {isLoading ? <Skeleton className="h-20 w-full" /> : !hasToday ? (
        <div className="flex flex-col items-start gap-3">
          <EmptyState title={data ? "No briefing for today" : "No briefing yet"} hint="Generate your daily briefing from current tasks, leads, dev items, and business context." />
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Daily Briefing
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {data!.content.summary && <p className="text-muted-foreground">{data!.content.summary}</p>}
          {data!.content.top_tasks && data!.content.top_tasks.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">
              {data!.content.top_tasks.map((t) => (
                <li key={t.task_id}><span className="font-medium">{t.title}</span> <span className="text-xs text-muted-foreground">— {t.reasoning}</span></li>
              ))}
            </ol>
          )}
          {data!.content.lead_to_contact && (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <span className="font-semibold">Lead to contact:</span> {data!.content.lead_to_contact.name} — {data!.content.lead_to_contact.reason}
            </div>
          )}
          {data!.content.risk_flag && (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">⚠ {data!.content.risk_flag}</div>
          )}
        </div>
      )}
    </div>
  );
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
  const open = (items ?? []).filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS" || i.status === "BLOCKED");
  const s1 = open.filter((i) => i.severity === "S1");
  const s2 = open.filter((i) => i.severity === "S2");
  const nextMilestone = (items ?? [])
    .filter((i) => i.is_milestone && i.target_date && i.status !== "RESOLVED" && i.status !== "WONT_FIX")
    .sort((a, b) => (a.target_date! < b.target_date! ? -1 : 1))[0];
  return (
    <div className="rounded-lg border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Dev</div>
        <Link to="/dev"><Button size="sm" variant="ghost">Open →</Button></Link>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <div><span className="font-mono text-2xl">{s1.length}</span> <SeverityBadge severity="S1" /></div>
            <div><span className="font-mono text-2xl">{s2.length}</span> <SeverityBadge severity="S2" /></div>
            <div className="text-xs text-muted-foreground">{open.length} open total</div>
          </div>
          {nextMilestone && (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">Next milestone</div>
              <div className="font-medium">{nextMilestone.title}</div>
              <div className="font-mono text-[10px] text-muted-foreground">target {nextMilestone.target_date}</div>
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
