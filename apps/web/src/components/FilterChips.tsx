// Repo, branch, window, and status chips (REQ-UI-02). Every change resets the table to page 1.
// Stub: implemented in the G8 implementer stage.
import type { RepoItem } from "@flakewatch/shared";
import type { OverviewState } from "../state/url-state.js";

interface Props {
  repos: readonly RepoItem[];
  /** The repo in use: the selected one, or the first. */
  repo: string;
  state: OverviewState;
  onChange(next: OverviewState): void;
}

export function FilterChips(_props: Props) {
  void _props;
  return null;
}
