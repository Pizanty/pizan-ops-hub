import { cn } from "@/lib/utils";
import type {
  Domain,
  TaskStatus,
  LeadStage,
  DevSeverity,
  DevStatus,
  DevType,
  ContactMethod,
} from "@/lib/ptops-types";

export function DomainBadge({ domain }: { domain: Domain }) {
  const cls: Record<Domain, string> = {
    SALES: "bg-[var(--color-domain-sales)]/15 text-[var(--color-domain-sales)] border-[var(--color-domain-sales)]/30",
    PRODUCT: "bg-[var(--color-domain-product)]/15 text-[var(--color-domain-product)] border-[var(--color-domain-product)]/30",
    OPS: "bg-[var(--color-domain-ops)]/15 text-[var(--color-domain-ops)] border-[var(--color-domain-ops)]/30",
    STRATEGY: "bg-[var(--color-domain-strategy)]/15 text-[var(--color-domain-strategy)] border-[var(--color-domain-strategy)]/30",
  };
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase", cls[domain])}>{domain}</span>;
}

export function StatusPill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "success" | "warning" | "danger" | "muted" | "info" }) {
  const tones = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/30",
    warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]/30",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground border-border opacity-70",
    info: "bg-primary/15 text-primary border-primary/30",
  };
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase", tones[tone])}>{children}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, "default" | "info" | "warning" | "success" | "muted"> = {
    TODO: "default",
    IN_PROGRESS: "info",
    BLOCKED: "warning",
    DONE: "success",
    ARCHIVED: "muted",
  };
  return <StatusPill tone={map[status]}>{status.replace("_", " ")}</StatusPill>;
}

export function PriorityDot({ priority }: { priority: number }) {
  const colors = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-zinc-500"];
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", colors[priority] ?? "bg-zinc-500")} />P{priority}
    </span>
  );
}

export function LeadStageBadge({ stage }: { stage: LeadStage }) {
  const tone: Record<LeadStage, "default" | "info" | "warning" | "success" | "danger" | "muted"> = {
    PROSPECT: "default",
    CONTACTED: "info",
    DEMO_SCHEDULED: "info",
    DEMO_DONE: "info",
    NEGOTIATION: "warning",
    WON: "success",
    LOST: "danger",
    ON_HOLD: "muted",
  };
  return <StatusPill tone={tone[stage]}>{stage.replace(/_/g, " ")}</StatusPill>;
}

export function SeverityBadge({ severity }: { severity: DevSeverity | null }) {
  if (!severity) return null;
  const tones: Record<DevSeverity, string> = {
    S1: "bg-[var(--color-sev-s1)]/15 text-[var(--color-sev-s1)] border-[var(--color-sev-s1)]/30",
    S2: "bg-[var(--color-sev-s2)]/15 text-[var(--color-sev-s2)] border-[var(--color-sev-s2)]/30",
    S3: "bg-[var(--color-sev-s3)]/15 text-[var(--color-sev-s3)] border-[var(--color-sev-s3)]/30",
  };
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px]", tones[severity])}>{severity}</span>;
}

export function DevStatusBadge({ status }: { status: DevStatus }) {
  const tone: Record<DevStatus, "default" | "info" | "warning" | "success" | "muted"> = {
    OPEN: "default",
    IN_PROGRESS: "info",
    BLOCKED: "warning",
    RESOLVED: "success",
    WONT_FIX: "muted",
  };
  return <StatusPill tone={tone[status]}>{status.replace("_", " ")}</StatusPill>;
}

export function DevTypeBadge({ type }: { type: DevType }) {
  return <StatusPill tone="default">{type.replace("_", " ")}</StatusPill>;
}

export function ContactMethodIcon({ method }: { method: ContactMethod }) {
  const icons: Record<ContactMethod, string> = {
    WHATSAPP: "💬",
    CALL: "📞",
    IN_PERSON: "🤝",
    EMAIL: "✉️",
    OTHER: "•",
  };
  return <span className="font-mono text-xs">{icons[method]} {method}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}
