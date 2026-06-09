import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { downloadCsv, toCsv } from "@/lib/ptops-logic";
import type { Lead, Task, DevItem } from "@/lib/ptops-types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  CheckCircle2,
  TrendingUp,
  Target,
  Wallet,
  Activity,
  Download,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <AppShell requireAdmin>
      <ReportsPage />
    </AppShell>
  ),
});

const DOMAIN_COLORS: Record<string, string> = {
  SALES: "var(--color-domain-sales)",
  PRODUCT: "var(--color-domain-product)",
  OPS: "var(--color-domain-ops)",
  STRATEGY: "var(--color-domain-strategy)",
};

const STAGE_ORDER: Array<{ key: string; label: string }> = [
  { key: "PROSPECT", label: "Prospect" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "DEMO_SCHEDULED", label: "Demo Scheduled" },
  { key: "DEMO_DONE", label: "Demo Done" },
  { key: "NEGOTIATION", label: "Negotiation" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
  { key: "ON_HOLD", label: "On Hold" },
];

const PIE_FALLBACK = [
  "var(--color-primary)",
  "var(--color-domain-product)",
  "var(--color-domain-ops)",
  "var(--color-domain-strategy)",
  "var(--color-domain-sales)",
  "var(--color-warning)",
  "var(--color-success)",
  "var(--color-muted-foreground)",
];

function ReportsPage() {
  const { user } = useAuth();
  const { data: tasks = [] } = useQuery({
    queryKey: ["reports", "tasks", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("user_id", user!.id);
      return (data ?? []) as Task[];
    },
  });
  const { data: leads = [] } = useQuery({
    queryKey: ["reports", "leads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("user_id", user!.id);
      return (data ?? []) as Lead[];
    },
  });
  const { data: devItems = [] } = useQuery({
    queryKey: ["reports", "dev"],
    queryFn: async () => {
      const { data } = await supabase.from("dev_items").select("*");
      return (data ?? []) as DevItem[];
    },
  });

  // Tasks stats
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const open = tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.filter(
      (t) => t.due_date && t.due_date < today && t.status !== "DONE" && t.status !== "ARCHIVED",
    ).length;
    const completionRate = total ? Math.round((done / total) * 100) : 0;
    const last7 = tasks.filter((t) => {
      if (!t.completed_at) return false;
      const d = new Date(t.completed_at);
      return Date.now() - d.getTime() < 7 * 24 * 3600 * 1000;
    }).length;
    return { total, done, open, blocked, overdue, completionRate, last7 };
  }, [tasks]);

  const byDomain = useMemo(() => {
    const m: Record<string, number> = {};
    tasks
      .filter((t) => t.status === "DONE")
      .forEach((t) => {
        m[t.domain] = (m[t.domain] ?? 0) + 1;
      });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const last30Days = useMemo(() => {
    const days: { date: string; done: number; created: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const ds = d.toISOString().slice(0, 10);
      const done = tasks.filter((t) => t.completed_at?.slice(0, 10) === ds).length;
      const created = tasks.filter((t) => t.created_at?.slice(0, 10) === ds).length;
      days.push({ date: ds.slice(5), done, created });
    }
    return days;
  }, [tasks]);

  // CRM stats
  const crmStats = useMemo(() => {
    const total = leads.length;
    const won = leads.filter((l) => l.stage === "WON").length;
    const lost = leads.filter((l) => l.stage === "LOST").length;
    const active = total - won - lost;
    const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    const mrr = leads
      .filter((l) => l.stage === "WON")
      .reduce((s, l) => s + (l.monthly_value_nis ?? 0), 0);
    const pipelineValue = leads
      .filter((l) => l.stage !== "WON" && l.stage !== "LOST")
      .reduce((s, l) => s + (l.monthly_value_nis ?? 0), 0);
    return { total, won, lost, active, winRate, mrr, pipelineValue };
  }, [leads]);

  const pipelineByStage = useMemo(() => {
    const m: Record<string, number> = {};
    leads.forEach((l) => {
      m[l.stage] = (m[l.stage] ?? 0) + 1;
    });
    return STAGE_ORDER.filter((s) => m[s.key]).map((s) => ({
      name: s.label,
      value: m[s.key],
    }));
  }, [leads]);

  // Dev stats
  const devStats = useMemo(() => {
    const total = devItems.length;
    const open = devItems.filter((i) => i.status === "OPEN").length;
    const inprog = devItems.filter((i) => i.status === "IN_PROGRESS").length;
    const resolved = devItems.filter((i) => i.status === "RESOLVED").length;
    const blocked = devItems.filter((i) => i.status === "BLOCKED").length;
    const s1 = devItems.filter((i) => i.severity === "S1" && i.status !== "RESOLVED").length;
    const resolutionRate = total ? Math.round((resolved / total) * 100) : 0;
    return { total, open, inprog, resolved, blocked, s1, resolutionRate };
  }, [devItems]);

  const devByType = useMemo(() => {
    const m: Record<string, number> = {};
    devItems.forEach((i) => {
      m[i.type] = (m[i.type] ?? 0) + 1;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [devItems]);

  const devBySeverity = useMemo(() => {
    const m: Record<string, number> = { S1: 0, S2: 0, S3: 0 };
    devItems
      .filter((i) => i.status !== "RESOLVED" && i.severity)
      .forEach((i) => {
        m[i.severity!] = (m[i.severity!] ?? 0) + 1;
      });
    return [
      { name: "S1", value: m.S1, fill: "var(--color-sev-s1)" },
      { name: "S2", value: m.S2, fill: "var(--color-sev-s2)" },
      { name: "S3", value: m.S3, fill: "var(--color-sev-s3)" },
    ];
  }, [devItems]);

  return (
    <>
      <PageHeader title="Reports" description="Productivity, pipeline, and dev velocity." />
      <div className="space-y-6 p-4 md:p-6">
        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList className="bg-card/60 backdrop-blur">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="crm">CRM</TabsTrigger>
            <TabsTrigger value="dev">Dev</TabsTrigger>
          </TabsList>

          {/* TASKS */}
          <TabsContent value="tasks" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Completed"
                value={taskStats.done}
                hint={`${taskStats.completionRate}% completion`}
                icon={<CheckCircle2 className="size-4" />}
                accent="success"
              />
              <KpiCard
                label="Last 7 days"
                value={taskStats.last7}
                hint="tasks shipped"
                icon={<TrendingUp className="size-4" />}
                accent="primary"
              />
              <KpiCard
                label="Open"
                value={taskStats.open}
                hint={`${taskStats.blocked} blocked`}
                icon={<Activity className="size-4" />}
                accent="muted"
              />
              <KpiCard
                label="Overdue"
                value={taskStats.overdue}
                hint="past due date"
                icon={<AlertTriangle className="size-4" />}
                accent={taskStats.overdue > 0 ? "danger" : "muted"}
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv("tasks.csv", toCsv(tasks as any))}
              >
                <Download className="mr-2 size-4" />
                Export CSV
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard
                title="Throughput — last 30 days"
                subtitle="Completed vs created"
                className="lg:col-span-2"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={last30Days} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-domain-product)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-domain-product)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip content={<TipBox />} />
                    <Area type="monotone" dataKey="created" stroke="var(--color-domain-product)" strokeWidth={2} fill="url(#gCreated)" />
                    <Area type="monotone" dataKey="done" stroke="var(--color-primary)" strokeWidth={2} fill="url(#gDone)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Completed by domain" subtitle="All time">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={byDomain}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                    >
                      {byDomain.map((d, i) => (
                        <Cell key={i} fill={DOMAIN_COLORS[d.name] ?? PIE_FALLBACK[i % PIE_FALLBACK.length]} />
                      ))}
                    </Pie>
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip content={<TipBox />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </TabsContent>

          {/* CRM */}
          <TabsContent value="crm" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Won"
                value={crmStats.won}
                hint={`${crmStats.winRate}% win rate`}
                icon={<Target className="size-4" />}
                accent="success"
              />
              <KpiCard
                label="Active Pipeline"
                value={crmStats.active}
                hint={`${crmStats.total} total leads`}
                icon={<Activity className="size-4" />}
                accent="primary"
              />
              <KpiCard
                label="MRR"
                value={`₪${crmStats.mrr.toLocaleString()}`}
                hint="from won deals"
                icon={<Wallet className="size-4" />}
                accent="success"
              />
              <KpiCard
                label="Pipeline Value"
                value={`₪${crmStats.pipelineValue.toLocaleString()}`}
                hint="potential MRR"
                icon={<Sparkles className="size-4" />}
                accent="primary"
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv("leads.csv", toCsv(leads as any))}
              >
                <Download className="mr-2 size-4" />
                Export CSV
              </Button>
            </div>

            <ChartCard title="Pipeline by stage" subtitle="Funnel snapshot">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={pipelineByStage}
                  layout="vertical"
                  margin={{ top: 10, right: 30, bottom: 10, left: 20 }}
                >
                  <defs>
                    <linearGradient id="gStage" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="var(--color-domain-product)" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip content={<TipBox />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                  <Bar dataKey="value" fill="url(#gStage)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          {/* DEV */}
          <TabsContent value="dev" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Open"
                value={devStats.open}
                hint={`${devStats.inprog} in progress`}
                icon={<Activity className="size-4" />}
                accent="primary"
              />
              <KpiCard
                label="Resolved"
                value={devStats.resolved}
                hint={`${devStats.resolutionRate}% resolution`}
                icon={<CheckCircle2 className="size-4" />}
                accent="success"
              />
              <KpiCard
                label="Blocked"
                value={devStats.blocked}
                hint="need unblock"
                icon={<AlertTriangle className="size-4" />}
                accent={devStats.blocked > 0 ? "danger" : "muted"}
              />
              <KpiCard
                label="S1 Open"
                value={devStats.s1}
                hint="critical issues"
                icon={<AlertTriangle className="size-4" />}
                accent={devStats.s1 > 0 ? "danger" : "muted"}
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv("dev_items.csv", toCsv(devItems as any))}
              >
                <Download className="mr-2 size-4" />
                Export CSV
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="By type" subtitle="All items">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={devByType} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="gType" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={1} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip content={<TipBox />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                    <Bar dataKey="value" fill="url(#gType)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Open severity" subtitle="Unresolved items">
                <ResponsiveContainer width="100%" height={260}>
                  <RadialBarChart
                    innerRadius="35%"
                    outerRadius="100%"
                    data={devBySeverity}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar background dataKey="value" cornerRadius={8} />
                    <Legend
                      iconType="circle"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip content={<TipBox />} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent = "primary",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "success" | "danger" | "muted";
}) {
  const accentClass: Record<string, string> = {
    primary: "text-primary bg-primary/10 ring-primary/20",
    success: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10 ring-[color:var(--color-success)]/20",
    danger: "text-destructive bg-destructive/10 ring-destructive/20",
    muted: "text-muted-foreground bg-muted ring-border",
  };
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-gradient-surface p-4 shadow-elegant transition-all hover:shadow-glow">
      <div className="absolute inset-0 bg-gradient-glow opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-3xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <div className={`flex size-9 items-center justify-center rounded-lg ring-1 ${accentClass[accent]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card/80 p-5 shadow-elegant backdrop-blur ${className}`}
    >
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <div className="font-display text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function TipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-elegant backdrop-blur">
      {label && <div className="mb-1 font-medium text-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: p.color || p.fill }}
          />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto font-mono text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
