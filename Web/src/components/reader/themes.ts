// Reading themes mirror QuietReadingTheme in the Mac app.
export type ThemeName = "white" | "cream" | "gray" | "dark";
export type Face = "serif" | "sans";

export const THEMES: Record<ThemeName, { label: string; bg: string; ink: string; voice: string; hairline: string }> = {
  white: { label: "White", bg: "#ffffff", ink: "#26262a", voice: "#6b6b70", hairline: "#d4d4d6" },
  cream: { label: "Cream", bg: "#f6f2e8", ink: "#2a2620", voice: "#6c6558", hairline: "#dcd5c4" },
  gray: { label: "Gray", bg: "#e6e6e6", ink: "#242426", voice: "#58585c", hairline: "#c8c8c8" },
  dark: { label: "Dark", bg: "#1a1a1c", ink: "#dcd8d0", voice: "#8a8a8c", hairline: "#38383a" },
};

export const FACES: Record<Face, string> = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
  sans: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
};

export const SIZE_MIN = 80;
export const SIZE_MAX = 160;
export const SIZE_STEP = 10;

export function themeVars(theme: ThemeName, size: number, face: Face): Record<string, string> {
  const t = THEMES[theme];
  return {
    "--bg": t.bg, "--ink": t.ink, "--voice": t.voice, "--hairline": t.hairline,
    // A faint tint of the reading theme for cards and badges (the app's own tint belongs to the app's mode).
    "--wash": `color-mix(in srgb, ${t.ink} 6%, ${t.bg})`,
    "--fs": `${(20 * size) / 100}px`, "--face": FACES[face],
  };
}

// Stylesheet for the sandboxed chapter document. Book styles are not loaded.
export const CHAPTER_CSS = `
:root { color-scheme: light dark; }
html { background: var(--bg); }
body { margin: 0; background: var(--bg); color: var(--ink); font: var(--fs)/1.7 var(--face); -webkit-font-smoothing: antialiased; hyphens: auto; overflow-wrap: break-word; }
article { max-width: 35em; margin: 0 auto; padding: 96px 28px 72px; }
p { margin: 0 0 1em; }
h1, h2, h3, h4 { font-weight: 300; line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 .6em; }
h1 { font-size: 1.9em; margin-top: .4em; } h2 { font-size: 1.5em; } h3 { font-size: 1.2em; }
a { color: inherit; text-decoration: underline; text-decoration-color: var(--voice); text-underline-offset: 3px; cursor: pointer; }
img, svg { max-width: 100%; height: auto; display: block; margin: 1.6em auto; }
blockquote { margin: 1.4em 0; padding-left: 1.2em; border-left: 1px solid var(--hairline); color: var(--ink); }
hr { border: 0; border-top: 1px solid var(--hairline); margin: 2.4em auto; width: 30%; }
pre, code { font-family: ui-monospace, Menlo, monospace; font-size: .85em; white-space: pre-wrap; }
table { border-collapse: collapse; max-width: 100%; } td, th { border-top: 1px solid var(--hairline); padding: .4em .8em; }
ul, ol { padding-left: 1.4em; }
::selection { background: color-mix(in srgb, var(--ink) 18%, transparent); }
::highlight(bookpal-search) { background-color: #ffe27a; color: #1d1d1f; }
@media (max-width: 600px) { article { padding: 72px 20px 56px; } }
`;
