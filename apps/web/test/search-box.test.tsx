import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "../src/components/SearchBox.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

afterEach(cleanup);

describe("SearchBox", () => {
  it("REQ-UI-05: applies the search 300 ms after typing stops, not before", () => {
    const onSearch = vi.fn();
    render(<SearchBox value="" onSearch={onSearch} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "checkout" },
    });
    act(() => vi.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledWith("checkout");
  });

  it("REQ-UI-05: typing again restarts the wait, so only the final text is searched", () => {
    const onSearch = vi.fn();
    render(<SearchBox value="" onSearch={onSearch} />);
    const box = screen.getByRole("searchbox", { name: "Search" });
    fireEvent.change(box, { target: { value: "che" } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(box, { target: { value: "checkout" } });
    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("checkout");
  });

  it("REQ-UI-05: clearing the box removes the search", () => {
    const onSearch = vi.fn();
    render(<SearchBox value="cart" onSearch={onSearch} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "  " },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledWith(undefined);
  });
});
