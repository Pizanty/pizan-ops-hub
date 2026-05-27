import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AppShell requireAdmin>
      <PageHeader title="Dashboard" description="Today's briefing, tasks, leads and dev status." />
      <div className="grid gap-4 p-6 md:grid-cols-3">
        <PlaceholderCard title="Today's briefing" hint="Wire generate-briefing edge function. Renders briefings.content JSONB." className="md:col-span-3" />
        <PlaceholderCard title="Top 3 tasks" hint="Order by ai_rank, then priority." />
        <PlaceholderCard title="CRM summary" hint="Counts per stage + overdue follow-ups." />
        <PlaceholderCard title="Dev status" hint="S1/S2 open + next milestone countdown." />
        <PlaceholderCard title="Weekly completion meter" hint="Done this week / created this week." className="md:col-span-3" />
      </div>
    </AppShell>
  );
}

function PlaceholderCard({ title, hint, className }: { title: string; hint: string; className?: string }) {
  return (
    <div className={"rounded-lg border bg-card p-4 " + (className ?? "")}>
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
