import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VaultApp } from "./app.js";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("missing application root");

createRoot(container).render(
  <StrictMode>
    <VaultApp />
  </StrictMode>,
);
