"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { clearCovers } from "@/lib/covers";
import styles from "./AppHeader.module.css";

type Props = { name: string; email: string; avatarUrl?: string };

export function AppHeader({ name, email, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <Link href="/library" className={styles.brand}>BookPal</Link>
          <nav className={styles.nav} aria-label="Primary">
            <Link href="/library" aria-current={pathname === "/library" ? "page" : undefined}>Library</Link>
          </nav>
        </div>
        <div className={styles.menuWrap} ref={wrapRef}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.trigger}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls="account-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Avatar name={name} url={avatarUrl} size={30} />
          </button>
          {open && (
            <div id="account-menu" role="menu" className={styles.menu}>
              <div className={styles.who}>
                <Avatar name={name} url={avatarUrl} size={40} />
                <div>
                  <div className={styles.name}>{name}</div>
                  <div className={styles.email}>{email}</div>
                </div>
              </div>
              <Link href="/profile" role="menuitem" className={styles.item}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>
                Profile
              </Link>
              <Link href="/upload" role="menuitem" className={styles.item}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
                Upload a book
              </Link>
              <Link href="/ai-settings" role="menuitem" className={styles.item}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
                AI settings
              </Link>
              <div className={styles.rule} />
              <form
                action="/auth/signout"
                method="post"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  await clearCovers();
                  form.submit();
                }}
              >
                <button type="submit" role="menuitem" className={styles.item}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5" /><path d="M15 8l4 4-4 4M19 12H9" /></svg>
                  Log out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
