import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "./context";
import App from "./App";
import {
  AdminConsole,
  EnvironmentBar,
  EnvironmentProvider,
} from "./environment";
import "./styles.css";

// Apply saved theme before first render to avoid flash of wrong colors.
const savedTheme = localStorage.getItem("nook-theme");
if (savedTheme === "dark" || savedTheme === "light")
  document.documentElement.setAttribute("data-theme", savedTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EnvironmentProvider>
      {window.location.pathname === "/admin" ? (
        <AdminConsole />
      ) : (
        <Provider>
          <EnvironmentBar />
          <App />
        </Provider>
      )}
    </EnvironmentProvider>
  </StrictMode>,
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
