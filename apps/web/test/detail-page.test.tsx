import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { writeToken } from "../src/state/token.js";
import { fakeHistory, ordersDetail, stableDetail } from "./helpers/detail-fixtures.js";
import { createFakeClient } from "./helpers/fake-client.js";
import { renderApp } from "./helpers/render.js";

afterEach(() => {
  cleanup();
  writeToken.clear();
});

const client = () =>
  createFakeClient({ details: { 18: ordersDetail(), 23: stableDetail() }, history: fakeHistory });
const chip = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });

describe("test detail page", () => {
  it("REQ-UI-07: shows the name, file, repo, and status for the selected scope", async () => {
    renderApp("/tests/18", client());
    expect(
      await screen.findByRole("heading", { level: 1, name: "orders > exports csv" }),
    ).toBeTruthy();
    expect(screen.getByText("tests/orders.test.ts")).toBeTruthy();
    expect(screen.getByText(/demo\/shoplite/)).toBeTruthy();
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    expect(header?.textContent).toContain("Quarantined");
    expect(header?.textContent).toContain("Quarantined automatically");
  });

  it("REQ-UI-07: the window and branch default to the overview's filters", async () => {
    const fake = client();
    renderApp("/tests/18?window=7d&branch=main&status=flaky", fake);
    await screen.findByRole("heading", { level: 1 });
    expect(chip("Window", "7 days").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Branch", "main").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).closest("header")?.textContent).toContain(
      "Stable",
    );
    await waitFor(() =>
      expect(fake.callsOf("history").at(-1)).toEqual({ id: 18, branch: "main", window: "7d" }),
    );
  });

  it("REQ-UI-07: changing the scope updates the status and history, and offers the test's own branches", async () => {
    const user = userEvent.setup();
    const fake = client();
    renderApp("/tests/18", fake);
    await screen.findByRole("heading", { level: 1 });
    const branches = within(screen.getByRole("group", { name: "Branch" }))
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(branches).toEqual(["All branches", "main"]);
    await user.click(chip("Window", "7 days"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).closest("header")?.textContent).toContain(
        "Stable",
      ),
    );
    await waitFor(() =>
      expect(fake.callsOf("history").at(-1)).toEqual({ id: 18, branch: "*", window: "7d" }),
    );
  });

  it("REQ-UI-07: a scope with no results says so instead of showing numbers (PQ-18)", async () => {
    renderApp("/tests/23?scopeWindow=7d&scopeBranch=feature/x", client());
    expect(await screen.findByText("No results in this scope")).toBeTruthy();
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("REQ-UI-07: for orders > exports csv on *, the trend chart's points for days −4 to −1 are 0", async () => {
    renderApp("/tests/18", client());
    const table = await screen.findByRole("table", { name: "Flake rate by day" });
    const points = within(table).getAllByTestId("trend-point");
    expect(points).toHaveLength(30);
    expect(points.slice(-4).map((p) => p.getAttribute("data-rate"))).toEqual(["0", "0", "0", "0"]);
    expect(points.slice(-4).map((p) => p.textContent)).toEqual([
      "2026-10-200.0%",
      "2026-10-210.0%",
      "2026-10-220.0%",
      "2026-10-230.0%",
    ]);
    expect(points[10]?.textContent).toContain("No commits");
  });

  it('REQ-UI-07: the commit strip has one labelled cell per commit; a failure with no re-run is "failed (not re-run)"', async () => {
    renderApp("/tests/18", client());
    await screen.findByRole("table", { name: "Flake rate by day" });
    const cells = screen.getAllByTestId("commit-cell");
    expect(cells.map((c) => c.getAttribute("data-label"))).toEqual([
      "passed",
      "flaky",
      "failed (not re-run)",
      "failed",
    ]);
    expect(cells[2]?.getAttribute("aria-label")).toBe(
      "ccccccc: failed (not re-run), 2026-10-11 10:00 UTC",
    );
  });

  it("REQ-UI-07: shows the number of unconfirmed failures in the selected scope", async () => {
    renderApp("/tests/23", client());
    expect((await screen.findByTestId("unconfirmed")).textContent).toBe("1");
    expect(screen.getByText(/1 unconfirmed failure with no re-run/)).toBeTruthy();
  });

  it("REQ-UI-07: shows the 5 most recent error messages", async () => {
    renderApp("/tests/18", client());
    const errors = await screen.findAllByTestId("recent-error");
    expect(errors).toHaveLength(5);
    expect(errors[0]?.textContent).toContain(
      'TimeoutError: Waiting for selector ".order-row" exceeded 5000ms',
    );
    expect(errors[0]?.textContent).toContain("0000000 on main, attempt 1");
  });

  it("REQ-UI-07: the back link returns to the overview with the previous filters, without the detail scope", async () => {
    const user = userEvent.setup();
    const { location } = renderApp("/tests/18?window=7d&status=flaky", client());
    await screen.findByRole("heading", { level: 1 });
    await user.click(chip("Window", "30 days"));
    await user.click(screen.getByRole("link", { name: "Back to all tests" }));
    expect(location()).toBe("/?window=7d&status=flaky");
  });

  it("REQ-UI-07: an unknown test case says it doesn't exist", async () => {
    renderApp("/tests/999", client());
    expect(await screen.findByText("This test case doesn't exist")).toBeTruthy();
  });
});
