// The ranked list of tests, worst first (REQ-UI-04), with paging (decision PQ-17).
// Stub: implemented in the G8 implementer stage.
import type { SortField, TestsResponse } from "@flakewatch/shared";
import type { OverviewState } from "../state/url-state.js";

interface Props {
  data: TestsResponse;
  state: OverviewState;
  onSort(field: SortField): void;
  onPage(page: number): void;
  onOpen(id: number): void;
}

export function RankedTable(_props: Props) {
  void _props;
  return null;
}
