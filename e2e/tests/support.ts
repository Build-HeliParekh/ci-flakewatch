// Shared helpers for end-to-end specs.
import type { APIRequestContext } from "@playwright/test";

export const API = "http://localhost:4010/api/v1";

/** Lifts any manual quarantine on these test cases, so one spec never changes another's data. */
export async function releaseManual(
  request: APIRequestContext,
  names: readonly string[],
): Promise<void> {
  for (const name of names) {
    const res = await request.get(`${API}/tests?q=${encodeURIComponent(name)}&pageSize=100`);
    const body = (await res.json()) as { items: { id: number; name: string }[] };
    for (const item of body.items.filter((i) => i.name === name)) {
      await request.delete(`${API}/tests/${item.id}/quarantine`);
    }
  }
}
