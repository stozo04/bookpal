"use client";
import { useEffect, useState } from "react";
import styles from "./AppFooter.module.css";

const KEY = "bookpal:footer-collapsed";

export function AppFooter() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  };

  return (
    <footer className={`${styles.footer} ${collapsed ? styles.collapsed : ""}`}>
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="footer-content"
        aria-label={collapsed ? "Show footer" : "Hide footer"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      <div id="footer-content" className={styles.content} hidden={collapsed}>
        <span className={`voice ${styles.brand}`}>BookPal — a private library</span>
        <span className="voice">Your books stay yours.</span>
      </div>
    </footer>
  );
}
