// One cell per recent commit, newest first, colored and labelled (REQ-UI-07).
import type { HistoryCommit } from "@flakewatch/shared";

/** passed, failed, flaky, or "failed (not re-run)" when a failure was never retried. */
export function commitLabel(commit: HistoryCommit): string {
  if (commit.outcome === "failed" && !commit.rerun) return "failed (not re-run)";
  return commit.outcome;
}

export function CommitStrip({ commits }: { commits: readonly HistoryCommit[] }) {
  return (
    <section className="section" aria-labelledby="commits-title">
      <h2 className="section__title" id="commits-title">
        Recent commits <span className="section__count">{commits.length}</span>
      </h2>
      {commits.length === 0 ? (
        <p className="muted">No commits in this scope.</p>
      ) : (
        <ol className="strip">
          {commits.map((commit) => {
            const label = commitLabel(commit);
            const text = `${commit.commitSha.slice(0, 7)}: ${label}, ${commit.firstStartedAt.replace("T", " ").slice(0, 16)} UTC`;
            return (
              <li
                key={commit.commitSha}
                className={`strip__cell strip__cell--${commit.outcome}${label === "failed (not re-run)" ? " strip__cell--unconfirmed" : ""}`}
                data-testid="commit-cell"
                data-label={label}
                aria-label={text}
                title={text}
              />
            );
          })}
        </ol>
      )}
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="strip__cell strip__cell--passed" aria-hidden="true" /> passed
        </li>
        <li>
          <span className="strip__cell strip__cell--flaky" aria-hidden="true" /> flaky
        </li>
        <li>
          <span className="strip__cell strip__cell--failed" aria-hidden="true" /> failed
        </li>
        <li>
          <span
            className="strip__cell strip__cell--failed strip__cell--unconfirmed"
            aria-hidden="true"
          />{" "}
          failed (not re-run)
        </li>
      </ul>
    </section>
  );
}
