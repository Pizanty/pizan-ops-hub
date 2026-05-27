import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/lib/ptops-ui";
import { generateBriefing } from "@/lib/api/briefing.functions";
import type { Briefing } from "@/lib/ptops-types";

export const Route = createFileRoute("/briefing")({
  component: () => (
    <AppShell requireAdmin>
      <BriefingHistory />
    </AppShell>
  ),
});

function BriefingHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const generate = useServerFn(generateBriefing);

  const { data: briefings = [], isLoading } = useQuery({
    queryKey: ["briefings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select("*")
        .eq("user_id", user!.id)
        .order("generated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as unknown as Briefing[];
    },
  });

  const gen = useMutation({
    mutationFn: (type: "DAILY" | "WEEKLY") => generate({ data: { type } }),
    onSuccess: () => {
      toast.success("Briefing generated");
      qc.invalidateQueries({ queryKey: ["briefings", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Briefings"
        description="Daily and weekly briefing history."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={gen.isPending} onClick={() => gen.mutate("DAILY")}>
              {gen.isPending && gen.variables === "DAILY" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
              Generate daily
            </Button>
            <Button size="sm" variant="outline" disabled={gen.isPending} onClick={() => gen.mutate("WEEKLY")}>
              {gen.isPending && gen.variables === "WEEKLY" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
              Generate weekly
            </Button>
          </div>
        }
      />
      <div className="space-y-2 p-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : briefings.length === 0 ? (
          <EmptyState title="No briefings yet" hint="Click Generate daily to create your first one." />
        ) : (
          briefings.map((b) => <BriefingRow key={b.id} b={b} />)
        )}
      </div>
    </>
  );
}

function BriefingRow({ b }: { b: Briefing }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left">
          <div>
            <div className="text-sm font-medium">
              {b.type} — {new Date(b.generated_at).toLocaleString()}
            </div>
            {b.content.summary && (
              <div className="truncate text-xs text-muted-foreground">{b.content.summary}</div>
            )}
          </div>
          <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-3 text-sm">
          {b.content.top_tasks && b.content.top_tasks.length > 0 && (
            <>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">Top tasks</div>
              <ol className="my-2 list-decimal space-y-1 pl-5">
                {b.content.top_tasks.map((t) => (
                  <li key={t.task_id}>
                    {t.title} — <span className="text-xs text-muted-foreground">{t.reasoning}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {b.content.skip_today && (
            <div className="text-xs">
              <b>Skip:</b> {b.content.skip_today}
            </div>
          )}
          {b.content.risk_flag && (
            <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              ⚠ {b.content.risk_flag}
            </div>
          )}
          {b.content.wins && b.content.wins.length > 0 && (
            <div className="mt-2 text-xs">
              <b>Wins:</b> {b.content.wins.join(", ")}
            </div>
          )}
          {b.content.losses && b.content.losses.length > 0 && (
            <div className="text-xs">
              <b>Losses:</b> {b.content.losses.join(", ")}
            </div>
          )}
          {b.content.next_week_focus && (
            <div className="text-xs">
              <b>Next week:</b> {b.content.next_week_focus}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
