import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { DEV_PRIORITIES, DEV_SEVERITIES, DEV_TYPES, type DevItem, type DevPriority, type DevSeverity, type DevStatus, type DevType } from "@/lib/ptops-types";
import { DevPriorityBadge, SeverityBadge, EmptyState } from "@/lib/ptops-ui";

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
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const [open, setOpen] = useState(false);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["dev_items", user?.id, role],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("dev_items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as DevItem[];
    },
  });

  const openItems = items.filter((i) => i.status !== "RESOLVED" && i.status !== "WONT_FIX");
  const milestones = openItems.filter((i) => i.is_milestone);
  const closedSet = new Set<DevStatus>(["RESOLVED", "WONT_FIX"]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);
  const unblockedIds = useMemo(() => {
    const out = new Set<string>();
    for (const i of openItems) {
      const bb = i.blocked_by ?? [];
      if (bb.length > 0 && bb.every((id) => closedSet.has((byId.get(id)?.status ?? "OPEN") as DevStatus))) {
        out.add(i.id);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItems, byId]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dev_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dev_items"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cols: DevStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "WONT_FIX"];
  const nonMilestoneItems = items.filter((i) => !i.is_milestone);

  return (
    <>
      <PageHeader
        title="Dev Tracker"
        description={isAdmin ? "Milestones, features, bugs." : "Items assigned to you."}
        actions={isAdmin ? <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus className="mr-1 h-4 w-4" />New item</Button> : null}
      />
      <div className="space-y-4 p-4 md:p-6">
        {milestones.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-primary">★ Milestones</span>
              <span className="font-mono text-[10px] text-muted-foreground">{milestones.length} open</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {milestones.map((m) => {
                const blocksCount = openItems.filter((i) => (i.blocked_by ?? []).includes(m.id)).length;
                return (
                  <div key={m.id} className="group relative rounded-lg border border-primary/30 bg-primary/5 p-3 hover:border-primary/60">
                    <Link to="/dev/$id" params={{ id: m.id }} className="block">
                      <div className="flex items-center gap-1.5">
                        <DevPriorityBadge priority={m.priority} />
                        {blocksCount > 0 && <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">blocks {blocksCount}</span>}
                      </div>
                      <div className="mt-1 text-sm font-medium">{m.title}</div>
                      {m.target_date && <div className="mt-1 font-mono text-[10px] text-muted-foreground">target {m.target_date}</div>}
                    </Link>
                    {isAdmin && (
                      <button
                        aria-label="Delete"
                        onClick={(e) => { e.preventDefault(); if (confirm(`Delete "${m.title}"?`)) del.mutate(m.id); }}
                        className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          nonMilestoneItems.length === 0 && milestones.length === 0 ? <EmptyState title="No items" hint={isAdmin ? "Create your first dev item." : "Nothing assigned to you yet."} /> :
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-5">
            {cols.map((status) => {
              const list = nonMilestoneItems.filter((i) => i.status === status);
              return (
                <div key={status} className="w-[80vw] shrink-0 snap-start rounded-lg border bg-card/40 p-2 md:w-auto md:shrink">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">{status.replace("_", " ")}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((i) => (
                      <div key={i.id} className="group relative rounded-md border bg-card p-2 text-sm hover:border-primary/50">
                        <Link to="/dev/$id" params={{ id: i.id }} className="block">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{i.type}</span>
                            <DevPriorityBadge priority={i.priority} />
                            {i.type === "BUG" && <SeverityBadge severity={i.severity} />}
                            {unblockedIds.has(i.id) && <span className="rounded border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-success)]">ready</span>}
                          </div>
                          <div className="mt-1 font-medium">{i.title}</div>
                          {(i.blocked_by?.length ?? 0) > 0 && (
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">blocked by {i.blocked_by.length}</div>
                          )}
                          {i.target_date && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{i.target_date}</div>}
                        </Link>
                        {isAdmin && (
                          <button
                            aria-label="Delete"
                            onClick={(e) => { e.preventDefault(); if (confirm(`Delete "${i.title}"?`)) del.mutate(i.id); }}
                            className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          ><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>}
      </div>
      <DevSheet open={open} onOpenChange={setOpen} items={items} />
    </>
  );
}

function DevSheet({ open, onOpenChange, items }: { open: boolean; onOpenChange: (b: boolean) => void; items: DevItem[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: "FEATURE" as DevType, title: "", description: "",
    priority: "P2" as DevPriority,
    severity: "" as "" | DevSeverity,
    is_milestone: false, target_date: "", github_issue_url: "",
    blocked_by: [] as string[],
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!form.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("dev_items").insert({
        created_by: user.id,
        type: form.type,
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        severity: form.type === "BUG" && form.severity ? form.severity : null,
        is_milestone: form.is_milestone,
        target_date: form.target_date || null,
        github_issue_url: form.github_issue_url || null,
        blocked_by: form.blocked_by,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dev_items"] }); toast.success("Created"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const candidates = items.filter((i) => i.status !== "RESOLVED" && i.status !== "WONT_FIX");
  const toggleBlocker = (id: string) => {
    setForm((f) => ({ ...f, blocked_by: f.blocked_by.includes(id) ? f.blocked_by.filter((x) => x !== id) : [...f.blocked_by, id] }));
  };
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogHeader><GlassDialogTitle>New dev item</GlassDialogTitle></GlassDialogHeader>
        <GlassDialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DevType, is_milestone: v === "MILESTONE" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEV_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Priority (build)</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as DevPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEV_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "BUG" && (
              <div className="space-y-2"><Label>Severity (live-incident impact)</Label>
                <Select value={form.severity || "none"} onValueChange={(v) => setForm({ ...form, severity: v === "none" ? "" : (v as DevSeverity) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {DEV_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>GitHub issue URL</Label><Input value={form.github_issue_url} onChange={(e) => setForm({ ...form, github_issue_url: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Blocked by</Label>
              {candidates.length === 0 ? <div className="text-xs text-muted-foreground">No open items to depend on.</div> : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                  {candidates.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 text-xs">
                      <input type="checkbox" checked={form.blocked_by.includes(c.id)} onChange={() => toggleBlocker(c.id)} className="mt-0.5" />
                      <span className="flex-1"><span className="font-mono text-[10px] text-muted-foreground">{c.type}{c.is_milestone ? " ★" : ""}</span> {c.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
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
