#!/usr/bin/env bun
/**
 * End-to-end integration tests against the live /api/public/claude-agent endpoint.
 *
 * Run:
 *   API_BASE=https://ops.pizantech.com bun tests/api/test-api.ts
 *   API_BASE=https://id-preview--<id>.lovable.app bun tests/api/test-api.ts
 *
 * Required env: CLAUDE_AGENT_TOKEN, IDAN_AGENT_TOKEN
 */

const API_BASE = process.env.API_BASE ?? "https://ops.pizantech.com";
const URL = `${API_BASE.replace(/\/$/, "")}/api/public/claude-agent`;
const ADMIN = process.env.CLAUDE_AGENT_TOKEN;
const IDAN = process.env.IDAN_AGENT_TOKEN;

if (!ADMIN) {
  console.error("Missing CLAUDE_AGENT_TOKEN env var");
  process.exit(1);
}

type Result = { name: string; ok: boolean; details?: string };
const results: Result[] = [];
let createdTaskId: string | null = null;
let createdLeadId: string | null = null;
let createdDevId: string | null = null;
let createdByIdanDevId: string | null = null;

async function call(
  body: unknown,
  opts: { token?: string | null; method?: string; raw?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  const token = opts.token === undefined ? ADMIN : opts.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(URL, {
    method: opts.method ?? "POST",
    headers,
    body: opts.raw ?? (body == null ? undefined : JSON.stringify(body)),
    redirect: "follow",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

function record(name: string, ok: boolean, details?: string) {
  results.push({ name, ok, details });
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${name}${details && !ok ? ` — ${details}` : ""}`);
}

function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    record(name, true);
  } catch (e: any) {
    record(name, false, e?.message ?? String(e));
  }
}

// ============ AUTH & CORS ============

await test("GET returns endpoint metadata", async () => {
  const r = await call(null, { method: "GET" });
  expect(r.status === 200, `expected 200 got ${r.status}`);
  expect(r.json?.ok === true, "ok flag");
  expect(Array.isArray(r.json?.valid_actions), "valid_actions array");
});

await test("OPTIONS preflight returns CORS headers", async () => {
  const r = await call(null, { method: "OPTIONS", token: null });
  expect(r.status === 200, `status ${r.status}`);
  expect(r.headers.get("access-control-allow-origin") === "*", "ACAO header");
  expect((r.headers.get("access-control-allow-methods") ?? "").includes("POST"), "ACAM includes POST");
});

await test("POST without token → 401", async () => {
  const r = await call({ action: "list_tasks" }, { token: null });
  expect(r.status === 401, `status ${r.status}`);
});

await test("POST with wrong token → 401", async () => {
  const r = await call({ action: "list_tasks" }, { token: "wrong-token-xxx" });
  expect(r.status === 401, `status ${r.status}`);
});

await test("POST with malformed JSON → 200 with error message", async () => {
  const r = await call(undefined, { raw: "{not json" });
  expect(r.status === 200, `status ${r.status}`);
  expect(r.json?.ok === false && /JSON/i.test(r.json?.error ?? ""), `unexpected ${JSON.stringify(r.json)}`);
});

await test("POST missing action → error", async () => {
  const r = await call({});
  expect(r.json?.ok === false && /action/i.test(r.json?.error ?? ""), `unexpected ${JSON.stringify(r.json)}`);
});

await test("POST unknown action → error", async () => {
  const r = await call({ action: "bogus_action_xyz" });
  expect(r.json?.ok === false && /Unknown action/i.test(r.json?.error ?? ""), JSON.stringify(r.json));
});

// ============ ADMIN — READ ============

await test("admin get_dashboard returns rich shape", async () => {
  const r = await call({ action: "get_dashboard" });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  const d = r.json.data;
  for (const k of ["tasks", "leads", "dev_items", "milestones", "weekly_completion", "mrr_nis"]) {
    expect(k in d, `missing ${k} in dashboard`);
  }
});

await test("admin list_tasks returns array", async () => {
  const r = await call({ action: "list_tasks", params: { limit: 5 } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(Array.isArray(r.json.data), "data is array");
});

await test("admin list_leads accepts stage filter", async () => {
  const r = await call({ action: "list_leads", params: { stage: "PROSPECT", limit: 3 } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
});

await test("admin list_dev_items + list_unblocked", async () => {
  const r1 = await call({ action: "list_dev_items", params: {} });
  expect(r1.json?.ok === true, JSON.stringify(r1.json));
  const r2 = await call({ action: "list_unblocked" });
  expect(r2.json?.ok === true, JSON.stringify(r2.json));
});

await test("admin get_pipeline_summary returns stages + mrr", async () => {
  const r = await call({ action: "get_pipeline_summary" });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(typeof r.json.data.mrr_nis === "number", "mrr_nis number");
  expect(typeof r.json.data.stages === "object", "stages object");
});

// ============ ADMIN — VALIDATION ============

await test("admin create_task rejects missing title", async () => {
  const r = await call({ action: "create_task", params: { domain: "SALES" } });
  expect(r.json?.ok === false, JSON.stringify(r.json));
});

await test("admin create_task rejects bad domain", async () => {
  const r = await call({ action: "create_task", params: { title: "X", domain: "BAD_DOM" } });
  expect(r.json?.ok === false, JSON.stringify(r.json));
});

await test("admin get_task with non-uuid → validation error", async () => {
  const r = await call({ action: "get_task", params: { id: "not-uuid" } });
  expect(r.json?.ok === false, JSON.stringify(r.json));
});

// ============ ADMIN — CRUD ============

await test("admin create_task → returns row", async () => {
  const r = await call({
    action: "create_task",
    params: { title: "__test_api__ " + Date.now(), domain: "OPS", priority: 4, status: "TODO" },
  });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  createdTaskId = r.json.data.id;
  expect(!!createdTaskId, "got id");
});

await test("admin update_task notes", async () => {
  if (!createdTaskId) throw new Error("no createdTaskId");
  const r = await call({ action: "update_task", params: { id: createdTaskId, notes: "edited by api test" } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(r.json.data.notes === "edited by api test", "notes saved");
});

await test("admin complete_task → status DONE + completed_at set", async () => {
  if (!createdTaskId) throw new Error("no createdTaskId");
  const r = await call({ action: "complete_task", params: { id: createdTaskId } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(r.json.data.status === "DONE", "status DONE");
  expect(!!r.json.data.completed_at, "completed_at set (trigger)");
});

await test("admin get_task returns stage summary fields", async () => {
  if (!createdTaskId) throw new Error("no createdTaskId");
  const r = await call({ action: "get_task", params: { id: createdTaskId } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  for (const k of ["stages", "stage_count", "stages_done", "progress_pct"]) {
    expect(k in r.json.data, `missing ${k}`);
  }
});

await test("admin add_task_stage and reorder", async () => {
  if (!createdTaskId) throw new Error("no createdTaskId");
  const s1 = await call({ action: "add_task_stage", params: { task_id: createdTaskId, label: "S1" } });
  const s2 = await call({ action: "add_task_stage", params: { task_id: createdTaskId, label: "S2" } });
  expect(s1.json?.ok && s2.json?.ok, "both stages added");
  const re = await call({
    action: "reorder_task_stages",
    params: { task_id: createdTaskId, ordered_ids: [s2.json.data.id, s1.json.data.id] },
  });
  expect(re.json?.ok === true, JSON.stringify(re.json));
  expect(re.json.data[0].id === s2.json.data.id, "reorder applied");
});

await test("admin delete_task", async () => {
  if (!createdTaskId) throw new Error("no createdTaskId");
  const r = await call({ action: "delete_task", params: { id: createdTaskId } });
  expect(r.json?.ok === true && r.json.data.deleted === true, JSON.stringify(r.json));
});

await test("admin create_lead → update_lead WON with value spawns task", async () => {
  const c = await call({
    action: "create_lead",
    params: { name: "__test_lead__ " + Date.now(), source: "INBOUND" },
  });
  expect(c.json?.ok === true, JSON.stringify(c.json));
  createdLeadId = c.json.data.id;
  const u = await call({
    action: "update_lead",
    params: { id: createdLeadId, stage: "WON", monthly_value_nis: 500 },
  });
  expect(u.json?.ok === true, JSON.stringify(u.json));
  expect(u.json.data.task && /Onboard/.test(u.json.data.task.title), "onboard task spawned");
});

await test("admin delete_lead refuses without cascade then succeeds", async () => {
  if (!createdLeadId) throw new Error("no createdLeadId");
  const first = await call({ action: "delete_lead", params: { id: createdLeadId, cascade: false } });
  expect(first.json?.ok === false && /cascade/i.test(first.json.error), JSON.stringify(first.json));
  const second = await call({ action: "delete_lead", params: { id: createdLeadId, cascade: true } });
  expect(second.json?.ok === true, JSON.stringify(second.json));
});

await test("admin create_dev_item + update_dev_item to RESOLVED sets resolved_at", async () => {
  const c = await call({ action: "create_dev_item", params: { type: "BUG", title: "__test_dev__", severity: "S3" } });
  expect(c.json?.ok === true, JSON.stringify(c.json));
  createdDevId = c.json.data.id;
  const u = await call({ action: "update_dev_item", params: { id: createdDevId, status: "RESOLVED" } });
  expect(u.json?.ok === true, JSON.stringify(u.json));
  expect(!!u.json.data.resolved_at, "resolved_at set");
});

await test("admin delete_dev_item cleans up", async () => {
  if (!createdDevId) throw new Error("no dev id");
  const r = await call({ action: "delete_dev_item", params: { id: createdDevId } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
});

// ============ BATCH ============

await test("batch with 25 mixed ops", async () => {
  const ops = Array.from({ length: 25 }, () => ({ action: "list_tasks", params: { limit: 1 } }));
  const r = await call({ action: "batch", params: { operations: ops } });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(r.json.data.results.length === 25, "25 results");
  expect(r.json.data.results.every((x: any) => x.ok === true), "all ok");
});

await test("batch with 26 ops → validation error", async () => {
  const ops = Array.from({ length: 26 }, () => ({ action: "list_tasks" }));
  const r = await call({ action: "batch", params: { operations: ops } });
  expect(r.json?.ok === false, JSON.stringify(r.json));
});

await test("batch with nested batch → marked error", async () => {
  const r = await call({
    action: "batch",
    params: { operations: [{ action: "batch", params: { operations: [{ action: "list_tasks" }] } }] },
  });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(r.json.data.results[0].ok === false && /Nested/i.test(r.json.data.results[0].error), "nested rejected");
});

await test("batch with unknown action → marked error per op", async () => {
  const r = await call({
    action: "batch",
    params: { operations: [{ action: "list_tasks" }, { action: "bogus" }] },
  });
  expect(r.json?.ok === true, JSON.stringify(r.json));
  expect(r.json.data.results[1].ok === false, "bogus failed");
});

// ============ IDAN TOKEN ============

if (IDAN) {
  await test("idan list_dev_items allowed", async () => {
    const r = await call({ action: "list_dev_items", params: {} }, { token: IDAN });
    expect(r.json?.ok === true, JSON.stringify(r.json));
  });

  await test("idan list_tasks → 403", async () => {
    const r = await call({ action: "list_tasks" }, { token: IDAN });
    expect(r.status === 403, `status ${r.status}`);
    expect(r.json?.ok === false, JSON.stringify(r.json));
  });

  await test("idan get_dashboard → 403", async () => {
    const r = await call({ action: "get_dashboard" }, { token: IDAN });
    expect(r.status === 403, `status ${r.status}`);
  });

  await test("idan create_lead → 403", async () => {
    const r = await call({ action: "create_lead", params: { name: "X" } }, { token: IDAN });
    expect(r.status === 403, `status ${r.status}`);
  });

  await test("idan create_dev_item attributes to Idan", async () => {
    const r = await call(
      { action: "create_dev_item", params: { type: "FEATURE", title: "__idan_test__" } },
      { token: IDAN },
    );
    expect(r.json?.ok === true, JSON.stringify(r.json));
    createdByIdanDevId = r.json.data.id;
    expect(!!r.json.data.created_by, "created_by set");
    // We can't verify the exact uuid without DB access, but it MUST differ from admin user.
    // Check via subsequent get_dev_item:
    const g = await call({ action: "get_dev_item", params: { id: createdByIdanDevId } }, { token: IDAN });
    expect(g.json?.ok === true && g.json.data.created_by === r.json.data.created_by, "consistent created_by");
  });

  await test("idan batch with disallowed action inside → 403", async () => {
    const r = await call(
      {
        action: "batch",
        params: { operations: [{ action: "list_dev_items" }, { action: "list_tasks" }] },
      },
      { token: IDAN },
    );
    expect(r.status === 403, `status ${r.status}`);
  });

  await test("idan delete_dev_item cleanup", async () => {
    if (!createdByIdanDevId) return;
    const r = await call({ action: "delete_dev_item", params: { id: createdByIdanDevId } }, { token: IDAN });
    expect(r.json?.ok === true, JSON.stringify(r.json));
  });
} else {
  console.log("⚠ IDAN_AGENT_TOKEN not set — skipping Idan tests");
}

// ============ SUMMARY ============

const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
console.log("\n=========================================");
console.log(`API TESTS: ${pass}/${results.length} passed  (target: ${API_BASE})`);
if (fail.length) {
  console.log("\nFailures:");
  for (const f of fail) console.log(`  ✗ ${f.name}: ${f.details}`);
  process.exit(1);
}
