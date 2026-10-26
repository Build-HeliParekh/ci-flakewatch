// Search by test name or file, applied 300 ms after typing stops (REQ-UI-05).
import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onSearch(q: string | undefined): void;
  debounceMs?: number;
}

export function SearchBox({ value, onSearch, debounceMs = 300 }: Props) {
  const [text, setText] = useState(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const lastSent = useRef(value);

  // Follow outside changes (for example "Clear filters").
  useEffect(() => {
    setText(value);
    lastSent.current = value;
  }, [value]);

  useEffect(() => {
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      const trimmed = text.trim();
      onSearchRef.current(trimmed === "" ? undefined : trimmed);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [text, debounceMs]);

  return (
    <label className="search">
      <span className="search__label">Search</span>
      <input
        type="search"
        className="search__input"
        placeholder="Test name or file"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </label>
  );
}
