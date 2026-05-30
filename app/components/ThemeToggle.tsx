"use client";

import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";

function resolve(pref: Pref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function apply(pref: Pref) {
  document.documentElement.dataset.theme = resolve(pref);
}

const OPTIONS: { value: Pref; label: string; icon: string }[] = [
  { value: "system", label: "System", icon: "◐" },
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
];

export default function ThemeToggle() {
  const [pref, setPref] = useState<Pref | null>(null);

  // Read stored preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Pref) || "system";
    setPref(stored);
  }, []);

  // Keep following the OS when in system mode.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function choose(p: Pref) {
    setPref(p);
    localStorage.setItem("theme", p);
    apply(p);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={pref === o.value ? "active" : ""}
          onClick={() => choose(o.value)}
          title={o.label}
          aria-pressed={pref === o.value}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
