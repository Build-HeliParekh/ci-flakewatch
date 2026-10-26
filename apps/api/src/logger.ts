// Structured logging (REQ-NFR-03). One JSON line per request; never headers, bodies, query
// strings, or tokens.

export interface RequestLogLine {
  method: string;
  /** The request path without the query string. */
  path: string;
  status: number;
  durationMs: number;
}

export interface Logger {
  request(line: RequestLogLine): void;
  error(message: string): void;
}

/** A logger that writes each entry as one JSON line (default: to stdout). */
export function jsonLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  return {
    request(line) {
      write(
        JSON.stringify({
          level: "info",
          method: line.method,
          path: line.path,
          status: line.status,
          durationMs: line.durationMs,
        }),
      );
    },
    error(message) {
      write(JSON.stringify({ level: "error", message }));
    },
  };
}
