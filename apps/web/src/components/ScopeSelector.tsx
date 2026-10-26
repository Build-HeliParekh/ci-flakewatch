// Window and branch for the detail page (REQ-UI-07).
import { ALL_BRANCHES, WINDOWS, type Window } from "@flakewatch/shared";
import type { DetailScope } from "../state/detail-state.js";

const WINDOW_LABELS: Readonly<Record<Window, string>> = { "7d": "7 days", "30d": "30 days" };

export function ScopeSelector({
  branches,
  scope,
  onChange,
}: {
  branches: readonly string[];
  scope: DetailScope;
  onChange(scope: DetailScope): void;
}) {
  const options = [ALL_BRANCHES, ...branches.filter((b) => b !== ALL_BRANCHES)];
  return (
    <div className="filters filters--compact">
      <div className="chip-group" role="group" aria-label="Window">
        <span className="chip-group__label" aria-hidden="true">
          Window
        </span>
        <div className="chip-group__chips">
          {WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              className="chip"
              aria-pressed={scope.window === window}
              onClick={() => onChange({ ...scope, window })}
            >
              {WINDOW_LABELS[window]}
            </button>
          ))}
        </div>
      </div>
      <div className="chip-group" role="group" aria-label="Branch">
        <span className="chip-group__label" aria-hidden="true">
          Branch
        </span>
        <div className="chip-group__chips">
          {options.map((branch) => (
            <button
              key={branch}
              type="button"
              className="chip"
              aria-pressed={scope.branch === branch}
              onClick={() => onChange({ ...scope, branch })}
            >
              {branch === ALL_BRANCHES ? "All branches" : branch}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
