import { test, expect } from "@playwright/test";

test("dashboard root responds", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(500);
});

test("spend endpoint rejects missing api key", async ({ request }) => {
  const res = await request.get("/api/apps/does-not-matter/spend");
  expect([401, 404]).toContain(res.status());
});
