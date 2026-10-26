import { describe, expect, it } from "vitest";
import { formatFlakeRate, unconfirmedLabel } from "../src/lib/format.js";

describe("formatFlakeRate", () => {
  it("REQ-STA-04: shows 1 of 3 flaky commits as 33.3%", () => {
    expect(formatFlakeRate(1, 3)).toBe("33.3%");
  });

  it("REQ-STA-04: shows 77 of 192 flaky commits as 40.1%", () => {
    expect(formatFlakeRate(77, 192)).toBe("40.1%");
  });

  it("REQ-STA-04: rounds half up from the integer counts, with one decimal place", () => {
    expect(formatFlakeRate(1, 16)).toBe("6.3%"); // 62.5 tenths → 63
    expect(formatFlakeRate(1, 8)).toBe("12.5%");
    expect(formatFlakeRate(2, 3)).toBe("66.7%");
    expect(formatFlakeRate(0, 30)).toBe("0.0%");
    expect(formatFlakeRate(5, 5)).toBe("100.0%");
  });

  it("REQ-STA-04: shows a dash when there are no commits", () => {
    expect(formatFlakeRate(0, 0)).toBe("—");
  });
});

describe("unconfirmedLabel", () => {
  it("REQ-UI-04: uses the singular for one failure and the plural otherwise", () => {
    expect(unconfirmedLabel(1)).toBe("1 unconfirmed failure");
    expect(unconfirmedLabel(96)).toBe("96 unconfirmed failures");
  });
});
