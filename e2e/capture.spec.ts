import { test, expect } from "@playwright/test";

const DRAFT_KEY = "conninter:draft-lead";

test.describe("Capture flow", () => {
  test("capture hub links navigate to QR scanner", async ({ page }) => {
    await page.goto("/capture");
    await page.getByRole("link", { name: /Scan Delegate QR/i }).click();
    await expect(page).toHaveURL(/\/capture\/qr/);
    await expect(page.getByText("Scan QR")).toBeVisible();
    await expect(page.getByText(/Point camera at delegate QR badge/i)).toBeVisible();
  });

  test("card route renders camera and upload controls", async ({ page }) => {
    await page.goto("/capture/card");
    await expect(page.getByRole("button", { name: /Open camera/i })).toBeVisible();
    await expect(page.getByText("Upload", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visiting card" })).toBeVisible();
  });

  test("manual entry shows empty form without placeholder name", async ({ page }) => {
    await page.goto("/leads/new?source=manual");
    await expect(page.getByRole("heading", { name: "Visitor details" })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("");
    await expect(page.getByText("Enter visitor details below")).toBeVisible();
  });

  test("draft handoff populates lead form from sessionStorage", async ({ page }) => {
    await page.goto("/capture");
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
    await page.goto("/leads/new?source=qr");
    await expect(page.getByLabel("Name")).toHaveValue("Dr. E2E Test");
    await expect(page.getByLabel("Email")).toHaveValue("e2e@example.com");
    await expect(page.getByText(/Auto-filled from QR scan/i)).toBeVisible();
  });

  test("back navigation from QR returns to capture hub", async ({ page }) => {
    await page.goto("/capture/qr");
    await page.getByRole("link", { name: /Back/i }).click();
    await expect(page).toHaveURL(/\/capture\/?$/);
    await expect(page.getByText("Scan Delegate QR")).toBeVisible();
  });

  test("save blocked when required fields are invalid", async ({ page }) => {
    await page.goto("/leads/new?source=manual");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Company").fill("Test Co");
    await page.getByLabel("Designation").fill("Director");
    await page.getByLabel("Mobile").fill("9876543210");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("City").fill("Mumbai");
    await expect(page.getByRole("button", { name: /Save Lead/i })).toBeDisabled();
  });
});
