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
export type SaveNotice = "failed" | "signed-out" | null;

type SaveResult = "saved" | "retry" | "signed-out" | "dropped";
const RETRY_DELAY_MS = 5000;

async function postPlace(fileId: string, body: object, keepalive: boolean): Promise<SaveResult> {
  try {
    const response = await fetch(`/api/files/${fileId}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive,
      body: JSON.stringify(body),
    });
    if (response.ok) return "saved";
    if (response.status === 401) return "signed-out";
    return response.status >= 500 ? "retry" : "dropped";
  } catch {
    return "retry";
  }
}

// Sends reading places and keeps the notice in step with the newest one. Each
// place carries the moment it was read, so a retry or a late request can never
// replace a newer place on the server. A network or server failure is retried
// once; a book that is gone or a bad request is dropped quietly.
export function usePlacePoster(fileId: string) {
  const [notice, setNotice] = useState<SaveNotice>(null);
  const newest = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(retry.current), []);

  const post = useCallback((progress: number, locator: unknown, keepalive = false) => {
    const body = { deviceId: deviceId(), progress: Math.min(1, Math.max(0, progress)), locator, clientUpdatedAt: Date.now() };
    const send = (isRetry: boolean) => {
      const request = ++newest.current;
      clearTimeout(retry.current);
      void postPlace(fileId, body, keepalive).then((result) => {
        if (request !== newest.current) return;
        if (result === "retry" && !isRetry) {
          retry.current = setTimeout(() => send(true), RETRY_DELAY_MS);
          return;
        }
        setNotice(result === "retry" ? "failed" : result === "signed-out" ? "signed-out" : null);
      });
    };
    send(false);
  }, [fileId]);

  return { post, notice };
}

// Saves the reading place two seconds after the reader stops moving, and when
// the tab is hidden. The locator uses the Mac app's field names.
export function usePlaceSaver(fileId: string, fingerprint: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Place | null>(null);
  const { post, notice } = usePlacePoster(fileId);

  const flush = useCallback((keepalive = false) => {
    clearTimeout(timer.current);
    const place = pending.current;
    if (!place) return;
    pending.current = null;
    post(place.progress, webLocator(fingerprint, place.resourceID, place.position, place.progression), keepalive);
  }, [fingerprint, post]);

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

  return { schedule, saveNotice: notice };
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
