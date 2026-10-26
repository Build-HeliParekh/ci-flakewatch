// The 5 most recent failure messages (REQ-UI-07).
import type { RecentError } from "@flakewatch/shared";

export function RecentErrors({ errors }: { errors: readonly RecentError[] }) {
  return (
    <section className="section" aria-labelledby="errors-title">
      <h2 className="section__title" id="errors-title">
        Recent errors
      </h2>
      {errors.length === 0 ? (
        <p className="muted">No failure messages recorded.</p>
      ) : (
        <ol className="errors">
          {errors.map((error) => (
            <li
              key={`${error.commitSha}-${error.attempt}-${error.startedAt}-${error.message}`}
              className="error"
              data-testid="recent-error"
            >
              <pre className="error__message">{error.message}</pre>
              <p className="error__meta">
                <code>{error.commitSha.slice(0, 7)}</code> on {error.branch}, attempt{" "}
                {error.attempt}, {error.startedAt.replace("T", " ").slice(0, 16)} UTC
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
