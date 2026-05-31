import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassDialog, GlassDialogContent, GlassDialogHeader, GlassDialogTitle, GlassDialogBody, GlassDialogFooter } from "@/components/ui/glass-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LEAD_STAGES, LEAD_SOURCES, type Lead, type LeadSource, type LeadStage } from "@/lib/ptops-types";
import { LeadStageBadge, EmptyState, isOverdue } from "@/lib/ptops-ui";
import { pipelineValueNis } from "@/lib/ptops-logic";

export const Route = createFileRoute("/crm")({ component: CrmLayout });

function CrmLayout() {
  return (
    <AppShell requireAdmin>
      <CrmPage />
      <Outlet />
    </AppShell>
  );
}

function CrmPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("user_id", user!.id).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  return (
    <>
      <PageHeader
        title="CRM"
        description={`${leads.length} leads · ₪${pipelineValueNis(leads).toLocaleString()}/mo active pipeline`}
        actions={
          <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />New lead
          </Button>
        }
      />
      <div className="p-4 md:p-6">
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          leads.length === 0 ? <EmptyState title="No leads yet" action={<Button onClick={() => setOpen(true)}>Add first lead</Button>} /> :
          <KanbanBoard leads={leads} />}
      </div>
      <LeadSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function KanbanBoard({ leads }: { leads: Lead[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4 2xl:grid-cols-8">
      {LEAD_STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="w-[80vw] shrink-0 snap-start rounded-lg border bg-card/40 p-2 md:w-auto md:shrink">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{stage.replace(/_/g, " ")}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((l) => (
                <Link key={l.id} to="/crm/$id" params={{ id: l.id }} className="block rounded-md border bg-card p-2 text-sm hover:border-primary/50">
                  <div className="font-medium">{l.name}</div>
                  {l.business_name && <div className="truncate text-xs text-muted-foreground">{l.business_name}</div>}
                  <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{l.monthly_value_nis ? `₪${Number(l.monthly_value_nis).toLocaleString()}/mo` : "—"}</span>
                    {l.next_action_date && <span className={isOverdue(l.next_action_date) && !["WON","LOST"].includes(l.stage) ? "text-destructive" : ""}>{l.next_action_date}</span>}
                  </div>
                </Link>
              ))}
              {items.length === 0 && <div className="rounded border border-dashed py-3 text-center font-mono text-[10px] text-muted-foreground">empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", business_name: "", phone: "", email: "", source: "INBOUND" as LeadSource, stage: "PROSPECT" as LeadStage, monthly_value_nis: "" });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!form.name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("leads").insert({
        user_id: user.id,
        name: form.name.trim(),
        business_name: form.business_name || null,
        phone: form.phone || null,
        email: form.email || null,
        source: form.source,
        stage: form.stage,
        monthly_value_nis: form.monthly_value_nis ? Number(form.monthly_value_nis) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead created");
      onOpenChange(false);
      setForm({ name: "", business_name: "", phone: "", email: "", source: "INBOUND", stage: "PROSPECT", monthly_value_nis: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogHeader><GlassDialogTitle>New lead</GlassDialogTitle></GlassDialogHeader>
        <GlassDialogBody>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Business name</Label><Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as LeadSource })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as LeadStage })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Monthly value (₪)</Label><Input type="number" value={form.monthly_value_nis} onChange={(e) => setForm({ ...form, monthly_value_nis: e.target.value })} /></div>
          </div>
        </GlassDialogBody>
        <GlassDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Create"}</Button>
        </GlassDialogFooter>
      </GlassDialogContent>
    </GlassDialog>
  );
}
