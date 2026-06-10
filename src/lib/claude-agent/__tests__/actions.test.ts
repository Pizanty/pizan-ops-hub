import { describe, it, expect, vi } from "vitest";
import * as A from "../actions.server";

const UID = "00000000-0000-0000-0000-000000000001";
const UUID = "11111111-1111-4111-8111-111111111111";

/**
 * Build a chainable mock of a Supabase query builder.
 * Every method returns the same proxy until awaited; the awaited result is
 * `{ data, error, count }` from the seed.
 */
function makeBuilder(seed: { data?: unknown; error?: unknown; count?: number }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const handler: ProxyHandler<any> = {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolve: any) => resolve({ data: seed.data ?? null, error: seed.error ?? null, count: seed.count ?? null });
      }
      if (prop === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: any = new Proxy({}, handler);
  return proxy;
}

function makeClient(byTable: Record<string, ReturnType<typeof makeBuilder>>) {
  return {
    from: (table: string) => {
      if (!byTable[table]) throw new Error(`Unexpected table: ${table}`);
      return byTable[table];
    },
  } as any;
}

describe("list_tasks", () => {
  it("builds query with user_id, status filter, and ordering", async () => {
    const tasks = makeBuilder({ data: [] });
    const stages = makeBuilder({ data: [] });
    const sb = makeClient({ tasks, task_stages: stages });
    await A.list_tasks(sb, UID, { status: "TODO", domain: "SALES", priority: 1 });
    const methods = tasks.calls.map((c: any) => c.method);
    expect(methods).toContain("select");
    expect(methods).toContain("eq");
    expect(methods).toContain("limit");
    // user_id eq is present
    expect(tasks.calls.some((c: any) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === UID)).toBe(true);
    // status eq applied
    expect(tasks.calls.some((c: any) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "TODO")).toBe(true);
  });

  it("uses .in() for array status", async () => {
    const tasks = makeBuilder({ data: [] });
    const stages = makeBuilder({ data: [] });
    const sb = makeClient({ tasks, task_stages: stages });
    await A.list_tasks(sb, UID, { status: ["TODO", "DONE"] });
    expect(tasks.calls.some((c: any) => c.method === "in" && c.args[0] === "status")).toBe(true);
  });
});

describe("create_task", () => {
  it("inserts with user_id and creates stages when provided", async () => {
    const newTask = { id: UUID, title: "T", user_id: UID };
    const tasks = makeBuilder({ data: newTask });
    const stages = makeBuilder({ data: null });
    const sb = makeClient({ tasks, task_stages: stages });
    const out = await A.create_task(sb, UID, { title: "T", domain: "SALES", stages: ["A", "B"] });
    expect(out.id).toBe(UUID);
    const insertCall = tasks.calls.find((c: any) => c.method === "insert");
    expect(insertCall.args[0].user_id).toBe(UID);
    expect("stages" in insertCall.args[0]).toBe(false); // stages stripped from main insert
    const stagesInsert = stages.calls.find((c: any) => c.method === "insert");
    expect(stagesInsert.args[0]).toHaveLength(2);
  });
});

describe("delete_lead", () => {
  it("refuses to delete a lead with related rows unless cascade=true", async () => {
    const tasks = makeBuilder({ count: 2 });
    const contacts = makeBuilder({ count: 1 });
    const leads = makeBuilder({ data: null });
    const sb = makeClient({ tasks, lead_contacts: contacts, leads });
    await expect(A.delete_lead(sb, UID, { id: UUID, cascade: false })).rejects.toThrow(/cascade:true/);
  });

  it("cascades when cascade=true", async () => {
    const tasks = makeBuilder({ count: 1 });
    const contacts = makeBuilder({ count: 1 });
    const leads = makeBuilder({ data: null });
    const sb = makeClient({ tasks, lead_contacts: contacts, leads });
    const out = await A.delete_lead(sb, UID, { id: UUID, cascade: true });
    expect(out.deleted).toBe(true);
    expect(out.unlinked_tasks).toBe(1);
    expect(out.deleted_contacts).toBe(1);
  });
});

