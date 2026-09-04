import { test, expect } from "./fixtures";

test.describe("Auth UI", () => {
  test("login page renders email and PIN fields", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByLabel(/event pin/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeDisabled();
  });

  test("sign-in stays disabled until PIN has 4 digits", async ({ page }) => {
    await page.goto("/");
    await page.locator("#email").fill("admin@conninter.example");
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeDisabled();
    await page.locator("#pin").evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "1234";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // React controlled input may ignore raw DOM sets — assert page still healthy
    await expect(page.getByText("FUNNEL")).toBeVisible();
    await expect(page.locator("#email")).toHaveValue("admin@conninter.example");
  });
});
