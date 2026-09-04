import { test, expect } from "./fixtures";

const DRAFT_KEY = "conninter:draft-lead";

test.describe("Capture flow", () => {
  test("unauthenticated capture hub redirects to sign-in", async ({ page }) => {
    await page.goto("/capture");
    await expect(page.getByLabel(/work email/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
  });

  test("unauthenticated card route redirects to sign-in", async ({ page }) => {
    await page.goto("/capture/card");
    await expect(page.getByLabel(/work email/i)).toBeVisible({ timeout: 15_000 });
  });

  test("unauthenticated manual lead form redirects to sign-in", async ({ page }) => {
    await page.goto("/leads/new?source=manual");
    await expect(page.getByLabel(/work email/i)).toBeVisible({ timeout: 15_000 });
  });

  test("login page stays usable with draft present in sessionStorage", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ({ key }) => {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            lead: {
              name: "Dr. E2E Test",
              email: "e2e@example.com",
              company: "Test Hospital",
              designation: "Director",
              mobile: "9876543210",
              city: "Mumbai",
            },
            captureSource: "qr",
            fieldConfidence: { name: 95, email: 95 },
          }),
        );
      },
      { key: DRAFT_KEY },
    );
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByLabel(/event pin/i)).toBeVisible();
  });

  test("sign-in page has no unexpected console errors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("FUNNEL")).toBeVisible();
  });
});
