// Character portraits: a picture the reader makes elsewhere (for example in ChatGPT)
// from a prompt BookPal writes, then saves to the book. One picture per character.

export const PORTRAIT_PROMPT_MAX = 2000;

const KEY = /^[0-9a-f]{64}$/;
export const isPortraitKey = (key: string) => KEY.test(key);

// Names become storage keys by hash, so any name is a safe path segment.
export async function portraitKey(name: string): Promise<string> {
  const bytes = new TextEncoder().encode(name.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const portraitFolder = (userId: string, fileId: string) => `${userId}/${fileId}/characters`;
export const portraitPath = (userId: string, fileId: string, key: string) => `${portraitFolder(userId, fileId)}/${key}`;

// The model's reply, trimmed to just the prompt the reader will paste.
export function cleanPortraitPrompt(raw: string): string | null {
  const text = raw
    .replace(/^```[a-z]*\s*|```\s*$/gi, "")
    .replace(/^\s*(prompt|image prompt)\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  return text.length >= 40 ? text.slice(0, PORTRAIT_PROMPT_MAX) : null;
}
