// Routes and providers (PLAN §3.5): "/" overview, "/tests/:id" detail.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { ApiClientContext, type ApiClient } from "./api/client.js";
import { DetailPage } from "./pages/DetailPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/tests/:id" element={<DetailPage />} />
    </Routes>
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } },
  });
}

export function AppProviders({
  client,
  queryClient,
  children,
}: {
  client: ApiClient;
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
    </QueryClientProvider>
  );
}
