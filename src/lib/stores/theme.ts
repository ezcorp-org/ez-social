import { writable } from "svelte/store";
import { browser } from "$app/environment";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "ez-theme";

function getStored(): ThemePreference {
  if (!browser) return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function resolveEffective(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  if (!browser) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(effective: "light" | "dark") {
  if (!browser) return;
  document.documentElement.classList.toggle("dark", effective === "dark");
}

const stored = getStored();
export const theme = writable<ThemePreference>(stored);

// Apply on store change + persist
if (browser) {
  applyClass(resolveEffective(stored));

  theme.subscribe((pref) => {
    localStorage.setItem(STORAGE_KEY, pref);
    applyClass(resolveEffective(pref));
  });

  // Listen for OS changes when in "system" mode
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    let current: ThemePreference = "system";
    theme.subscribe((v) => (current = v))();
    if (current === "system") {
      applyClass(resolveEffective("system"));
    }
  });
}
