"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    window.localStorage.setItem("rulequant-theme", nextTheme);
  }

  return (
    <button
      type="button"
      className="rq-theme-toggle"
      onClick={toggleTheme}
      aria-label="切换浅色或深色模式"
      title="切换浅色或深色模式"
    >
      <span className="rq-theme-toggle__track" aria-hidden="true">
        <span className="rq-theme-toggle__thumb"><Sun className="rq-theme-icon rq-theme-icon--sun" /><Moon className="rq-theme-icon rq-theme-icon--moon" /></span>
      </span>
      <span className="rq-theme-toggle__label rq-theme-label--light">浅色</span>
      <span className="rq-theme-toggle__label rq-theme-label--dark">深色</span>
    </button>
  );
}
