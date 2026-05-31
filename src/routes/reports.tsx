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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/reports")({
  component: () => <AppShell requireAdmin><ReportsPage /></AppShell>,
});

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#84cc16", "#64748b"];

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

  const byDomain = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.filter((t) => t.status === "DONE").forEach((t) => { m[t.domain] = (m[t.domain] ?? 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const last30Days = useMemo(() => {
    const days: { date: string; done: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const ds = d.toISOString().slice(0, 10);
      const count = tasks.filter((t) => t.completed_at?.slice(0, 10) === ds).length;
      days.push({ date: ds.slice(5), done: count });
    }
    return days;
  }, [tasks]);

  const pipelineByStage = useMemo(() => {
    const m: Record<string, number> = {};
    leads.forEach((l) => { m[l.stage] = (m[l.stage] ?? 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [leads]);

  return (
    <>
      <PageHeader title="Reports" description="Productivity, pipeline, and dev velocity." />
      <div className="p-4 md:p-6">
        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="crm">CRM</TabsTrigger>
            <TabsTrigger value="dev">Dev</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => downloadCsv("tasks.csv", toCsv(tasks as any))}>Export CSV</Button>
            </div>
            <ChartCard title="Tasks completed — last 30 days">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={last30Days}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="done" fill="#6366f1" /></BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Completed by domain">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byDomain} dataKey="value" nameKey="name" outerRadius={80} label>
                    {byDomain.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>
          <TabsContent value="crm" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => downloadCsv("leads.csv", toCsv(leads as any))}>Export CSV</Button>
            </div>
            <ChartCard title="Pipeline by stage">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={pipelineByStage}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" fill="#22c55e" /></BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>
          <TabsContent value="dev" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => downloadCsv("dev_items.csv", toCsv(devItems as any))}>Export CSV</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {(["OPEN","IN_PROGRESS","RESOLVED"] as const).map((s) => (
                <div key={s} className="rounded-lg border bg-card p-4">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">{s}</div>
                  <div className="text-3xl font-semibold">{devItems.filter((i) => i.status === s).length}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}
