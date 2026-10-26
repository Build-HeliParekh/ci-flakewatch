// The dashboard's view of the API (PLAN §3.5). Components use the ApiClient from context, so
// tests can inject a fake one.
import { createContext } from "react";
import type {
  ErrorCode,
  HistoryQuery,
  HistoryResponse,
  QuarantineRequest,
  QuarantineResponse,
  ReposResponse,
  SummaryQuery,
  SummaryResponse,
  TestDetailResponse,
  TestsQuery,
  TestsResponse,
} from "@flakewatch/shared";

export interface ApiClient {
  repos(): Promise<ReposResponse>;
  tests(query: TestsQuery): Promise<TestsResponse>;
  summary(query: SummaryQuery): Promise<SummaryResponse>;
  test(id: number): Promise<TestDetailResponse>;
  history(id: number, query: HistoryQuery): Promise<HistoryResponse>;
  quarantine(id: number, body: QuarantineRequest): Promise<QuarantineResponse>;
  release(id: number): Promise<void>;
}

/** A failed API call. `status` is `null` when the API couldn't be reached at all. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: ErrorCode | null,
    message: string,
  ) {
    super(message);
  }
}

type QueryValue = string | number | readonly string[] | undefined;

/** `?a=1&b=x,y`, leaving out undefined values and empty lists. */
export function toQueryString(_params: Record<string, QueryValue>): string {
  void _params;
  throw new Error("not implemented (G8b)");
}

/** An ApiClient over HTTP. `baseUrl` is VITE_API_URL; empty means the same origin. */
export function createHttpClient(_baseUrl: string, _fetchImpl: typeof fetch = fetch): ApiClient {
  void _baseUrl;
  void _fetchImpl;
  throw new Error("not implemented (G8b)");
}

export const ApiClientContext = createContext<ApiClient | null>(null);
