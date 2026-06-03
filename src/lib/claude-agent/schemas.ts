import { z } from "zod";
import { CONTEXT_KEYS } from "@/lib/ptops-types";

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
export const Priority = z.enum(["P1", "P2", "P3"]);

const stringOrArray = z.union([z.string(), z.array(z.string())]);
const ContextKeyEnum = z.enum(CONTEXT_KEYS as unknown as [string, ...string[]]);

export const Schemas = {
  empty: z.object({}).passthrough().optional().default({}),

  list_tasks: z.object({
    status: stringOrArray.optional(),
    domain: Domain.optional(),
    priority: z.number().int().min(1).max(5).optional(),
    due_before: isoDate.optional(),
    due_after: isoDate.optional(),
    has_lead: z.boolean().optional(),
    search: z.string().min(1).max(200).optional(),
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
    stage: z.union([Stage, z.array(Stage)]).optional(),
    source: Source.optional(),
    overdue_only: z.boolean().optional(),
    search: z.string().min(1).max(200).optional(),
    next_action_before: isoDate.optional(),
    next_action_after: isoDate.optional(),
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
  delete_lead: z.object({ id: uuid, cascade: z.boolean().default(false) }),
  log_contact: z.object({
    lead_id: uuid,
    method: ContactMethod,
    summary: z.string().min(1),
    contact_date: isoDate.optional(),
  }),
  list_contacts: z.object({
    lead_id: uuid.optional(),
    since: isoDate.optional(),
    method: ContactMethod.optional(),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  get_lead_contacts: z.object({ lead_id: uuid }),
  delete_contact: z.object({ id: uuid }),

  list_dev_items: z.object({
    type: z.union([DevType, z.array(DevType)]).optional(),
    severity: Severity.optional(),
    priority: Priority.optional(),
    status: stringOrArray.optional(),
    open_only: z.boolean().optional(),
    is_milestone: z.boolean().optional(),
    blocking: uuid.optional(),
    ready_only: z.boolean().optional(),
    search: z.string().min(1).max(200).optional(),
  }),
  get_dev_item: z.object({ id: uuid }),
  create_dev_item: z.object({
    type: DevType,
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    severity: Severity.optional(),
    priority: Priority.optional(),
    github_issue_url: z.string().url().optional(),
    target_date: isoDate.optional(),
    is_milestone: z.boolean().default(false),
    blocked_by: z.array(uuid).optional(),
    notes: z.string().optional(),
  }),
  update_dev_item: z.object({
    id: uuid,
    status: z.string().optional(),
    notes: z.string().nullable().optional(),
    severity: Severity.nullable().optional(),
    priority: Priority.nullable().optional(),
    target_date: isoDate.nullable().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    is_milestone: z.boolean().optional(),
    blocked_by: z.array(uuid).optional(),
  }),
  delete_dev_item: z.object({ id: uuid }),

  update_business_context: z.object({
    updates: z.record(z.string().min(1).max(255), z.string()),
  }),
  set_business_context: z.object({ key: ContextKeyEnum, value: z.string() }),
  append_business_context: z.object({
    key: ContextKeyEnum,
    value: z.string().min(1),
    separator: z.string().default("\n"),
  }),
  clear_business_context_key: z.object({ key: ContextKeyEnum }),
  delete_business_context_key: z.object({ key: ContextKeyEnum }),

  batch: z.object({
    operations: z
      .array(z.object({ action: z.string().min(1), params: z.unknown().optional() }))
      .min(1)
      .max(25),
  }),

  list_attachments: z.object({
    entity_type: z.enum(["task", "dev_item"]),
    entity_id: uuid,
  }),
  get_attachment: z.object({ id: uuid }),
  upload_attachment: z.object({
    entity_type: z.enum(["task", "dev_item"]),
    entity_id: uuid,
    filename: z.string().min(1).max(255),
    mime_type: z.string().min(1).max(255).optional(),
    content_base64: z.string().min(1),
  }),
  delete_attachment: z.object({ id: uuid }),
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
  "delete_lead",
  "log_contact",
  "list_contacts",
  "get_lead_contacts",
  "delete_contact",
  "lead_data_quality",
  "get_pipeline_summary",
  "list_dev_items",
  "get_dev_item",
  "create_dev_item",
  "update_dev_item",
  "delete_dev_item",
  "list_unblocked",
  "get_business_context",
  "update_business_context",
  "set_business_context",
  "append_business_context",
  "clear_business_context_key",
  "delete_business_context_key",
  "batch",
] as const;

export type ActionName = (typeof VALID_ACTIONS)[number];
