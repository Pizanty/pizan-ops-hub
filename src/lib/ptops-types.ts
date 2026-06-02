export type Domain = "SALES" | "PRODUCT" | "OPS" | "STRATEGY";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "ARCHIVED";
export type LeadStage =
  | "PROSPECT"
  | "CONTACTED"
  | "DEMO_SCHEDULED"
  | "DEMO_DONE"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "ON_HOLD";
export type LeadSource = "REFERRAL" | "OUTREACH" | "INBOUND" | "EVENT" | "OTHER";
export type ContactMethod = "WHATSAPP" | "CALL" | "IN_PERSON" | "EMAIL" | "OTHER";
export type DevType = "BUG" | "FEATURE" | "MILESTONE" | "TECH_DEBT";
export type DevSeverity = "S1" | "S2" | "S3";
export type DevPriority = "P1" | "P2" | "P3";
export type DevStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "RESOLVED" | "WONT_FIX";
export type AppRole = "admin" | "developer";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  domain: Domain;
  priority: number;
  status: TaskStatus;
  due_date: string | null;
  notes: string | null;
  lead_id: string | null;
  ai_rank: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Lead {
  id: string;
  user_id: string;
  name: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource | null;
  stage: LeadStage;
  next_action: string | null;
  next_action_date: string | null;
  monthly_value_nis: number | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  user_id: string;
  contact_date: string;
  method: ContactMethod;
  summary: string | null;
  created_at: string;
}

export interface DevItem {
  id: string;
  created_by: string;
  assigned_to: string | null;
  type: DevType;
  title: string;
  description: string | null;
  severity: DevSeverity | null;
  priority: DevPriority | null;
  status: DevStatus;
  github_issue_url: string | null;
  target_date: string | null;
  is_milestone: boolean;
  blocked_by: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface DevItemUpdate {
  id: string;
  dev_item_id: string;
  user_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
export interface BusinessContextRow {
  id: string;
  user_id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

export const DOMAINS: Domain[] = ["SALES", "PRODUCT", "OPS", "STRATEGY"];
export const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "ARCHIVED"];
export const LEAD_STAGES: LeadStage[] = [
  "PROSPECT",
  "CONTACTED",
  "DEMO_SCHEDULED",
  "DEMO_DONE",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
];
export const LEAD_SOURCES: LeadSource[] = ["REFERRAL", "OUTREACH", "INBOUND", "EVENT", "OTHER"];
export const CONTACT_METHODS: ContactMethod[] = ["WHATSAPP", "CALL", "IN_PERSON", "EMAIL", "OTHER"];
export const DEV_TYPES: DevType[] = ["BUG", "FEATURE", "MILESTONE", "TECH_DEBT"];
export const DEV_SEVERITIES: DevSeverity[] = ["S1", "S2", "S3"];
export const DEV_PRIORITIES: DevPriority[] = ["P1", "P2", "P3"];
export const DEV_STATUSES: DevStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "WONT_FIX"];
export const LOST_REASONS = ["Price", "Timing", "Competitor", "No Interest", "Other"] as const;

export const PRIORITY_LABELS: Record<number, { label: string; icon: string }> = {
  1: { label: "Critical", icon: "🔴" },
  2: { label: "High", icon: "🟠" },
  3: { label: "Normal", icon: "🟡" },
  4: { label: "Low", icon: "🔵" },
  5: { label: "Someday", icon: "⚪" },
};

export const CONTEXT_KEYS = [
  "current_phase",
  "caterflow_status",
  "paying_clients",
  "warm_leads",
  "90_day_target",
  "90_day_priorities",
  "success_threshold",
  "operator_hours",
  "capital_available",
  "active_warnings",
  "product_stability",
  "execution_bias_flag",
  "current_blockers",
] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];
