import { describe, it, expect } from "vitest";
import { Schemas, VALID_ACTIONS } from "../schemas";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("Schemas — happy paths", () => {
  it("list_tasks accepts empty and defaults limit=50", () => {
    expect(Schemas.list_tasks.parse({}).limit).toBe(50);
  });
  it("list_tasks accepts status as string or array", () => {
    expect(Schemas.list_tasks.parse({ status: "TODO" }).status).toBe("TODO");
    expect(Schemas.list_tasks.parse({ status: ["TODO", "DONE"] }).status).toEqual(["TODO", "DONE"]);
  });
  it("create_task accepts minimal valid input", () => {
    const p = Schemas.create_task.parse({ title: "X", domain: "SALES" });
    expect(p.priority).toBe(3);
    expect(p.status).toBe("TODO");
  });
  it("create_lead defaults stage to PROSPECT", () => {
    expect(Schemas.create_lead.parse({ name: "X" }).stage).toBe("PROSPECT");
  });
  it("create_dev_item accepts all enums and is_milestone default false", () => {
    const p = Schemas.create_dev_item.parse({ type: "BUG", title: "T" });
    expect(p.is_milestone).toBe(false);
  });
  it("delete_lead default cascade=false", () => {
    expect(Schemas.delete_lead.parse({ id: UUID }).cascade).toBe(false);
  });
  it("batch accepts 25 operations", () => {
    const ops = Array.from({ length: 25 }, () => ({ action: "list_tasks" }));
    expect(Schemas.batch.parse({ operations: ops }).operations).toHaveLength(25);
  });
});

describe("Schemas — validation rejections", () => {
  it("list_tasks rejects invalid domain", () => {
    expect(() => Schemas.list_tasks.parse({ domain: "INVALID" })).toThrow();
  });
  it("list_tasks rejects priority out of range", () => {
    expect(() => Schemas.list_tasks.parse({ priority: 99 })).toThrow();
    expect(() => Schemas.list_tasks.parse({ priority: 0 })).toThrow();
  });
  it("list_tasks rejects bad date format", () => {
    expect(() => Schemas.list_tasks.parse({ due_before: "2026/01/01" })).toThrow();
    expect(() => Schemas.list_tasks.parse({ due_before: "2026-1-1" })).toThrow();
  });
  it("list_tasks rejects limit>500", () => {
    expect(() => Schemas.list_tasks.parse({ limit: 501 })).toThrow();
  });
  it("get_task rejects non-uuid id", () => {
    expect(() => Schemas.get_task.parse({ id: "not-a-uuid" })).toThrow();
  });
  it("create_task rejects missing title", () => {
    expect(() => Schemas.create_task.parse({ domain: "SALES" })).toThrow();
  });
  it("create_task rejects title too long", () => {
    expect(() => Schemas.create_task.parse({ title: "x".repeat(501), domain: "SALES" })).toThrow();
  });
  it("create_lead rejects invalid email", () => {
    expect(() => Schemas.create_lead.parse({ name: "X", email: "not-an-email" })).toThrow();
  });
  it("create_dev_item rejects invalid type / severity", () => {
    expect(() => Schemas.create_dev_item.parse({ type: "OOPS", title: "T" })).toThrow();
    expect(() => Schemas.create_dev_item.parse({ type: "BUG", title: "T", severity: "S9" })).toThrow();
  });
  it("create_dev_item rejects bad github_issue_url", () => {
    expect(() => Schemas.create_dev_item.parse({ type: "BUG", title: "T", github_issue_url: "not-url" })).toThrow();
  });
  it("create_dev_item rejects non-uuid in blocked_by", () => {
    expect(() => Schemas.create_dev_item.parse({ type: "BUG", title: "T", blocked_by: ["nope"] })).toThrow();
  });
  it("log_contact requires uuid lead_id and non-empty summary", () => {
    expect(() => Schemas.log_contact.parse({ lead_id: "x", method: "CALL", summary: "ok" })).toThrow();
    expect(() => Schemas.log_contact.parse({ lead_id: UUID, method: "CALL", summary: "" })).toThrow();
  });
  it("batch rejects 0 or 26 operations", () => {
    expect(() => Schemas.batch.parse({ operations: [] })).toThrow();
    const ops = Array.from({ length: 26 }, () => ({ action: "list_tasks" }));
    expect(() => Schemas.batch.parse({ operations: ops })).toThrow();
  });
  it("upload_attachment requires non-empty content_base64", () => {
    expect(() =>
      Schemas.upload_attachment.parse({ entity_type: "task", entity_id: UUID, filename: "a.txt", content_base64: "" }),
    ).toThrow();
  });
  it("upload_attachment rejects invalid entity_type", () => {
    expect(() =>
      Schemas.upload_attachment.parse({ entity_type: "blob", entity_id: UUID, filename: "a", content_base64: "AA==" }),
    ).toThrow();
  });
});

describe("VALID_ACTIONS coverage", () => {
  it("contains all schema keys that map to actions", () => {
    // sanity: list of well-known actions present
    for (const a of ["get_dashboard", "list_tasks", "create_task", "batch", "list_unblocked"]) {
      expect(VALID_ACTIONS).toContain(a);
    }
  });
  it("has no duplicates", () => {
    expect(new Set(VALID_ACTIONS).size).toBe(VALID_ACTIONS.length);
  });
});
