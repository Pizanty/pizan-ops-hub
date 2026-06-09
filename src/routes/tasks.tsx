import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassDialog, GlassDialogContent, GlassDialogHeader, GlassDialogTitle, GlassDialogBody, GlassDialogFooter } from "@/components/ui/glass-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DOMAINS, TASK_STATUSES, type Domain, type Task, type TaskStatus } from "@/lib/ptops-types";
import { DomainBadge, TaskStatusBadge, PriorityDot, EmptyState, isOverdue } from "@/lib/ptops-ui";
import { rankTasks } from "@/lib/ptops-logic";

export const Route = createFileRoute("/tasks")({ component: TasksLayout });

function TasksLayout() {
  return (
    <AppShell requireAdmin>
      <TasksPage />
      <Outlet />
    </AppShell>
  );
}

function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [domainFilter, setDomainFilter] = useState<Domain | "ALL">("ALL");

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: stageRows = [] } = useQuery({
    queryKey: ["task_stages", "all", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_stages")
        .select("task_id,done,position,label")
        .eq("user_id", user!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as { task_id: string; done: boolean; position: number; label: string }[];
    },
  });

  const stageSummary = (() => {
    const map = new Map<string, { total: number; done: number; current: string | null }>();
    for (const r of stageRows) {
      const e = map.get(r.task_id) ?? { total: 0, done: 0, current: null };
      e.total += 1;
      if (r.done) e.done += 1;
      else if (e.current == null) e.current = r.label;
      map.set(r.task_id, e);
    }
    return map;
  })();

  const tasks = (() => {
    const active = rankTasks(allTasks);
    const completed = allTasks
      .filter((t) => t.status === "DONE" || t.status === "ARCHIVED")
      .sort((a, b) => {
        const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tb - ta;
      });
    return [...active, ...completed];
  })();

  const filtered = tasks.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (domainFilter !== "ALL" && t.domain !== domainFilter) return false;
    return true;
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${tasks.filter((t) => t.status !== "DONE" && t.status !== "ARCHIVED").length} open`}
        actions={
          <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />New task
          </Button>
        }
      />
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "ALL")}>
            <SelectTrigger className="min-w-[140px] flex-1 md:w-40 md:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={domainFilter} onValueChange={(v) => setDomainFilter(v as Domain | "ALL")}>
            <SelectTrigger className="min-w-[140px] flex-1 md:w-40 md:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All domains</SelectItem>
              {DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : filtered.length === 0 ? (
          <EmptyState title="No tasks" hint="Create your first task to get started." action={<Button onClick={() => setOpen(true)}>New task</Button>} />
        ) : (
          <>
            {/* Mobile card list */}
            <ul className="space-y-2 md:hidden">
              {filtered.map((t) => (
                <li key={t.id} className="rounded-lg border bg-card p-3">
                  <Link to="/tasks/$id" params={{ id: t.id }} className="block text-sm font-medium leading-snug hover:underline">
                    {t.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <DomainBadge domain={t.domain} />
                    <PriorityDot priority={t.priority} />
                    <TaskStatusBadge status={t.status} />
                    <StageProgress summary={stageSummary.get(t.id)} />
                    {t.due_date && (
                      <span className={"font-mono text-[10px] " + (isOverdue(t.due_date) && t.status !== "DONE" ? "text-destructive" : "text-muted-foreground")}>
                        {t.due_date}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2">
                    {t.status !== "DONE" && (
                      <Button size="sm" variant="ghost" className="min-h-11" onClick={() => updateStatus.mutate({ id: t.id, status: "DONE" })}>
                        Mark done
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-11 w-11" aria-label="Delete task">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete task?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTask.mutate(t.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left font-mono text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">Pri</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <Link to="/tasks/$id" params={{ id: t.id }} className="hover:underline">{t.title}</Link>
                      </td>
                      <td className="px-3 py-2"><DomainBadge domain={t.domain} /></td>
                      <td className="px-3 py-2"><PriorityDot priority={t.priority} /></td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><TaskStatusBadge status={t.status} /><StageProgress summary={stageSummary.get(t.id)} /></div></td>
                      <td className={"px-3 py-2 font-mono text-xs " + (isOverdue(t.due_date) && t.status !== "DONE" ? "text-destructive" : "text-muted-foreground")}>{t.due_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {t.status !== "DONE" && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "DONE" })}>Done</Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete task"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete task?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTask.mutate(t.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <TaskSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function TaskSheet({ open, onOpenChange, task }: { open: boolean; onOpenChange: (b: boolean) => void; task?: Task }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? "");
  const [domain, setDomain] = useState<Domain>(task?.domain ?? "OPS");
  const [priority, setPriority] = useState<number>(task?.priority ?? 3);
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!title.trim()) throw new Error("Title required");
      const payload = {
        user_id: user.id,
        title: title.trim(),
        domain,
        priority,
        due_date: dueDate || null,
        notes: notes || null,
      };
      if (task) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(task ? "Updated" : "Created");
      onOpenChange(false);
      if (!task) { setTitle(""); setNotes(""); setDueDate(""); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogHeader><GlassDialogTitle>{task ? "Edit task" : "New task"}</GlassDialogTitle></GlassDialogHeader>
        <GlassDialogBody>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Domain</Label>
                <Select value={domain} onValueChange={(v) => setDomain(v as Domain)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Priority</Label>
                <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>P{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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

export { TaskSheet };
