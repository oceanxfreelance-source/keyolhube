"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** Dark (default, professional) or light. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch {}
  };
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} title={theme === "dark" ? "Switch to light interface" : "Switch to dark interface"} aria-label={`Interface: ${theme}. Switch theme`}>
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
