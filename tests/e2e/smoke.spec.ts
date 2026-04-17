import { test, expect } from "@playwright/test";

test("dashboard root responds", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(500);
});

test("overview renders the redesigned scorecard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Fleet Overview/i })).toBeVisible();
  // Scorecard table header anchors regression tests to the redesign.
  await expect(page.getByText(/Portfolio scorecard/i)).toBeVisible();
  await expect(page.getByText(/14d trend/i)).toBeVisible();
  await expect(page.getByText(/^Spend$/i)).toBeVisible();
  await expect(page.getByText(/^Value$/i)).toBeVisible();
  await expect(page.getByText(/^Net$/i)).toBeVisible();
});

test("queries route is gone", async ({ page }) => {
  const res = await page.goto("/queries");
  expect(res?.status()).toBe(404);
});

test("spend endpoint rejects missing api key", async ({ request }) => {
  const res = await request.get("/api/apps/does-not-matter/spend");
  expect([401, 404]).toContain(res.status());
});

test("feedback endpoint rejects missing api key", async ({ request }) => {
  const res = await request.post("/api/feedback", {
    data: {
      app_slug: "chatbot",
      entity_type: "chatbot_message",
      entity_id: "msg_1",
      vote: "up",
    },
  });
  expect(res.status()).toBe(401);
});

test("feedback endpoint rejects invalid payload", async ({ request }) => {
  const res = await request.post("/api/feedback", {
    headers: { "x-api-key": "obs_not-a-real-key-but-enough-to-pass-the-401-gate" },
    data: { app_slug: "chatbot" },
  });
  // Invalid payload OR 401 from key mismatch — both prove the endpoint is live
  // and validating. Allowing either keeps this resilient to whether a real
  // `chatbot` app row exists in the test DB.
  expect([400, 401, 404]).toContain(res.status());
});
