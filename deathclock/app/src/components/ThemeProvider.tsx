"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

type Resolved = "light" | "dark";

type ThemeContextValue = {
  /** What the user chose, which may be "system". */
  mode: ThemeMode;
  /** What is actually rendered right now. */
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
  /** Flips between light and dark, resolving "system" first. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "deathclock-theme";

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Theme state for the whole app.
 *
 * The initial class is applied by an inline script in the document head (see
 * `ThemeScript`) rather than here, because React hydrates after first paint and
 * a late-applied class produces a visible flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  // Adopt the stored preference after mount, and keep following the OS while
  // the user is on "system".
  useEffect(() => {
    const stored = readStoredMode();
    setModeState(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (nextMode: ThemeMode) => {
      const next: Resolved = nextMode === "system" ? (media.matches ? "dark" : "light") : nextMode;
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
    };

    apply(stored);
    const onChange = () => {
      if (readStoredMode() === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const nextResolved: Resolved = next === "system" ? (media.matches ? "dark" : "light") : next;
    setResolved(nextResolved);
    document.documentElement.classList.toggle("dark", nextResolved === "dark");
    document.documentElement.style.colorScheme = nextResolved;
  }, []);

  const toggle = useCallback(() => {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setMode(current === "dark" ? "light" : "dark");
  }, [setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return context;
}

/**
 * Blocking script that applies the stored theme before first paint.
 *
 * Rendered in <head>. It must be inline and synchronous: deferring it to a
 * bundle would let the page paint in the wrong theme first.
 */
export const themeScript = `(function(){try{var k="deathclock-theme";var m=localStorage.getItem(k)||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
