import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GlassDialog, GlassDialogContent, GlassDialogHeader, GlassDialogTitle, GlassDialogBody, GlassDialogFooter } from "@/components/ui/glass-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CONTACT_METHODS, LEAD_STAGES, LEAD_SOURCES, LOST_REASONS, type ContactMethod, type Lead, type LeadContact, type LeadSource, type LeadStage } from "@/lib/ptops-types";
import { LeadStageBadge, ContactMethodIcon } from "@/lib/ptops-ui";
import { WonDialog, LostDialog } from "@/lib/ptops-stage-actions";

export const Route = createFileRoute("/crm/$id")({ component: LeadDetail });

function LeadDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: lead } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["lead_contacts", id],
    queryFn: async () => {
      const { data } = await supabase.from("lead_contacts").select("*").eq("lead_id", id).order("contact_date", { ascending: false });
      return (data ?? []) as LeadContact[];
    },
  });

  const [form, setForm] = useState<Partial<Lead>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  useEffect(() => { if (lead) setForm(lead); }, [lead]);

  const save = useMutation({
    mutationFn: async (overrides: Partial<Lead> = {}) => {
      const payload = { ...form, ...overrides };
      const { error } = await supabase.from("leads").update({
        name: payload.name, business_name: payload.business_name, phone: payload.phone, email: payload.email,
        source: payload.source, stage: payload.stage,
        next_action: payload.next_action, next_action_date: payload.next_action_date || null,
        monthly_value_nis: payload.monthly_value_nis ? Number(payload.monthly_value_nis) : null,
        lost_reason: payload.lost_reason, notes: payload.notes,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["lead", id] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleStageSelect(v: string) {
    if (v === "WON") { setWonOpen(true); return; }
    if (v === "LOST") { setLostOpen(true); return; }
    setForm({ ...form, stage: v as LeadStage });
  }


  return (
    <GlassDialog open onOpenChange={(o) => !o && nav({ to: "/crm" })}>
      <GlassDialogContent size="xl">
        <GlassDialogHeader>
          <GlassDialogTitle className="flex items-center gap-2">{lead?.name ?? "Lead"} {form.stage && <LeadStageBadge stage={form.stage as LeadStage} />}</GlassDialogTitle>
        </GlassDialogHeader>
        {!lead ? (
          <GlassDialogBody><div className="text-sm text-muted-foreground">Loading…</div></GlassDialogBody>
        ) : (
          <>
            <GlassDialogBody>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Name</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Business</Label><Input value={form.business_name ?? ""} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Stage</Label>
                    <Select value={form.stage} onValueChange={handleStageSelect}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Source</Label>
                    <Select value={form.source ?? undefined} onValueChange={(v) => setForm({ ...form, source: v as LeadSource })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Monthly value (₪)</Label><Input type="number" value={form.monthly_value_nis ?? ""} onChange={(e) => setForm({ ...form, monthly_value_nis: e.target.value as any })} /></div>
                  <div className="space-y-2"><Label>Next action date</Label><Input type="date" value={form.next_action_date ?? ""} onChange={(e) => setForm({ ...form, next_action_date: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Next action</Label><Input value={form.next_action ?? ""} onChange={(e) => setForm({ ...form, next_action: e.target.value })} placeholder="e.g. Send proposal" /></div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={4} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                {form.stage === "LOST" && (
                  <div className="space-y-2"><Label>Lost reason</Label>
                    <Select value={form.lost_reason ?? undefined} onValueChange={(v) => setForm({ ...form, lost_reason: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick reason" /></SelectTrigger>
                      <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <div className="mb-2 text-sm font-semibold">Contact history</div>
                  {contacts.length === 0 ? <div className="text-xs text-muted-foreground">No contacts logged.</div> : (
                    <ul className="space-y-2">
                      {contacts.map((c) => (
                        <li key={c.id} className="rounded border border-white/10 bg-card/40 p-2 text-sm">
                          <div className="flex items-center justify-between">
                            <ContactMethodIcon method={c.method} />
                            <span className="font-mono text-[10px] text-muted-foreground">{c.contact_date}</span>
                          </div>
                          {c.summary && <p className="mt-1 text-xs text-muted-foreground">{c.summary}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </GlassDialogBody>
            <GlassDialogFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <LogContactDialog leadId={id} userId={user?.id} open={logOpen} onOpenChange={setLogOpen} />
                <Button variant="outline" onClick={() => setWonOpen(true)}>Mark Won</Button>
                <Button variant="outline" onClick={() => setLostOpen(true)}>Mark Lost</Button>
              </div>
              <Button onClick={() => save.mutate({})} disabled={save.isPending}>Save</Button>
            </GlassDialogFooter>
            <WonDialog open={wonOpen} lead={lead} userId={user?.id} onOpenChange={setWonOpen} />
            <LostDialog open={lostOpen} lead={lead} onOpenChange={setLostOpen} />
          </>
        )}
      </GlassDialogContent>
    </GlassDialog>
  );
}

function LogContactDialog({ leadId, userId, open, onOpenChange }: { leadId: string; userId?: string; open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<ContactMethod>("WHATSAPP");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("lead_contacts").insert({ lead_id: leadId, user_id: userId, method, contact_date: date, summary: summary || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead_contacts", leadId] }); toast.success("Logged"); onOpenChange(false); setSummary(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button variant="secondary">Log contact</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ContactMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTACT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Summary</Label><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
