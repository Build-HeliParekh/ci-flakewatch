import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "../src/components/StatusBadge.js";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("REQ-UI-06: shows each status as a text label", () => {
    const labels = (["broken", "quarantined", "flaky", "stable"] as const).map(
      (status) => render(<StatusBadge status={status} />).container.textContent,
    );
    expect(labels).toEqual(["Broken", "Quarantined", "Flaky", "Stable"]);
  });

  it("REQ-UI-06: gives each status its own style, as well as its label", () => {
    const classes = (["broken", "quarantined", "flaky", "stable"] as const).map(
      (status) => render(<StatusBadge status={status} />).container.firstElementChild?.className,
    );
    expect(new Set(classes).size).toBe(4);
  });
});
