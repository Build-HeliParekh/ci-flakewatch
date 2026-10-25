// flakewatch dashboard entry point. Pages and routing are added from T-26 (PLAN §3.5).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <h1>flakewatch</h1>
    </StrictMode>,
  );
}
