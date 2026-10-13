"use client";
import { useEffect, useState } from "react";
import { SIZE_MAX, SIZE_MIN, THEMES, type Face, type ThemeName } from "./themes";

const KEY = "bookpal:reader-prefs";
// Text size and PDF zoom are different things; each is remembered separately.
const SIZE_KEY = { text: "bookpal:reader-size", zoom: "bookpal:reader-zoom" } as const;

export type ReaderPrefs = {
  theme: ThemeName; size: number; face: Face;
  setTheme: (t: ThemeName) => void; setSize: (s: number) => void; setFace: (f: Face) => void;
};

// Theme, size and typeface, remembered in this browser (a per-viewer convenience).
export function useReaderPrefs(sizeKind: keyof typeof SIZE_KEY = "text"): ReaderPrefs {
  const [theme, setTheme] = useState<ThemeName>("cream");
  const [size, setSize] = useState(100);
  const [face, setFace] = useState<Face>("serif");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved?.theme in THEMES) setTheme(saved.theme);
      else {
        // No choice made yet: follow the app's light or dark appearance.
        const forced = document.documentElement.dataset.theme;
        const dark = forced ? forced === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
        setTheme(dark ? "dark" : "cream");
      }
      const size = Number(localStorage.getItem(SIZE_KEY[sizeKind]));
      if (size) setSize(Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)));
      if (saved?.face === "serif" || saved?.face === "sans") setFace(saved.face);
    } catch {}
  }, [sizeKind]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme, face }));
      localStorage.setItem(SIZE_KEY[sizeKind], String(size));
    } catch {}
  }, [theme, size, face, sizeKind]);

  return { theme, size, face, setTheme, setSize, setFace };
}
