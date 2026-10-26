import { describe, expect, it } from "vitest";
import { ApiClientError, createHttpClient, toQueryString } from "../src/api/client.js";

function fakeFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("HTTP API client", () => {
  it("calls /api/v1 on the same origin when the base URL is empty", async () => {
    const { impl, calls } = fakeFetch(() => json(200, { items: [] }));
    await createHttpClient("", impl).repos();
    expect(calls[0]?.url).toBe("/api/v1/repos");
  });

  it("joins a base URL with or without a trailing slash", async () => {
    const { impl, calls } = fakeFetch(() => json(200, { items: [] }));
    await createHttpClient("http://localhost:4100/", impl).repos();
    expect(calls[0]?.url).toBe("http://localhost:4100/api/v1/repos");
  });

  it("sends the ranked-list query with statuses comma-separated and leaves out unset values", async () => {
    const { impl, calls } = fakeFetch(() =>
      json(200, { items: [], page: 1, pageSize: 25, total: 0, asOf: "" }),
    );
    await createHttpClient("", impl).tests({
      repo: "demo/shoplite",
      branch: "*",
      window: "30d",
      status: ["quarantined", "flaky"],
      sort: "flakeRate",
      order: "desc",
      page: 2,
      pageSize: 25,
    });
    const url = new URL(calls[0]?.url ?? "", "http://x");
    expect(url.pathname).toBe("/api/v1/tests");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      repo: "demo/shoplite",
      branch: "*",
      window: "30d",
      status: "quarantined,flaky",
      sort: "flakeRate",
      order: "desc",
      page: "2",
      pageSize: "25",
    });
    expect(toQueryString({ a: undefined, b: [] })).toBe("");
  });

  it("REQ-UI-08: turns an API error response into an ApiClientError with its status and code", async () => {
    const { impl } = fakeFetch(() =>
      json(400, { error: { code: "VALIDATION_ERROR", message: "window must be 7d or 30d" } }),
    );
    const error = await createHttpClient("", impl)
      .summary({ window: "30d" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "window must be 7d or 30d",
    });
  });

  it("REQ-UI-08: a 5xx without an error body is still an ApiClientError with its status", async () => {
    const { impl } = fakeFetch(() => new Response("Bad gateway", { status: 502 }));
    const error = await createHttpClient("", impl)
      .repos()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: null });
  });

  it("REQ-UI-08: when the API can't be reached, the error has status null", async () => {
    const { impl } = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    const error = await createHttpClient("", impl)
      .repos()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).status).toBeNull();
  });

  it("posts a quarantine reason as JSON and treats 204 as success", async () => {
    const { impl, calls } = fakeFetch((_url, init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : json(201, { manualQuarantine: { reason: "x", at: "" } }),
    );
    const client = createHttpClient("", impl);
    await client.quarantine(17, { reason: "Times out on CI" });
    await expect(client.release(17)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      url: "/api/v1/tests/17/quarantine",
      init: { method: "POST", body: '{"reason":"Times out on CI"}' },
    });
    expect(calls[1]?.init?.method).toBe("DELETE");
  });
});
