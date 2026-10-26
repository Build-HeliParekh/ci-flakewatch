import { expect, test, type Page } from "@playwright/test";

const rows = (page: Page) => page.getByTestId("test-row");
const chip = (page: Page, group: string, name: string) =>
  page.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
const card = (page: Page, key: string) => page.getByTestId(`card-${key}`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(rows(page).first()).toBeVisible();
});

test("REQ-NFR-02: at 1280 × 800 the top five rows and their failed attempts are visible without scrolling", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  expect(viewport).toEqual({ width: 1280, height: 800 });
  const names = [
    "auth > redirects after sso",
    "orders > exports csv",
    "cart > updates total",
    "profile > uploads avatar",
    "search > paginates results",
  ];
  for (const [i, name] of names.entries()) {
    const row = rows(page).nth(i);
    await expect(row).toContainText(name);
    const lastCell = row.locator("td").last();
    await expect(lastCell).toBeInViewport({ ratio: 1 });
  }
  await expect(rows(page).nth(4).locator("td").last()).toHaveText("9");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("REQ-UI-01: the cards show 1 broken, 3 quarantined, 2 flaky, and 161 failed attempts from flakes", async ({
  page,
}) => {
  await expect(card(page, "broken")).toHaveText("1");
  await expect(card(page, "quarantined")).toHaveText("3");
  await expect(card(page, "flaky")).toHaveText("2");
  await expect(card(page, "failedAttemptsFromFlakes")).toHaveText("161");
});

test("REQ-UI-02: the Quarantined chip lists only quarantined tests and the cards don't change", async ({
  page,
}) => {
  await chip(page, "Status", "Quarantined").click();
  await expect(rows(page)).toHaveCount(3);
  for (const row of await rows(page).all()) await expect(row).toContainText("Quarantined");
  await expect(card(page, "quarantined")).toHaveText("3");
  await expect(card(page, "failedAttemptsFromFlakes")).toHaveText("161");
});

test("REQ-UI-02: profile > uploads avatar is Quarantined on feature/avatar-v2 and Stable on main", async ({
  page,
}) => {
  const avatarRow = () => rows(page).filter({ hasText: "profile > uploads avatar" });
  await chip(page, "Branch", "feature/avatar-v2").click();
  await expect(avatarRow()).toContainText("Quarantined");
  await chip(page, "Branch", "main").click();
  await page.getByRole("searchbox", { name: "Search" }).fill("uploads avatar");
  await expect(avatarRow()).toContainText("Stable");
});

test("REQ-UI-03: a filtered view's URL opened in a new tab shows the same chips and rows", async ({
  page,
  context,
}) => {
  await chip(page, "Window", "7 days").click();
  await chip(page, "Status", "Flaky").click();
  await expect(rows(page)).toHaveCount(2);
  const names = await rows(page).locator(".test-link").allTextContents();
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(chip(other, "Window", "7 days")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(other, "Status", "Flaky")).toHaveAttribute("aria-pressed", "true");
  await expect(rows(other).locator(".test-link")).toHaveText(names);
});

test("REQ-UI-04: the first row is auth > redirects after sso at 40.1%", async ({ page }) => {
  await expect(rows(page).first()).toContainText("auth > redirects after sso");
  await expect(rows(page).first()).toContainText("40.1%");
});

test("REQ-UI-04: payments > refunds partial shows Broken and a marker reading 96 unconfirmed failures", async ({
  page,
}) => {
  const row = rows(page).filter({ hasText: "payments > refunds partial" });
  await expect(row).toContainText("Broken");
  await expect(row).toContainText("96 unconfirmed failures");
});

test("REQ-UI-05: typing checkout lists only tests whose name or file contains checkout", async ({
  page,
}) => {
  await page.getByRole("searchbox", { name: "Search" }).fill("checkout");
  await expect(page).toHaveURL(/q=checkout/);
  await expect(page.getByText(/of 25$/)).toBeVisible();
  await expect(rows(page)).toHaveCount(25);
  for (const name of await rows(page).locator(".test-link").allTextContents())
    expect(name).toContain("checkout");
});
