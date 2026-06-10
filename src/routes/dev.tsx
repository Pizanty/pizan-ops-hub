import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

type DevSearch = { q: string; types: DevType[]; priorities: DevPriority[]; mine: boolean };

function toArr<T extends string>(v: unknown, allowed: readonly T[]): T[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : [];
  return raw.filter((x): x is T => typeof x === "string" && (allowed as readonly string[]).includes(x));
}

export const Route = createFileRoute("/dev")({
  component: DevLayout,
  validateSearch: (search: Record<string, unknown>): DevSearch => ({
    q: typeof search.q === "string" ? search.q : "",
    types: toArr(search.types, DEV_TYPES),
    priorities: toArr(search.priorities, DEV_PRIORITIES),
    mine: search.mine === true || search.mine === "true",
  }),
});

function DevLayout() {
  return (
    <AppShell>
      <DevPage />
      <Outlet />
    </AppShell>
  );
}

const STATUS_TONE: Record<DevStatus, { dot: string; text: string }> = {
  OPEN: { dot: "bg-sky-400", text: "text-sky-400" },
  IN_PROGRESS: { dot: "bg-amber-400", text: "text-amber-400" },
  BLOCKED: { dot: "bg-rose-400", text: "text-rose-400" },
  RESOLVED: { dot: "bg-emerald-400", text: "text-emerald-400" },
  WONT_FIX: { dot: "bg-zinc-500", text: "text-zinc-500" },
};

function DevPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/dev" });
  const search = Route.useSearch();
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
  const nonMilestoneItems = useMemo(() => items.filter((i) => !i.is_milestone), [items]);

  // ----- Filtering -----
  const q = search.q.trim().toLowerCase();
  const filtered = useMemo(() => {
    return nonMilestoneItems.filter((i) => {
      if (q && !i.title.toLowerCase().includes(q)) return false;
      if (search.types.length > 0 && !search.types.includes(i.type)) return false;
      if (search.priorities.length > 0 && !search.priorities.includes(i.priority)) return false;
      if (search.mine && user?.id && i.created_by !== user.id && i.assigned_to !== user.id) return false;
      return true;
    });
  }, [nonMilestoneItems, q, search.types, search.priorities, search.mine, user?.id]);

  const totalCounts = useMemo(() => {
    const m = new Map<DevStatus, number>();
    for (const i of filtered) m.set(i.status, (m.get(i.status) ?? 0) + 1);
    return m;
  }, [filtered]);

  const setSearch = (patch: Partial<DevSearch>) => {
    navigate({ search: (prev: DevSearch) => ({ ...prev, ...patch }), replace: true });
  };
  const toggleInArr = <T extends string>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const hasActiveFilters = q.length > 0 || search.types.length > 0 || search.priorities.length > 0 || search.mine;

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

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 p-2">
          <div className="relative min-w-0 flex-1 sm:flex-initial sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.q}
              onChange={(e) => setSearch({ q: e.target.value })}
              placeholder="Search title…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {DEV_TYPES.filter((t) => t !== "MILESTONE").map((t) => {
              const active = search.types.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => setSearch({ types: toggleInArr(search.types, t) })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition",
                    active ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >{t}</button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {DEV_PRIORITIES.map((p) => {
              const active = search.priorities.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => setSearch({ priorities: toggleInArr(search.priorities, p) })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition",
                    active ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >{p}</button>
              );
            })}
          </div>
          <button
            onClick={() => setSearch({ mine: !search.mine })}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition",
              search.mine ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >Mine</button>
          {hasActiveFilters && (
            <button
              onClick={() => navigate({ search: { q: "", types: [], priorities: [], mine: false }, replace: true })}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            ><X className="h-3 w-3" /> Reset</button>
          )}
        </div>

        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          nonMilestoneItems.length === 0 && milestones.length === 0 ? <EmptyState title="No items" hint={isAdmin ? "Create your first dev item." : "Nothing assigned to you yet."} /> :
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-5">
            {cols.map((status) => {
              const list = filtered.filter((i) => i.status === status);
              const tone = STATUS_TONE[status];
              return (
                <div key={status} className="flex w-[82vw] shrink-0 snap-start flex-col rounded-lg border bg-card/40 p-2 md:w-auto md:min-w-0 md:shrink">
                  <div className="mb-2 flex min-w-0 items-center justify-between px-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                      <span className={cn("truncate font-mono text-[10px] uppercase", tone.text)}>{status.replace("_", " ")}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{list.length}</span>
                  </div>
                  {list.length === 0 ? (
                    <div className="rounded border border-dashed border-border/60 px-2 py-3 text-center font-mono text-[10px] text-muted-foreground">
                      {totalCounts.get(status) ? "no match" : "empty"}
                    </div>
                  ) : (
                    <StatusColumnBody
                      items={list}
                      isAdmin={isAdmin}
                      unblockedIds={unblockedIds}
                      onDelete={(id, title) => { if (confirm(`Delete "${title}"?`)) del.mutate(id); }}
                    />
                  )}
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

// ---------- Status column body: groups items by priority into buckets ----------
const PRIO_META: Record<DevPriority, { label: string; tone: string; defaultOpen: boolean }> = {
  P1: { label: "P1 · High", tone: "text-rose-300", defaultOpen: true },
  P2: { label: "P2 · Medium", tone: "text-amber-300", defaultOpen: true },
  P3: { label: "P3 · Low", tone: "text-zinc-400", defaultOpen: false },
};

type ColumnBodyProps = {
  items: DevItem[];
  isAdmin: boolean;
  unblockedIds: Set<string>;
  onDelete: (id: string, title: string) => void;
};

function StatusColumnBody({ items, isAdmin, unblockedIds, onDelete }: ColumnBodyProps) {
  const buckets = useMemo(() => {
    const m = new Map<DevPriority, DevItem[]>();
    for (const p of DEV_PRIORITIES) m.set(p, []);
    for (const i of items) m.get((i.priority ?? "P3") as DevPriority)?.push(i);
    return m;
  }, [items]);

  return (
    <div className="space-y-2">
      {DEV_PRIORITIES.map((p) => {
        const list = buckets.get(p) ?? [];
        if (list.length === 0) return null;
        return (
          <PriorityBucket
            key={p}
            label={PRIO_META[p].label}
            tone={PRIO_META[p].tone}
            defaultOpen={PRIO_META[p].defaultOpen}
            items={list}
            isAdmin={isAdmin}
            unblockedIds={unblockedIds}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

function PriorityBucket({
  label, tone, defaultOpen, items, isAdmin, unblockedIds, onDelete,
}: {
  label: string;
  tone: string;
  defaultOpen: boolean;
  items: DevItem[];
  isAdmin: boolean;
  unblockedIds: Set<string>;
  onDelete: (id: string, title: string) => void;
}) {
  const PREVIEW = 5;
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || items.length <= PREVIEW;
  const visible = showAll ? items : items.slice(0, PREVIEW);
  const hiddenCount = items.length - visible.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition hover:bg-card/70"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className={cn("min-w-0 truncate font-mono text-[10px] uppercase tracking-wide", tone)}>{label}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{items.length}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-1">
          {visible.map((i) => (
            <DevCard
              key={i.id}
              item={i}
              isAdmin={isAdmin}
              ready={unblockedIds.has(i.id)}
              onDelete={onDelete}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded border border-dashed border-border/60 px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >Show {hiddenCount} more</button>
          )}
          {expanded && items.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full rounded px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
            >Collapse</button>
          )}
        </div>
      )}
    </div>
  );
}

const DevCard = memo(function DevCard({
  item, isAdmin, ready, onDelete,
}: {
  item: DevItem;
  isAdmin: boolean;
  ready: boolean;
  onDelete: (id: string, title: string) => void;
}) {
  // Only show target date if within 7 days or overdue.
  const showDate = !!item.target_date && (() => {
    const t = new Date(item.target_date).getTime();
    if (Number.isNaN(t)) return false;
    const days = (t - Date.now()) / 86400000;
    return days < 7;
  })();
  const blockCount = item.blocked_by?.length ?? 0;

  return (
    <div className="group relative rounded-md border bg-card p-2 text-sm hover:border-primary/50">
      <Link to="/dev/$id" params={{ id: item.id }} className="block min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{item.type}</span>
          <DevPriorityBadge priority={item.priority} />
          {item.type === "BUG" && <SeverityBadge severity={item.severity} />}
          {ready && <span className="rounded border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-success)]">ready</span>}
          {blockCount > 0 && <span className="rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">blk {blockCount}</span>}
        </div>
        <div className="mt-1 line-clamp-2 break-words text-[13px] font-medium leading-snug">{item.title}</div>
        {showDate && <div className="mt-1 font-mono text-[10px] text-amber-300">due {item.target_date}</div>}
      </Link>
      {isAdmin && (
        <button
          aria-label="Delete"
          onClick={(e) => { e.preventDefault(); onDelete(item.id, item.title); }}
          className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        ><Trash2 className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );
});
