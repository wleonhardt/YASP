import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/globals.css";
import "./styles/theme.css";

// --- YASP bootstrap diagnostics (remove when no longer needed) ---
window.addEventListener("error", (e) => {
  console.error("[YASP] Uncaught error:", e.message, e.filename, e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[YASP] Unhandled rejection:", e.reason);
});
console.log("[YASP] Bootstrap: module loaded, mounting React app");
// --- end diagnostics ---

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
  console.log("[YASP] Bootstrap: React tree mounted"); // diagnostic
} else {
  console.error("[YASP] Bootstrap: #root element not found");
}
