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
  return notImplemented("jsonLogger", write);
}

function notImplemented(name: string, ...args: unknown[]): never {
  throw new Error(`${name} is not implemented yet (T-07b); called with ${args.length} argument(s)`);
}
