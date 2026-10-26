// The dashboard's view of the API (PLAN §3.5). Components use the ApiClient from context, so
// tests can inject a fake one.
import { createContext } from "react";
import type {
  ApiErrorBody,
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
  /** `token` is the write token, when the API needs one (REQ-ING-10, decision PQ-03). */
  quarantine(id: number, body: QuarantineRequest, token?: string): Promise<QuarantineResponse>;
  release(id: number, token?: string): Promise<void>;
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
export function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

/** An ApiClient over HTTP. `baseUrl` is VITE_API_URL; empty means the same origin. */
export function createHttpClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  const root = `${baseUrl.replace(/\/+$/, "")}/api/v1`;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        ...init,
        headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      });
    } catch {
      throw new ApiClientError(null, null, "The flakewatch API can't be reached.");
    }
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = (body as Partial<ApiErrorBody> | null)?.error;
      throw new ApiClientError(
        response.status,
        error?.code ?? null,
        error?.message ?? `The API answered ${response.status}.`,
      );
    }
    return body as T;
  }

  const json = (method: string, body?: unknown, token?: string): RequestInit => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  };

  return {
    repos: () => call("/repos"),
    tests: (query) =>
      call(
        `/tests${toQueryString({
          repo: query.repo,
          branch: query.branch,
          window: query.window,
          status: query.status,
          q: query.q,
          sort: query.sort,
          order: query.order,
          page: query.page,
          pageSize: query.pageSize,
        })}`,
      ),
    summary: (query) =>
      call(
        `/summary${toQueryString({ repo: query.repo, branch: query.branch, window: query.window })}`,
      ),
    test: (id) => call(`/tests/${id}`),
    history: (id, query) =>
      call(`/tests/${id}/history${toQueryString({ branch: query.branch, window: query.window })}`),
    quarantine: (id, body, token) => call(`/tests/${id}/quarantine`, json("POST", body, token)),
    release: (id, token) => call(`/tests/${id}/quarantine`, json("DELETE", undefined, token)),
  };
}

export const ApiClientContext = createContext<ApiClient | null>(null);
