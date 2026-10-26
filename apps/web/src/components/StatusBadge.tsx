// A status with its text label and its color; color is never the only signal (REQ-UI-06).
// Stub: implemented in the G8 implementer stage.
import type { Status } from "@flakewatch/shared";

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  broken: "",
  quarantined: "",
  flaky: "",
  stable: "",
};

export function StatusBadge(_props: { status: Status }) {
  void _props;
  return null;
}
