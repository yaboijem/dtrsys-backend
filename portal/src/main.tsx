import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { STORAGE_KEYS } from "./config";
import { registerPortalSW } from "./pwa/register";
import "@fontsource-variable/inter";
import "./index.css";

// Apply stored theme before first paint to avoid flash
(() => {
  try {
    const pref = localStorage.getItem(STORAGE_KEYS.theme);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = pref === "dark" || (pref !== "light" && systemDark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    // ignore
  }
})();

registerPortalSW();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
