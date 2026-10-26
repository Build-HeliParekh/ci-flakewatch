// The overview: summary cards, filter chips, search, and the ranked table (REQ-UI-01 to UI-05,
// REQ-UI-08). All state lives in the URL (REQ-UI-03).
import { PAGE_SIZE_DEFAULT, type SortField } from "@flakewatch/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientContext, ApiClientError, type ApiClient } from "../api/client.js";
import { FilterChips } from "../components/FilterChips.js";
import { OverviewCards } from "../components/OverviewCards.js";
import { RankedTable } from "../components/RankedTable.js";
import { SearchBox } from "../components/SearchBox.js";
import { StatePanel } from "../components/StatePanel.js";
import {
  DEFAULT_STATE,
  defaultOrder,
  parseOverviewState,
  serializeOverviewState,
  type OverviewState,
} from "../state/url-state.js";

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("ApiClientContext is missing");
  return client;
}

export function OverviewPage() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const state = parseOverviewState(search);
  const setState = (next: OverviewState) => setSearch(serializeOverviewState(next));

  const repos = useQuery({ queryKey: ["repos"], queryFn: () => api.repos() });
  const repo = state.repo ?? repos.data?.items[0]?.name;
  const scope = { repo, branch: state.branch, window: state.window };

  const summary = useQuery({
    queryKey: ["summary", scope],
    queryFn: () =>
      api.summary({ ...(repo ? { repo } : {}), branch: state.branch, window: state.window }),
    enabled: repo !== undefined,
  });
  const tests = useQuery({
    queryKey: ["tests", repo, state],
    queryFn: () =>
      api.tests({
        ...(repo ? { repo } : {}),
        branch: state.branch,
        window: state.window,
        ...(state.status.length > 0 ? { status: state.status } : {}),
        ...(state.q ? { q: state.q } : {}),
        sort: state.sort,
        order: state.order,
        page: state.page,
        pageSize: PAGE_SIZE_DEFAULT,
      }),
    enabled: repo !== undefined,
    placeholderData: (previous) => previous,
  });

  const failed = [repos, summary, tests].find((query) => query.isError);
  const retry = () => void queryClient.refetchQueries();
  const filtersActive =
    state.status.length > 0 || state.q !== undefined || state.branch !== DEFAULT_STATE.branch;

  const onSort = (field: SortField) => {
    const order =
      state.sort === field ? (state.order === "asc" ? "desc" : "asc") : defaultOrder(field);
    setState({ ...state, sort: field, order, page: 1 });
  };
  const onOpen = (id: number) => navigate({ pathname: `/tests/${id}`, search: search.toString() });

  let body: React.ReactNode;
  if (failed) {
    body = (
      <StatePanel
        kind="error"
        onRetry={retry}
        message={failed.error instanceof ApiClientError ? failed.error.message : undefined}
      />
    );
  } else if (repos.isPending) {
    body = <StatePanel kind="loading" />;
  } else if (repos.data && repos.data.items.length === 0) {
    body = <StatePanel kind="empty" />;
  } else {
    body = (
      <>
        <FilterChips
          repos={repos.data?.items ?? []}
          repo={repo ?? ""}
          state={state}
          onChange={setState}
        />
        <div className="toolbar">
          <SearchBox value={state.q ?? ""} onSearch={(q) => setState(withSearch(state, q))} />
        </div>
        {summary.data ? (
          <OverviewCards summary={summary.data} />
        ) : (
          <div className="cards cards--placeholder" />
        )}
        {tests.data ? (
          tests.data.total === 0 ? (
            <StatePanel
              kind={filtersActive ? "no-match" : "empty"}
              onClear={() =>
                setState({ ...DEFAULT_STATE, ...(state.repo ? { repo: state.repo } : {}) })
              }
            />
          ) : (
            <RankedTable
              data={tests.data}
              state={state}
              onSort={onSort}
              onPage={(page) => setState({ ...state, page })}
              onOpen={onOpen}
            />
          )
        ) : (
          <StatePanel kind="loading" />
        )}
      </>
    );
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Flaky tests</h1>
        <p className="page__lede">
          Tests that failed and passed on the same commit, worst first. Fix the top few and most
          re-runs go away.
        </p>
      </header>
      {body}
    </main>
  );
}

/** The state with a new search term (or none), back on page 1. */
function withSearch(state: OverviewState, q: string | undefined): OverviewState {
  const { q: _previous, ...rest } = state;
  void _previous;
  return { ...rest, ...(q ? { q } : {}), page: 1 };
}
