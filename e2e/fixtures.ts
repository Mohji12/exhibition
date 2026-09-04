import { test as base, expect } from "@playwright/test";

const ALLOWED_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Failed to load resource: net::ERR_/i,
];

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const errors: string[] = [];

    page.on("pageerror", (err) => {
      errors.push(`pageerror: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ALLOWED_CONSOLE.some((re) => re.test(text))) return;
      errors.push(`console.error: ${text}`);
    });

    await use(page);

    if (errors.length) {
      await testInfo.attach("console-errors", {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
      expect(errors, `Unexpected browser errors:\n${errors.join("\n")}`).toEqual([]);
    }
  },
});

export { expect };
