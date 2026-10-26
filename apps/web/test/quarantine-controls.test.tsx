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

const header = () => screen.getByRole("heading", { level: 1 }).closest("header")?.textContent ?? "";

describe("quarantine controls", () => {
  it("REQ-UI-07: quarantining a stable test case with a reason changes the badge to Quarantined without a reload", async () => {
    const user = userEvent.setup();
    const fake = createFakeClient({ details: { 23: stableDetail() }, history: fakeHistory });
    renderApp("/tests/23", fake);
    await screen.findByRole("heading", { level: 1 });
    expect(header()).toContain("Stable");
    await user.click(screen.getByRole("button", { name: "Quarantine" }));
    const dialog = screen.getByRole("dialog", { name: "Quarantine this test" });
    await user.type(within(dialog).getByLabelText("Reason"), "Times out on CI runners");
    await user.click(within(dialog).getByRole("button", { name: "Quarantine test" }));
    await waitFor(() => expect(header()).toContain("Quarantined"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fake.callsOf("quarantine")).toEqual([
      { id: 23, reason: "Times out on CI runners", token: undefined },
    ]);
    expect(screen.getByText(/Times out on CI runners/)).toBeTruthy();
  });

  it("REQ-UI-07: Release appears when manually quarantined and lifts it", async () => {
    const user = userEvent.setup();
    const detail = stableDetail();
    const fake = createFakeClient({ details: { 23: detail }, history: fakeHistory });
    renderApp("/tests/23", fake);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Quarantine" }));
    await user.type(screen.getByLabelText("Reason"), "flaky on CI");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    await user.click(await screen.findByRole("button", { name: "Release" }));
    await waitFor(() => expect(header()).toContain("Stable"));
    expect(screen.getByRole("button", { name: "Quarantine" })).toBeTruthy();
  });

  it("REQ-UI-07: an empty reason isn't sent", async () => {
    const user = userEvent.setup();
    const fake = createFakeClient({ details: { 23: stableDetail() }, history: fakeHistory });
    renderApp("/tests/23", fake);
    await user.click(await screen.findByRole("button", { name: "Quarantine" }));
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a reason.");
    expect(fake.callsOf("quarantine")).toHaveLength(0);
  });

  it("REQ-UI-09: the dialog works with the keyboard alone: focus moves in, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    renderApp(
      "/tests/23",
      createFakeClient({ details: { 23: stableDetail() }, history: fakeHistory }),
    );
    const button = await screen.findByRole("button", { name: "Quarantine" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Quarantine" }));
  });

  it("REQ-UI-09: Tab stays inside the dialog, and the whole flow can be done from the keyboard", async () => {
    const user = userEvent.setup();
    renderApp(
      "/tests/23",
      createFakeClient({ details: { 23: stableDetail() }, history: fakeHistory }),
    );
    (await screen.findByRole("button", { name: "Quarantine" })).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("Keyboard only");
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Quarantine test");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
    await user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("Quarantine test");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(header()).toContain("Quarantined"));
  });

  it("REQ-UI-07: when the API needs a write token, the dialog asks once and keeps it for the tab (PQ-03)", async () => {
    const user = userEvent.setup();
    const fake = createFakeClient({
      details: { 23: stableDetail(), 18: ordersDetail() },
      history: fakeHistory,
      requireToken: "abc",
    });
    renderApp("/tests/23", fake);
    await user.click(await screen.findByRole("button", { name: "Quarantine" }));
    await user.type(screen.getByLabelText("Reason"), "needs a token");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    const token = await screen.findByLabelText("Write token");
    expect(token.getAttribute("type")).toBe("password");
    await user.type(token, "wrong");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That token was not accepted.");
    await user.clear(screen.getByLabelText("Write token"));
    await user.type(screen.getByLabelText("Write token"), "abc");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    await waitFor(() => expect(header()).toContain("Quarantined"));
    // The token is reused for the next change without asking again.
    await user.click(screen.getByRole("button", { name: "Release" }));
    await waitFor(() => expect(header()).toContain("Stable"));
    expect(fake.callsOf("release").at(-1)).toEqual({ id: 23, token: "abc" });
    expect(screen.queryByLabelText("Write token")).toBeNull();
  });

  it("REQ-UI-07: a write token is never written to browser storage (PQ-03)", async () => {
    const user = userEvent.setup();
    renderApp(
      "/tests/23",
      createFakeClient({
        details: { 23: stableDetail() },
        history: fakeHistory,
        requireToken: "abc",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Quarantine" }));
    await user.type(screen.getByLabelText("Reason"), "x");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    await user.type(await screen.findByLabelText("Write token"), "abc");
    await user.click(screen.getByRole("button", { name: "Quarantine test" }));
    await waitFor(() => expect(header()).toContain("Quarantined"));
    expect(JSON.stringify({ ...localStorage })).not.toContain("abc");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("abc");
  });
});
