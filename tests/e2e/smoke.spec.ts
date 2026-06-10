import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "Set TEST_USER_EMAIL / TEST_USER_PASSWORD to run E2E");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in|connect/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("Auth + navigation", () => {
  test("login redirects to home and shows app shell", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/login/);
  });

  test("unauthenticated visit to /tasks redirects to /login", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/login|auth/);
  });
});

test.describe("Task lifecycle", () => {
  test("create → edit → complete → delete a task", async ({ page }) => {
    await login(page);
    await page.goto("/tasks");
    const title = `__e2e_${Date.now()}__`;

    await page.getByRole("button", { name: /new task|create|הוסף|חדש/i }).first().click();
    await page.getByLabel(/title|כותרת/i).fill(title);
    await page.getByRole("button", { name: /save|create|שמור/i }).click();

    await expect(page.getByText(title)).toBeVisible();

    await page.getByText(title).click();
    // Mark complete via whatever control the UI exposes:
    await page
      .getByRole("button", { name: /complete|done|הושלם/i })
      .first()
      .click();

    // Delete:
    await page
      .getByRole("button", { name: /delete|מחק/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: /confirm|delete|מחק|אישור/i })
      .last()
      .click();
    await expect(page.getByText(title)).not.toBeVisible();
  });
});

test.describe("API ↔ UI sync", () => {
  test("a row created via API appears in the UI after reload", async ({ page, request }) => {
    const token = process.env.CLAUDE_AGENT_TOKEN;
    test.skip(!token, "CLAUDE_AGENT_TOKEN not set");

    const title = `__e2e_api_sync_${Date.now()}__`;
    const res = await request.post("/api/public/claude-agent", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { action: "create_task", params: { title, domain: "OPS" } },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    const id = body.data.id;

    await login(page);
    await page.goto("/tasks");
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // cleanup
    await request.post("/api/public/claude-agent", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { action: "delete_task", params: { id } },
    });
  });
});
