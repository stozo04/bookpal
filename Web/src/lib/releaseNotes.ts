// BookPal's release history, newest first, shown from the version in the footer.
// Every version bump adds its entry at the top (AGENTS.md, "Versioning"), and
// scripts/check-version-bump.sh fails CI when the current version has none.

export type ChangeKind = "New" | "Improved" | "Fixed" | "Removed";
export type Change = { kind: ChangeKind; text: string };
export type Release = { version: string; date: string; changes: Change[] };

export const RELEASES: Release[] = [
  {
    version: "0.4.0",
    date: "2026-11-23",
    changes: [
      { kind: "New", text: "What’s New: click or point at the version in the footer to see what changed in each release." },
    ],
  },
  {
    version: "0.3.1",
    date: "2026-11-23",
    changes: [
      { kind: "Fixed", text: "Your reading place, uploads, folders and book edits save again. Since mid-October they had been failing, so “Continue reading” stopped moving." },
      { kind: "Improved", text: "If the reader can’t save your place, a small note at the bottom says so instead of failing silently. It tries once more on its own." },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-11-23",
    changes: [
      { kind: "New", text: "Character portraits: ChatGPT draws a character from how the book describes them, and the picture is kept with the book." },
      { kind: "New", text: "The reader bar has a previous-chapter button next to next-chapter, and the library link says “Library”." },
      { kind: "Fixed", text: "Short EPUB chapters no longer leave a tall blank space below the text." },
      { kind: "New", text: "The version now shows in the footer." },
    ],
  },
];

const DISPLAY_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function displayDate(isoDate: string): string {
  return DISPLAY_DATE.format(new Date(`${isoDate}T00:00:00Z`));
}
