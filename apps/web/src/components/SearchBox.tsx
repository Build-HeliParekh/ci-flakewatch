// Search by test name or file, applied 300 ms after typing stops (REQ-UI-05).
// Stub: implemented in the G8 implementer stage.

interface Props {
  value: string;
  onSearch(q: string | undefined): void;
  debounceMs?: number;
}

export function SearchBox(_props: Props) {
  void _props;
  return null;
}
