// Repo, branch, window, and status chips (REQ-UI-02). Every change resets the table to page 1.
import {
  ALL_BRANCHES,
  STATUSES,
  WINDOWS,
  type RepoItem,
  type Status,
  type Window,
} from "@flakewatch/shared";
import type { OverviewState } from "../state/url-state.js";
import { STATUS_LABELS } from "./StatusBadge.js";

const WINDOW_LABELS: Readonly<Record<Window, string>> = { "7d": "7 days", "30d": "30 days" };

interface Props {
  repos: readonly RepoItem[];
  /** The repo in use: the selected one, or the first. */
  repo: string;
  state: OverviewState;
  onChange(next: OverviewState): void;
}

export function FilterChips({ repos, repo, state, onChange }: Props) {
  const change = (patch: Partial<OverviewState>) => onChange({ ...state, ...patch, page: 1 });
  const branches = repos.find((item) => item.name === repo)?.branches ?? [];

  const toggleStatus = (status: Status) => {
    const selected = state.status.includes(status)
      ? state.status.filter((value) => value !== status)
      : [...state.status, status];
    change({ status: STATUSES.filter((value) => selected.includes(value)) });
  };

  return (
    <div className="filters">
      <ChipGroup label="Repo">
        {repos.map((item) => (
          <Chip
            key={item.name}
            pressed={item.name === repo}
            onClick={() => change({ repo: item.name, branch: ALL_BRANCHES })}
          >
            {item.name}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label="Branch">
        <Chip
          pressed={state.branch === ALL_BRANCHES}
          onClick={() => change({ branch: ALL_BRANCHES })}
        >
          All branches
        </Chip>
        {branches.map((branch) => (
          <Chip key={branch} pressed={state.branch === branch} onClick={() => change({ branch })}>
            {branch}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label="Window">
        {WINDOWS.map((window) => (
          <Chip key={window} pressed={state.window === window} onClick={() => change({ window })}>
            {WINDOW_LABELS[window]}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label="Status">
        {STATUSES.map((status) => (
          <Chip
            key={status}
            pressed={state.status.includes(status)}
            onClick={() => toggleStatus(status)}
            className={`chip--${status}`}
          >
            {STATUS_LABELS[status]}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      <span className="chip-group__label" aria-hidden="true">
        {label}
      </span>
      <div className="chip-group__chips">{children}</div>
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  className = "",
  children,
}: {
  pressed: boolean;
  onClick(): void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
