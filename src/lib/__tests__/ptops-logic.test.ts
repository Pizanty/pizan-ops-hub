import { describe, it, expect } from "vitest";
import {
  rankTasks,
  leadStageCounts,
  pipelineValueNis,
  overdueFollowups,
  weekRange,
  csvEscape,
  toCsv,
} from "../ptops-logic";
import type { Lead, Task } from "../ptops-types";

const baseTask = (over: Partial<Task>): Task => ({
  id: over.id ?? crypto.randomUUID(),
  user_id: "u",
  title: over.title ?? "t",
  domain: "OPS",
  priority: 3,
  status: "TODO",
  due_date: null,
  notes: null,
  lead_id: null,
  ai_rank: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  completed_at: null,
  ...over,
});

const baseLead = (over: Partial<Lead>): Lead => ({
  id: over.id ?? crypto.randomUUID(),
  user_id: "u",
  name: "L",
  business_name: null,
  phone: null,
  email: null,
  source: null,
  stage: "PROSPECT",
  next_action: null,
  next_action_date: null,
  monthly_value_nis: null,
  lost_reason: null,
  notes: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

describe("rankTasks", () => {
  it("excludes DONE and ARCHIVED", () => {
    const r = rankTasks([
      baseTask({ id: "a", status: "DONE" }),
      baseTask({ id: "b", status: "ARCHIVED" }),
      baseTask({ id: "c", status: "TODO" }),
    ]);
    expect(r.map((t) => t.id)).toEqual(["c"]);
  });

  it("orders by ai_rank, then priority, then due_date", () => {
    const r = rankTasks([
      baseTask({ id: "a", ai_rank: 5, priority: 1 }),
      baseTask({ id: "b", ai_rank: 1, priority: 5 }),
      baseTask({ id: "c", ai_rank: 1, priority: 1, due_date: "2026-02-01" }),
      baseTask({ id: "d", ai_rank: 1, priority: 1, due_date: "2026-01-15" }),
    ]);
    expect(r.map((t) => t.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("treats missing ai_rank as last", () => {
    const r = rankTasks([
      baseTask({ id: "a", ai_rank: null }),
      baseTask({ id: "b", ai_rank: 2 }),
    ]);
    expect(r[0].id).toBe("b");
  });
});

describe("leadStageCounts", () => {
  it("groups by stage", () => {
    const c = leadStageCounts([
      baseLead({ stage: "PROSPECT" }),
      baseLead({ stage: "PROSPECT" }),
      baseLead({ stage: "WON" }),
    ]);
    expect(c).toEqual({ PROSPECT: 2, WON: 1 });
  });
});

describe("pipelineValueNis", () => {
  it("sums monthly value for active stages only", () => {
    const v = pipelineValueNis([
      baseLead({ stage: "PROSPECT", monthly_value_nis: 1000 }),
      baseLead({ stage: "NEGOTIATION", monthly_value_nis: 2000 }),
      baseLead({ stage: "WON", monthly_value_nis: 9999 }),
      baseLead({ stage: "LOST", monthly_value_nis: 5000 }),
      baseLead({ stage: "ON_HOLD", monthly_value_nis: 500 }),
      baseLead({ stage: "PROSPECT", monthly_value_nis: null }),
    ]);
    expect(v).toBe(3000);
  });
});

describe("overdueFollowups", () => {
  it("returns leads whose next_action_date is before today", () => {
    const today = new Date("2026-03-10");
    const r = overdueFollowups(
      [
        baseLead({ id: "a", next_action_date: "2026-03-01" }),
        baseLead({ id: "b", next_action_date: "2026-03-15" }),
        baseLead({ id: "c", next_action_date: "2026-03-01", stage: "WON" }),
        baseLead({ id: "d", next_action_date: null }),
      ],
      today,
    );
    expect(r.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("weekRange", () => {
  it("starts on Sunday and spans 7 days", () => {
    const { start, end } = weekRange(new Date("2026-03-11")); // Wed
    expect(start.getDay()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("csvEscape", () => {
  it("escapes quotes and wraps when needed", () => {
    expect(csvEscape("hi")).toBe("hi");
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("emits header and rows", () => {
    const csv = toCsv([
      { a: 1, b: "x" },
      { a: 2, b: "y,z" },
    ]);
    expect(csv).toBe('a,b\n1,x\n2,"y,z"');
  });
  it("returns empty for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
