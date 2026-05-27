import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CONTEXT_KEYS, type BusinessContextRow, type ContextKey } from "@/lib/ptops-types";

export const Route = createFileRoute("/context")({
  component: () => <AppShell requireAdmin><ContextPage /></AppShell>,
});

const LABELS: Record<ContextKey, string> = {
  current_phase: "Current phase",
  caterflow_status: "CaterFlow status",
  paying_clients: "Paying clients",
  warm_leads: "Warm leads",
  "90_day_target": "90-day target",
  success_threshold: "Success threshold",
  operator_hours: "Operator hours / week",
  capital_available: "Capital available",
  current_blockers: "Current blockers",
};

function ContextPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["business_context", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("business_context").select("*").eq("user_id", user!.id);
      return (data ?? []) as BusinessContextRow[];
    },
  });

  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value ?? "";
    setValues((prev) => ({ ...map, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const payload = CONTEXT_KEYS.map((k) => ({ user_id: user.id, key: k, value: values[k] ?? "" }));
      const { error } = await supabase.from("business_context").upsert(payload, { onConflict: "user_id,key" as any });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["business_context"] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Business Context" description="These values are passed to AI briefing prompts." actions={<Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save all</Button>} />
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {CONTEXT_KEYS.map((k) => (
          <div key={k} className="space-y-2">
            <Label>{LABELS[k]}</Label>
            <Textarea rows={3} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
          </div>
        ))}
      </div>
    </>
  );
}
