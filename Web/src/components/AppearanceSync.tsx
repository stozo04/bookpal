"use client";
import { useEffect } from "react";

// The profile is the source of truth. If this browser's cookie is stale (the choice
// was changed on another device), bring this page and the cookie in step.
export function AppearanceSync({ value }: { value: "system" | "light" | "dark" }) {
  useEffect(() => {
    const current = document.cookie.match(/(?:^|; )bookpal-appearance=([^;]*)/)?.[1] ?? "system";
    if (current === value) return;
    document.cookie = `bookpal-appearance=${value}; path=/; max-age=31536000; samesite=lax`;
    if (value === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = value;
  }, [value]);
  return null;
}
