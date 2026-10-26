import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { releaseManual } from "./support.js";

test.afterEach(async ({ request }) => {
  await releaseManual(request, ["search > paginates results", "auth > redirects after sso"]);
});

const RULES = [
  "color-contrast",
  "button-name",
  "link-name",
  "label",
  "aria-input-field-name",
  "aria-toggle-field-name",
  "image-alt",
];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => RULES.includes(v.id))
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("REQ-UI-09: keyboard alone can select a chip, open a test case, and quarantine it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("test-row").first()).toBeVisible();
  const flaky = page
    .getByRole("group", { name: "Status" })
    .getByRole("button", { name: "Flaky", exact: true });
  await flaky.focus();
  await page.keyboard.press("Enter");
  await expect(flaky).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("test-row")).toHaveCount(2);
  await page.getByRole("button", { name: "search > paginates results" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("search > paginates results");
  await page.getByRole("button", { name: "Quarantine", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Reason")).toBeFocused();
  await page.keyboard.type("Keyboard-only check");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Quarantine test" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail__header")).toContainText("Quarantined");
  await expect(page.getByRole("button", { name: "Release" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail__header")).toContainText("Flaky");
});

test("REQ-UI-09: axe finds no contrast or missing-name problems on the overview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("test-row").first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("REQ-UI-09: axe finds no contrast or missing-name problems on the detail page and the dialog", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "auth > redirects after sso" }).click();
  await expect(page.getByTestId("commit-cell").first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole("button", { name: "Quarantine", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("REQ-UI-09: axe finds no problems in dark mode either", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("test-row").first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
