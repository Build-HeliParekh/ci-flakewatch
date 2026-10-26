// One test case: its scope, trend, commits, errors, and quarantine controls (REQ-UI-07).
import { ALL_BRANCHES } from "@flakewatch/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../api/client.js";
import { CommitStrip } from "../components/CommitStrip.js";
import { QuarantineControls } from "../components/QuarantineControls.js";
import { RecentErrors } from "../components/RecentErrors.js";
import { ScopeSelector } from "../components/ScopeSelector.js";
import { StatePanel } from "../components/StatePanel.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { TrendChart } from "../components/TrendChart.js";
import { formatCount, formatFlakeRate, unconfirmedLabel } from "../lib/format.js";
import { overviewSearch, parseDetailScope, withDetailScope } from "../state/detail-state.js";
import { useApiClient } from "./OverviewPage.js";

const SOURCE_TEXT = {
  auto: "Quarantined automatically",
  manual: "Quarantined by hand",
  both: "Quarantined automatically and by hand",
} as const;

export function DetailPage() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const params = useParams();
  const id = Number(params["id"]);
  const [search, setSearch] = useSearchParams();
  const scope = parseDetailScope(search);

  const detail = useQuery({
    queryKey: ["test", id],
    queryFn: () => api.test(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const history = useQuery({
    queryKey: ["history", id, scope.branch, scope.window],
    queryFn: () => api.history(id, { branch: scope.branch, window: scope.window }),
    enabled: detail.isSuccess,
    placeholderData: (previous) => previous,
  });

  const back = (
    <Link className="back" to={{ pathname: "/", search: overviewSearch(search) }}>
      Back to all tests
    </Link>
  );

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <main className="page">
        {back}
        {notFound ? (
          <div className="state">
            <h1 className="state__title">This test case doesn&apos;t exist</h1>
            <p>It may have been removed, or the link has a typo.</p>
          </div>
        ) : (
          <StatePanel
            kind="error"
            message={detail.error.message}
            onRetry={() => void queryClient.refetchQueries()}
          />
        )}
      </main>
    );
  }
  if (!detail.data) {
    return (
      <main className="page">
        {back}
        <StatePanel kind="loading" />
      </main>
    );
  }

  const test = detail.data;
  const selected = test.scopes.find((s) => s.window === scope.window && s.branch === scope.branch);
  const branches = [...new Set(test.scopes.map((s) => s.branch))].filter((b) => b !== ALL_BRANCHES);
  const hasData = selected !== undefined && selected.status !== null;

  return (
    <main className="page page--detail">
      {back}
      <header className="detail__header">
        <h1 className="detail__name">{test.name}</h1>
        <p className="detail__where">
          <span className="test-file">{test.file || "No file"}</span> in {test.repo}
        </p>
        <div className="detail__status">
          {hasData && selected.status ? (
            <StatusBadge status={selected.status} />
          ) : (
            <span className="badge badge--none">No data</span>
          )}
          {selected?.quarantineSource && (
            <span className="muted">{SOURCE_TEXT[selected.quarantineSource]}</span>
          )}
        </div>
      </header>

      <ScopeSelector
        branches={branches}
        scope={scope}
        onChange={(next) => setSearch(withDetailScope(search, next))}
      />

      {hasData ? (
        <dl className="cards cards--detail" aria-label="This scope">
          <div className="card">
            <dt className="card__label">Flake rate</dt>
            <dd className="card__value">
              {formatFlakeRate(selected.flakyCommits, selected.commitsRun)}
            </dd>
            <dd className="card__hint">
              {selected.flakyCommits} of {selected.commitsRun} commits flaky
            </dd>
          </div>
          <div className="card">
            <dt className="card__label">Failed attempts</dt>
            <dd className="card__value">{formatCount(selected.failedAttempts)}</dd>
            <dd className="card__hint">CI attempts this test failed</dd>
          </div>
          <div className="card">
            <dt className="card__label">Unconfirmed failures</dt>
            <dd className="card__value" data-testid="unconfirmed">
              {formatCount(selected.unconfirmedFailures)}
            </dd>
            <dd className="card__hint">
              {selected.unconfirmedFailures === 0
                ? "Every failure was re-run"
                : `${unconfirmedLabel(selected.unconfirmedFailures)} with no re-run to compare`}
            </dd>
          </div>
          <div className="card">
            <dt className="card__label">Last seen</dt>
            <dd className="card__value card__value--small">
              {selected.lastSeenAt ? selected.lastSeenAt.slice(0, 10) : "—"}
            </dd>
            <dd className="card__hint">
              {scope.branch === ALL_BRANCHES ? "On any branch" : `On ${scope.branch}`}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="state state--empty" data-testid="no-scope-data">
          <h2 className="state__title">No results in this scope</h2>
          <p>Try another window or branch.</p>
        </div>
      )}

      <QuarantineControls testId={test.id} manual={test.manualQuarantine} />

      {history.data ? (
        <>
          <TrendChart points={history.data.trend} />
          <CommitStrip commits={history.data.commits} />
        </>
      ) : history.isError ? (
        <StatePanel
          kind="error"
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : (
        <StatePanel kind="loading" />
      )}

      <RecentErrors errors={test.recentErrors} />
    </main>
  );
}
