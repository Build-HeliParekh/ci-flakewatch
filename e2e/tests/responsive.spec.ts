import { expect, test, type Page } from "@playwright/test";

const pageScrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test("REQ-UI-10: at 375 px the page has no horizontal scroll and the chips wrap onto several lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByTestId("test-row").first()).toBeVisible();
  expect(await pageScrollsSideways(page)).toBe(false);
  const tops = await page
    .getByRole("group", { name: "Branch" })
    .getByRole("button")
    .evaluateAll((els) => [
      ...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))),
    ]);
  expect(tops.length).toBeGreaterThan(1);
  // The table may scroll inside its own container.
  const container = await page
    .locator(".table-scroll")
    .evaluate((el) => getComputedStyle(el).overflowX);
  expect(["auto", "scroll"]).toContain(container);
});

for (const width of [375, 768, 1280, 1920]) {
  test(`REQ-UI-10: no horizontal page scroll at ${width} px on the overview and detail pages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("test-row").first()).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
    await page.getByRole("button", { name: "orders > exports csv" }).click();
    await expect(page.getByTestId("commit-cell").first()).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
  });
}
