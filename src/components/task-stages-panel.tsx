import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { TaskStage } from "@/lib/ptops-types";

export function TaskStagesPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["task_stages", taskId] as const;
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const { data: stages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_stages")
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskStage[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: async (label: string) => {
      if (!user) throw new Error("Not signed in");
      const position = stages.length ? stages[stages.length - 1].position + 1 : 0;
      const { error } = await supabase.from("task_stages").insert({
        task_id: taskId,
        user_id: user.id,
        label: label.trim(),
        position,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setNewLabel(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (s: TaskStage) => {
      const { error } = await supabase.from("task_stages").update({ done: !s.done }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("task_stages").update({ label: label.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = stages.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= stages.length) return;
      const a = stages[idx];
      const b = stages[swap];
      const { error: e1 } = await supabase.from("task_stages").update({ position: b.position }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("task_stages").update({ position: a.position }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const total = stages.length;
  const done = stages.filter((s) => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Stages</div>
        {total > 0 && (
          <div className="font-mono text-[10px] text-muted-foreground">
            {done} / {total} · {pct}%
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : stages.length === 0 ? (
        <div className="text-xs text-muted-foreground">No stages yet. Add steps to break this task down.</div>
      ) : (
        <ul className="space-y-1">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded border border-white/10 bg-card/40 p-2 text-xs"
            >
              <Checkbox
                checked={s.done}
                onCheckedChange={() => toggle.mutate(s)}
                aria-label={`Mark ${s.label} done`}
              />
              <div className="min-w-0 flex-1">
                {editingId === s.id ? (
                  <div className="flex gap-1">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename.mutate({ id: s.id, label: editLabel });
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-7"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rename.mutate({ id: s.id, label: editLabel })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={"block w-full truncate text-left " + (s.done ? "text-muted-foreground line-through" : "")}
                    onClick={() => { setEditingId(s.id); setEditLabel(s.label); }}
                  >
                    {s.label}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move.mutate({ id: s.id, dir: -1 })} aria-label="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === stages.length - 1} onClick={() => move.mutate({ id: s.id, dir: 1 })} aria-label="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => { if (confirm(`Delete stage "${s.label}"?`)) remove.mutate(s.id); }}
                  aria-label="Delete stage"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1 pt-1">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newLabel.trim()) add.mutate(newLabel);
          }}
          placeholder="Add a stage…"
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!newLabel.trim() || add.isPending}
          onClick={() => add.mutate(newLabel)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />Add
        </Button>
      </div>
    </div>
  );
}
