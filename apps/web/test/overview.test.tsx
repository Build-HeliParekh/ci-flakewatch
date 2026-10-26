import type { TestsQuery } from "@flakewatch/shared";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeClient } from "./helpers/fake-client.js";
import { renderApp } from "./helpers/render.js";

afterEach(cleanup);

const rows = () => screen.getAllByTestId("test-row");
const firstRow = async () => {
  const [row] = await screen.findAllByTestId("test-row");
  if (!row) throw new Error("no rows");
  return row;
};
const chip = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name });
const card = (key: string) => screen.getByTestId(`card-${key}`).textContent;
const lastTestsQuery = (client: ReturnType<typeof createFakeClient>) =>
  client.callsOf("tests").at(-1) as TestsQuery;
const queryOf = (location: string) => new URLSearchParams(location.split("?")[1] ?? "");

describe("overview cards", () => {
  it("REQ-UI-01: shows 1 broken, 3 quarantined, 2 flaky, and 161 failed attempts from flakes for ShopLite", async () => {
    renderApp();
    await screen.findByTestId("card-broken");
    expect(card("broken")).toBe("1");
    expect(card("quarantined")).toBe("3");
    expect(card("flaky")).toBe("2");
    expect(card("failedAttemptsFromFlakes")).toBe("161");
  });

  it("REQ-UI-01: shows the cards above the ranked table", async () => {
    renderApp();
    await firstRow();
    const summary = screen.getByLabelText("Summary");
    const table = screen.getByRole("region", { name: "Tests ranked by flake rate" });
    expect(summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("filter chips", () => {
  it("REQ-UI-02: starts with the first repo, all branches, 30 days, and no status selected", async () => {
    const { client } = renderApp();
    await firstRow();
    expect(chip("Repo", "demo/shoplite").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Branch", "All branches").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Window", "30 days").getAttribute("aria-pressed")).toBe("true");
    for (const status of ["Broken", "Quarantined", "Flaky", "Stable"]) {
      expect(chip("Status", status).getAttribute("aria-pressed")).toBe("false");
    }
    expect(lastTestsQuery(client)).toMatchObject({
      repo: "demo/shoplite",
      branch: "*",
      window: "30d",
    });
    expect(lastTestsQuery(client).status).toBeUndefined();
    expect(client.callsOf("summary").at(-1)).toEqual({
      repo: "demo/shoplite",
      branch: "*",
      window: "30d",
    });
  });

  it("REQ-UI-02: the Quarantined chip lists only quarantined tests and leaves the cards unchanged", async () => {
    const user = userEvent.setup();
    const { client } = renderApp();
    await firstRow();
    const summaryCalls = client.callsOf("summary").length;
    await user.click(chip("Status", "Quarantined"));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((row) => within(row).getByText(/Quarantined/).textContent)).toHaveLength(3);
    expect(lastTestsQuery(client).status).toEqual(["quarantined"]);
    expect(card("quarantined")).toBe("3");
    expect(card("failedAttemptsFromFlakes")).toBe("161");
    expect(client.callsOf("summary")).toHaveLength(summaryCalls);
  });

  it("REQ-UI-02: status chips can be combined", async () => {
    const user = userEvent.setup();
    const { client } = renderApp();
    await firstRow();
    await user.click(chip("Status", "Flaky"));
    await user.click(chip("Status", "Broken"));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(lastTestsQuery(client).status).toEqual(["broken", "flaky"]);
  });

  it("REQ-UI-02: branch and window chips apply to both the cards and the table", async () => {
    const user = userEvent.setup();
    const { client } = renderApp();
    await firstRow();
    await user.click(chip("Branch", "feature/avatar-v2"));
    await user.click(chip("Window", "7 days"));
    await waitFor(() =>
      expect(lastTestsQuery(client)).toMatchObject({ branch: "feature/avatar-v2", window: "7d" }),
    );
    expect(client.callsOf("summary").at(-1)).toEqual({
      repo: "demo/shoplite",
      branch: "feature/avatar-v2",
      window: "7d",
    });
  });

  it("REQ-UI-02: branch options follow the selected repo, and changing repo goes back to all branches", async () => {
    const user = userEvent.setup();
    const { client } = renderApp();
    await firstRow();
    const branchNames = () =>
      within(screen.getByRole("group", { name: "Branch" }))
        .getAllByRole("button")
        .map((button) => button.textContent);
    expect(branchNames()).toEqual([
      "All branches",
      "feature/avatar-v2",
      "feature/new-checkout",
      "fix/search-performance",
      "main",
    ]);
    await user.click(chip("Branch", "main"));
    await user.click(chip("Repo", "zeta/other"));
    expect(branchNames()).toEqual(["All branches", "develop", "main"]);
    expect(chip("Branch", "All branches").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() =>
      expect(lastTestsQuery(client)).toMatchObject({ repo: "zeta/other", branch: "*" }),
    );
  });

  it("REQ-UI-02: changing any chip goes back to page 1", async () => {
    const user = userEvent.setup();
    const { client, location } = renderApp("/?page=3");
    await firstRow();
    expect(lastTestsQuery(client).page).toBe(3);
    await user.click(chip("Window", "7 days"));
    await waitFor(() => expect(lastTestsQuery(client).page).toBe(1));
    expect(queryOf(location()).get("page")).toBeNull();
  });
});

describe("shareable URLs", () => {
  it("REQ-UI-03: opening a filtered URL restores the same chips and rows", async () => {
    const { client } = renderApp("/?status=flaky&window=7d&sort=failedAttempts");
    await firstRow();
    expect(chip("Status", "Flaky").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Window", "7 days").getAttribute("aria-pressed")).toBe("true");
    expect(rows().map((row) => within(row).getAllByRole("button")[0]?.textContent)).toEqual([
      "profile > uploads avatar",
      "search > paginates results",
    ]);
    expect(lastTestsQuery(client)).toMatchObject({
      status: ["flaky"],
      window: "7d",
      sort: "failedAttempts",
      order: "desc",
    });
  });

  it("REQ-UI-03: every change is written to the URL, so the view can be shared", async () => {
    const user = userEvent.setup();
    const { location } = renderApp();
    await firstRow();
    await user.click(chip("Status", "Broken"));
    await user.click(chip("Branch", "main"));
    await waitFor(() => expect(queryOf(location()).get("status")).toBe("broken"));
    expect(queryOf(location()).get("branch")).toBe("main");
  });

  it("REQ-UI-03: the default view has a clean URL", async () => {
    const { location } = renderApp();
    await firstRow();
    expect(location()).toBe("/");
  });
});

describe("ranked table", () => {
  it("REQ-UI-04: with default filters the first row is auth > redirects after sso at 40.1%", async () => {
    renderApp();
    const row = await firstRow();
    expect(within(row).getByRole("button", { name: "auth > redirects after sso" })).toBeTruthy();
    expect(row?.textContent).toContain("40.1%");
    expect(row?.textContent).toContain("77 / 192");
    expect(row?.textContent).toContain("tests/auth.test.ts");
    expect(within(row).getAllByRole("cell")[0]?.textContent).toContain("1");
  });

  it("REQ-UI-04: payments > refunds partial shows the Broken badge and a marker reading 96 unconfirmed failures", async () => {
    renderApp();
    await firstRow();
    const row = rows().find((r) => r.textContent?.includes("payments > refunds partial"));
    expect(row?.textContent).toContain("Broken");
    expect(row?.textContent).toContain("96 unconfirmed failures");
  });

  it("REQ-UI-04: a single unconfirmed failure uses the singular, and tests with none have no marker", async () => {
    renderApp("/?q=checkout%20%3E%20validates");
    await firstRow();
    expect(rows()[0]?.textContent).toContain("1 unconfirmed failure");
    expect(rows()[0]?.textContent).not.toContain("1 unconfirmed failures");
    cleanup();
    renderApp();
    expect((await firstRow()).textContent).not.toContain("unconfirmed");
  });

  it("REQ-UI-04: shows 25 rows a page, and ranks continue on later pages", async () => {
    const user = userEvent.setup();
    const { client } = renderApp();
    await firstRow();
    expect(rows()).toHaveLength(25);
    expect(lastTestsQuery(client).pageSize).toBe(25);
    expect(screen.getByText("1–25 of 151")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("26–50 of 151")).toBeTruthy());
    expect(rows()[0]?.querySelector("td")?.textContent).toContain("26");
    expect(screen.getByText("Page 2 of 7")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByText("1–25 of 151")).toBeTruthy());
  });

  it("REQ-UI-04: Next is disabled on the last page", async () => {
    renderApp("/?page=7");
    await firstRow();
    expect(screen.getByText("151–151 of 151")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("REQ-UI-04: flake rate and failed attempts are sortable; a second click reverses the order", async () => {
    const user = userEvent.setup();
    const { client, location } = renderApp();
    await firstRow();
    const header = (name: string) => screen.getByRole("columnheader", { name: new RegExp(name) });
    expect(header("Flake rate").getAttribute("aria-sort")).toBe("descending");
    expect(header("Failed attempts").getAttribute("aria-sort")).toBe("none");

    await user.click(within(header("Failed attempts")).getByRole("button"));
    await waitFor(() =>
      expect(lastTestsQuery(client)).toMatchObject({
        sort: "failedAttempts",
        order: "desc",
        page: 1,
      }),
    );
    await waitFor(() => expect(rows()[0]?.textContent).toContain("payments > refunds partial"));
    expect(header("Failed attempts").getAttribute("aria-sort")).toBe("descending");

    await user.click(within(header("Failed attempts")).getByRole("button"));
    await waitFor(() =>
      expect(lastTestsQuery(client)).toMatchObject({ sort: "failedAttempts", order: "asc" }),
    );
    expect(queryOf(location()).get("order")).toBe("asc");
    expect(header("Failed attempts").getAttribute("aria-sort")).toBe("ascending");
  });

  it("REQ-UI-04: only flake rate and failed attempts can be sorted", async () => {
    renderApp();
    await firstRow();
    const sortable = screen
      .getAllByRole("columnheader")
      .filter((th) => th.hasAttribute("aria-sort"))
      .map((th) => th.textContent?.replace(/[▲▼↕]/g, "").trim());
    expect(sortable).toEqual(["Flake rate", "Failed attempts"]);
  });

  it("REQ-UI-04: clicking a row opens its detail page and keeps the filters for the way back", async () => {
    const user = userEvent.setup();
    const { location } = renderApp("/?window=7d");
    await user.click(await firstRow());
    expect(location()).toBe("/tests/17?window=7d");
    await user.click(screen.getByRole("link", { name: "Back to all tests" }));
    expect(location()).toBe("/?window=7d");
  });

  it("REQ-UI-04: the test name is a keyboard-usable button that opens the detail page", async () => {
    const user = userEvent.setup();
    const { location } = renderApp();
    await firstRow();
    screen.getByRole("button", { name: "auth > redirects after sso" }).focus();
    await user.keyboard("{Enter}");
    expect(location()).toBe("/tests/17");
  });
});

describe("search", () => {
  it("REQ-UI-05: typing checkout lists only tests whose name or file contains checkout", async () => {
    const user = userEvent.setup();
    const { client, location } = renderApp();
    await firstRow();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "checkout");
    await waitFor(() => expect(lastTestsQuery(client).q).toBe("checkout"));
    await waitFor(() => expect(rows().length).toBeLessThan(25));
    for (const row of rows()) expect(row.textContent?.toLowerCase()).toContain("checkout");
    expect(queryOf(location()).get("q")).toBe("checkout");
    expect(client.callsOf("tests").filter((query) => (query as TestsQuery).q === "c")).toHaveLength(
      0,
    );
  });

  it("REQ-UI-05: a search from the URL fills the box", async () => {
    renderApp("/?q=cart");
    await firstRow();
    expect((screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement).value).toBe(
      "cart",
    );
  });
});

describe("loading, empty, and error states", () => {
  it("REQ-UI-08: shows a loading indicator until the data arrives", async () => {
    const client = createFakeClient();
    client.hold = true;
    renderApp("/", client);
    expect((await screen.findByRole("status")).textContent).toContain("Loading");
    expect(screen.queryByTestId("test-row")).toBeNull();
    client.resume();
    await firstRow();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("REQ-UI-08: with an empty database, explains how to upload results or seed demo data instead of an empty table", async () => {
    renderApp("/", createFakeClient({ repos: { items: [] }, items: [] }));
    expect(await screen.findByText("No test results yet")).toBeTruthy();
    expect(screen.getByText("POST /api/v1/results")).toBeTruthy();
    expect(screen.getByText("npm run seed:demo")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("REQ-UI-08: when no rows match, says so and Clear filters restores the full list", async () => {
    const user = userEvent.setup();
    const { location } = renderApp("/?q=no-such-test&status=broken&window=7d");
    expect(await screen.findByText("No tests match these filters")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(rows()).toHaveLength(25));
    expect(location()).toBe("/");
  });

  it("REQ-UI-08: Clear filters keeps the selected repo", async () => {
    const user = userEvent.setup();
    const { location } = renderApp("/?repo=demo/shoplite&q=no-such-test");
    await user.click(await screen.findByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(location()).toBe("/?repo=demo%2Fshoplite"));
  });

  it("REQ-UI-08: when the API can't be reached, shows an error with Retry, which loads the data once the API is back", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.failing = true;
    renderApp("/", client);
    const alert = await screen.findByRole("alert");
    expect(alert?.textContent).toContain("can't load test results");
    expect(alert?.textContent).toContain("Check that the API is running.");
    client.failing = false;
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect((await firstRow()).textContent).toContain("auth > redirects after sso");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
