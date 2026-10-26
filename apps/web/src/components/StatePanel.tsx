// Loading, empty, no-match, and error states (REQ-UI-08).
// Stub: implemented in the G8 implementer stage.

type Kind = "loading" | "empty" | "no-match" | "error";

interface Props {
  kind: Kind;
  onRetry?(): void;
  onClear?(): void;
  message?: string | undefined;
}

export function StatePanel(_props: Props) {
  void _props;
  return null;
}
