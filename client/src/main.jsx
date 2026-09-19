import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { iniciarMonitorVersaoApp } from "./utils/appUpdate.js";
import "./index.css";
import "./styles/client-shared.css";
import "./styles/desktop.css";
import "./styles/client-desktop.css";

iniciarMonitorVersaoApp();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
