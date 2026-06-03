import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { GlassDialog, GlassDialogContent, GlassDialogHeader, GlassDialogTitle, GlassDialogBody, GlassDialogFooter } from "@/components/ui/glass-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DOMAINS, TASK_STATUSES, type Domain, type Task, type TaskStatus } from "@/lib/ptops-types";
import { AttachmentsPanel } from "@/components/attachments-panel";

export const Route = createFileRoute("/tasks/$id")({ component: TaskDetail });

function TaskDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: task, isLoading } = useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Task | null;
    },
  });

  const [form, setForm] = useState<Partial<Task>>({});
  useEffect(() => { if (task) setForm(task); }, [task]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").update({
        title: form.title, domain: form.domain, priority: form.priority,
        status: form.status, due_date: form.due_date || null, notes: form.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Saved"); nav({ to: "/tasks" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassDialog open onOpenChange={(o) => !o && nav({ to: "/tasks" })}>
      <GlassDialogContent size="xl">
        <GlassDialogHeader><GlassDialogTitle>Edit task</GlassDialogTitle></GlassDialogHeader>
        {isLoading || !task ? (
          <GlassDialogBody><div className="text-sm text-muted-foreground">Loading…</div></GlassDialogBody>
        ) : (
          <>
            <GlassDialogBody>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Title</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Domain</Label>
                    <Select value={form.domain} onValueChange={(v) => setForm({ ...form, domain: v as Domain })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Priority</Label>
                    <Select value={String(form.priority)} onValueChange={(v) => setForm({ ...form, priority: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>P{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Due date</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={5} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  Created {new Date(task.created_at).toLocaleString()}<br />
                  {task.completed_at && <>Completed {new Date(task.completed_at).toLocaleString()}</>}
                </div>
              </div>
            </GlassDialogBody>
            <GlassDialogFooter>
              <Button variant="ghost" onClick={() => nav({ to: "/tasks" })}>Cancel</Button>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
            </GlassDialogFooter>
          </>
        )}
      </GlassDialogContent>
    </GlassDialog>
  );
}
