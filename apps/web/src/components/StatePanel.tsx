// Loading, empty, no-match, and error states (REQ-UI-08).

type Kind = "loading" | "empty" | "no-match" | "error";

interface Props {
  kind: Kind;
  onRetry?(): void;
  onClear?(): void;
  message?: string | undefined;
}

export function StatePanel({ kind, onRetry, onClear, message }: Props) {
  if (kind === "loading") {
    return (
      <div className="state state--loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        Loading test results…
      </div>
    );
  }
  if (kind === "empty") {
    return (
      <div className="state state--empty">
        <h2 className="state__title">No test results yet</h2>
        <p>
          Upload JUnit XML reports from CI to <code>POST /api/v1/results</code>, or load the
          ShopLite demo data with <code>npm run seed:demo</code>.
        </p>
      </div>
    );
  }
  if (kind === "no-match") {
    return (
      <div className="state state--no-match">
        <h2 className="state__title">No tests match these filters</h2>
        <button type="button" className="button" onClick={onClear}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="state state--error" role="alert">
      <h2 className="state__title">The dashboard can't load test results</h2>
      <p>{message ?? "The flakewatch API didn't respond."} Check that the API is running.</p>
      <button type="button" className="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
