// flakewatch dashboard entry point.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createHttpClient } from "./api/client.js";
import { AppProviders, AppRoutes, createQueryClient } from "./App.js";
import "./styles.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AppProviders
        client={createHttpClient(import.meta.env.VITE_API_URL ?? "")}
        queryClient={createQueryClient()}
      >
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </StrictMode>,
  );
}
