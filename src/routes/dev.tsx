import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
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
import { DEV_SEVERITIES, DEV_STATUSES, DEV_TYPES, type DevItem, type DevSeverity, type DevStatus, type DevType } from "@/lib/ptops-types";
import { DevStatusBadge, DevTypeBadge, SeverityBadge, EmptyState } from "@/lib/ptops-ui";

export const Route = createFileRoute("/dev")({ component: DevLayout });

function DevLayout() {
  return (
    <AppShell>
      <DevPage />
      <Outlet />
    </AppShell>
  );
}

function DevPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [open, setOpen] = useState(false);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["dev_items", user?.id, role],
    enabled: !!user?.id,
    queryFn: async () => {
      // RLS already restricts: admins see all, developers see their own.
      const { data, error } = await supabase.from("dev_items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as DevItem[];
    },
  });

  const nextMilestone = items.find((i) => i.is_milestone && i.target_date && i.status !== "RESOLVED" && i.status !== "WONT_FIX");

  const cols: DevStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "WONT_FIX"];

  return (
    <>
      <PageHeader
        title="Dev Tracker"
        description={isAdmin ? "All bugs, features, milestones." : "Items assigned to you."}
        actions={isAdmin ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />New item</Button> : null}
      />
      <div className="space-y-4 p-6">
        {nextMilestone && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="font-mono text-[10px] uppercase text-primary">Next milestone — target {nextMilestone.target_date}</div>
            <div className="font-medium">{nextMilestone.title}</div>
          </div>
        )}
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          items.length === 0 ? <EmptyState title="No items" hint={isAdmin ? "Create your first dev item." : "Nothing assigned to you yet."} /> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {cols.map((status) => {
              const list = items.filter((i) => i.status === status);
              return (
                <div key={status} className="rounded-lg border bg-card/40 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">{status.replace("_", " ")}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((i) => (
                      <Link key={i.id} to="/dev/$id" params={{ id: i.id }} className="block rounded-md border bg-card p-2 text-sm hover:border-primary/50">
                        <div className="flex items-center gap-1.5">
                          <DevTypeBadge type={i.type} />
                          <SeverityBadge severity={i.severity} />
                          {i.is_milestone && <span className="font-mono text-[10px] text-primary">★</span>}
                        </div>
                        <div className="mt-1 font-medium">{i.title}</div>
                        {i.target_date && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{i.target_date}</div>}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>}
      </div>
      <DevSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function DevSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: "BUG" as DevType, title: "", description: "", severity: "S2" as DevSeverity,
    is_milestone: false, target_date: "", github_issue_url: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!form.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("dev_items").insert({
        created_by: user.id, type: form.type, title: form.title.trim(),
        description: form.description || null, severity: form.severity,
        is_milestone: form.is_milestone, target_date: form.target_date || null,
        github_issue_url: form.github_issue_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dev_items"] }); toast.success("Created"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogHeader><GlassDialogTitle>New dev item</GlassDialogTitle></GlassDialogHeader>
        <GlassDialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DevType, is_milestone: v === "MILESTONE" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEV_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as DevSeverity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEV_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>GitHub issue URL</Label><Input value={form.github_issue_url} onChange={(e) => setForm({ ...form, github_issue_url: e.target.value })} /></div>
          </div>
        </GlassDialogBody>
        <GlassDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
        </GlassDialogFooter>
      </GlassDialogContent>
    </GlassDialog>
  );
}
