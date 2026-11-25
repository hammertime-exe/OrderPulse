import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { WorkspaceErrorBoundary } from "./ui.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceErrorBoundary>
      <App />
    </WorkspaceErrorBoundary>
  </StrictMode>,
);
