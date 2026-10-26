// Renders the real dashboard routes at a URL, with a fake API client (PLAN §3.5).
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppProviders, AppRoutes, createQueryClient } from "../../src/App.js";
import { createFakeClient, type FakeClient } from "./fake-client.js";

/** Shows the current path and query, so tests can check what the URL became. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location" hidden>{`${location.pathname}${location.search}`}</div>;
}

export function renderApp(url = "/", client: FakeClient = createFakeClient()) {
  const view = render(
    <AppProviders client={client} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AppProviders>,
  );
  const location = () => view.getByTestId("location").textContent ?? "";
  return { ...view, client, location };
}
