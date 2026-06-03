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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEV_SEVERITIES, DEV_STATUSES, DEV_TYPES, type DevItem, type DevItemUpdate, type DevSeverity, type DevStatus, type DevType, type UserProfile } from "@/lib/ptops-types";
import { AttachmentsPanel } from "@/components/attachments-panel";

export const Route = createFileRoute("/dev/$id")({ component: DevDetail });

function DevDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const { data: item } = useQuery({
    queryKey: ["dev_item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("dev_items").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as DevItem | null;
    },
  });

  const { data: updates = [] } = useQuery({
    queryKey: ["dev_item_updates", id],
    queryFn: async () => {
      const { data } = await supabase.from("dev_item_updates").select("*").eq("dev_item_id", id).order("created_at", { ascending: false });
      return (data ?? []) as DevItemUpdate[];
    },
  });

  const { data: developers = [] } = useQuery({
    queryKey: ["users", "all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, email, full_name");
      return (data ?? []) as Pick<UserProfile, "id" | "email" | "full_name">[];
    },
  });

  const [form, setForm] = useState<Partial<DevItem>>({});
  useEffect(() => { if (item) setForm(item); }, [item]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = isAdmin ? {
        title: form.title, type: form.type, description: form.description,
        severity: form.severity, status: form.status, assigned_to: form.assigned_to ?? null,
        target_date: form.target_date || null, github_issue_url: form.github_issue_url ?? null,
        notes: form.notes ?? null, is_milestone: !!form.is_milestone,
      } : { status: form.status, notes: form.notes ?? null };
      const { error } = await supabase.from("dev_items").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dev_items"] });
      qc.invalidateQueries({ queryKey: ["dev_item", id] });
      qc.invalidateQueries({ queryKey: ["dev_item_updates", id] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassDialog open onOpenChange={(o) => !o && nav({ to: "/dev" })}>
      <GlassDialogContent size="xl">
        <GlassDialogHeader><GlassDialogTitle>{item?.title ?? "Item"}</GlassDialogTitle></GlassDialogHeader>
        {!item ? (
          <GlassDialogBody><div className="text-sm text-muted-foreground">Loading…</div></GlassDialogBody>
        ) : (
          <>
            <GlassDialogBody>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {isAdmin && (
                    <>
                      <div className="space-y-2"><Label>Title</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Type</Label>
                        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DevType })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{DEV_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as DevStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DEV_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <>
                      <div className="space-y-2"><Label>Severity</Label>
                        <Select value={form.severity ?? undefined} onValueChange={(v) => setForm({ ...form, severity: v as DevSeverity })}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{DEV_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label>Assignee</Label>
                        <Select value={form.assigned_to ?? "unassigned"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "unassigned" ? null : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {developers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label>Target date</Label><Input type="date" value={form.target_date ?? ""} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
                      <div className="space-y-2 col-span-2"><Label>GitHub issue URL</Label><Input value={form.github_issue_url ?? ""} onChange={(e) => setForm({ ...form, github_issue_url: e.target.value })} /></div>
                      <div className="space-y-2 col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                    </>
                  )}
                  <div className="space-y-2 col-span-2"><Label>Notes (developer-editable)</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold">Audit log</div>
                  {updates.length === 0 ? <div className="text-xs text-muted-foreground">No changes yet.</div> : (
                    <ul className="space-y-1 text-xs">
                      {updates.map((u) => (
                        <li key={u.id} className="rounded border border-white/10 bg-card/40 p-2 font-mono text-[11px]">
                          <span className="text-muted-foreground">{new Date(u.created_at).toLocaleString()} · </span>
                          <span className="text-foreground">{u.field_changed}</span>
                          <span className="text-muted-foreground"> {u.old_value ?? "∅"} → {u.new_value ?? "∅"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <AttachmentsPanel entityType="dev_item" entityId={item.id} />
              </div>
            </GlassDialogBody>
            <GlassDialogFooter>
              <Button variant="ghost" onClick={() => nav({ to: "/dev" })}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
            </GlassDialogFooter>
          </>
        )}
      </GlassDialogContent>
    </GlassDialog>
  );
}
