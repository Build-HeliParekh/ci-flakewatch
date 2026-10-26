// The overview: summary cards, filter chips, search, and the ranked table (REQ-UI-01 to UI-05,
// REQ-UI-08). All state lives in the URL (REQ-UI-03). Stub: implemented in the G8 implementer
// stage.
import { useContext } from "react";
import { ApiClientContext, type ApiClient } from "../api/client.js";

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("ApiClientContext is missing");
  return client;
}

export function OverviewPage() {
  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Flaky tests</h1>
      </header>
    </main>
  );
}
