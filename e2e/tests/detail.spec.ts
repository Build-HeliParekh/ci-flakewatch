import { expect, test } from "@playwright/test";
import { releaseManual } from "./support.js";

test.afterEach(async ({ request }) => {
  await releaseManual(request, ["checkout > applies discount code"]);
});

test("REQ-UI-07: for orders > exports csv on *, the trend points for days −4 to −1 are 0", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "orders > exports csv" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("orders > exports csv");
  const points = page.getByTestId("trend-point");
  await expect(points).toHaveCount(30);
  const rates = await points.evaluateAll((els) => els.map((el) => el.getAttribute("data-rate")));
  expect(rates.slice(-4)).toEqual(["0", "0", "0", "0"]);
  await expect(page.locator(".trend__chart svg")).toBeVisible();
});

test("REQ-UI-07: quarantining a stable test case changes the badge to Quarantined without a page reload", async ({
  page,
}) => {
  await page.goto("/?q=applies%20discount%20code");
  await page.getByRole("button", { name: "checkout > applies discount code" }).click();
  const header = page.locator(".detail__header");
  await expect(header).toContainText("Stable");
  const marker = await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
    return true;
  });
  expect(marker).toBe(true);
  await page.getByRole("button", { name: "Quarantine", exact: true }).click();
  await page.getByLabel("Reason").fill("Checking quarantine end to end");
  await page.getByRole("button", { name: "Quarantine test" }).click();
  await expect(header).toContainText("Quarantined");
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
  // Leave the data as it was for the other specs.
  await page.getByRole("button", { name: "Release" }).click();
  await expect(header).toContainText("Stable");
});

test("REQ-UI-08: when the API is unreachable, the error state with Retry is shown, and Retry recovers", async ({
  page,
}) => {
  let down = true;
  await page.route("**/api/v1/**", (route) =>
    down ? route.abort("connectionrefused") : route.continue(),
  );
  await page.goto("/");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("can't load test results");
  down = false;
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("test-row").first()).toBeVisible();
});

test("REQ-UI-08: a 5xx from the API shows the error state", async ({ page }) => {
  await page.route("**/api/v1/summary**", (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert").getByRole("button", { name: "Retry" })).toBeVisible();
});

test("REQ-UI-08: with an empty database, the empty-state message is shown instead of an empty table", async ({
  page,
}) => {
  await page.route("**/api/v1/repos", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No test results yet" })).toBeVisible();
  await expect(page.getByText("npm run seed:demo")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
