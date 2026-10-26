// A status with its text label and its color; color is never the only signal (REQ-UI-06).
import type { Status } from "@flakewatch/shared";

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  broken: "Broken",
  quarantined: "Quarantined",
  flaky: "Flaky",
  stable: "Stable",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge--${status}`} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
