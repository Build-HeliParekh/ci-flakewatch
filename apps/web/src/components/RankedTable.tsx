// The ranked list of tests, worst first (REQ-UI-04), with paging (decision PQ-17).
import type { SortField, TestListItem, TestsResponse } from "@flakewatch/shared";
import { formatFlakeRate, unconfirmedLabel } from "../lib/format.js";
import type { OverviewState } from "../state/url-state.js";
import { StatusBadge } from "./StatusBadge.js";

interface Props {
  data: TestsResponse;
  state: OverviewState;
  onSort(field: SortField): void;
  onPage(page: number): void;
  onOpen(id: number): void;
}

export function RankedTable({ data, state, onSort, onPage, onOpen }: Props) {
  const offset = (data.page - 1) * data.pageSize;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const first = data.total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + data.items.length, data.total);

  return (
    <section className="ranked" aria-label="Tests ranked by flake rate">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="col-rank">
                Rank
              </th>
              <th scope="col">Test</th>
              <th scope="col">Status</th>
              <SortHeader field="flakeRate" label="Flake rate" state={state} onSort={onSort} />
              <th scope="col" className="num">
                Flaky / commits
              </th>
              <SortHeader
                field="failedAttempts"
                label="Failed attempts"
                state={state}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <Row key={item.id} item={item} rank={offset + index + 1} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pager" aria-label="Pages">
        <span className="pager__range">
          {first}–{last} of {data.total}
        </span>
        <button
          type="button"
          className="button button--quiet"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          Previous
        </button>
        <span className="pager__page">
          Page {data.page} of {pages}
        </span>
        <button
          type="button"
          className="button button--quiet"
          disabled={data.page >= pages}
          onClick={() => onPage(data.page + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}

function Row({
  item,
  rank,
  onOpen,
}: {
  item: TestListItem;
  rank: number;
  onOpen(id: number): void;
}) {
  const percent = item.commitsRun > 0 ? (item.flakyCommits / item.commitsRun) * 100 : 0;
  return (
    <tr className="row" data-testid="test-row" onClick={() => onOpen(item.id)}>
      <td className="col-rank num">{rank}</td>
      <td className="col-test">
        <button
          type="button"
          className="test-link"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item.id);
          }}
        >
          {item.name}
        </button>
        <span className="test-file">{item.file}</span>
      </td>
      <td className="col-status">
        <StatusBadge status={item.status} />
        {item.unconfirmedFailures > 0 && (
          <span className="marker" title="Failed with no passing result on the same commit">
            <span aria-hidden="true">⚠ </span>
            {unconfirmedLabel(item.unconfirmedFailures)}
          </span>
        )}
      </td>
      <td className="col-rate num">
        <span className="rate">
          <span className="rate__bar" aria-hidden="true">
            <span
              className={`rate__fill rate__fill--${item.status}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </span>
          <span className="rate__text">{formatFlakeRate(item.flakyCommits, item.commitsRun)}</span>
        </span>
      </td>
      <td className="num">
        {item.flakyCommits} / {item.commitsRun}
      </td>
      <td className="num">{item.failedAttempts}</td>
    </tr>
  );
}

function SortHeader({
  field,
  label,
  state,
  onSort,
}: {
  field: SortField;
  label: string;
  state: OverviewState;
  onSort(field: SortField): void;
}) {
  const active = state.sort === field;
  const ariaSort = active ? (state.order === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" className="num" aria-sort={ariaSort}>
      <button type="button" className="sort" onClick={() => onSort(field)}>
        {label}
        <span className="sort__icon" aria-hidden="true">
          {active ? (state.order === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
