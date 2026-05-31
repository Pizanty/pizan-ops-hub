import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const Domain = z.enum(["SALES", "PRODUCT", "OPS", "STRATEGY"]);
export const TaskStatus = z.string().min(1);
export const Stage = z.enum([
  "PROSPECT",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
]);
export const Source = z.enum(["REFERRAL", "OUTREACH", "INBOUND", "EVENT", "OTHER"]);
export const ContactMethod = z.enum(["WHATSAPP", "CALL", "IN_PERSON", "EMAIL", "OTHER"]);
export const DevType = z.enum(["BUG", "FEATURE", "MILESTONE", "TECH_DEBT"]);
export const Severity = z.enum(["S1", "S2", "S3"]);


export const Schemas = {
  empty: z.object({}).passthrough().optional().default({}),

  list_tasks: z.object({
    status: z.string().optional(),
    domain: Domain.optional(),
    priority: z.number().int().min(1).max(5).optional(),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  get_task: z.object({ id: uuid }),
  create_task: z.object({
    title: z.string().min(1).max(500),
    domain: Domain,
    priority: z.number().int().min(1).max(5).default(3),
    status: z.string().default("TODO"),
    due_date: isoDate.optional(),
    notes: z.string().optional(),
    lead_id: uuid.optional(),
  }),
  update_task: z.object({
    id: uuid,
    title: z.string().min(1).max(500).optional(),
    domain: Domain.optional(),
    priority: z.number().int().min(1).max(5).optional(),
    status: z.string().optional(),
    due_date: isoDate.nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  delete_task: z.object({ id: uuid }),
  complete_task: z.object({ id: uuid }),

  list_leads: z.object({
    stage: Stage.optional(),
    source: Source.optional(),
    overdue_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  get_lead: z.object({ id: uuid }),
  create_lead: z.object({
    name: z.string().min(1).max(255),
    business_name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    source: Source.optional(),
    stage: Stage.default("PROSPECT"),
    next_action: z.string().optional(),
    next_action_date: isoDate.optional(),
    notes: z.string().optional(),
  }),
  update_lead: z.object({
    id: uuid,
    name: z.string().min(1).optional(),
    business_name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    stage: Stage.optional(),
    next_action: z.string().nullable().optional(),
    next_action_date: isoDate.nullable().optional(),
    monthly_value_nis: z.number().nullable().optional(),
    lost_reason: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  log_contact: z.object({
    lead_id: uuid,
    method: ContactMethod,
    summary: z.string().min(1),
    contact_date: isoDate.optional(),
  }),

  list_dev_items: z.object({
    type: DevType.optional(),
    severity: Severity.optional(),
    status: z.string().optional(),
    open_only: z.boolean().optional(),
  }),
  get_dev_item: z.object({ id: uuid }),
  create_dev_item: z.object({
    type: DevType,
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    severity: Severity.optional(),
    github_issue_url: z.string().url().optional(),
    target_date: isoDate.optional(),
    is_milestone: z.boolean().default(false),
    notes: z.string().optional(),
  }),
  update_dev_item: z.object({
    id: uuid,
    status: z.string().optional(),
    notes: z.string().nullable().optional(),
    severity: Severity.nullable().optional(),
    target_date: isoDate.nullable().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  }),

  update_business_context: z.object({
    updates: z.record(z.string().min(1).max(255), z.string()),
  }),
};

export const VALID_ACTIONS = [
  "get_dashboard",
  "list_tasks",
  "get_task",
  "create_task",
  "update_task",
  "delete_task",
  "complete_task",
  "list_leads",
  "get_lead",
  "create_lead",
  "update_lead",
  "log_contact",
  "get_pipeline_summary",
  "list_dev_items",
  "get_dev_item",
  "create_dev_item",
  "update_dev_item",
  "get_business_context",
  "update_business_context",
] as const;

export type ActionName = (typeof VALID_ACTIONS)[number];