describe("list_unblocked", () => {
  it("returns items whose blockers are all resolved/wont_fix", async () => {
    const dev = makeBuilder({
      data: [
        { id: "a", status: "RESOLVED", blocked_by: [] },
        { id: "b", status: "OPEN", blocked_by: ["a"] }, // unblocked
        { id: "c", status: "OPEN", blocked_by: ["a", "d"] }, // still blocked by d
        { id: "d", status: "OPEN", blocked_by: [] },
        { id: "e", status: "RESOLVED", blocked_by: ["a"] }, // closed, excluded
        { id: "f", status: "OPEN", blocked_by: [] }, // no blockers, excluded
      ],
    });
    const sb = makeClient({ dev_items: dev });
    const out = (await A.list_unblocked(sb, UID)) as any[];
    expect(out.map((x) => x.id).sort()).toEqual(["b"]);
  });
});

describe("update_lead", () => {
  it("creates an onboarding task when stage→WON and monthly_value_nis set", async () => {
    const updatedLead = { id: UUID, name: "Acme" };
    const leads = makeBuilder({ data: updatedLead });
    const tasks = makeBuilder({ data: { id: "task-1", title: "Onboard Acme to CaterFlow" } });
    const sb = makeClient({ leads, tasks });
    const out = await A.update_lead(sb, UID, { id: UUID, stage: "WON", monthly_value_nis: 500 });
    expect(out.task).toBeTruthy();
    const ins = tasks.calls.find((c: any) => c.method === "insert");
    expect(ins.args[0].domain).toBe("SALES");
    expect(ins.args[0].user_id).toBe(UID);
  });

  it("does NOT create task when only stage changes without value", async () => {
    const leads = makeBuilder({ data: { id: UUID } });
    const tasks = makeBuilder({ data: null });
    const sb = makeClient({ leads, tasks });
    const out = await A.update_lead(sb, UID, { id: UUID, stage: "WON" });
    expect(out.task).toBeNull();
    expect(tasks.calls.find((c: any) => c.method === "insert")).toBeUndefined();
  });
});

describe("get_pipeline_summary", () => {
  it("sums MRR only for WON and flags overdue non-terminal stages", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const leads = makeBuilder({
      data: [
        { id: "1", name: "A", stage: "WON", monthly_value_nis: 1000, next_action_date: null },
        { id: "2", name: "B", stage: "QUALIFIED", monthly_value_nis: 99, next_action_date: yesterday, next_action: "call" },
        { id: "3", name: "C", stage: "LOST", monthly_value_nis: 500, next_action_date: yesterday },
        { id: "4", name: "D", stage: "PROSPECT", monthly_value_nis: null, next_action_date: today },
      ],
    });
    const sb = makeClient({ leads });
    const out = (await A.get_pipeline_summary(sb, UID)) as any;
    expect(out.mrr_nis).toBe(1000);
    expect(out.total_leads).toBe(4);
    expect(out.overdue.map((o: any) => o.id)).toEqual(["2"]);
  });
});

describe("create_dev_item", () => {
  it("sets created_by to provided userId", async () => {
    const dev = makeBuilder({ data: { id: UUID, created_by: UID } });
    const sb = makeClient({ dev_items: dev });
    await A.create_dev_item(sb, UID, { type: "BUG", title: "T" });
    const ins = dev.calls.find((c: any) => c.method === "insert");
    expect(ins.args[0].created_by).toBe(UID);
  });
});

describe("upload_attachment", () => {
  it("rejects invalid base64 implicitly (zero-length buffer)", async () => {
    // Buffer.from of "!@#$" yields empty buffer — should throw "Empty file"
    const sb = makeClient({});
    await expect(
      A.upload_attachment(sb, UID, { entity_type: "task", entity_id: UUID, filename: "f", content_base64: "!@#" }),
    ).rejects.toThrow();
  });
});

describe("err()", () => {
  it("extracts message from error-like objects", () => {
    expect(A.err({ message: "boom" })).toBe("boom");
    expect(A.err(null)).toBe("Database error");
    expect(A.err(undefined, "fallback")).toBe("fallback");
  });
});
