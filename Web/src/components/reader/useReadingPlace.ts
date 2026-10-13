"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { webLocator } from "@/lib/locator";

function deviceId(): string {
  try {
    const saved = localStorage.getItem("bookpal:device-id");
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem("bookpal:device-id", fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export type Place = { progress: number; resourceID: string; position: number; progression: number };

// Saves the reading place two seconds after the reader stops moving, and when
// the tab is hidden. The locator uses the Mac app's field names.
export function usePlaceSaver(fileId: string, fingerprint: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Place | null>(null);

  const flush = useCallback((keepalive = false) => {
    clearTimeout(timer.current);
    const place = pending.current;
    if (!place) return;
    pending.current = null;
    void fetch(`/api/files/${fileId}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive,
      body: JSON.stringify({
        deviceId: deviceId(),
        progress: Math.min(1, Math.max(0, place.progress)),
        locator: webLocator(fingerprint, place.resourceID, place.position, place.progression),
      }),
    }).catch(() => {});
  }, [fileId, fingerprint]);

  const schedule = useCallback((place: Place) => {
    pending.current = place;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 2000);
  }, [flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  return { schedule };
}

// The top bar hides while reading down and returns on scroll up, near the top,
// or on a tap in the page.
export function useAutoHideBar() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const quietUntil = useRef(0);
  const onScrollY = useCallback((y: number) => {
    // Late layout shifts right after opening are not the reader scrolling away.
    if (performance.now() < quietUntil.current) { lastY.current = y; return; }
    if (y < 80) setHidden(false);
    else if (y > lastY.current + 4) setHidden(true);
    else if (y < lastY.current - 4) setHidden(false);
    lastY.current = y;
  }, []);
  const settle = useCallback(() => {
    quietUntil.current = performance.now() + 1500;
    lastY.current = window.scrollY;
    setHidden(false);
  }, []);
  return { hidden, setHidden, onScrollY, settle };
}

// A short-lived link to the user's own file (ranged reads need it to outlast the first request).
export async function openFileUrl(fileId: string): Promise<string> {
  const link = await fetch(`/api/files/${fileId}/download`);
  if (!link.ok) throw new Error("download link");
  return (await link.json()).url as string;
}

export async function openFileBytes(fileId: string): Promise<ArrayBuffer> {
  const url = await openFileUrl(fileId);
  const response = await fetch(url);
  if (!response.ok) throw new Error("download");
  return response.arrayBuffer();
}
