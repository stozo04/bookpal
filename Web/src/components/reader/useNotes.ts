"use client";
import { useCallback, useState } from "react";
import type { Character } from "@/lib/castgraph";
import { putNote, type Profile, type ReaderNotes } from "@/lib/notes";
import { wordKey, type Definition } from "@/lib/define";
import type { Recap } from "@/lib/recap";

// The book's saved AI notes, kept in step with what gets saved.
export function useNotes(fileId: string, initial: ReaderNotes) {
  const [notes, setNotes] = useState(initial);

  const saveSummary = useCallback((label: string, progress: number, text: string) => {
    setNotes((n) => ({ ...n, summaries: { ...n.summaries, [label]: { progress, text } } }));
    void putNote(fileId, { kind: "summary", label, progress, content: { text } });
  }, [fileId]);

  const saveCast = useCallback((label: string, progress: number, characters: Character[]) => {
    setNotes((n) => ({ ...n, cast: { label, progress, characters } }));
    void putNote(fileId, { kind: "cast", label, progress, content: { characters } });
  }, [fileId]);

  const saveProfile = useCallback((name: string, label: string, progress: number, profile: Profile) => {
    setNotes((n) => ({ ...n, profiles: { ...n.profiles, [name]: { label, progress, profile } } }));
    void putNote(fileId, { kind: "character", label: name, progress, content: { label, profile } });
  }, [fileId]);

  const saveWord = useCallback((word: string, def: Definition) => {
    const key = wordKey(word);
    if (!key) return;
    setNotes((n) => ({ ...n, words: { ...n.words, [key]: def } }));
    void putNote(fileId, { kind: "word", label: key, progress: 0, content: { def } });
  }, [fileId]);

  const saveRecap = useCallback((label: string, progress: number, recap: Recap) => {
    setNotes((n) => ({ ...n, recaps: { ...n.recaps, [label]: { progress, recap } } }));
    void putNote(fileId, { kind: "recap", label, progress, content: { recap } });
  }, [fileId]);

  return { notes, saveSummary, saveCast, saveProfile, saveWord, saveRecap };
}
